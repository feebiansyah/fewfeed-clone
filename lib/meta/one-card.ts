import { setTimeout as sleep } from "node:timers/promises";

import { db } from "@/lib/db";
import { metaFetch } from "@/lib/meta/client";
import { decryptSecret } from "@/lib/security/secrets";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 4000;
const NUMERIC_ID = /^\d{1,30}$/;
const STORY_ID = /^\d{1,30}_\d{1,30}$/;

export type PrepareOneCardInput = {
  userId: string;
  facebookPageDbId: string;
  adAccountDbId: string;
  image: {
    bytes: Uint8Array;
    mimeType: "image/png" | "image/jpeg";
  };
  message: string;
  destinationUrl: string;
  caption: string;
  title: string;
  description: string;
};

export type PrepareOneCardResult = {
  preparationId: string;
  creativeId: string;
  effectiveObjectStoryId: string;
  attempts: number;
};

type UploadResponse = {
  images?: Record<string, { hash?: string; url?: string }>;
};

type CreativeResponse = {
  id?: string;
  effective_object_story_id?: string;
};

type SafeCode =
  | "INVALID_IMAGE_TYPE"
  | "IMAGE_TOO_LARGE"
  | "INVALID_DESTINATION_URL"
  | "INVALID_TEXT_LENGTH"
  | "PAGE_NOT_AVAILABLE"
  | "AD_ACCOUNT_NOT_AVAILABLE"
  | "META_CONNECTION_NOT_AVAILABLE"
  | "IMAGE_UPLOAD_FAILED"
  | "CREATIVE_CREATE_FAILED"
  | "POLL_FAILED"
  | "POLL_TIMEOUT";

const SAFE_MESSAGES: Record<SafeCode, string> = {
  INVALID_IMAGE_TYPE: "Image type is not supported.",
  IMAGE_TOO_LARGE: "Image exceeds the size limit.",
  INVALID_DESTINATION_URL: "Destination URL must use HTTPS.",
  INVALID_TEXT_LENGTH: "One or more text fields exceed the allowed length.",
  PAGE_NOT_AVAILABLE: "The selected Page is not available.",
  AD_ACCOUNT_NOT_AVAILABLE: "The selected Ad Account is not available.",
  META_CONNECTION_NOT_AVAILABLE: "The Meta connection is not available.",
  IMAGE_UPLOAD_FAILED: "Image upload failed.",
  CREATIVE_CREATE_FAILED: "Creative creation failed and was not retried.",
  POLL_FAILED: "Creative status lookup failed.",
  POLL_TIMEOUT: "Story ID was not available after 15 attempts.",
};

export class SafeOneCardError extends Error {
  readonly safeCode: SafeCode;
  readonly safeMessage: string;

  constructor(safeCode: SafeCode) {
    super(safeCode);
    this.name = "SafeOneCardError";
    this.safeCode = safeCode;
    this.safeMessage = SAFE_MESSAGES[safeCode];
  }
}

