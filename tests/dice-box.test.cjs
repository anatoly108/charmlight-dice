const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { loadDice } = require('./helpers/load-dice.cjs');

let DiceBox;
before(async () => { ({ DiceBox } = await loadDice()); });

// Only the browser output boundaries are replaced. Dice meshes, geometry,
// face selection, notation, physics, animation, events and promises stay real.
globalThis.document = Object.assign(new EventTarget(), {
  querySelector: () => ({ clientWidth: 600, clientHeight: 400 }),
});
globalThis.requestAnimationFrame = () => {};

function createTable(t) {
  let now = 1_000_000;
  let seed = 123456789;
  const frames = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(Math, 'random', () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  t.mock.method(globalThis, 'requestAnimationFrame', callback => frames.push(callback));

  const box = new DiceBox('#table', { framerate: 0.02 });
  box.renderer = { render() {} };
  Object.assign(box.display, {
    currentWidth: 300, currentHeight: 200,
    containerWidth: 600, containerHeight: 400,
  });
  box.world.gravity.set(0, 0, -9.8 * box.gravity_multiplier);
  box.world.allowSleep = true;
  box.world.solver.iterations = 14;
  box.makeWorldBox();
  box.DiceFactory.applyColorSet({
    id: 'test', foreground: '#fff', background: '#000', outline: 'none',
    texture: { name: 'none', material: 'none' },
  });
  box.colorData = box.DiceFactory.colordata;
  box.DiceFactory.createMaterials = () => [];

  return {
    box,
    advance(milliseconds) { now += milliseconds; },
    settle(frameMilliseconds = 20) {
      let count = 0;
      while (box.rolling) {
        assert.ok(++count <= 1100, 'animation must finish within its iteration limit');
        assert.ok(frames.length, 'unfinished roll must schedule another animation frame');
        now += frameMilliseconds;
        frames.shift()(now);
      }
      return count;
    },
  };
}

test('reroll after an idle pause stays pending until the visible throw settles', async t => {
  const table = createTable(t);
  const { box } = table;
  const initial = box.roll('1d20@7');
  table.settle();
  await initial;
  table.advance(10_000);

  const callbacks = [];
  const events = [];
  box.onRerollComplete = result => callbacks.push(result);
  const listener = event => events.push(event.detail);
  document.addEventListener('rerollComplete', listener);
  t.after(() => document.removeEventListener('rerollComplete', listener));

  let resolved = false;
  const rerolled = box.reroll([0]).then(result => { resolved = true; return result; });
  await Promise.resolve();
  assert.equal(callbacks.length, 0, 'callback must not fire on the first frame');
  assert.equal(events.length, 0, 'event must wait for the animation');
  assert.equal(resolved, false, 'returned promise must wait for the animation');
  assert.ok(table.settle() > 1);
  const result = await rerolled;
  assert.deepEqual(callbacks, [result]);
  assert.deepEqual(events, [result]);
  assert.equal(result[0].value, box.diceList[0].getFaceValue().value);
});

test('runtime configuration changes apply while preserving the custom finish', async t => {
  const { box } = createTable(t);
  const custom = { name: 'charmlight', foreground: '#ffd700', background: '#151015' };
  box.theme_customColorset = custom;

  await box.updateConfig({ volume: 25, strength: 2, onRollComplete: () => {} });
  assert.equal(box.volume, 25);
  assert.equal(box.strength, 2);
  assert.equal(box.theme_customColorset, custom);
});

test('explicitly clearing a custom finish reloads the named theme', async t => {
  const { box } = createTable(t);
  box.theme_customColorset = { name: 'charmlight' };
  await box.updateConfig({ theme_customColorset: null });
  assert.equal(box.theme_customColorset, null);
  assert.equal(box.colorData.name, 'White');
});

test('clearing the texture override triggers a theme reload', async t => {
  const { box } = createTable(t);
  box.theme_texture = 'metal';
  await box.updateConfig({ theme_texture: '' });
  assert.equal(box.theme_texture, '');
  assert.equal(box.colorData.name, 'White');
});

test('enabling sound at runtime loads impact sounds before resolving', async t => {
  const { box } = createTable(t);
  class AudioBoundary {
    set src(value) { this.url = value; queueMicrotask(() => this.oncanplaythrough()); }
    play() { return Promise.resolve(); }
  }
  const previousAudio = globalThis.Audio;
  globalThis.Audio = AudioBoundary;
  t.after(() => { globalThis.Audio = previousAudio; });

  await box.updateConfig({ sounds: true });
  assert.equal(box.sounds, true);
  assert.equal(box.sounds_table.felt.length, 7);
  assert.equal(box.sounds_dice.coin.length, 6);
  assert.equal(box.sounds_dice.plastic.length, 15);
  box.lastSoundStep = -1;
  assert.doesNotThrow(() => box.eventCollide({
    body: box.box_body.desk,
    target: { velocity: { length: () => 1000 } },
  }));
});

test('collisions while sound clips load do not interrupt an active roll', async t => {
  const table = createTable(t);
  const { box } = table;
  class AudioBoundary {
    set src(value) { this.url = value; queueMicrotask(() => this.oncanplaythrough()); }
    play() { return Promise.resolve(); }
  }
  const previousAudio = globalThis.Audio;
  globalThis.Audio = AudioBoundary;
  t.after(() => { globalThis.Audio = previousAudio; });

  const rolled = box.roll('2d20@7,20');
  const updated = box.updateConfig({ sounds: true });
  try {
    // loadSounds() is still awaiting the first surface clip at this point.
    assert.equal(box.sounds_dice.plastic, undefined);
    assert.doesNotThrow(() => box.eventCollide({
      body: box.diceList[0].body, target: box.diceList[1].body,
    }));
    // Coins use their own bank, which is also not loaded yet.
    box.diceList[0].body.diceShape = 'd2';
    assert.doesNotThrow(() => box.eventCollide({
      body: box.diceList[0].body, target: box.diceList[1].body,
    }));
  } finally {
    await updated;
    table.settle();
    await rolled;
  }
  assert.equal((await rolled).total, 27);
});

test('added dice wait for animation and preserve supplied results and settled dice', async t => {
  const table = createTable(t);
  const { box } = table;
  const initial = box.roll('1d20@7');
  table.settle();
  await initial;
  const originalPosition = box.diceList[0].body.position.clone();
  const callbacks = [];
  box.onAddDiceComplete = result => callbacks.push(result);
  const added = box.add('2d20@1,20');
  assert.equal(callbacks.length, 0);
  assert.ok(table.settle() > 1);
  const result = await added;
  assert.deepEqual(result.map(die => die.value), [1, 20]);
  assert.deepEqual(callbacks, [result]);
  assert.equal(box.diceList[0].getFaceValue().value, 7);
  assert.ok(box.diceList[0].body.position.almostEquals(originalPosition));
  assert.deepEqual(box.diceList.map(die => die.getFaceValue().value), [7, 1, 20]);
});

test('backend-supplied d20 outcomes 1 through 20 match the final face geometry', async t => {
  const table = createTable(t);
  for (let value = 1; value <= 20; value++) {
    const rolled = table.box.roll(`1d20@${value}`);
    table.settle();
    const result = await rolled;
    assert.equal(result.total, value);
    assert.equal(result.sets[0].rolls[0].value, value);
    assert.equal(table.box.diceList[0].getFaceValue().value, value);
  }
});

test('supplied multi-die outcomes survive delayed animation frames', async t => {
  const table = createTable(t);
  for (const frameMilliseconds of [40, 80, 100, 250, 500]) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const rolled = table.box.roll('4d20@1,7,13,20');
      table.settle(frameMilliseconds);
      const result = await rolled;
      assert.deepEqual(result.sets[0].rolls.map(die => die.value), [1, 7, 13, 20],
        `supplied outcomes must survive ${frameMilliseconds}ms frames (attempt ${attempt})`);
      assert.deepEqual(table.box.diceList.map(die => die.getFaceValue().value), [1, 7, 13, 20]);
    }
  }
});

test('simulation iteration limits count physics steps during delayed frames', async t => {
  const table = createTable(t);
  table.box.iterationLimit = 40;
  const rolled = table.box.roll('4d20@1,7,13,20');
  table.settle(100);
  const result = await rolled;
  assert.deepEqual(result.sets[0].rolls.map(die => die.value), [1, 7, 13, 20]);
  assert.deepEqual(table.box.diceList.map(die => die.getFaceValue().value), [1, 7, 13, 20]);
});
