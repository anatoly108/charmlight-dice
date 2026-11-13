const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { build } = require('vite');

// Use the project's existing bundler to resolve the source's extensionless
// imports. No browser, additional test framework, or generated files in git.
exports.loadDice = async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'charmlight-dice-test-'));
  try {
    await build({
      configFile: false,
      publicDir: false,
      logLevel: 'error',
      build: {
        outDir,
        emptyOutDir: true,
        minify: false,
        lib: {
          entry: resolve(__dirname, 'entry.js'),
          formats: ['cjs'],
          fileName: () => 'dice.cjs',
        },
      },
    });
    return require(join(outDir, 'dice.cjs'));
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
};
