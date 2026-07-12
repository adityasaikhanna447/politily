import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "43c380f8-2924-41a1-9bdb-707cba1c22fe";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  triggers: {
    crons: ["*/15 * * * *"],
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: "politily-d1",
      database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
    },
  ],
  r2_buckets: [],
};

export default defineConfig({
  plugins: [
    vinext(),
    sites(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: localBindingConfig,
    }),
  ],
});
