// Builds the playground (demo/index.html) as a static site for GitHub Pages:
//   npm run build:demo   ->   dist-demo/
import { cpSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const outDir = 'dist-demo'

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: { input: 'demo/index.html' },
  },
  plugins: [{
    name: 'demo-site',
    closeBundle() {
      // The presets are fetched at runtime, so they are not part of the bundle.
      cpSync('demo/presets', `${outDir}/demo/presets`, { recursive: true })
      // Serve the playground from the site root.
      writeFileSync(`${outDir}/index.html`, '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./demo/"><link rel="canonical" href="./demo/">')
    },
  }],
})
