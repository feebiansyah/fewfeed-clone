import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeOAuthState, createOAuthState } from "@/lib/meta/oauth";

describe("Meta OAuth state", () => {
  beforeEach(() => {
    process.env.META_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T00:00:00.000Z"));
  });

  afterEach(() => {
    delete process.env.META_TOKEN_ENCRYPTION_KEY;
    vi.useRealTimers();
  });

  it("accepts a fresh state for the same website user", async () => {
    const state = await createOAuthState("user-1");

    await expect(consumeOAuthState(state, "user-1")).resolves.toBe(true);
  });

  it("rejects a state bound to another user", async () => {
    const state = await createOAuthState("user-1");

    await expect(consumeOAuthState(state, "user-2")).resolves.toBe(false);
  });

  it("rejects a modified state", async () => {
    const state = await createOAuthState("user-1");
    const modified = `${state.slice(0, -1)}${state.endsWith("A") ? "B" : "A"}`;

    await expect(consumeOAuthState(modified, "user-1")).resolves.toBe(false);
  });

  it("rejects an expired state", async () => {
    const state = await createOAuthState("user-1");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    await expect(consumeOAuthState(state, "user-1")).resolves.toBe(false);
  });
});
