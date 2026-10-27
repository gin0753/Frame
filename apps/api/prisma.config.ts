import { defineConfig } from 'prisma/config';

// Deliberately inherit the shell; neither CLI nor API implicitly loads .env.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
