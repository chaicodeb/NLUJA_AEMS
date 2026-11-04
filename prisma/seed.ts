import { seedDemo } from "../src/lib/demo/seed";
import { db } from "../src/lib/db";

seedDemo()
  .then((r) => {
    console.log(`Seeded demo data: ${r.students} students`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
