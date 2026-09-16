import { defineConfig } from "rolldown";

export default defineConfig({
  input: "tests/run.ts",
  output: {
    file: ".test-dist/run.js",
    format: "esm",
  },
  platform: "node",
  resolve: {
    conditionNames: ["node"],
  },
});
