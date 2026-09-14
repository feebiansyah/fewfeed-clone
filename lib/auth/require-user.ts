import type { User } from "../../generated/prisma/client";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}
