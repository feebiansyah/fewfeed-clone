"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { db } from "@/lib/db";

export async function setDefaultAdAccount(
  adAccountDbId: string,
  _formData?: FormData,
): Promise<void> {
  void _formData;
  const user = await requireUser();
  const account = await db.adAccount.findFirst({
    where: {
      id: adAccountDbId,
      userId: user.id,
      accessStatus: "AVAILABLE",
    },
    select: { id: true },
  });

  if (!account) {
    throw new Error("AD_ACCOUNT_NOT_AVAILABLE");
  }

  await db.$transaction([
    db.adAccount.updateMany({
      where: { userId: user.id },
      data: { isDefaultOneCard: false },
    }),
    db.adAccount.update({
      where: { id: account.id },
      data: { isDefaultOneCard: true },
    }),
  ]);

  revalidatePath("/dashboard");
}
