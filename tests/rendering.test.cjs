const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { loadDice } = require('./helpers/load-dice.cjs');

let DiceBox, DiceFactory, THREE, TEXTURELIST, COLORSETS, MATERIALTYPES, randomLook;
before(async () => { ({ DiceBox, DiceFactory, THREE, TEXTURELIST, COLORSETS, MATERIALTYPES, randomLook } = await loadDice()); });

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

const d20Triangles = edgeRoundness => {
  const factory = new DiceFactory({ baseScale: 100, edgeRoundness });
  factory.applyColorSet({
    id: `round-${edgeRoundness}`, foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'none' },
  });
  const mesh = factory.create('d20');
  const { position, normal } = mesh.geometry.attributes;
  const triangles = mesh.geometry.groups.map(group => ({
    bevel: group.materialIndex === 0,
    points: [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(position, group.start + i)),
    normals: [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(normal, group.start + i)),
  }));
  return { mesh, triangles };
};
const isFlat = triangle => triangle.normals.every(normal => normal.distanceTo(triangle.normals[0]) < 1e-6);

test('rounded edges shade bevels as curves and keep numbered faces flat', () => {
  const sharp = d20Triangles(0), round = d20Triangles(1);
  assert.equal(sharp.triangles.length, round.triangles.length, 'rounding must not add triangles');
  assert.ok(sharp.triangles.every(isFlat), 'roundness 0 keeps the original hard bevel');
  assert.equal(sharp.mesh.material[1].flatShading, true);

  const faces = round.triangles.filter(triangle => !triangle.bevel);
  const bevels = round.triangles.filter(triangle => triangle.bevel);
  assert.equal(faces.length, 20);
  assert.ok(faces.every(isFlat), 'numbers must sit on flat faces');
  assert.ok(bevels.length > 0 && bevels.every(triangle => !isFlat(triangle)), 'every bevel must blend between faces');
  assert.equal(round.mesh.material[1].flatShading, false, 'flat shading would ignore the rounding');

  // Each bevel corner borrows the normal of the numbered face it touches.
  const faceNormalAt = point => faces.find(face => face.points.some(corner => corner.distanceTo(point) < 1e-3)).normals[0];
  for (const bevel of bevels) {
    bevel.points.forEach((point, index) => assert.ok(bevel.normals[index].distanceTo(faceNormalAt(point)) < 1e-6));
  }

  const faceSize = triangles => triangles.find(triangle => !triangle.bevel).points[0].distanceTo(triangles.find(triangle => !triangle.bevel).points[1]);
  assert.ok(faceSize(round.triangles) < faceSize(sharp.triangles), 'a rounder edge is a wider bevel');
});

test('edge roundness changes at runtime and studio plastic uses the modern material', async () => {
  const box = makeBox();
  assert.equal(box.DiceFactory.edgeRoundness, 1);
  await box.updateConfig({ edge_roundness: 0 });
  assert.equal(box.DiceFactory.edgeRoundness, 0);

  const factory = new DiceFactory({ baseScale: 100 });
  factory.applyColorSet({
    id: 'studio-plastic', foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'plastic' },
  });
  const material = factory.create('d20').material[1];
  assert.equal(material.isMeshStandardMaterial, true);
  assert.equal(material.metalness, 0);
  assert.ok(material.roughness > 0.2 && material.roughness < 0.5);
});

test('matte plastic takes a smaller share of the environment so the key light models it', () => {
  const environment = new THREE.Texture();
  const share = name => {
    const box = makeBox({ light_intensity: 0.8 });
    box.scene.environment = environment;
    box.setupLighting();
    box.DiceFactory.applyColorSet({
      id: `share-${name}`, foreground: '#f4d899', background: '#48364e', outline: '#181220',
      texture: { name: 'none', material: name },
    });
    const die = box.DiceFactory.create('d20');
    box.diceList.push(die);
    assert.equal(die.material[1].envMap, environment, 'dice must reflect the studio environment');
    const before = die.material[1].envMapIntensity;
    box.updateConfig({ light_intensity: 0.4 });
    assert.ok(Math.abs(die.material[1].envMapIntensity - before / 2) < 1e-9, 'light intensity scales reflections on existing dice');
    return before;
  };
  const metal = share('metal'), plastic = share('plastic');
  assert.ok(Math.abs(metal - 0.8) < 1e-9, 'metal keeps the full environment');
  assert.ok(plastic < metal / 2, 'plastic must not be flooded by the environment');
});

