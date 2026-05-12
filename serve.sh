#!/usr/bin/env sh
# Serves the project on http://127.0.0.1:8080/ (localhost only).
cd "$(dirname "$0")" || exit 1
exec python3 -m http.server 8080 --bind 127.0.0.1
