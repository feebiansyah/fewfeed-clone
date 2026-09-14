import { getMetaConfig } from "@/lib/meta/config";
import { MetaApiError } from "@/lib/meta/errors";

export type MetaRequestInit = Omit<RequestInit, "headers"> & {
  accessToken?: string;
  headers?: Record<string, string>;
};

function assertAllowedPath(path: string): void {
  if (!/^\/(?:oauth\/access_token|me)(?:\?|$)/.test(path)) {
    throw new MetaApiError("META_PATH_NOT_ALLOWED");
  }
}

export async function metaFetch<T>(
  path: string,
  init: MetaRequestInit = {},
): Promise<T> {
  assertAllowedPath(path);
  const { graphVersion } = getMetaConfig();
  const url = new URL(`https://graph.facebook.com/${graphVersion}${path}`);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }

  let response: Response;
  try {
    const { accessToken: _accessToken, ...requestInit } = init;
    void _accessToken;
    response = await fetch(url, {
      ...requestInit,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new MetaApiError("META_NETWORK_ERROR");
  }

  if (!response.ok) {
    throw new MetaApiError("META_API_ERROR", response.status);
  }

  try {
    return await response.json() as T;
  } catch {
    throw new MetaApiError("META_INVALID_RESPONSE", response.status);
  }
}
