#!/usr/bin/env bash
# Builds the plugin and packs it into a distributable .streamDeckPlugin.
# Output: dist/de.nichtlegacy.ilovemusic.streamDeckPlugin
set -euo pipefail

cd "$(dirname "$0")/.."

PLUGIN_DIR="de.nichtlegacy.ilovemusic.sdPlugin"
OUTPUT_DIR="dist"

# package.json is the source of the version; refuse to pack a manifest that has
# drifted from it, so the artifact can never claim a version nobody chose.
node Scripts/version.mjs --check

VERSION="$(node Scripts/version.mjs --print)"
echo "==> Packing ${VERSION}"

npm run build

# Finder litter is invisible to .gitignore, which only keeps it out of git — it
# was being shipped inside the package.
find "$PLUGIN_DIR" -name ".DS_Store" -delete

mkdir -p "$OUTPUT_DIR"
npx streamdeck pack "$PLUGIN_DIR" --output "$OUTPUT_DIR" --force

echo
echo "Built: ${OUTPUT_DIR}/${PLUGIN_DIR%.sdPlugin}.streamDeckPlugin"
echo "Install by double-clicking it, or with: streamdeck install ${OUTPUT_DIR}/${PLUGIN_DIR%.sdPlugin}.streamDeckPlugin"
