import { describe, expect, it, vi } from "vitest";

import { createUserFromCommand } from "@/scripts/create-user";

function dependencies() {
  return {
    findUser: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue(undefined),
    write: vi.fn(),
  };
}

describe("terminal user creation", () => {
  it("normalizes email and creates an active user", async () => {
    const deps = dependencies();

    await createUserFromCommand(
      ["--email", "  Admin@Example.COM "],
      "twelve-characters",
      deps,
    );

    expect(deps.findUser).toHaveBeenCalledWith("admin@example.com");
    expect(deps.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: "admin@example.com",
      isActive: true,
    }));
    expect(deps.write).toHaveBeenCalledWith("Created user: admin@example.com");
  });

  it("rejects a missing or invalid email", async () => {
    const deps = dependencies();

    await expect(createUserFromCommand([], "twelve-characters", deps)).rejects.toThrow("INVALID_EMAIL");
    await expect(createUserFromCommand(["--email", "invalid"], "twelve-characters", deps)).rejects.toThrow("INVALID_EMAIL");
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("requires NEW_USER_PASSWORD", async () => {
    const deps = dependencies();

    await expect(
      createUserFromCommand([], undefined, deps),
    ).rejects.toThrow("Set NEW_USER_PASSWORD before running this command.");
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("enforces the 12-character password rule", async () => {
    const deps = dependencies();

    await expect(
      createUserFromCommand(["--email", "admin@example.com"], "short-pass", deps),
    ).rejects.toThrow("PASSWORD_TOO_SHORT");
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("rejects an existing normalized email", async () => {
    const deps = dependencies();
    deps.findUser.mockResolvedValue({ id: "existing" });

    await expect(
      createUserFromCommand(["--email", "ADMIN@example.com"], "twelve-characters", deps),
    ).rejects.toThrow("USER_ALREADY_EXISTS");
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("never writes the password or password hash", async () => {
    const deps = dependencies();
    const password = "do-not-log-this";

    await createUserFromCommand(["--email", "admin@example.com"], password, deps);

    const output = JSON.stringify(deps.write.mock.calls);
    const storedHash = deps.createUser.mock.calls[0][0].passwordHash;
    expect(output).not.toContain(password);
    expect(output).not.toContain(storedHash);
  });
});
