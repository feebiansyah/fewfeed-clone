import { getMetaConfig } from "@/lib/meta/config";
import { MetaApiError } from "@/lib/meta/errors";

export type MetaRequestInit = Omit<RequestInit, "headers"> & {
  accessToken?: string;
  headers?: Record<string, string>;
};

function assertAllowedPath(path: string, method: string): void {
  const allowedRead = method === "GET" && (
    /^\/oauth\/access_token(?:\?|$)/.test(path)
    || /^\/me(?:\?|$)/.test(path)
    || /^\/me\/accounts(?:\?|$)/.test(path)
    || /^\/me\/adaccounts(?:\?|$)/.test(path)
    || /^\/me\/businesses(?:\?|$)/.test(path)
    || /^\/\d{1,30}\?fields=id%2Ceffective_object_story_id$/.test(path)
  );
  const allowedWrite = method === "POST" && (
    /^\/act_\d{1,30}\/adimages$/.test(path)
    || /^\/act_\d{1,30}\/adcreatives$/.test(path)
  );

  if (!allowedRead && !allowedWrite) {
    throw new MetaApiError("META_PATH_NOT_ALLOWED");
  }
}

export async function metaFetch<T>(
  path: string,
  init: MetaRequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  assertAllowedPath(path, method);
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
