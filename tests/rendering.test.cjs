const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { loadDice } = require('./helpers/load-dice.cjs');

let DiceBox, DiceFactory, THREE;
before(async () => { ({ DiceBox, DiceFactory, THREE } = await loadDice()); });

// Drawing is a browser responsibility; these checks exercise the actual
// generated textures/materials and scene lighting with a minimal canvas boundary.
globalThis.HTMLImageElement = class {};
globalThis.document = {
  querySelector: () => ({ clientWidth: 900, clientHeight: 600 }),
  createElement: () => ({
    width: 300, height: 150,
    getContext: () => ({
      clearRect() {}, fillRect() {}, translate() {}, rotate() {},
      strokeText() {}, fillText() {}, measureText: () => ({ width: 10 }),
    }),
  }),
};

test('generated face colors use sRGB while bump textures remain linear data', () => {
  const factory = new DiceFactory({ baseScale: 100 });
  factory.applyColorSet({
    id: 'color-test', foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'glass' },
  });
  const mesh = factory.create('d20');
  for (const material of mesh.material) {
    assert.equal(material.map.colorSpace, THREE.SRGBColorSpace);
    if (material.bumpMap) assert.equal(material.bumpMap.colorSpace, THREE.NoColorSpace);
  }
});

const makeBox = (options) => {
  const box = new DiceBox('#dice', options);
  box.renderer = { setSize() {}, render() {}, shadowMap: {} };
  box.setDimensions(new THREE.Vector2(900, 600));
  return box;
};
const keyLight = box => box.lights.reduce((sum, light) => sum + light.intensity, 0);
const towardsLight = box => box.light.position.clone().normalize();

test('key light illumination stays visible and consistent across table sizes', () => {
  const box = makeBox();
  const large = keyLight(box);
  assert.ok(large > 0.5 && large < 5, 'the key light must visibly light the dice');
  assert.ok(box.light_amb.intensity > 0 && box.light_amb.intensity < large / 2,
    'fill light should support the studio lighting without flattening the facets');
  box.container = { clientWidth: 390, clientHeight: 844 };
  box.setDimensions(new THREE.Vector2(390, 844));
  assert.ok(Math.abs(keyLight(box) - large) < 1e-6, 'resizing must not dim the dice');
});

test('light direction follows azimuth and elevation, a vector, and runtime changes', async () => {
  const box = makeBox({ light_direction: { azimuth: 90, elevation: 30 } });
  let direction = towardsLight(box);
  assert.ok(Math.abs(direction.x - Math.cos(Math.PI / 6)) < 1e-6, 'azimuth 90 lights from the right');
  assert.ok(Math.abs(direction.y) < 1e-6);
  assert.ok(Math.abs(direction.z - 0.5) < 1e-6);

  await box.updateConfig({ light_direction: { azimuth: 0, elevation: 90 } });
  assert.ok(towardsLight(box).z > 0.999, 'elevation 90 lights from straight above');

  box.setLightDirection({ x: -2, y: 0, z: 2 });
  direction = towardsLight(box);
  assert.ok(Math.abs(direction.x + Math.SQRT1_2) < 1e-6 && Math.abs(direction.z - Math.SQRT1_2) < 1e-6);

  box.setLightDirection({ x: 0, y: 1, z: -5 });
  direction = towardsLight(box);
  assert.ok(direction.z > 0.2 && direction.y > 0.9, 'a light below the table is lifted above it');
});

test('every light of the key cluster covers the whole table with its shadow map', () => {
  for (const light_direction of [{ azimuth: 315, elevation: 58 }, { azimuth: 40, elevation: 15 }, { azimuth: 0, elevation: 90 }]) {
    const box = makeBox({ light_direction, shadow_quality: 'high', shadow_softness: 2 });
    assert.equal(box.lights.length, 5);
    for (const light of box.lights) {
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
      light.shadow.updateMatrices(light);
      for (const x of [-900, 900]) for (const y of [-600, 600]) for (const z of [0, 300]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(light.shadow.camera.matrixWorldInverse)
          .applyMatrix4(light.shadow.camera.projectionMatrix);
        assert.ok(Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && Math.abs(point.z) <= 1,
          `table corner ${x},${y},${z} must be inside the shadow map`);
      }
    }
  }
});

