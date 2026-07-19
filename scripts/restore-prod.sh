#!/usr/bin/env bash
# Compatibility wrapper — use recover-prod.sh
exec "$(cd "$(dirname "$0")" && pwd)/recover-prod.sh" "$@"
