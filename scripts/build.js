#!/usr/bin/env node
// scripts/build.js — Production build
//
// Bundles each app into a single HTML file with inlined JS and CSS.
// Output: dist/<app>/index.html — deploy anywhere, zero server needed.

const { build } = require('esbuild')
const fs         = require('fs')
const path       = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

const APPS = [
  { name: 'hub',     entry: 'packages/hub/src/main.js',     html: 'packages/hub/index.html'     },
  { name: 'sandbox', entry: 'packages/sandbox/src/main.js', html: 'packages/sandbox/index.html' },
  { name: 'quiz',    entry: 'packages/quiz/src/main.js',     html: 'packages/quiz/index.html'    },
  { name: 'xray',    entry: 'packages/xray/src/main.js',     html: 'packages/xray/index.html'    },
]

const COLORS = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', dim: '\x1b[2m', red: '\x1b[31m',
}

function log(msg, color = '') {
  console.log(`${color}${msg}${COLORS.reset}`)
}

async function buildApp({ name, entry, html }) {
  const outDir = path.join(DIST, name)
  fs.mkdirSync(outDir, { recursive: true })

  const start = Date.now()

  // Bundle JS
  const result = await build({
    entryPoints:  [path.join(ROOT, entry)],
    bundle:       true,
    minify:       true,
    format:       'esm',
    write:        false,
    alias: {
      '@netlens/core':   path.join(ROOT, 'packages/core/src'),
      '@netlens/ui':     path.join(ROOT, 'packages/ui/src'),
    },
  })

  const jsCode = result.outputFiles[0].text

  // Bundle CSS (design system + app-specific)
  const cssFiles = [
    path.join(ROOT, 'packages/ui/src/design-system/tokens.css'),
    path.join(ROOT, 'packages/ui/src/design-system/index.css'),
    // App-specific CSS
    path.join(ROOT, `packages/${name}/src/${name}.css`),
  ].filter(f => fs.existsSync(f))

  const cssCode = cssFiles
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n')

  // Read HTML template and inline everything
  const htmlTemplate = fs.readFileSync(path.join(ROOT, html), 'utf8')
  const output = htmlTemplate
    // Remove external CSS links
    .replace(/<link rel="stylesheet"[^>]+>/g, '')
    // Remove external script tags
    .replace(/<script type="module"[^>]+><\/script>/g, '')
    // Inject inlined CSS before </head>
    .replace('</head>', `<style>${cssCode}</style>\n</head>`)
    // Inject inlined JS before </body>
    .replace('</body>', `<script type="module">${jsCode}</script>\n</body>`)

  const outPath = path.join(outDir, 'index.html')
  fs.writeFileSync(outPath, output)

  const elapsed  = Date.now() - start
  const size     = (fs.statSync(outPath).size / 1024).toFixed(1)
  log(`  ✓ ${name.padEnd(8)} ${size.padStart(6)} KB  ${elapsed}ms`, COLORS.green)
}

async function main() {
  log(`\n${COLORS.bold}NetLens Production Build${COLORS.reset}`)
  log(`Output: ${DIST}\n`, COLORS.dim)

  // Clean dist
  fs.rmSync(DIST, { recursive: true, force: true })
  fs.mkdirSync(DIST)

  const start = Date.now()

  // Build all apps concurrently
  await Promise.all(APPS.map(buildApp))

  // Copy shared assets (fonts are loaded from Google Fonts CDN in prod)
  // No assets to copy — fully self-contained HTML files

  const total = ((Date.now() - start) / 1000).toFixed(1)
  log(`\n${COLORS.bold}Done in ${total}s${COLORS.reset}`)
  log(`\nDeploy: copy dist/ to any static host (GitHub Pages, S3, Netlify)`, COLORS.dim)
  log(`        Each app/index.html is fully self-contained.\n`, COLORS.dim)
}

main().catch(e => {
  console.error(COLORS.red + 'Build failed: ' + e.message + COLORS.reset)
  process.exit(1)
})
