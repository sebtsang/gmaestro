import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/state/db";
import { CompanyContextSchema } from "@/lib/shared/schemas";
import type { CompanyContext } from "@/lib/shared/types";

export function loadCompanyContext(userId: string): CompanyContext | null {
  const row = db
    .select()
    .from(schema.companyContext)
    .where(eq(schema.companyContext.userId, userId))
    .get();
  return row ? CompanyContextSchema.parse(row) : null;
}

export function saveCompanyContext(
  input: Omit<CompanyContext, "updatedAt">,
): CompanyContext {
  const row = { ...input, updatedAt: new Date() };
  db.insert(schema.companyContext)
    .values(row)
    .onConflictDoUpdate({
      target: schema.companyContext.userId,
      set: row,
    })
    .run();
  return CompanyContextSchema.parse(row);
}
