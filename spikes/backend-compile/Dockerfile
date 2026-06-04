# Compiler service — bundles riscv-none-embed-gcc + ch32v003fun and exposes
# an HTTP POST /compile endpoint that turns C source into a flashable .bin
# in ~1 second. Self-contained: downloads the xPack toolchain + the
# ch32v003fun framework at build time, so no host-side `_ctx/` staging is
# required (works on Dokploy / Cloud Run / fresh CI without any extra step).
#
#   docker build -t ch32v003-compiler .
#
# Pinned versions (bump deliberately, verify SHA changes):
#   - xPack riscv-none-embed-gcc 8.2.0-3.1  (matches PlatformIO's pkg)
#   - cnlohr/ch32fun @ ec727ff (last commit before ch32v003fun → ch32fun
#     rename — preserves the on-disk layout build.sh expects).

FROM debian:bookworm-slim

# Toolchain dynamically links against host libstdc++ / libz / libexpat.
# nodejs runs the HTTP wrapper. tini = clean PID-1 signal handling so
# docker-compose stop doesn't have to SIGKILL inflight compiles. curl +
# ca-certificates needed for the toolchain/framework downloads below.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libc6 libstdc++6 libgmp10 libmpfr6 libexpat1 libz1 \
        ca-certificates curl nodejs tini && \
    rm -rf /var/lib/apt/lists/*

# ── Toolchain: xPack riscv-none-embed-gcc 8.2.0-3.1 (linux x64) ───────
# 216 MB compressed, ~1.1 GB extracted. SHA256 pinned for supply-chain
# integrity — if upstream rotates the tarball, the build fails loudly
# instead of silently picking up a different toolchain.
RUN set -eux; \
    cd /tmp; \
    curl -fsSL -o toolchain.tgz \
      https://github.com/xpack-dev-tools/riscv-none-embed-gcc-xpack/releases/download/v8.2.0-3.1/xpack-riscv-none-embed-gcc-8.2.0-3.1-linux-x64.tgz; \
    echo "3d40fab50ebad8424ff85748f25d2eaee50f86a5d5222abd7a45a2e490f1e4f5  toolchain.tgz" | sha256sum -c -; \
    mkdir -p /opt/toolchain-riscv; \
    # Tarball nests as xPacks/riscv-none-embed-gcc/8.2.0-3.1/<bin,lib,share,…>
    # so strip 3 levels to land /opt/toolchain-riscv/{bin,lib,share,…} flat.
    tar -xzf toolchain.tgz -C /opt/toolchain-riscv --strip-components=3; \
    rm toolchain.tgz

# ── Framework: cnlohr/ch32fun @ ec727ff ───────────────────────────────
# Last commit before the ch32v003fun/ → ch32fun/ rename (Feb 2025) —
# keeps the directory + filename layout that build.sh's hardcoded paths
# expect. ~2 MB tarball; trivial relative to the toolchain.
RUN set -eux; \
    cd /tmp; \
    curl -fsSL -o ch32v003fun.tgz \
      https://github.com/cnlohr/ch32fun/archive/ec727ff42e9b6ea5d89446d7af2ca11655574794.tar.gz; \
    echo "27690acf1089c47cfc899090b65f1d2fedad87cebe072ce2aa7ab8becbc5f518  ch32v003fun.tgz" | sha256sum -c -; \
    mkdir -p /opt/framework-ch32v003fun; \
    tar -xzf ch32v003fun.tgz -C /opt/framework-ch32v003fun --strip-components=1; \
    rm ch32v003fun.tgz

# curl + ca-certs were only needed at build time — strip them so the
# runtime image has nothing extra to keep up to date for security.
RUN apt-get purge -y --auto-remove curl && rm -rf /var/lib/apt/lists/*

# build.sh + HTTP wrapper.
COPY build.sh funconfig.h server.js /opt/spike/
RUN chmod +x /opt/spike/build.sh

# Override the hard-coded paths in build.sh to point at the container
# layout. The script reads TOOL / FRAMEWORK / LIBGCC env vars when set.
ENV TOOL=/opt/toolchain-riscv/bin \
    FRAMEWORK=/opt/framework-ch32v003fun/ch32v003fun \
    LIBGCC=/opt/framework-ch32v003fun/misc/libgcc.a \
    PATH=/opt/toolchain-riscv/bin:$PATH \
    PORT=3001 \
    HOST=0.0.0.0

# Non-root user — defence in depth for untrusted code.
RUN useradd -r -u 1000 -m -d /work compiler
USER compiler
WORKDIR /work

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# tini → node so PID 1 forwards signals correctly to the HTTP server.
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/spike/server.js"]
