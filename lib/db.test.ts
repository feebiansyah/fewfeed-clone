import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";

describe("db", () => {
  it("exports a Prisma client without connecting on import", () => {
    expect(db).toBeTypeOf("object");
    expect(db.$connect).toBeTypeOf("function");
  });
});
