# Spike Dockerfile — bundles riscv-none-embed-gcc + ch32v003fun so a single
# `docker run --rm -i compile-spike < main.c > firmware.bin` produces a
# flashable .bin in well under a second.
#
# Build context expected at the project root; this Dockerfile is intended
# to be invoked as: docker build -f Dockerfile -t ch32v003-compile .
# from the spike directory. The build-context.sh helper stages the local
# toolchain + framework into ./_ctx/ so COPYs work without touching ~/.

FROM debian:bookworm-slim

# Toolchain dynamically links against host libstdc++ / libz / libexpat from
# 2018-era Debian. Pull them in instead of rebuilding the toolchain.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libc6 libstdc++6 libgmp10 libmpfr6 libexpat1 libz1 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Drop in the toolchain + framework (staged by build-context.sh).
COPY _ctx/toolchain-riscv     /opt/toolchain-riscv
COPY _ctx/framework-ch32v003fun /opt/framework-ch32v003fun

# Spike scripts.
COPY build.sh funconfig.h /opt/spike/
RUN chmod +x /opt/spike/build.sh

# Override the hard-coded paths in build.sh to point at the container
# layout. The script reads TOOL / FRAMEWORK / LIBGCC env vars when set.
ENV TOOL=/opt/toolchain-riscv/bin \
    FRAMEWORK=/opt/framework-ch32v003fun/ch32v003fun \
    LIBGCC=/opt/framework-ch32v003fun/misc/libgcc.a \
    PATH=/opt/toolchain-riscv/bin:$PATH

# Non-root user — defence in depth for untrusted code.
RUN useradd -r -u 1000 -m -d /work compiler
USER compiler
WORKDIR /work

# Single-shot interface: compile.sh reads source path arg or stdin.
ENTRYPOINT ["/opt/spike/build.sh"]