test('every listed texture has its image files and every colorset names a listed texture', () => {
  const { existsSync } = require('node:fs');
  const { resolve } = require('node:path');
  const missing = [];
  for (const [key, texture] of Object.entries(TEXTURELIST)) {
    for (const file of [texture.source, texture.source_bump]) {
      if (file && !existsSync(resolve(__dirname, '../public', file))) missing.push(`${key}: ${file}`);
    }
  }
  assert.deepEqual(missing, [], 'a listed texture must not point at a missing image');
  assert.equal(Object.values(TEXTURELIST).filter(texture => texture.source).length, 30);

  const unknown = [];
  for (const [key, colorset] of Object.entries(COLORSETS)) {
    for (const name of [].concat(colorset.texture ?? [])) {
      if (typeof name === 'string' && !(name in TEXTURELIST)) unknown.push(`${key}: ${name}`);
    }
  }
  assert.deepEqual(unknown, [], 'a colorset must not name a texture that is not listed');
});

test('material tuning adjusts each knob live and lets go of it again', async () => {
  const dieOf = (box, material) => {
    box.DiceFactory.applyColorSet({
      id: `tuning-${material}`, foreground: '#f4d899', background: '#48364e', outline: '#181220',
      texture: { name: 'none', material },
    });
    const die = box.DiceFactory.create('d20');
    box.diceList.push(die);
    return die.material[1];
  };

  // Phong plastic: sheen, tightness, brightness and texture depth.
  const box = makeBox({ material_tuning: { sheen: 0.5 } });
  const phong = dieOf(box, 'none');
  assert.equal(phong.isMeshPhongMaterial, true);
  assert.equal(phong.specular.r, 0.5, 'tuning applies to new dice');
  const colour = phong.color.r, bump = phong.bumpScale;
  await box.updateConfig({ material_tuning: { sheen: 0.2, sheen_tightness: 30, brightness: 0.5, texture_depth: 2, roughness: 0.9 } });
  assert.ok(Math.abs(phong.specular.g - 0.2) < 1e-9, 'tuning applies to dice on the table');
  assert.equal(phong.shininess, 30);
  assert.ok(Math.abs(phong.color.r - colour / 2) < 1e-9);
  assert.equal(phong.bumpScale, bump * 2);
  assert.ok(Math.abs(keyLight(box) - 0.7 * Math.PI) < 1e-9, 'the lights themselves must not change');
  await box.updateConfig({ material_tuning: {} });
  assert.deepEqual([phong.specular.r, phong.shininess, phong.color.r, phong.bumpScale], [1, 5, colour, bump],
    'dropping a knob restores the material default');

  // PBR plastic: roughness, metalness and reflections.
  const pbrBox = makeBox();
  pbrBox.scene.environment = new THREE.Texture();
  pbrBox.setupLighting();
  const pbr = dieOf(pbrBox, 'plastic');
  const defaults = [pbr.roughness, pbr.metalness, pbr.envMapIntensity];
  await pbrBox.updateConfig({ material_tuning: { roughness: 0.8, metalness: 0.5, reflections: 1, sheen: 0 } });
  assert.deepEqual([pbr.roughness, pbr.metalness], [0.8, 0.5]);
  assert.ok(Math.abs(pbr.envMapIntensity - 0.7) < 1e-9, 'reflections 1 takes the whole environment');
  await pbrBox.updateConfig({ light_intensity: 0.35 });
  assert.ok(Math.abs(pbr.envMapIntensity - 0.35) < 1e-9, 'tuned reflections still follow the light intensity');
  await pbrBox.updateConfig({ light_intensity: 0.7, material_tuning: {} });
  [pbr.roughness, pbr.metalness, pbr.envMapIntensity].forEach((value, index) => assert.ok(Math.abs(value - defaults[index]) < 1e-9));
});

