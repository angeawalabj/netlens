#!/usr/bin/env node
// scripts/dev.js — Fix EISDIR : vérifie qu'un chemin est un fichier avant de lire

const http = require('http')
const path = require('path')
const fs   = require('fs')

const ROOT = path.resolve(__dirname, '..')

const APPS = [
  { name: 'hub',     dir: 'packages/hub',    port: 3000 },
  { name: 'sandbox', dir: 'packages/sandbox', port: 3001 },
  { name: 'quiz',    dir: 'packages/quiz',    port: 3002 },
  { name: 'xray',    dir: 'packages/xray',    port: 3003 },
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2':'font/woff2',
  '.svg':  'image/svg+xml',
}

const IMPORT_MAP = {
  imports: {
    '@netlens/core':
      'http://localhost:4000/packages/core/src/index.js',
    '@netlens/core/protocols':
      'http://localhost:4000/packages/core/src/protocols/index.js',
    '@netlens/core/quiz/engine.js':
      'http://localhost:4000/packages/core/src/quiz/engine.js',
    '@netlens/core/quiz/questions.js':
      'http://localhost:4000/packages/core/src/quiz/questions.js',
    '@netlens/core/anomaly/engine.js':
      'http://localhost:4000/packages/core/src/anomaly/engine.js',
    '@netlens/ui/components/dom.js':
      'http://localhost:4000/packages/ui/src/components/dom.js',
    '@netlens/ui/components/PacketFlow/PacketFlow.js':
      'http://localhost:4000/packages/ui/src/components/PacketFlow/PacketFlow.js',
    '@netlens/ui/components/Inspector/Inspector.js':
      'http://localhost:4000/packages/ui/src/components/Inspector/Inspector.js',
  }
}

function isFile(p) {
  try { return fs.statSync(p).isFile() } catch { return false }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}

function resolveFile(reqUrl, appDir) {
  const clean = (reqUrl.split('?')[0] || '/').replace(/\.\./g, '')

  const candidates = [
    path.join(ROOT, appDir, clean === '/' ? 'index.html' : clean),
    path.join(ROOT, appDir, 'index.html'),
    path.join(ROOT, clean),
  ]

  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate
    if (isDir(candidate)) {
      const idx = path.join(candidate, 'index.html')
      if (isFile(idx)) return idx
    }
  }
  return null
}

function injectImportMap(html) {
  const tag = '<script type="importmap">\n' + JSON.stringify(IMPORT_MAP, null, 2) + '\n</script>'
  if (html.includes('<script')) return html.replace('<script', tag + '\n<script')
  return html.replace('</head>', tag + '\n</head>')
}

function createServer(appDir, port, name) {
  const server = http.createServer((req, res) => {
    const filePath = resolveFile(req.url, appDir)

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('404 Not Found: ' + req.url)
      return
    }

    const ext  = path.extname(filePath).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-cache')

    try {
      let content = fs.readFileSync(filePath)
      if (ext === '.html') content = injectImportMap(content.toString())
      res.writeHead(200, { 'Content-Type': mime })
      res.end(content)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('500: ' + err.message)
    }
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error('[' + name + '] Port ' + port + ' already in use')
    else console.error('[' + name + ']', err.message)
  })

  server.listen(port, '127.0.0.1', () => {
    console.log('  [' + name.padEnd(8) + '] http://localhost:' + port)
  })
  return server
}

console.log('\nNetLens Dev Server\n')
createServer('.', 4000, 'root')
APPS.forEach(function(app) { createServer(app.dir, app.port, app.name) })
console.log('\n  Press Ctrl+C to stop\n')
process.on('SIGINT', function() { process.exit(0) })
