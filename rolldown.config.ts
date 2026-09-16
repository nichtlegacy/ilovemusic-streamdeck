import { execFile } from "node:child_process";
import path from "node:path";
import url from "node:url";
import { defineConfig } from "rolldown";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "de.nichtlegacy.ilovemusic";
const sdPluginFolder = `${sdPlugin}.sdPlugin`;
const streamDeckCli = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "streamdeck.cmd" : "streamdeck",
);

export default defineConfig({
  input: "src/plugin.ts",
  output: {
    file: `${sdPluginFolder}/bin/plugin.js`,
    sourcemap: isWatching,
    sourcemapPathTransform: (relativeSourcePath, sourcemapPath) =>
      url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href,
    minify: !isWatching,
  },
  transform: {
    decorator: {
      legacy: true,
    },
  },
  platform: "node",
  resolve: {
    conditionNames: ["node"],
  },
  plugins: [
    {
      name: "watch-externals",
      buildStart() {
        this.addWatchFile(`${sdPluginFolder}/manifest.json`);
      },
      buildEnd() {
        if (isWatching) {
          execFile(streamDeckCli, ["restart", sdPlugin], (error, stdout, stderr) => {
            if (stdout) console.log(stdout.trim());
            if (stderr) console.error(stderr.trim());
            if (error) console.error("Failed to restart Stream Deck:", error.message);
          });
        }
      },
    },
    {
      name: "emit-module-package-file",
      generateBundle() {
        this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
      },
    },
  ],
});
