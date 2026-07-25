import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "43c380f8-2924-41a1-9bdb-707cba1c22fe";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    APP_BASE_URL: "https://politily.adityakhanna-tcc.workers.dev",
    POLITILY_SCORE_THRESHOLD: "72",
    POLITILY_ALERT_MIN_SCORE: "60",
    POLITILY_MAX_DEEP_BRIEFS_PER_RUN: "1",
    POLITILY_MAX_EMAIL_ALERTS_PER_RUN: "5",
    POLITILY_MAX_SOURCES_PER_RUN: "18",
    POLITILY_FETCH_TIMEOUT_MS: "6500",
    POLITILY_MIN_STORY_DATE: "2026-07-20T00:00:00+05:30",
    POLITILY_MAX_MEDIA_FETCHES_PER_RUN: "6",
  },
  triggers: {
    crons: ["*/5 * * * *"],
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
