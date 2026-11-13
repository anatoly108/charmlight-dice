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

test('spotlight illumination stays visible and consistent across table sizes', () => {
  const box = new DiceBox('#dice');
  box.renderer = { setSize() {}, render() {} };
  box.setDimensions(new THREE.Vector2(900, 600));
  const large = box.light.intensity / box.light.position.lengthSq();
  assert.ok(large > 0.5 && large < 5, 'spotlight must compensate for board world units');
  assert.equal(box.light.decay, 2, 'keep current inverse-square light attenuation');
  assert.ok(box.light_amb.intensity > 0 && box.light_amb.intensity < large / 2,
    'fill light should support the studio lighting without flattening the facets');
  box.container = { clientWidth: 390, clientHeight: 844 };
  box.setDimensions(new THREE.Vector2(390, 844));
  const small = box.light.intensity / box.light.position.lengthSq();
  assert.ok(Math.abs(small - large) < 1e-6, 'resizing must not dim the dice');
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
