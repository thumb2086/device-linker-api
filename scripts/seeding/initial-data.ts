import { MetaManager } from "../../packages/domain/src/index.js";

async function seed() {
  console.log("Seeding initial data...");
  const metaManager = new MetaManager();

  // In real implementation, insert into Postgres
  // await db.insert(users).values({ ...adminUser });

  console.log("Seeding complete.");
}

seed().catch(console.error);
