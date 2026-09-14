import { pathToFileURL } from "node:url";

import { hashPassword } from "@/lib/auth/password";

type CreateUserDependencies = {
  findUser(email: string): Promise<unknown | null>;
  createUser(data: {
    email: string;
    passwordHash: string;
    isActive: true;
  }): Promise<unknown>;
  write(message: string): void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailArgument(args: string[]): string {
  const index = args.indexOf("--email");
  const email = index >= 0 ? args[index + 1]?.trim().toLowerCase() : "";

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new Error("INVALID_EMAIL");
  }

  return email;
}

export async function createUserFromCommand(
  args: string[],
  password: string | undefined,
  dependencies: CreateUserDependencies,
): Promise<void> {
  if (!password) {
    throw new Error("Set NEW_USER_PASSWORD before running this command.");
  }
  const email = emailArgument(args);

  if (await dependencies.findUser(email)) {
    throw new Error("USER_ALREADY_EXISTS");
  }

  const passwordHash = await hashPassword(password);
  try {
    await dependencies.createUser({ email, passwordHash, isActive: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new Error("USER_ALREADY_EXISTS");
    }
    throw new Error("CREATE_USER_FAILED");
  }

  dependencies.write(`Created user: ${email}`);
}

async function main(): Promise<void> {
  if (!process.env.NEW_USER_PASSWORD) {
    throw new Error("Set NEW_USER_PASSWORD before running this command.");
  }

  const { db } = await import("@/lib/db");
  try {
    await createUserFromCommand(process.argv.slice(2), process.env.NEW_USER_PASSWORD, {
      findUser: (email) => db.user.findUnique({ where: { email }, select: { id: true } }),
      createUser: (data) => db.user.create({ data, select: { id: true } }),
      write: (message) => console.log(message),
    });
  } finally {
    await db.$disconnect();
  }
}

const isMain = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isMain) {
  main()
    .catch((error) => {
      const code = error instanceof Error ? error.message : "CREATE_USER_FAILED";
      const safeMessages: Record<string, string> = {
        "Set NEW_USER_PASSWORD before running this command.": "Set NEW_USER_PASSWORD before running this command.",
        INVALID_EMAIL: "Provide a valid email using --email user@example.com.",
        PASSWORD_TOO_SHORT: "NEW_USER_PASSWORD must contain at least 12 characters.",
        USER_ALREADY_EXISTS: "A user with that email already exists.",
        CREATE_USER_FAILED: "Could not create user.",
      };
      console.error(safeMessages[code] ?? safeMessages.CREATE_USER_FAILED);
      process.exitCode = 1;
    });
}
