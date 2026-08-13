#!/usr/bin/env bash
# Vendors Tesseract.js locally into src/tesseract/, since Manifest V3
# extensions cannot load scripts from a CDN at runtime.
#
# Run this once after cloning (or whenever bumping the Tesseract.js version).
# Requires Node/npm. Safe to re-run.

set -euo pipefail

DEST="src/tesseract"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$DEST"

echo "Fetching tesseract.js, tesseract.js-core, and @tesseract.js-data/eng..."
(
  cd "$TMP"
  npm init -y > /dev/null 2>&1
  npm install --no-audit --no-fund tesseract.js@5 @tesseract.js-data/eng > /dev/null
)

echo "Copying vendor files into $DEST ..."
cp "$TMP/node_modules/tesseract.js/dist/tesseract.min.js" "$DEST/"
cp "$TMP/node_modules/tesseract.js/dist/worker.min.js" "$DEST/"

# LSTM-only core matches Tesseract.js's default OEM (OEM.LSTM_ONLY) and is
# roughly 20% smaller than the combined legacy+LSTM core — no reason to ship
# the legacy engine when the library defaults to LSTM anyway.
cp "$TMP/node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js" "$DEST/tesseract-core.wasm.js"
cp "$TMP/node_modules/tesseract.js-core/tesseract-core-lstm.wasm" "$DEST/tesseract-core.wasm"

# Must match the LSTM-only build variant (4.0.0_best_int) — see
# tesseract.js's worker-script/index.js for how this path is derived.
cp "$TMP/node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz" "$DEST/"

echo "Done. Vendored files:"
ls -la "$DEST"
