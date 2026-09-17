import { getMetaConfig } from "@/lib/meta/config";
import { MetaApiError } from "@/lib/meta/errors";

export type MetaRequestInit = Omit<RequestInit, "headers"> & {
  accessToken?: string;
  headers?: Record<string, string>;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeMetaMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const sanitized = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/(https?:\/\/[^\s?#<>"']+)\?[^\s#<>"']*/gi, "$1?[REDACTED]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(access_token|appsecret_proof)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi, "$1=[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  return sanitized || null;
}

async function safeMetaErrorDetails(response: Response) {
  try {
    const body: unknown = await response.json();
    if (!isRecord(body) || !isRecord(body.error)) return {};

    const code = body.error.code;
    const subcode = body.error.error_subcode;
    return {
      metaCode: typeof code === "number" && Number.isFinite(code) ? code : null,
      metaSubcode: typeof subcode === "number" && Number.isFinite(subcode) ? subcode : null,
      metaMessage: sanitizeMetaMessage(body.error.message),
    };
  } catch {
    return {};
  }
}

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
    const details = await safeMetaErrorDetails(response);
    throw new MetaApiError("META_API_ERROR", { status: response.status, ...details });
  }

  try {
    return await response.json() as T;
  } catch {
    throw new MetaApiError("META_INVALID_RESPONSE", { status: response.status });
  }
}
