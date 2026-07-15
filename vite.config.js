import { resolve } from "path"
import { defineConfig } from 'vite'
// vite.config.js

const root = resolve(__dirname, 'src')
const outDir = resolve(__dirname, 'dist')

export default defineConfig(({ command }) => ({
  root,
  // Only serve the top-level public/ (textures, sounds) during `vite`/`vite dev`,
  // so the src/index.html demo page has real assets to load. Keep it disabled
  // for `vite build` so the lib build's dist/ output is unaffected - public/ is
  // intentionally shipped as a separate directory (see package.json "files"),
  // not copied into dist.
  publicDir: command === 'serve' ? resolve(__dirname, 'public') : false,
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'dice-box-threejs',
      fileName: (format) => `dice-box-threejs.${format}.js`
    },
    outDir,
    emptyOutDir: true,
  }
}))