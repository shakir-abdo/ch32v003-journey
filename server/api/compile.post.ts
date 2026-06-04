/**
 * POST /api/compile — proxy to the compiler service, gated by Origin
 * check and (optionally) Google reCAPTCHA v3 verification.
 *
 *   request : raw C source as the request body (text/plain or text/x-c)
 *             header `x-recaptcha-token` (required if NUXT_RECAPTCHA_SECRET_KEY set)
 *   200     : application/octet-stream — flat .bin, ready for flash flow
 *             header `x-compile-log` = URI-encoded toolchain output
 *   400     : text/plain — compile error log (GCC stderr)
 *   403     : origin not allowed / recaptcha failed
 *   413     : input too large
 *   502/504 : compiler service unreachable / timed out
 *
 * Defence layers (in order):
 *   1. Cloudflare edge rate limiting (configured per-domain in CF dashboard)
 *   2. server/middleware/rate-limit.ts (per-IP, 20 req/60s, in-process)
 *   3. Origin allow-list (this file)
 *   4. reCAPTCHA v3 score check (this file, env-gated)
 *   5. compiler container caps (256 KB body, 5 s timeout, 4 concurrent)
 *
 * COMPILER_URL is set at runtime (docker-compose: http://compiler:3001).
 * For local `pnpm dev` outside compose, set COMPILER_URL=http://localhost:3001
 * after `docker compose up compiler`.
 */

// Browser origins allowed to POST /api/compile. Anything else (cross-origin
// fetch from a third-party site, `curl` without an Origin header) gets 403
// unless it presents a valid reCAPTCHA token (which the public site has but
// scripted callers don't).
const ALLOWED_ORIGINS = new Set<string>([
  'https://ch32v003.shakir.sd',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

// reCAPTCHA v3 returns a score 0.0..1.0; 0.5 is Google's recommended cut-off.
const RECAPTCHA_MIN_SCORE = 0.5
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

interface RecaptchaResponse {
  success: boolean
  score?: number
  action?: string
  hostname?: string
  challenge_ts?: string
  'error-codes'?: string[]
}

async function verifyRecaptcha(token: string, secret: string): Promise<RecaptchaResponse> {
  const params = new URLSearchParams({secret, response: token})
  const res = await fetch(RECAPTCHA_VERIFY_URL, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: params.toString(),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`recaptcha siteverify HTTP ${res.status}`)
  return await res.json() as RecaptchaResponse
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const recaptchaSecret = config.recaptchaSecretKey

  // ── Origin gate ──────────────────────────────────────────────────
  const origin = getRequestHeader(event, 'origin')
  const originOk = origin ? ALLOWED_ORIGINS.has(origin) : false

  // ── reCAPTCHA gate (env-gated; if no secret is configured, skip) ──
  if (recaptchaSecret) {
    const token = getRequestHeader(event, 'x-recaptcha-token')
    if (!token) {
      // Allow same-origin browser requests through *only* if reCAPTCHA isn't
      // configured. With reCAPTCHA on, every request must carry a token —
      // origin alone is too weak (Origin is forgeable from curl).
      throw createError({
        statusCode: 403,
        statusMessage: 'recaptcha token required',
        data: {detail: 'send a v3 token in the x-recaptcha-token header'},
      })
    }
    let verdict: RecaptchaResponse
    try {
      verdict = await verifyRecaptcha(token, recaptchaSecret)
    } catch (e) {
      // Treat verification failures (Google outage / network) as soft-fail
      // → 503 so the client can retry; better than letting all requests
      // through silently if reCAPTCHA breaks.
      throw createError({
        statusCode: 503,
        statusMessage: 'recaptcha verification unavailable',
        data: {detail: e instanceof Error ? e.message : String(e)},
      })
    }
    const score = verdict.score ?? 0
    if (!verdict.success || score < RECAPTCHA_MIN_SCORE) {
      throw createError({
        statusCode: 403,
        statusMessage: 'recaptcha rejected',
        data: {
          detail: `score=${score} success=${verdict.success}`,
          errorCodes: verdict['error-codes'] ?? [],
        },
      })
    }
    // If a token is present and valid we accept regardless of Origin.
  } else if (!originOk) {
    // No reCAPTCHA configured → fall back to a strict origin check.
    throw createError({
      statusCode: 403,
      statusMessage: 'origin not allowed',
      data: {detail: `origin "${origin ?? '(missing)'}" not in allow-list`},
    })
  }

  // ── Body ──────────────────────────────────────────────────────────
  const body = await readRawBody(event, false)
  if (!body || body.length === 0) {
    throw createError({statusCode: 400, statusMessage: 'empty body — POST C source as the request body'})
  }

  // ── Proxy to the compiler container ───────────────────────────────
  const compilerUrl = process.env.COMPILER_URL ?? 'http://compiler:3001'
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
