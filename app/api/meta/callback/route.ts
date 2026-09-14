import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  consumeOAuthState,
  exchangeCodeForAccessToken,
  getMetaIdentity,
} from "@/lib/meta/oauth";
import { encryptSecret } from "@/lib/security/secrets";

function dashboardRedirect(requestUrl: URL, result: "connected" | "error"): Response {
  return NextResponse.redirect(new URL(`/dashboard?meta=${result}`, requestUrl));
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", requestUrl));
  }

  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  if (!state || !code || !(await consumeOAuthState(state, user.id))) {
    return dashboardRedirect(requestUrl, "error");
  }

  try {
    const token = await exchangeCodeForAccessToken(code);
    const identity = await getMetaIdentity(token.accessToken);
    const encryptedAccessToken = encryptSecret(token.accessToken);

    await db.metaConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        metaUserId: identity.id,
        metaDisplayName: identity.name ?? null,
        encryptedAccessToken,
        tokenExpiresAt: token.expiresAt,
        status: "CONNECTED",
        lastErrorCode: null,
      },
      update: {
        metaUserId: identity.id,
        metaDisplayName: identity.name ?? null,
        encryptedAccessToken,
        tokenExpiresAt: token.expiresAt,
        status: "CONNECTED",
        lastErrorCode: null,
      },
    });
  } catch {
    return dashboardRedirect(requestUrl, "error");
  }

  return dashboardRedirect(requestUrl, "connected");
}