function validateInput(input: PrepareOneCardInput): void {
  if (input.image.mimeType !== "image/png" && input.image.mimeType !== "image/jpeg") {
    throw new SafeOneCardError("INVALID_IMAGE_TYPE");
  }
  if (input.image.bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new SafeOneCardError("IMAGE_TOO_LARGE");
  }

  try {
    const url = new URL(input.destinationUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
  } catch {
    throw new SafeOneCardError("INVALID_DESTINATION_URL");
  }

  if (
    input.message.length > 5000
    || input.title.length > 500
    || input.caption.length > 500
    || input.description.length > 500
  ) {
    throw new SafeOneCardError("INVALID_TEXT_LENGTH");
  }
}

function uploadedImage(response: UploadResponse): { hash: string | null; url: string } {
  const image = response.images && Object.values(response.images)[0];
  if (!image?.url) throw new SafeOneCardError("IMAGE_UPLOAD_FAILED");

  try {
    const url = new URL(image.url);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
  } catch {
    throw new SafeOneCardError("IMAGE_UPLOAD_FAILED");
  }

  return {
    hash: typeof image.hash === "string" && image.hash ? image.hash : null,
    url: image.url,
  };
}

async function markFailed(preparationId: string, error: SafeOneCardError, attempts: number): Promise<void> {
  try {
    await db.oneCardPreparation.update({
      where: { id: preparationId },
      data: {
        status: "FAILED",
        pollAttempts: attempts,
        safeErrorCode: error.safeCode,
        safeErrorMessage: error.safeMessage,
      },
    });
  } catch {
    // Preserve the original safe failure and never expose persistence details.
  }
}

export async function prepareOneCard(
  input: PrepareOneCardInput,
): Promise<PrepareOneCardResult> {
  validateInput(input);

  const page = await db.facebookPage.findFirst({
    where: {
      id: input.facebookPageDbId,
      userId: input.userId,
      accessStatus: "AVAILABLE",
    },
    select: { id: true, pageId: true, metaConnectionId: true },
  });
  if (!page || !NUMERIC_ID.test(page.pageId)) {
    throw new SafeOneCardError("PAGE_NOT_AVAILABLE");
  }

  const adAccount = await db.adAccount.findFirst({
    where: {
      id: input.adAccountDbId,
      userId: input.userId,
      accessStatus: "AVAILABLE",
    },
    select: { id: true, accountId: true, metaConnectionId: true },
  });
  if (!adAccount || !NUMERIC_ID.test(adAccount.accountId)) {
    throw new SafeOneCardError("AD_ACCOUNT_NOT_AVAILABLE");
  }

  const connection = await db.metaConnection.findUnique({
    where: { userId: input.userId },
    select: { id: true, status: true, encryptedAccessToken: true },
  });
  if (
    !connection
    || connection.status !== "CONNECTED"
    || connection.id !== page.metaConnectionId
    || connection.id !== adAccount.metaConnectionId
  ) {
    throw new SafeOneCardError("META_CONNECTION_NOT_AVAILABLE");
  }

  const preparation = await db.oneCardPreparation.create({
    data: {
      userId: input.userId,
      facebookPageId: page.id,
      adAccountId: adAccount.id,
      status: "PENDING",
    },
    select: { id: true },
  });

  let stage: "upload" | "creative" | "poll" = "upload";
  let attempts = 0;
  try {
    await db.oneCardPreparation.update({
      where: { id: preparation.id },
      data: { status: "UPLOADING_IMAGE" },
    });

    const accessToken = decryptSecret(connection.encryptedAccessToken);
    const imageBody = new FormData();
    imageBody.set("bytes", Buffer.from(input.image.bytes).toString("base64"));
    imageBody.set("name", input.image.mimeType === "image/png" ? "one-card.png" : "one-card.jpg");
    const upload = await metaFetch<UploadResponse>(`/act_${adAccount.accountId}/adimages`, {
      method: "POST",
      accessToken,
      body: imageBody,
    });
    const image = uploadedImage(upload);

    stage = "creative";
    await db.oneCardPreparation.update({
      where: { id: preparation.id },
      data: {
        status: "CREATING_CREATIVE",
        imageHash: image.hash,
        imageAssetUrl: image.url,
      },
    });

    const creativeBody = new FormData();
    creativeBody.set("name", input.title || "One Card preparation");
    creativeBody.set("object_story_spec", JSON.stringify({
      page_id: page.pageId,
      link_data: {
        message: input.message,
        link: input.destinationUrl,
        caption: input.caption,
        name: input.title,
        description: input.description,
        picture: image.url,
        multi_share_optimized: true,
        multi_share_end_card: true,
      },
    }));
    const creative = await metaFetch<CreativeResponse>(`/act_${adAccount.accountId}/adcreatives`, {
      method: "POST",
      accessToken,
      body: creativeBody,
    });
    if (!creative.id || !NUMERIC_ID.test(creative.id)) {
      throw new SafeOneCardError("CREATIVE_CREATE_FAILED");
    }

    stage = "poll";
    await db.oneCardPreparation.update({
      where: { id: preparation.id },
      data: {
        status: "POLLING_STORY",
        creativeId: creative.id,
        pollAttempts: 0,
      },
    });

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
      attempts = attempt;
      const current: CreativeResponse = await metaFetch<CreativeResponse>(
        `/${creative.id}?fields=id%2Ceffective_object_story_id`,
        { method: "GET", accessToken },
      );
      if (current.id !== creative.id) {
        throw new SafeOneCardError("POLL_FAILED");
      }

      const storyId = current.effective_object_story_id;
      if (typeof storyId === "string" && STORY_ID.test(storyId)) {
        await db.oneCardPreparation.update({
          where: { id: preparation.id },
          data: {
            status: "SUCCEEDED",
            creativeId: creative.id,
            effectiveObjectStoryId: storyId,
            pollAttempts: attempt,
            safeErrorCode: null,
            safeErrorMessage: null,
          },
        });
        return {
          preparationId: preparation.id,
          creativeId: creative.id,
          effectiveObjectStoryId: storyId,
          attempts: attempt,
        };
      }
      if (storyId !== undefined && storyId !== "") {
        throw new SafeOneCardError("POLL_FAILED");
      }

      await db.oneCardPreparation.update({
        where: { id: preparation.id },
        data: { pollAttempts: attempt },
      });
      if (attempt < MAX_POLL_ATTEMPTS) await sleep(POLL_INTERVAL_MS);
    }

    throw new SafeOneCardError("POLL_TIMEOUT");
  } catch (error) {
    const safeError = error instanceof SafeOneCardError
      ? error
      : new SafeOneCardError(
        stage === "upload"
          ? "IMAGE_UPLOAD_FAILED"
          : stage === "creative"
            ? "CREATIVE_CREATE_FAILED"
            : "POLL_FAILED",
      );
    await markFailed(preparation.id, safeError, attempts);
    throw safeError;
  }
}
