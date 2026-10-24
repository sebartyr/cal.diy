import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { defineConfig } from "prisma/config";

// With a config file Prisma stops loading .env on its own. Deployments inject the variables directly,
// so the file is optional.
const envFile = path.join(__dirname, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: path.join(__dirname, "schema.prisma"),
  migrations: {
    seed: "yarn seed-basic",
  },
});
