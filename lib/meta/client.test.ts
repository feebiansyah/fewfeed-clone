import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meta/config", () => ({
  getMetaConfig: () => ({ graphVersion: "v25.0" }),
}));

import { metaFetch } from "@/lib/meta/client";
import { MetaApiError } from "@/lib/meta/errors";

async function captureMetaError(operation: Promise<unknown>): Promise<MetaApiError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof MetaApiError) return error;
    throw error;
  }
  throw new Error("Expected MetaApiError");
}

describe("metaFetch safe error diagnostics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("captures only sanitized structured fields from a non-2xx Meta response", async () => {
    const opaque = "A".repeat(48);
    const json = vi.fn().mockResolvedValue({
      error: {
        code: 100,
        error_subcode: 1815,
        message: `Bad\u0000request access_token=token-value Bearer bearer-value appsecret_proof=proof-value https://example.com/path?access_token=url-value&x=1 ${opaque}`,
        raw_private_field: "must-not-escape",
      },
      raw_response_field: "must-not-escape-either",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json }));

    const caught = await captureMetaError(metaFetch("/act_123/adcreatives", {
      method: "POST",
      accessToken: "request-token",
      body: new FormData(),
    }));

    expect(json).toHaveBeenCalledTimes(1);
    expect(caught).toBeInstanceOf(MetaApiError);
    expect(caught).toMatchObject({
      safeCode: "META_API_ERROR",
      status: 400,
      metaCode: 100,
      metaSubcode: 1815,
    });
    expect(caught.metaMessage).toContain("Bad request");
    expect(caught.metaMessage).not.toMatch(/token-value|bearer-value|proof-value|url-value|must-not-escape|A{32}/);
    expect(caught.metaMessage).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(JSON.stringify(caught)).not.toMatch(/raw_private_field|raw_response_field|request-token/);
  });

  it("accepts Meta code and subcode only when they are finite numbers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: { code: "100", error_subcode: Number.POSITIVE_INFINITY, message: "Invalid request" },
      }),
    }));

    const caught = await captureMetaError(metaFetch("/act_123/adcreatives", { method: "POST" }));

    expect(caught).toMatchObject({ metaCode: null, metaSubcode: null });
  });

  it("caps a sanitized Meta message at 300 characters", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: { message: "safe words ".repeat(100) } }),
    }));

    const caught = await captureMetaError(metaFetch("/act_123/adcreatives", { method: "POST" }));

    expect(caught.metaMessage).toHaveLength(300);
  });

  it("keeps non-JSON errors generic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(new SyntaxError("not json")),
    }));

    const caught = await captureMetaError(metaFetch("/act_123/adcreatives", { method: "POST" }));

    expect(caught).toMatchObject({
      safeCode: "META_API_ERROR",
      status: 502,
      metaCode: null,
      metaSubcode: null,
      metaMessage: null,
    });
    expect(caught.message).toBe("Meta request failed");
  });

  it("keeps the endpoint and method allowlist strict", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(metaFetch("/act_123/campaigns", { method: "POST" })).rejects.toMatchObject({
      safeCode: "META_PATH_NOT_ALLOWED",
    });
    await expect(metaFetch("/act_123/adcreatives", { method: "GET" })).rejects.toMatchObject({
      safeCode: "META_PATH_NOT_ALLOWED",
    });
    await expect(metaFetch("/123?fields=id%2Ceffective_object_story_id", { method: "POST" })).rejects.toMatchObject({
      safeCode: "META_PATH_NOT_ALLOWED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
