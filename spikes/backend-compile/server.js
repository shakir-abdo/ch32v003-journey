// Tiny HTTP wrapper around build.sh — turns the spike's one-shot CLI into
// a long-running compile service.
//
//   POST /compile   body  : raw C source (text/plain or text/x-c)
//                   200   : application/octet-stream — flat .bin
//                   400   : text/plain — compile error log (stderr)
//                   413   : body exceeds MAX_BODY
//                   504   : build.sh exceeded COMPILE_TIMEOUT_MS
//   GET  /health    200   : "ok"
//
// Defensive limits because this executes untrusted user-supplied C through
// a full GCC toolchain. Tighter sandboxing (seccomp, cgroup CPU/mem caps,
// network egress firewall) belongs at the orchestrator layer.

'use strict'

const http = require('node:http')
const {spawn} = require('node:child_process')
const {writeFile, readFile, mkdtemp, rm} = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'
const MAX_BODY = Number(process.env.MAX_BODY ?? 256 * 1024)
const COMPILE_TIMEOUT_MS = Number(process.env.COMPILE_TIMEOUT_MS ?? 5000)
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 4)
const BUILD_SH = process.env.BUILD_SH ?? '/opt/spike/build.sh'

let inflight = 0

async function readBody(req, limit) {
  let total = 0
  const chunks = []
  for await (const chunk of req) {
    total += chunk.length
    if (total > limit) {
      const e = new Error(`body too large (>${limit} bytes)`)
      e.statusCode = 413
      throw e
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function compile(source) {
  const work = await mkdtemp(path.join(os.tmpdir(), 'compile-'))
  const srcPath = path.join(work, 'main.c')
  const binPath = path.join(work, 'main.bin')
  try {
    await writeFile(srcPath, source)
    const proc = spawn(BUILD_SH, [srcPath, binPath], {stdio: ['ignore', 'pipe', 'pipe']})
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => {stdout += d.toString()})
    proc.stderr.on('data', (d) => {stderr += d.toString()})
    const exit = await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        proc.kill('SIGKILL')
        const e = new Error(`compile exceeded ${COMPILE_TIMEOUT_MS}ms`)
        e.statusCode = 504
        reject(e)
      }, COMPILE_TIMEOUT_MS)
      proc.once('close', (code) => {clearTimeout(t); resolve(code)})
      proc.once('error', (err) => {clearTimeout(t); reject(err)})
    })
    if (exit !== 0) {
      const e = new Error(stderr || stdout || `build.sh exit ${exit}`)
      e.statusCode = 400
      throw e
    }
    const bin = await readFile(binPath)
    return {bin, log: (stdout + stderr).trim()}
  } finally {
    await rm(work, {recursive: true, force: true})
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, {'content-type': 'text/plain'})
      res.end('ok\n')
      return
    }
    if (req.method === 'POST' && req.url === '/compile') {
      if (inflight >= MAX_CONCURRENT) {
        res.writeHead(503, {'content-type': 'text/plain', 'retry-after': '1'})
        res.end(`too many concurrent compiles (limit ${MAX_CONCURRENT})\n`)
        return
      }
      inflight++
      try {
        const body = await readBody(req, MAX_BODY)
        const {bin, log} = await compile(body.toString('utf8'))
        // Compile log goes in a header — keeps the body a clean .bin so the
        // caller can pipe it straight to the flash flow without parsing.
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': bin.length,
          'x-compile-log': encodeURIComponent(log.slice(0, 4000)),
        })
        res.end(bin)
      } finally {
        inflight--
      }
      return
    }
    res.writeHead(404, {'content-type': 'text/plain'})
    res.end('not found\n')
  } catch (e) {
    const status = e.statusCode ?? 500
    res.writeHead(status, {'content-type': 'text/plain'})
    res.end((e.message ?? String(e)) + '\n')
    if (status === 500) console.error(e)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[compiler] listening on ${HOST}:${PORT}  (max_body=${MAX_BODY}B, timeout=${COMPILE_TIMEOUT_MS}ms, concurrency=${MAX_CONCURRENT})`)
})

// Graceful shutdown so docker-compose stop doesn't wedge inflight compiles.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[compiler] ${sig} → draining (${inflight} inflight)`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 8000).unref()
  })
}
