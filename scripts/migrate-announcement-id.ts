import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is missing.");
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: 'require' });

async function main() {
  console.log("🚀 Running migration: Add announcement_id column to announcements table...");

  try {
    // Check if column exists
    const columnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'announcements' AND column_name = 'announcement_id'
    `;

    if (columnCheck.length === 0) {
      console.log("⚠️ Column 'announcement_id' not found. Adding it now...");
      
      // Add the missing column
      await sql`ALTER TABLE announcements ADD COLUMN announcement_id TEXT`;
      
      // Create unique index
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS announcements_announcement_id_idx ON announcements (announcement_id)`;
      
      // Generate announcement_id for existing rows
      await sql`
        UPDATE announcements 
        SET announcement_id = 'announcement_' || EXTRACT(EPOCH FROM created_at)::bigint || '_' || SUBSTRING(id::text, 1, 8)
        WHERE announcement_id IS NULL
      `;
      
      console.log("✅ Migration complete: announcement_id column added");
    } else {
      console.log("✅ Column 'announcement_id' already exists");
    }
  } catch (e: any) {
    console.error("❌ Migration failed:", e.message);
    process.exit(1);
  }

  await sql.end();
  console.log("✨ Migration finished.");
}

main().catch(console.error);
