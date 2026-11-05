import { seedDemo } from "../src/lib/demo/seed";
import { db } from "../src/lib/db";

async function main() {
  const users = await db.user.count().catch(() => 0);
  if (users > 0 && process.env.FORCE_RESEED !== "1") {
    console.log(`Database already has ${users} users — keeping existing demo data.`);
    return;
  }
  const r = await seedDemo();
  console.log(`Seeded demo data: ${r.students} students`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
