const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { mkdir } = require('node:fs/promises');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('vite');

let server, browser, origin;
before(async () => {
  server = await createServer({
    configFile: false, root: resolve(__dirname, '../..'), publicDir: 'public',
    logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  await mkdir(resolve(__dirname, '../../test-results'), { recursive: true });
});
after(async () => { await browser?.close(); await server?.close(); });

for (const viewport of [{ width: 900, height: 600 }, { width: 390, height: 844 }]) {
  for (const material of ['none', 'metal', 'glass', 'wood']) {
    test(`${material} dice render and complete supplied rolls at ${viewport.width}px`, { timeout: 90_000 }, async () => {
      const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.width < 500 ? 3 : 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' || /THREE.*(?:deprecated|removed)|not a property of THREE/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      try {
        await page.goto(`${origin}/tests/browser/index.html?material=${material}`);
        await page.evaluate(() => window.ready);
        const state = await page.evaluate(async () => {
          const result = await box.roll('4d20@1,7,13,20');
          const gl = box.renderer.getContext();
          // Render immediately before reading: the default canvas does not
          // preserve its drawing buffer between animation frames.
          box.renderer.render(box.scene, box.camera);
          const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let visible = 0, bright = 0, shadow = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] > 200) {
              visible++;
              if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 40) bright++;
            }
          }
          const comparison = new Uint8Array(pixels.length);
          box.desk.visible = false;
          box.renderer.render(box.scene, box.camera);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, comparison);
          for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] > comparison[i] + 2 && comparison[i] < 200) shadow++;
          }
          box.desk.visible = true;

          // Isolate the environment: direct and hemisphere lights cannot mask
          // a missing reflection map in this check.
          const direct = box.light.intensity, fill = box.light_amb.intensity;
          const environment = box.scene.environment;
          box.light.intensity = 0;
          box.light_amb.intensity = 0;
          box.renderer.render(box.scene, box.camera);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          box.scene.environment = null;
          box.renderer.render(box.scene, box.camera);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, comparison);
          let reflected = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            reflected += Math.max(0, pixels[i] + pixels[i + 1] + pixels[i + 2] - comparison[i] - comparison[i + 1] - comparison[i + 2]);
          }
          box.scene.environment = environment;
          box.light.intensity = direct;
          box.light_amb.intensity = fill;
          box.renderer.render(box.scene, box.camera);
          return {
            revision, values: result.sets[0].rolls.map(die => die.value),
            faces: box.diceList.map(die => die.getFaceValue().value),
            visible, bright, glError: gl.getError(),
            shadow, reflected, pixelRatio: box.renderer.getPixelRatio(),
            toneMapping: box.renderer.toneMapping,
            environment: Boolean(box.scene.environment),
            webglVersion: gl.getParameter(gl.VERSION),
            colorSpaces: box.diceList[0].material.map(material => material.map.colorSpace),
          };
        });
        assert.equal(state.revision, '187');
        assert.match(state.webglVersion, /WebGL 2/);
        assert.deepEqual(state.values, [1, 7, 13, 20]);
        assert.deepEqual(state.faces, [1, 7, 13, 20]);
        assert.ok(state.visible > 1000, `dice must draw visible pixels: ${JSON.stringify(state)}`);
        assert.ok(state.bright / state.visible > 0.25, 'dice must remain illuminated');
        assert.equal(state.glError, 0);
        assert.equal(state.pixelRatio, viewport.width < 500 ? 2 : 1);
        assert.equal(state.environment, true);
        assert.equal(state.toneMapping, 7); // Three.js NeutralToneMapping.
        if (material !== 'none') assert.ok(state.reflected > 1000, 'studio environment must contribute reflected light');
        assert.ok(state.shadow > 100, 'grounded dice must draw soft shadow pixels');
        assert.ok(state.colorSpaces.every(colorSpace => colorSpace === 'srgb'));
        const followup = await page.evaluate(async () => {
          const added = await box.add('1d20@17');
          const rerolled = await box.reroll([0]);
          const next = await box.roll('2d20@20,1');
          return { added: added[0].value, rerolled: rerolled[0].value, next: next.total };
        });
        assert.equal(followup.added, 17);
        assert.ok(followup.rerolled >= 1 && followup.rerolled <= 20);
        assert.equal(followup.next, 21);
        await page.setViewportSize({ width: viewport.width + 40, height: viewport.height });
        await page.waitForFunction(() => box.renderer.domElement.width === Math.floor(window.innerWidth * box.renderer.getPixelRatio()));
        assert.deepEqual(errors, []);
        await page.screenshot({ path: resolve(__dirname, `../../test-results/${material}-${viewport.width}.png`) });
      } finally {
        await page.close();
      }
    });
  }
}
