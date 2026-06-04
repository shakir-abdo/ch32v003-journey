/**
 * POST /api/compile — proxy to the compiler service.
 *
 *   request : raw C source as the request body (text/plain or text/x-c)
 *   200     : application/octet-stream — flat .bin, ready for flash flow
 *             header `x-compile-log` = URI-encoded toolchain output
 *   400     : text/plain — compile error log (GCC stderr)
 *   413     : input too large
 *   502/504 : compiler service unreachable / timed out
 *
 * The compiler container is the only thing in the system that runs the
 * RISC-V toolchain — keeps the Nuxt image lean and lets the compiler
 * scale (or be replaced by Cloud Run) without touching the front-end.
 *
 * COMPILER_URL is set at runtime (docker-compose: http://compiler:3001).
 * For local `pnpm dev` outside compose, set COMPILER_URL=http://localhost:3001
 * after `docker compose up compiler`.
 */
export default defineEventHandler(async (event) => {
  const compilerUrl = process.env.COMPILER_URL ?? 'http://compiler:3001'

  const body = await readRawBody(event, false)
  if (!body || body.length === 0) {
    throw createError({statusCode: 400, statusMessage: 'empty body — POST C source as the request body'})
  }

  let upstream: Response
  try {
    upstream = await fetch(`${compilerUrl}/compile`, {
      method: 'POST',
      headers: {'content-type': 'text/x-c'},
      body,
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    throw createError({
      statusCode: 502,
      statusMessage: 'compiler service unreachable',
      data: {detail: e instanceof Error ? e.message : String(e), compilerUrl},
    })
  }

  if (!upstream.ok) {
    const text = await upstream.text()
    throw createError({
      statusCode: upstream.status,
      statusMessage: upstream.statusText || 'compile failed',
      data: {log: text.trim()},
    })
  }

  const bin = new Uint8Array(await upstream.arrayBuffer())
  const log = upstream.headers.get('x-compile-log') ?? ''

  setResponseHeaders(event, {
    'content-type': 'application/octet-stream',
    'content-length': bin.length,
    'x-compile-log': log,
    'cache-control': 'no-store',
  })
  return bin
})
