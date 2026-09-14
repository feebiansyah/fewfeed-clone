import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({
  db: {
    adAccount: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { setDefaultAdAccount } from "@/app/dashboard/actions";

describe("setDefaultAdAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-a" });
    mocks.updateMany.mockReturnValue({ operation: "clear-user-a" });
    mocks.update.mockReturnValue({ operation: "set-owned-account" });
    mocks.transaction.mockResolvedValue([]);
  });

  it("cannot select another user's ad account as default", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(setDefaultAdAccount("account-user-b")).rejects.toThrow(
      "AD_ACCOUNT_NOT_AVAILABLE",
    );

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "account-user-b",
        userId: "user-a",
        accessStatus: "AVAILABLE",
      },
      select: { id: true },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("clears the previous default in the same tenant", async () => {
    mocks.findFirst.mockResolvedValue({ id: "account-a-2" });

    await setDefaultAdAccount("account-a-2");

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-a" },
      data: { isDefaultOneCard: false },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "account-a-2" },
      data: { isDefaultOneCard: true },
    });
    expect(mocks.transaction).toHaveBeenCalledWith([
      { operation: "clear-user-a" },
      { operation: "set-owned-account" },
    ]);
  });

  it("does not change another user's default", async () => {
    mocks.findFirst.mockResolvedValue({ id: "account-a-1" });

    await setDefaultAdAccount("account-a-1");

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-a" },
    }));
    expect(JSON.stringify(mocks.updateMany.mock.calls)).not.toContain("user-b");
  });

  it("rejects stale ad accounts", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(setDefaultAdAccount("stale-account")).rejects.toThrow(
      "AD_ACCOUNT_NOT_AVAILABLE",
    );

    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ accessStatus: "AVAILABLE" }),
    }));
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
