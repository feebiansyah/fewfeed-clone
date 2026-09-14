import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { buildMetaOAuthUrl, createOAuthState } from "@/lib/meta/oauth";

export async function GET(request: Request): Promise<Response> {
  const user = await requireUser();
  const requestUrl = new URL(request.url);
  const reconnect = requestUrl.searchParams.get("reconnect") === "1";
  const existing = await db.metaConnection.findUnique({
    where: { userId: user.id },
    select: { status: true },
  });

  if (existing?.status === "CONNECTED" && !reconnect) {
    return NextResponse.redirect(
      new URL("/dashboard?meta=already_connected", requestUrl),
    );
  }

  const state = await createOAuthState(user.id);
  return NextResponse.redirect(buildMetaOAuthUrl(state));
}