test('fill intensity scales only the soft light from all around', async () => {
  const box = makeBox();
  const fill = box.light_amb.intensity, key = keyLight(box);
  await box.updateConfig({ fill_intensity: 0.25 });
  assert.ok(Math.abs(box.light_amb.intensity - fill / 4) < 1e-9);
  assert.ok(Math.abs(keyLight(box) - key) < 1e-9, 'the main light must stay as bright');
});

test('rim light sits low and opposite the main light, casts no shadow and is off by default', async () => {
  const box = makeBox({ light_direction: { azimuth: 90, elevation: 50 } });
  assert.equal(box.light_rim, null);
  await box.updateConfig({ rim_intensity: 0.5, rim_color: '#3366ff', fill_color: '#aaccff', color_spotlight: '#ffd9a8' });
  const rim = box.light_rim, direction = rim.position.clone().normalize();
  assert.ok(direction.x < -0.8 && Math.abs(direction.y) < 1e-6, 'the main light is on the right, so the rim comes from the left');
  assert.ok(direction.z > 0.3 && direction.z < 0.5, 'the rim light stays low');
  assert.equal(rim.castShadow, false);
  assert.ok(Math.abs(rim.intensity - keyLight(box) / 2) < 1e-9, 'rim strength is relative to the main light');
  assert.equal(rim.color.getHexString(), '3366ff');
  assert.equal(box.light_amb.color.getHexString(), 'aaccff');
  assert.equal(box.light.color.getHexString(), 'ffd9a8');
  assert.equal(box.scene.children.filter(child => child === rim).length, 1);

  box.setLightDirection({ azimuth: 0, elevation: 90 });
  assert.ok(box.light_rim.position.z > 0, 'a light straight above still gets a rim');
  assert.equal(box.scene.children.includes(rim), false, 'the replaced rim light must leave the scene');
  await box.updateConfig({ rim_intensity: 0 });
  assert.equal(box.light_rim, null);
  assert.equal(box.scene.children.filter(child => child.isDirectionalLight).length, box.lights.length);
});

test('clear coat is a PBR-only layer that tunes live', async () => {
  const box = makeBox();
  box.DiceFactory.applyColorSet({
    id: 'coat-test', foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'plastic' },
  });
  const die = box.DiceFactory.create('d20');
  box.diceList.push(die);
  const material = die.material[1];
  assert.equal(material.isMeshPhysicalMaterial, true);
  assert.equal(material.clearcoat, 0, 'no coat unless asked for');
  await box.updateConfig({ material_tuning: { clearcoat: 0.8, clearcoat_roughness: 0.2 } });
  assert.deepEqual([material.clearcoat, material.clearcoatRoughness], [0.8, 0.2]);
  await box.updateConfig({ material_tuning: {} });
  assert.equal(material.clearcoat, 0);
});

test('studio reflections turn with the main light unless told to stay', async () => {
  const turnOf = box => THREE.MathUtils.radToDeg(box.scene.environmentRotation.y);
  const box = makeBox({ light_direction: { azimuth: 160, elevation: 50 } });
  assert.ok(Math.abs(turnOf(box)) < 1e-6, 'the room is unturned when the light sits at its bright side');
  assert.ok(Math.abs(box.scene.environmentRotation.x - Math.PI / 2) < 1e-9, 'the room stays upright on the Z-up board');
  box.setLightDirection({ azimuth: 100, elevation: 50 });
  assert.ok(Math.abs(turnOf(box) - 60) < 1e-6);
  box.setLightDirection({ azimuth: 100, elevation: 20 });
  assert.ok(Math.abs(turnOf(box) - 60) < 1e-6, 'only the compass direction matters');

  box.scene.environment = new THREE.Texture();
  box.setupLighting();
  box.DiceFactory.applyColorSet({
    id: 'follow-test', foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'metal' },
  });
  const die = box.DiceFactory.create('d20');
  box.diceList.push(die);
  box.setLightDirection({ azimuth: 250, elevation: 50 });
  const dieTurn = THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(die.material[1].envMapRotation.y), 360);
  assert.ok(Math.abs(dieTurn - 270) < 1e-6, 'dice on the table follow too');
  await box.updateConfig({ reflections_follow_light: false });
  assert.equal(box.scene.environmentRotation.y, 0);
  assert.equal(die.material[1].envMapRotation.y, 0);
});

