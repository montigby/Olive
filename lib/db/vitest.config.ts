import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests hit the real local database — run serially to keep assertions clean.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
