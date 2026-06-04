/**
 * In-memory per-IP rate limiter for hot endpoints.
 *
 * Scoped to /api/compile because that's the expensive one (toolchain
 * invocation). Other Nuxt routes pass through untouched.
 *
 * Limits: 20 requests / 60 s rolling window per IP. Hitting the cap
 * returns 429 with a Retry-After header so well-behaved clients back
 * off. Cloudflare's edge rate limiter should handle the first wave;
 * this is the second line of defence in case CF is misconfigured or
 * an attacker bypasses CF (direct VPS IP, internal probing, etc).
 *
 * Caveats:
 * - In-memory only — counters reset on each container restart. For a
 *   single-instance deploy that's fine; if we ever go multi-instance
 *   swap this for Redis or rely solely on CF.
 * - The Map is bounded by lazy GC: every request sweeps expired
 *   entries when the Map exceeds GC_TRIGGER. Keeps memory predictable
 *   under abuse without scheduling a background timer.
 */

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20
const GC_TRIGGER = 1024

interface Bucket {count: number; resetAt: number}
const buckets = new Map<string, Bucket>()

function getClientIp(event: ReturnType<typeof useEvent> | Parameters<Parameters<typeof defineEventHandler>[0]>[0]): string {
  // Cloudflare's authoritative client IP (set by their edge); fall back
  // to the standard proxy chain headers, then the socket peer.
  const cfIp     = getRequestHeader(event, 'cf-connecting-ip')
  const realIp   = getRequestHeader(event, 'x-real-ip')
  const fwd      = getRequestHeader(event, 'x-forwarded-for')
  const firstFwd = fwd ? fwd.split(',')[0]?.trim() : undefined
  const sockIp   = event.node?.req?.socket?.remoteAddress
  return cfIp || realIp || firstFwd || sockIp || 'unknown'
}

function sweepExpired(now: number): void {
  if (buckets.size < GC_TRIGGER) return
  for (const [ip, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(ip)
  }
}

export default defineEventHandler((event) => {
  const url = event.node.req.url ?? ''
  if (!url.startsWith('/api/compile')) return

  const ip = getClientIp(event)
  const now = Date.now()
  sweepExpired(now)

  const bucket = buckets.get(ip)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, {count: 1, resetAt: now + WINDOW_MS})
    return
  }

  bucket.count++
  if (bucket.count > MAX_PER_WINDOW) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    setResponseHeader(event, 'retry-after', String(retryAfter))
    setResponseHeader(event, 'x-ratelimit-limit', String(MAX_PER_WINDOW))
    setResponseHeader(event, 'x-ratelimit-window', '60s')
    throw createError({
      statusCode: 429,
      statusMessage: 'too many requests',
      data: {
        detail: `max ${MAX_PER_WINDOW} compiles per minute per IP; retry in ${retryAfter}s`,
      },
    })
  }
})
