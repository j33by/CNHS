#!/usr/bin/env bash
# Creates the platform folders (android/ windows/) for one app, then patches them. Run from the repo root.
# Usage: tools/prepare_app.sh <admin|teacher|student> <platforms,comma,separated> "<App label>"
set -euo pipefail
APP="$1"; PLATFORMS="$2"; LABEL="$3"
cd "apps/$APP"
TMP="$(mktemp -d)"
flutter create --no-pub --org edu.calapenhs --project-name "cnhs_$APP" --platforms="$PLATFORMS" "$TMP/scaffold" >/dev/null
for p in ${PLATFORMS//,/ }; do
  if [ ! -d "$p" ]; then cp -r "$TMP/scaffold/$p" "$p"; fi
done
if [[ "$PLATFORMS" == *android* ]]; then python3 ../../tools/patch_android.py android "$LABEL"; fi
if [ -f windows/runner/main.cpp ]; then sed -i "s/L\"cnhs_$APP\"/L\"$LABEL\"/" windows/runner/main.cpp; fi
flutter pub get
echo "Prepared $APP ($PLATFORMS)"
