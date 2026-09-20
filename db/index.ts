import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  const binding = env.DB as D1Database | undefined;

  if (!binding) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the production D1 database ID and DB binding in vite.config.ts, then rebuild and deploy the Worker."
    );
  }

  return drizzle(binding, { schema });
}
