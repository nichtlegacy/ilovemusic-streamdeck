#!/usr/bin/env node
// Keeps the Stream Deck manifest version in step with package.json.
//
// package.json is the single source of truth. Elgato requires a four-part
// version, so the manifest carries the package version plus a build segment.
// `--check` verifies the two agree without writing, which is what CI runs; a
// drifting manifest would otherwise ship a version nobody chose.
//
//   node Scripts/version.mjs           # write manifest from package.json
//   node Scripts/version.mjs --check   # fail if they disagree
//   node Scripts/version.mjs --print   # print the four-part version

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = join(repoRoot, "package.json");
const manifestPath = join(repoRoot, "de.nichtlegacy.ilovemusic.sdPlugin", "manifest.json");

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const manifestRaw = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestRaw);

if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  fail(`package.json version must be X.Y.Z, got '${pkg.version}'`);
}

// Keep any build segment the manifest already carries, so a rebuild of the same
// release can be published as 0.1.0.1 without touching package.json.
const build = (manifest.Version ?? "").split(".")[3] ?? "0";
const expected = `${pkg.version}.${/^\d+$/.test(build) ? build : "0"}`;

const mode = process.argv[2] ?? "--write";

if (mode === "--print") {
  process.stdout.write(`${expected}\n`);
} else if (mode === "--check") {
  if (manifest.Version !== expected) {
    fail(
      `manifest version '${manifest.Version}' does not match package.json '${pkg.version}'.\n` +
        `       Run 'npm run version:sync' and commit the result.`,
    );
  }
  process.stdout.write(`manifest version ${manifest.Version} matches package.json\n`);
} else {
  if (manifest.Version === expected) {
    process.stdout.write(`manifest version already ${expected}\n`);
  } else {
    // Rewrite only the value, so the file keeps its key order and formatting.
    const updated = manifestRaw.replace(
      /("Version"\s*:\s*")[^"]*(")/,
      (_match, before, after) => `${before}${expected}${after}`,
    );
    if (updated === manifestRaw) fail("could not find a Version field to update in the manifest");
    writeFileSync(manifestPath, updated);
    process.stdout.write(`manifest version ${manifest.Version} -> ${expected}\n`);
  }
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}
