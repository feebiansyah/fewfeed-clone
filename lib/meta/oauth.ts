import { randomBytes } from "node:crypto";

import { getMetaConfig, META_OAUTH_SCOPES } from "@/lib/meta/config";
import { metaFetch } from "@/lib/meta/client";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  userId: string;
  createdAt: number;
  nonce: string;
};

type TokenResponse = {
  access_token: string;
  expires_in?: number;
};

export type MetaIdentity = {
  id: string;
  name?: string;
};

export async function createOAuthState(userId: string): Promise<string> {
  const payload: OAuthStatePayload = {
    userId,
    createdAt: Date.now(),
    nonce: randomBytes(16).toString("base64url"),
  };
  return encryptSecret(JSON.stringify(payload));
}

export async function consumeOAuthState(
  state: string,
  expectedUserId: string,
): Promise<boolean> {
  try {
    const payload = JSON.parse(decryptSecret(state)) as Partial<OAuthStatePayload>;
    const age = Date.now() - Number(payload.createdAt);
    return payload.userId === expectedUserId
      && typeof payload.nonce === "string"
      && payload.nonce.length > 0
      && Number.isFinite(age)
      && age >= 0
      && age <= OAUTH_STATE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

export function buildMetaOAuthUrl(state: string): URL {
  const config = getMetaConfig();
  const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_OAUTH_SCOPES.join(","));
  return url;
}

export async function exchangeCodeForAccessToken(
  code: string,
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const config = getMetaConfig();
  const query = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });
  const result = await metaFetch<TokenResponse>(`/oauth/access_token?${query}`, {
    method: "GET",
  });
  if (!result.access_token) {
    throw new Error("META_TOKEN_MISSING");
  }

  return {
    accessToken: result.access_token,
    expiresAt: typeof result.expires_in === "number"
      ? new Date(Date.now() + result.expires_in * 1000)
      : null,
  };
}

export async function getMetaIdentity(accessToken: string): Promise<MetaIdentity> {
  const identity = await metaFetch<MetaIdentity>("/me?fields=id%2Cname", {
    method: "GET",
    accessToken,
  });
  if (!identity.id) {
    throw new Error("META_IDENTITY_MISSING");
  }
  return identity;
}
