import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "43c380f8-2924-41a1-9bdb-707cba1c22fe";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    APP_BASE_URL: "https://politily.adityakhanna-tcc.workers.dev",
    ALERT_EMAIL: "adityakhanna.tcc@gmail.com",
    ALERT_FROM_EMAIL: "alerts@alerts.shirdisairasoi.org",
    GEMINI_MODEL: "gemini-3.5-flash",
    POLITILY_SCORE_THRESHOLD: "72",
    POLITILY_ALERT_MIN_SCORE: "85",
    POLITILY_MAX_DEEP_BRIEFS_PER_RUN: "0",
    POLITILY_MAX_EMAIL_ALERTS_PER_RUN: "4",
    POLITILY_MAX_SOURCES_PER_RUN: "32",
    POLITILY_FETCH_TIMEOUT_MS: "5000",
    POLITILY_MIN_STORY_DATE: "2026-07-20T00:00:00+05:30",
    POLITILY_MAX_MEDIA_FETCHES_PER_RUN: "10",
  },
  triggers: {
    crons: ["*/2 * * * *", "30 9,15 * * *"],
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
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: localBindingConfig,
    }),
  ],
});
