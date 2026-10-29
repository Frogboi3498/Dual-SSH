#!/bin/bash
# Builds the .dmg and .pkg installers on a Mac. Result: dist/*.dmg and dist/*.pkg
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed once, to BUILD the installers (the installers themselves need nothing)."
  echo "Install it from https://nodejs.org then run this again."
  read -n 1 -s -r -p "Press any key to close"; exit 1
fi
# Use a mirror if GitHub downloads stall on your network (override by exporting your own).
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"
npm install --ignore-scripts || { echo "npm install failed"; read -n 1 -s -r -p "Press any key"; exit 1; }
npm run dist:mac || { echo "build failed"; read -n 1 -s -r -p "Press any key"; exit 1; }
echo; echo "Done. Installers are in: $(pwd)/dist"
open dist