test('shadow softness and quality choose the size of the light cluster', () => {
  assert.equal(makeBox({ shadow_quality: 'low' }).lights.length, 1);
  assert.equal(makeBox({ shadow_quality: 'medium' }).lights.length, 3);
  assert.equal(makeBox({ shadow_quality: 'high', shadow_softness: 0 }).lights.length, 1, 'a hard light is a single point');
  const soft = makeBox({ shadow_quality: 'high', shadow_softness: 2 });
  const spread = Math.max(...soft.lights.map(light => light.position.angleTo(soft.light.position)));
  assert.ok(spread > 0.1 && spread < 0.2, 'a softer light is a wider cluster');
  assert.ok(soft.lights.every(light => light.castShadow));
  assert.equal(soft.desk.material.opacity, 0.5);
});

test('contact shadows sit under resting dice, fade with height and leave with the die', () => {
  const factory = new DiceFactory({ baseScale: 100 });
  factory.applyColorSet({
    id: 'contact-test', foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'metal' },
  });
  const box = makeBox({ shadow_opacity: 0.4 });
  const die = factory.create('d20');
  box.diceList.push(die);
  box.scene.add(die);
  box.addContactShadow(die);
  const patch = die.contactShadow;

  die.position.set(120, -80, 79);
  box.render();
  assert.equal(patch.visible, true);
  assert.deepEqual([patch.position.x, patch.position.y], [120, -80]);
  const resting = patch.material.opacity;
  assert.ok(resting > 0.3);

  die.position.z = 170;
  box.render();
  assert.ok(patch.material.opacity > 0 && patch.material.opacity < resting, 'a lifted die darkens the table less');
  die.position.z = 400;
  box.render();
  assert.equal(patch.visible, false, 'a die high in the air leaves no contact shadow');

  die.position.z = 79;
  box.setShadows(false);
  assert.equal(patch.visible, false);
  assert.equal(box.lights.some(light => light.castShadow), false);
  box.setShadows(true);
  assert.equal(patch.visible, true);

  let disposed = false;
  patch.material.addEventListener('dispose', () => { disposed = true; });
  box.clearDice();
  assert.equal(disposed, true);
  assert.equal(box.scene.children.includes(patch), false);
});

test('solid dice respect depth and retain material reflection strength', () => {
  const factory = new DiceFactory({ baseScale: 100 });
  factory.applyColorSet({
    id: 'solid-test', foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'metal' },
  });
  const mesh = factory.create('d20');
  for (const material of mesh.material) {
    assert.equal(material.transparent, false, 'solid dice should occlude one another');
    assert.equal(material.depthTest, true);
    assert.equal(material.depthWrite, true);
    assert.ok(material.envMapIntensity > 0, 'metal must reflect the studio environment');
  }
});

test('a pixel-density-only change redraws settled dice', t => {
  const previousWindow = globalThis.window;
  const frames = [];
  globalThis.window = Object.assign(new EventTarget(), {
    devicePixelRatio: 1,
    requestAnimationFrame: callback => frames.push(callback),
    cancelAnimationFrame() {},
  });
  t.after(() => { globalThis.window = previousWindow; });
  const box = new DiceBox('#dice');
  let ratio = 1, drawn = true;
  const canvas = { width: 900, height: 600 };
  box.renderer = {
    domElement: canvas,
    getPixelRatio: () => ratio,
    setPixelRatio(value) {
      ratio = value;
      this.setSize(900, 600); // WebGLRenderer clears the canvas here.
    },
    setSize(width, height) { canvas.width = width * ratio; canvas.height = height * ratio; drawn = false; },
    render() { drawn = true; },
  };
  box.resizeWorld();
  window.devicePixelRatio = 2;
  window.dispatchEvent(new Event('resize'));
  frames.shift()();
  assert.equal(ratio, 2);
  assert.equal(canvas.width, 1800);
  assert.equal(drawn, true, 'settled dice must redraw after the buffer is resized');
});

