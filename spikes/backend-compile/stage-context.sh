#!/usr/bin/env bash
# Stage the local PlatformIO toolchain + ch32v003fun framework into ./_ctx
# so the Dockerfile's COPY directives can pick them up from a relative path.
# Run before `docker build`.
#
# We use hard-links instead of cp -r when on the same filesystem to keep
# the context build fast (toolchain is ~1 GB).

set -euo pipefail

cd "$(dirname "$0")"

PIO_PACKAGES="${PIO_PACKAGES:-$HOME/.platformio/packages}"
TOOL_SRC="$PIO_PACKAGES/toolchain-riscv"
FW_SRC="$PIO_PACKAGES/framework-ch32v003fun"

[ -d "$TOOL_SRC" ] || { echo "missing $TOOL_SRC — install via PlatformIO first" >&2; exit 1; }
[ -d "$FW_SRC" ]   || { echo "missing $FW_SRC — install via PlatformIO first" >&2; exit 1; }

mkdir -p _ctx
rm -rf _ctx/toolchain-riscv _ctx/framework-ch32v003fun

# cp -al = hard-link copy (atomic per file, fast); falls back gracefully on
# cross-filesystem moves. Docker still tarballs the result so duplication
# in the daemon is unavoidable, but the context staging itself is cheap.
cp -al "$TOOL_SRC" _ctx/toolchain-riscv 2>/dev/null || cp -r "$TOOL_SRC" _ctx/toolchain-riscv
cp -al "$FW_SRC"   _ctx/framework-ch32v003fun 2>/dev/null || cp -r "$FW_SRC" _ctx/framework-ch32v003fun

echo "staged:"
du -sh _ctx/* 2>/dev/null
