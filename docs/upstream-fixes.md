# Upstream fixes

This repository starts from `3d-dice/dice-box-threejs` at
`6945e0068eae27f22acd26debdb70f6ef2fd6063` (version 0.0.12).
The existing rendering dependencies and visual themes are retained.

## Imported fixes

| Source | Change | Verification |
| --- | --- | --- |
| [Upstream #20](https://github.com/3d-dice/dice-box-threejs/pull/20), commit `7da087f80539df816f49904ea42103e4efbf0f8f`, by fl4v102001 | Reset reroll animation timing so a pause between throws is not simulated on the first frame. | After a ten-second idle pause, the callback, event and promise wait for the animated reroll to settle. |
| [Upstream #21](https://github.com/3d-dice/dice-box-threejs/pull/21), configuration changes in commit `3371f897fdffbad8138bd366e907622333ed30f1`, by Craig R. Hughes | Apply options with `Object.assign`, preserve omitted custom finishes, handle explicit custom-finish clearing and empty texture options, and load impact sounds when enabling audio. | Configuration/theme/audio regression tests, including collisions while clips load. Sound loading is awaited, matching `initialize()`, rather than fire-and-forget as in the later upstream branch. |

The collision handler also skips unloaded sound banks, porting the guards from
the same upstream commit so enabling sound during a roll cannot interrupt physics.

The original #21 fix (`a19539821ec925943b95c2ce2f72de38d49080f9`)
wakes added dice after pre-simulation. On this baseline `spawnDice()` already
replaces each reset body with an awake dynamic body. The added-dice regression
passes without the extra wake-up loop, so that redundant change is not imported.

The later commits in #21 also introduce new multi-colorset methods, lifecycle
and packaging changes, and redesigned themes. Those broader changes, along with
[#17's interaction features](https://github.com/3d-dice/dice-box-threejs/pull/17),
remain candidates for separate review.

The existing `DiceColors` cache remains unchanged: reselecting an already cached
named colorset can reuse its prior texture/material. Clearing the custom finish
is supported with `theme_customColorset: null`; a named `theme_colorset` must
still be a valid name. Cache redesign is separate work.

## Backend-supplied results

Continue to supply authoritative results using the existing notation:

```js
const results = await box.roll('2d20@7,20');
```

The tests exercise the real notation parser, meshes, physics simulation, face
mapping, animation loop and completion delivery. They check all supplied d20
outcomes from 1 to 20, plus multiple added dice, against final face geometry.
Only browser output boundaries are replaced: canvas drawing/material generation,
frame scheduling, wall-clock time and audio playback. These are headless
correctness checks; visual quality and device performance need browser testing.

## Running checks

Use Node.js 22 or newer (the tests use the built-in test runner and mocking):

```sh
npm ci
npm test
npm run build
```

The tests reuse Vite to bundle the existing extensionless source imports into a
temporary CommonJS file. They add no testing dependencies or generated files to
the repository.
