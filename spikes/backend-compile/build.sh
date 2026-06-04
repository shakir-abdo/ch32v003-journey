#!/usr/bin/env bash
# Spike: turn a single C source file into a flashable CH32V003 .bin.
# Mirrors the toolchain flags PlatformIO + ch32v003fun use.
#
# Usage: ./build.sh <source.c> [output.bin]
#
# Outputs a flat binary suitable for the flash flow proven in
# public/webusb-spike.html. The toolchain + framework paths point at
# the local PlatformIO install; for the production service these will
# come from inside a Docker image.

set -euo pipefail

SRC="${1:?usage: build.sh <source.c> [output.bin]}"
OUT="${2:-${SRC%.c}.bin}"

# Paths default to the local PlatformIO install; override via env when
# running inside the container.
TOOL="${TOOL:-/home/shakir/.platformio/packages/toolchain-riscv/bin}"
FRAMEWORK="${FRAMEWORK:-/home/shakir/.platformio/packages/framework-ch32v003fun/ch32v003fun}"
LIBGCC="${LIBGCC:-/home/shakir/.platformio/packages/framework-ch32v003fun/misc/libgcc.a}"

GCC="$TOOL/riscv-none-embed-gcc"
OBJCOPY="$TOOL/riscv-none-embed-objcopy"
SIZE="$TOOL/riscv-none-embed-size"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Common compile flags. Mirrors ch32v003fun's own ch32v003fun.mk
# (-march=rv32ec, no `xw`). PlatformIO's bundled toolchain has a WCH-
# patched GCC that accepts `rv32ecxw` for compressed-bus-write code-size
# optimisations, but upstream xPack riscv-none-embed-gcc — which is what
# the production Docker image uses — only supports the standard `rv32ec`.
# Functional equivalence; the .bin is a few hundred bytes larger without
# the WCH compressed extensions.
CFLAGS=(
  -std=gnu11 -Os -g -Wall
  -msmall-data-limit=0 -msave-restore
  -fmessage-length=0 -fsigned-char
  -ffunction-sections -fdata-sections -fno-common
  -Wunused -Wuninitialized -Wno-comment
  -march=rv32ec -mabi=ilp32e
  -flto -static-libgcc -nostdlib
  -DCH32V003J4 -DCH32V00X -DCH32V00x -DCH32V003
  -I"$(dirname "$(realpath "$0")")"
  -I"$FRAMEWORK"
)

# Preprocess the framework's linker template (it has #define guards).
"$GCC" -E -P -x c \
  -DTARGET_MCU=CH32V003 -DMCU_PACKAGE=0 -DTARGET_MCU_LD=0 \
  "$FRAMEWORK/ch32v003fun.ld" > "$WORK/link.ld"

# Compile framework runtime + user source.
"$GCC" "${CFLAGS[@]}" -c "$FRAMEWORK/ch32v003fun.c" -o "$WORK/ch32v003fun.o"
"$GCC" "${CFLAGS[@]}" -c "$SRC" -o "$WORK/user.o"

# Link.
"$GCC" \
  -T "$WORK/link.ld" \
  -Os -march=rv32ec -mabi=ilp32e \
  -ffunction-sections -fdata-sections -Wl,-gc-sections \
  --specs=nano.specs --specs=nosys.specs \
  -nostartfiles -flto -static-libgcc -nostdlib \
  "$WORK/ch32v003fun.o" "$WORK/user.o" \
  -Wl,--start-group -lm "$LIBGCC" -Wl,--end-group \
  -o "$WORK/firmware.elf"

# Extract flat binary.
"$OBJCOPY" -O binary "$WORK/firmware.elf" "$OUT"

# Report sizes.
"$SIZE" "$WORK/firmware.elf"
echo "→ $OUT  ($(stat -c%s "$OUT") bytes)"
