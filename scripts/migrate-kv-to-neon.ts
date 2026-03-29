import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "../packages/infrastructure/src/db/schema.js";
import crypto from "crypto";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is missing. Migration aborted.");
  process.exit(1);
}

const sql = neon(connectionString);
const db = drizzle(sql, { schema });

// This script now assumes KV data is already being accessed via the Postgres-backed KV fallback
// or that the user will provide the Vercel KV env vars for a one-time migration.

async function migrate() {
  console.log("🚀 KV to Neon Migration script (Post-KV removal version)");
  console.log("This script is now a placeholder as the system has moved to Postgres-only.");
  console.log("If you still need to migrate from Vercel KV, please revert to a previous commit or use an external migration tool.");
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
