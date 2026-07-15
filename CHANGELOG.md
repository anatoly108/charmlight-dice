# Changelog

All notable changes to this project are documented in this file.

## 0.1.0

### Audio
- Migrated sound playback to the Web Audio API (`AudioContext`/`AudioBufferSourceNode`), fixing stutter on iOS and desktop browsers when `sounds: true`.
- `AudioContext` is created lazily and resumed from user-gesture call stacks (click-to-roll, `add()`, `reroll()`, `rollMulti()`) so playback isn't silently blocked by browser autoplay/gesture restrictions.

### Physics performance
- Switched to `CANNON.SAPBroadphase` for collision broadphase.
- Capped the per-frame physics catch-up loop so a stalled/backgrounded tab can't spiral into running many `world.step()` calls back-to-back.
- The pre-throw settle simulation now yields to the event loop periodically instead of blocking the main thread in one long synchronous loop.

### Correctness fixes
- `updateConfig()` now actually applies merged options (via `Object.assign`) and correctly reloads sounds when `sounds` is turned on.
- `updateConfig()` no longer wipes `theme_customColorset` back to `null` on calls that don't mention it at all (e.g. `updateConfig({volume: 50})`); it now only touches theme-related fields the caller actually passed, using property-presence checks instead of truthiness.
- `rollMulti()` no longer has a race where a `roll()`/`rollMulti()`/`reroll()`/`add()` call started while a prior `rollMulti()` was still pre-warming its colorsets could be incorrectly superseded once that prior `rollMulti()`'s prewarm resolved; ownership is now claimed synchronously before the prewarm `await`, matching `roll()`/`add()`/`reroll()`.
- `destroy()` called while `add()` was mid-way through its chunked pre-simulation now correctly rejects `add()`'s returned Promise instead of silently resolving it with `undefined`.
- Per-set `+`/`-` operators in dice notation (e.g. `2d6-1d4`) are now respected.
- Signed modifier merging (e.g. combining a `+5` roll with a `-3` `add()`) now nets out correctly, including exact cancellation to zero.
- Forced/predetermined results for `d4` now produce the correct face.
- Fixed `disotope`'s explicit per-face values array being incorrectly collapsed into a min/max/step range.
- Malformed forced-result (`@`) suffixes (e.g. `2d6@foo`, or `2d6@1,garbage` where one token doesn't parse) are now rejected as malformed notation instead of silently forcing only the tokens that happened to look like numbers and dropping the rest.

### Behavior changes
- Malformed/unparseable dice notation now rejects the returned Promise (with a descriptive `Error`) instead of silently resolving a fake empty result.
- A roll superseded by a newer `roll()`/`rollMulti()`/`reroll()`/`add()` call now rejects with `Error('Roll superseded by a new roll')` instead of hanging forever.
- `reroll()` called while a previous roll is still animating (table not yet settled) now clears the still-falling dice and rejects the `reroll()` call itself, instead of silently rerolling whichever half-fallen dice happened to occupy the requested ids. See the [Error Handling](README.md#error-handling) section.
- Die type names are now case-sensitive.
- The reroll-function notation `{r,...}` (e.g. `{r,2}`) has been removed as unsupported; it was previously accepted by the parser but silently did nothing.

### Colorsets
- Colorsets were redesigned for WCAG AAA text legibility (numeral/outline contrast against each die's body color); several damage-type colorsets were also conceptually rethemed. The colorset names and selection API (`theme_colorset`) are unchanged.

### Memory / lifecycle
- Added `destroy()` to fully tear down a `DiceBox` instance: stops in-flight rolls/animation, removes the window resize listener, settles any pending roll Promise, disposes GPU resources (geometries, materials, cached textures, environment map), closes the `AudioContext`, and removes the canvas from the DOM.
- `destroy()` now also cancels `clearDice()`'s pending ~100ms delayed re-render and guards the debounced window-resize handler, so neither can fire after `destroy()` and throw against the torn-down renderer/scene.
- Added an LRU cache (with a capacity cap) for composite/bump material textures, and a deferred-disposal path for cache evictions so a texture still in use on the table isn't disposed out from under it.
- Per-(type, face) bump normal-map textures are now cached and disposed per-`DiceFactory` instance rather than leaking onto a shared static registry.
- `add()` no longer silently adopts an interrupted in-flight roll's still-falling dice into its own result; a superseded in-flight roll is cleared first, matching `startClickThrow()`'s behavior.
- `reroll()` no longer silently adopts an interrupted in-flight roll's still-falling dice either; see the Behavior changes entry above.

### Packaging
- Fixed the npm `"files"` allowlist so the published tarball actually contains what's needed.
- Marked the package `"type": "module"` and added a proper `"exports"` map. The package is ESM-only; there is no CommonJS build.
- Removed `.npmignore` — the `"files"` allowlist in `package.json` now governs the published tarball.

### Developer experience
- Added a new `src/demo.js` + demo page exercising roll/add/reroll/rollMulti/colorset switching, for local development and manual testing.