test('iridescence, brushed highlights and glow tune live and stay off by default', async () => {
  const box = makeBox();
  box.DiceFactory.applyColorSet({
    id: 'layers-test', foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'plastic' },
  });
  const die = box.DiceFactory.create('d20');
  box.diceList.push(die);
  const material = die.material[1];
  assert.deepEqual([material.iridescence, material.anisotropy, material.emissiveIntensity > 0 && material.emissive.getHex() > 0], [0, 0, false]);

  // Stand in for the glow mask a browser canvas would have produced.
  material.userData.glowMap = new THREE.Texture();
  await box.updateConfig({ material_tuning: {
    iridescence: 0.8, iridescence_thickness: 600, anisotropy: 0.7, anisotropy_angle: 90, glow: 1.5, texture_depth: 2,
  } });
  assert.equal(material.iridescence, 0.8);
  assert.equal(material.iridescenceThicknessMaximum, 600);
  assert.equal(material.anisotropy, 0.7);
  assert.ok(Math.abs(material.anisotropyRotation - Math.PI / 2) < 1e-9);
  assert.equal(material.emissiveMap, material.userData.glowMap);
  assert.equal(material.emissiveIntensity, 1.5);
  assert.equal(material.emissive.getHexString(), 'f4d899', 'the glow takes the number colour by default');
  assert.equal(material.normalScale.x, 2, 'texture depth also drives normal maps');

  await box.updateConfig({ material_tuning: { glow: 1, glow_color: '#00ffcc' } });
  assert.equal(material.emissive.getHexString(), '00ffcc');
  await box.updateConfig({ material_tuning: {} });
  assert.deepEqual([material.iridescence, material.anisotropy, material.emissiveMap, material.emissiveIntensity], [0, 0, null, 0]);
});

const TUNING_KEYS = ['brightness', 'texture_depth', 'glow', 'glow_color', 'sheen', 'sheen_tightness', 'roughness', 'metalness',
  'reflections', 'clearcoat', 'clearcoat_roughness', 'iridescence', 'iridescence_thickness', 'anisotropy', 'anisotropy_angle'];
