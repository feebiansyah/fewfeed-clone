"use server";

import { redirect } from "next/navigation";

import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type LoginState = {
  error?: "INVALID_CREDENTIALS" | "ACCOUNT_DISABLED";
};

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "INVALID_CREDENTIALS" };
  }

  if (!user.isActive) {
    return { error: "ACCOUNT_DISABLED" };
  }

  await createSession(user.id);
  redirect("/dashboard");
}
