#!/bin/bash
# Deploy NOAA-Forecast.js to Scriptable's iCloud directory
SRC="$(dirname "$0")/NOAA-Forecast.js"
DEST="$HOME/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents/NOAA-Forecast.js"

cp "$SRC" "$DEST"
echo "Deployed to Scriptable: $DEST"