const assertLook = (look, label) => {
  const skin = look.options.theme_customColorset;
  assert.ok(skin.material in MATERIALTYPES, `${label}: unknown material ${skin.material}`);
  assert.ok(skin.texture in TEXTURELIST, `${label}: unknown texture ${skin.texture}`);
  assert.ok(skin.name, `${label}: the library needs a colorset name`);
  for (const colour of [skin.background, skin.foreground, skin.outline]) assert.match(colour, /^#[0-9a-f]{6}$/, label);
  for (const key of Object.keys(look.options.material_tuning)) assert.ok(TUNING_KEYS.includes(key), `${label}: unknown tuning ${key}`);
  const { azimuth, elevation } = look.options.light_direction;
  assert.ok(azimuth >= 0 && azimuth <= 360 && elevation >= 15 && elevation <= 90, label);
};

test('saved presets are complete, valid and listed', () => {
  const { readdirSync, readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const folder = resolve(__dirname, '../demo/presets');
  const index = JSON.parse(readFileSync(resolve(folder, 'index.json'), 'utf8'));
  const files = readdirSync(folder).filter(file => file !== 'index.json').sort();
  assert.deepEqual(index.map(entry => entry.file), files, 'the preset list must match the files');
  assert.equal(files.length, 31);
  for (const file of files) {
    const preset = JSON.parse(readFileSync(resolve(folder, file), 'utf8'));
    assert.ok(preset.name && preset.description, file);
    assertLook(preset, file);
  }
});

test('random looks always name real materials, textures and knobs', () => {
  const materials = new Set();
  for (let i = 0; i < 300; i++) {
    const look = randomLook();
    assertLook(look, `random look ${i}`);
    materials.add(look.options.theme_customColorset.material);
  }
  assert.ok(materials.size >= 4, 'random looks must cover several materials');
});

test('optional hooks locate, pick and highlight a settled die', () => {
  const box = makeBox();
  box.DiceFactory.applyColorSet({
    id: 'hooks-test', foreground: '#f4d899', background: '#48364e', outline: '#181220',
    texture: { name: 'none', material: 'none' },
  });
  const die = box.DiceFactory.create('d20');
  die.notation = { type: 'd20' };
  box.diceList.push(die);
  box.scene.add(die);
  die.position.set(0, 0, 79);

  const center = box.getDieScreenPosition(0);
  assert.ok(Math.abs(center.x - 450) < 1e-6 && Math.abs(center.y - 300) < 1e-6, 'a die at the origin sits mid-container');
  assert.ok(center.radius > 40 && center.radius < 70, `a d20 is about 100px across: ${center.radius}`);
  die.position.set(450, 300, 79);
  const moved = box.getDieScreenPosition(0);
  assert.ok(moved.x > center.x && moved.y < center.y, 'right and up in the world is right and up on screen');
  assert.equal(box.getDieScreenPosition(5), null);

  assert.equal(box.pickDie(moved.x, moved.y), 0);
  assert.equal(box.pickDie(moved.x - 3 * moved.radius, moved.y), null);

  // Highlighting only touches the face that points up, and can be undone.
  for (const material of die.material) material.userData.glowMap = new THREE.Texture();
  const top = box.getTopFaceMaterial(die);
  box.highlightDie(0, { glow: 2, color: '#ffcc00' });
  const lit = die.material.filter(material => material.emissiveMap);
  assert.deepEqual(lit.map(material => die.material.indexOf(material)), [die.material.indexOf(top)]);
  assert.equal(top.emissive.getHexString(), 'ffcc00');
  box.updateConfig({ material_tuning: { brightness: 1.2 } });
  assert.equal(top.emissiveIntensity, 2, 'retuning the material keeps the highlight');
  box.highlightDie(0, null);
  assert.equal(die.material.some(material => material.emissiveMap), false);
  assert.equal(top.emissiveIntensity, 0);
});

test('roll speed plays the same throw faster without changing its result', async t => {
  const previousWindow = globalThis.window;
  const frames = [];
  globalThis.window = Object.assign(new EventTarget(), {
    devicePixelRatio: 1, requestAnimationFrame: callback => frames.push(callback), cancelAnimationFrame() {},
  });
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setTimeout', callback => { callback(); return 0; });
  const previousRaf = globalThis.requestAnimationFrame, previousEvent = globalThis.CustomEvent;
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.document.dispatchEvent = () => {};
  t.after(() => { globalThis.window = previousWindow; globalThis.requestAnimationFrame = previousRaf; globalThis.CustomEvent = previousEvent; });

  const framesFor = async roll_speed => {
    const box = makeBox({ roll_speed });
    box.DiceFactory.applyColorSet({
      id: `speed-${roll_speed}`, foreground: '#f4d899', background: '#48364e', outline: '#181220',
      texture: { name: 'none', material: 'none' },
    });
    box.colorData = { texture: { material: 'none' } };
    frames.length = 0;
    let settled = null;
    const pending = box.roll('1d20@17').then(result => { settled = result; });
    let count = 0;
    while (!settled && count < 5000) {
      now += 1000 / 60;
      const frame = frames.shift();
      if (frame) frame();
      await Promise.resolve();
      count++;
    }
    await pending;
    return { count, value: settled.sets[0].rolls[0].value };
  };
  const normal = await framesFor(1), fast = await framesFor(3);
  assert.equal(normal.value, 17);
  assert.equal(fast.value, 17, 'a faster throw must land on the supplied value');
  assert.ok(fast.count < normal.count * 0.5, `speed 3 should need far fewer frames: ${normal.count} -> ${fast.count}`);
});
