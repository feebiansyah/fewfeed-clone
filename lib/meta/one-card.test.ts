import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pageFindFirst: vi.fn(),
  adAccountFindFirst: vi.fn(),
  connectionFindUnique: vi.fn(),
  preparationCreate: vi.fn(),
  preparationUpdate: vi.fn(),
  decryptSecret: vi.fn(),
  metaFetch: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    facebookPage: { findFirst: mocks.pageFindFirst },
    adAccount: { findFirst: mocks.adAccountFindFirst },
    metaConnection: { findUnique: mocks.connectionFindUnique },
    oneCardPreparation: {
      create: mocks.preparationCreate,
      update: mocks.preparationUpdate,
    },
  },
}));
vi.mock("@/lib/security/secrets", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/meta/client", () => ({ metaFetch: mocks.metaFetch }));
vi.mock("node:timers/promises", () => ({ setTimeout: mocks.sleep }));

import {
  prepareOneCard,
  type PrepareOneCardInput,
} from "@/lib/meta/one-card";

const validInput: PrepareOneCardInput = {
  userId: "user-a",
  facebookPageDbId: "page-db-a",
  adAccountDbId: "account-db-a",
  image: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" },
  message: "Primary text",
  destinationUrl: "https://example.com/landing",
  caption: "example.com",
  title: "Card title",
  description: "Card description",
};

function mockSuccessfulFlow(storyAttempt = 1) {
  let reads = 0;
  mocks.metaFetch.mockImplementation((path: string) => {
    if (path === "/act_456/adimages") {
      return { images: { uploaded: { hash: "image-hash", url: "https://images.example/image.png" } } };
    }
    if (path === "/act_456/adcreatives") return { id: "789" };
    if (path === "/789?fields=id%2Ceffective_object_story_id") {
      reads += 1;
      return reads === storyAttempt
        ? { id: "789", effective_object_story_id: "123_987" }
        : { id: "789" };
    }
    throw new Error(`unexpected path: ${path}`);
  });
}

describe("prepareOneCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pageFindFirst.mockResolvedValue({
      id: "page-db-a",
      pageId: "123",
      metaConnectionId: "connection-a",
    });
    mocks.adAccountFindFirst.mockResolvedValue({
      id: "account-db-a",
      accountId: "456",
      metaConnectionId: "connection-a",
    });
    mocks.connectionFindUnique.mockResolvedValue({
      id: "connection-a",
      status: "CONNECTED",
      encryptedAccessToken: "encrypted-token",
    });
    mocks.preparationCreate.mockResolvedValue({ id: "preparation-1" });
    mocks.preparationUpdate.mockResolvedValue({});
    mocks.decryptSecret.mockReturnValue("raw-meta-token");
    mocks.sleep.mockResolvedValue(undefined);
    mockSuccessfulFlow();
  });

  it("validates Page ownership before any Meta write", async () => {
    mocks.pageFindFirst.mockResolvedValue(null);

    await expect(prepareOneCard(validInput)).rejects.toThrow("PAGE_NOT_AVAILABLE");

    expect(mocks.pageFindFirst).toHaveBeenCalledWith({
      where: { id: "page-db-a", userId: "user-a", accessStatus: "AVAILABLE" },
      select: { id: true, pageId: true, metaConnectionId: true },
    });
    expect(mocks.metaFetch).not.toHaveBeenCalled();
    expect(mocks.preparationCreate).not.toHaveBeenCalled();
  });

  it("validates Ad Account ownership before any Meta write", async () => {
    mocks.adAccountFindFirst.mockResolvedValue(null);

    await expect(prepareOneCard(validInput)).rejects.toThrow("AD_ACCOUNT_NOT_AVAILABLE");

    expect(mocks.adAccountFindFirst).toHaveBeenCalledWith({
      where: { id: "account-db-a", userId: "user-a", accessStatus: "AVAILABLE" },
      select: { id: true, accountId: true, metaConnectionId: true },
    });
    expect(mocks.metaFetch).not.toHaveBeenCalled();
  });

  it("rejects stale Page/Ad Account", async () => {
    mocks.pageFindFirst.mockResolvedValue(null);
    await expect(prepareOneCard(validInput)).rejects.toThrow("PAGE_NOT_AVAILABLE");

    mocks.pageFindFirst.mockResolvedValue({ id: "page-db-a", pageId: "123", metaConnectionId: "connection-a" });
    mocks.adAccountFindFirst.mockResolvedValue(null);
    await expect(prepareOneCard(validInput)).rejects.toThrow("AD_ACCOUNT_NOT_AVAILABLE");
    expect(mocks.metaFetch).not.toHaveBeenCalled();
  });

  it("rejects image types other than PNG/JPEG", async () => {
    const input = { ...validInput, image: { ...validInput.image, mimeType: "image/gif" as "image/png" } };
    await expect(prepareOneCard(input)).rejects.toThrow("INVALID_IMAGE_TYPE");
    expect(mocks.pageFindFirst).not.toHaveBeenCalled();
  });

  it("rejects images larger than 5 MiB", async () => {
    const input = { ...validInput, image: { ...validInput.image, bytes: new Uint8Array(5 * 1024 * 1024 + 1) } };
    await expect(prepareOneCard(input)).rejects.toThrow("IMAGE_TOO_LARGE");
    expect(mocks.metaFetch).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS destination URLs", async () => {
    await expect(prepareOneCard({ ...validInput, destinationUrl: "http://example.com" })).rejects.toThrow(
      "INVALID_DESTINATION_URL",
    );
    expect(mocks.metaFetch).not.toHaveBeenCalled();
  });

  it("uploads image to /act_<accountId>/adimages", async () => {
    await prepareOneCard(validInput);

    expect(mocks.metaFetch).toHaveBeenCalledWith("/act_456/adimages", expect.objectContaining({
      method: "POST",
      accessToken: "raw-meta-token",
      body: expect.any(FormData),
    }));
  });

  it("creates one creative through /act_<accountId>/adcreatives", async () => {
    await prepareOneCard(validInput);

    expect(mocks.metaFetch.mock.calls.filter(([path]) => path === "/act_456/adcreatives")).toHaveLength(1);
  });

  it("uses object_story_spec.link_data with the selected Page", async () => {
    await prepareOneCard(validInput);

    const creativeCall = mocks.metaFetch.mock.calls.find(([path]) => path === "/act_456/adcreatives");
    const body = creativeCall?.[1].body as FormData;
    expect(JSON.parse(String(body.get("object_story_spec")))).toEqual({
      page_id: "123",
      link_data: {
        message: "Primary text",
        link: "https://example.com/landing",
        caption: "example.com",
        name: "Card title",
        description: "Card description",
        picture: "https://images.example/image.png",
        multi_share_optimized: true,
        multi_share_end_card: true,
      },
    });
  });

  it("polls immediately before the first 4-second wait", async () => {
    mockSuccessfulFlow(2);
    await prepareOneCard(validInput);

    const firstReadOrder = mocks.metaFetch.mock.invocationCallOrder[
      mocks.metaFetch.mock.calls.findIndex(([path]) => path.startsWith("/789?"))
    ];
    expect(firstReadOrder).toBeLessThan(mocks.sleep.mock.invocationCallOrder[0]);
  });

  it("returns on attempt 6 when story ID appears on attempt 6", async () => {
    mockSuccessfulFlow(6);

    await expect(prepareOneCard(validInput)).resolves.toEqual({
      preparationId: "preparation-1",
      creativeId: "789",
      effectiveObjectStoryId: "123_987",
      attempts: 6,
    });
    expect(mocks.sleep).toHaveBeenCalledTimes(5);
  });

  it("performs at most 15 reads", async () => {
    mockSuccessfulFlow(99);

    await expect(prepareOneCard(validInput)).rejects.toThrow("POLL_TIMEOUT");
    expect(mocks.metaFetch.mock.calls.filter(([path]) => path.startsWith("/789?"))).toHaveLength(15);
  });

  it("waits exactly 4 seconds only between missing attempts", async () => {
    mockSuccessfulFlow(99);
    await expect(prepareOneCard(validInput)).rejects.toThrow("POLL_TIMEOUT");

    expect(mocks.sleep).toHaveBeenCalledTimes(14);
    for (const call of mocks.sleep.mock.calls) expect(call).toEqual([4000]);
  });

  it("does not create a second creative after timeout", async () => {
    mockSuccessfulFlow(99);
    await expect(prepareOneCard(validInput)).rejects.toThrow("POLL_TIMEOUT");

    expect(mocks.metaFetch.mock.calls.filter(([path]) => path === "/act_456/adcreatives")).toHaveLength(1);
  });

  it("persists successful story ID and attempt count", async () => {
    mockSuccessfulFlow(6);
    await prepareOneCard(validInput);

    expect(mocks.preparationUpdate).toHaveBeenCalledWith({
      where: { id: "preparation-1" },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        creativeId: "789",
        effectiveObjectStoryId: "123_987",
        pollAttempts: 6,
        safeErrorCode: null,
        safeErrorMessage: null,
      }),
    });
  });

  it("persists safe FAILED state on controlled failure", async () => {
    mocks.metaFetch.mockRejectedValue(new Error("raw-meta-token unsafe response"));

    await expect(prepareOneCard(validInput)).rejects.toThrow("IMAGE_UPLOAD_FAILED");
    expect(mocks.preparationUpdate).toHaveBeenCalledWith({
      where: { id: "preparation-1" },
      data: expect.objectContaining({
        status: "FAILED",
        safeErrorCode: "IMAGE_UPLOAD_FAILED",
        safeErrorMessage: "Image upload failed.",
      }),
    });
    expect(JSON.stringify(mocks.preparationUpdate.mock.calls)).not.toContain("raw-meta-token");
  });

  it("never calls campaign, adset, ad, budget, publish, scheduled-post, or GraphQL endpoints", async () => {
    await prepareOneCard(validInput);

    const paths = mocks.metaFetch.mock.calls.map(([path]) => String(path)).join("\n");
    expect(paths).not.toMatch(/campaign|adset|\/ads(?:\?|$)|budget|publish|scheduled|graphql/i);
  });
});