test('resizing disposes the replaced shadow target and table resources', () => {
  const box = new DiceBox('#dice');
  box.renderer = { setSize() {}, render() {} };
  box.setDimensions(new THREE.Vector2(900, 600));
  const target = new THREE.WebGLRenderTarget(16, 16);
  box.light.shadow.map = target;
  const disposed = [];
  target.addEventListener('dispose', () => disposed.push('shadow'));
  box.desk.geometry.addEventListener('dispose', () => disposed.push('geometry'));
  box.desk.material.addEventListener('dispose', () => disposed.push('material'));
  box.setDimensions(new THREE.Vector2(390, 844));
  assert.deepEqual(disposed.sort(), ['geometry', 'material', 'shadow']);
});

test('destroy frees GPU resources, listeners and the canvas, and stops rendering', t => {
  const previousWindow = globalThis.window;
  globalThis.window = Object.assign(new EventTarget(), {
    devicePixelRatio: 1, requestAnimationFrame() {}, cancelAnimationFrame() {},
  });
  t.after(() => { globalThis.window = previousWindow; });
  const factory = new DiceFactory({ baseScale: 100 });
  const box = new DiceBox('#dice');
  const calls = [];
  let renders = 0;
  box.renderer = {
    setSize() {}, render() { renders++; }, shadowMap: {},
    dispose() { calls.push('renderer'); }, forceContextLoss() { calls.push('context'); },
    domElement: { remove() { calls.push('canvas'); } },
  };
  box.setDimensions(new THREE.Vector2(900, 600));
  box.resizeWorld();
  box.DiceFactory.applyColorSet({
    id: 'destroy-test', foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'metal' },
  });
  const die = box.DiceFactory.create('d6');
  box.diceList.push(die);
  box.scene.add(die);
  box.addContactShadow(die);
  die.material[0].addEventListener('dispose', () => calls.push('die material'));
  die.material[0].map.addEventListener('dispose', () => calls.push('face texture'));
  die.geometry.addEventListener('dispose', () => calls.push('die shape'));
  box.desk.material.addEventListener('dispose', () => calls.push('table'));
  const removed = [];
  window.removeEventListener = (type, handler) => removed.push([type, handler]);

  box.destroy();
  box.destroy();
  assert.deepEqual(calls.sort(), ['canvas', 'context', 'die material', 'die shape', 'face texture', 'renderer', 'table']);
  assert.deepEqual(removed, [['resize', box.resizeHandler]]);
  assert.equal(box.scene.children.filter(child => child.isMesh || child.isLight).length, 0);
  const before = renders;
  box.render();
  box.setLightDirection({ azimuth: 10, elevation: 40 });
  assert.equal(renders, before, 'a destroyed box must not draw');
  assert.rejects(() => box.initialize(), /destroyed/);
});

test('the package entry loads as plain ESM without a browser or a bundler', () => {
  // The host app renders on the server first: importing must not touch the DOM.
  const { execFileSync } = require('node:child_process');
  const { resolve } = require('node:path');
  const root = resolve(__dirname, '..');
  const output = execFileSync(process.execPath, ['--input-type=module', '-e',
    `const dice = await import('charmlight-dice'); console.log(typeof dice.default, dice.default === dice.DiceBox, typeof document);`,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(output.trim(), 'function true undefined');
});

test('the installed package ships the source, types, assets and nothing else', () => {
  const { execFileSync } = require('node:child_process');
  const { resolve } = require('node:path');
  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: resolve(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }))[0].files.map(file => file.path);
  for (const needed of ['src/index.js', 'src/index.d.ts', 'src/DiceBox.js', 'bin/copy-assets.mjs', 'public/textures/bronze01.webp', 'package.json']) {
    assert.ok(packed.includes(needed), `${needed} must be in the package`);
  }
  assert.deepEqual(packed.filter(path => /^(tests|demo|docs|dist|\.claude|\.github)\//.test(path)), []);
});
