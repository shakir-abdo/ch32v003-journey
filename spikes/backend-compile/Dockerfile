# Compiler service — bundles riscv-none-embed-gcc + ch32v003fun and exposes
# an HTTP POST /compile endpoint that turns C source into a flashable .bin
# in ~1 second. Promoted from spike (single-shot CLI) to long-running
# service via the Node.js wrapper in server.js.
#
# Build context expected at this directory:
#   docker build -t ch32v003-compiler .
# stage-context.sh stages the local toolchain + framework into ./_ctx/.

FROM debian:bookworm-slim

# Toolchain dynamically links against host libstdc++ / libz / libexpat.
# nodejs runs the HTTP wrapper. tini = clean PID-1 signal handling so
# docker-compose stop doesn't have to SIGKILL inflight compiles.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libc6 libstdc++6 libgmp10 libmpfr6 libexpat1 libz1 ca-certificates \
        nodejs tini && \
    rm -rf /var/lib/apt/lists/*

# Drop in the toolchain + framework (staged by stage-context.sh).
COPY _ctx/toolchain-riscv     /opt/toolchain-riscv
COPY _ctx/framework-ch32v003fun /opt/framework-ch32v003fun

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
