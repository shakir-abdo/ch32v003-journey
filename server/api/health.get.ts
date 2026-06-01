/**
 * Health probe for container orchestrators (Docker HEALTHCHECK, Dokploy,
 * k8s readiness/liveness, load balancers).
 *
 * Returns 200 with a small JSON payload — no DB roundtrip, no auth.
 * Add downstream checks here if you want richer readiness signals
 * (DB ping, queue connectivity, etc.) but be careful: a slow probe
 * eats orchestrator timeout budgets and can mark a healthy app as down.
 */
export default defineEventHandler(() => ({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString()
}))
