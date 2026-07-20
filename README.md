# dice-box-threejs
3D Dice implemented with ThreeJS and Cannon ES

Based on [Major's 3D Dice](https://majorvictory.github.io/3DDiceRoller/)

The goal of this project is to decouple the UI of Major's 3D Dice and keep the dice box focused: dice notation goes in, a JSON results object comes out when the roll finishes, and the API around that gives you a full roll lifecycle to manage - add dice to a settled table (`add()`/`addMulti()`), reroll specific dice, remove dice, roll multiple colorsets/notations as one combined throw (`rollMulti()`), and theme the table (colors, texture, material) at runtime.

Why another dice roller when you have [@3d-dice/dice-box](https://github.com/3d-dice/dice-box)?
Teall dice had already solved predeterministic rolling, which is a feature some developers really need. Major's 3D dice are based on Teall Dice.

## Demo
https://codesandbox.io/s/dice-box-threejs-j79h35?file=/src/index.js

## Install using NPM
```
npm install @3d-dice/dice-box-threejs
```

## Config Options
```
const defaultConfig = {
	assetPath: "./", // path (relative to your page, or absolute) prefixed onto texture/sound asset URLs; see "Notes" below
	framerate: (1/60),
	sounds: false,
	volume: 100,
	color_spotlight: 0xefdfd5,
	shadows: true,
	theme_surface:  "green-felt",
	sound_dieMaterial: 'plastic',
	theme_customColorset: null,
	theme_colorset: "white", // see available colorsets in https://github.com/3d-dice/dice-box-threejs/blob/main/src/const/colorsets.js
	theme_texture: "", // see available textures in https://github.com/3d-dice/dice-box-threejs/blob/main/src/const/texturelist.js
	theme_material: "glass", // "none" | "metal" | "wood" | "glass" | "plastic" -- "glass" is a glossy/polished look (low roughness), not real transparent/refractive glass
	gravity_multiplier: 400,
	light_intensity: 0.7,
	baseScale: 100,
	strength: 1, // toss strength of dice
	iterationLimit: 1000, // safety cap on the number of physics settle-check iterations before a roll is considered resolved
	onRollComplete: () => {},
	onRerollComplete: () => {}, // called with the results of a reroll(), see below
	onAddDiceComplete: () => {}, // called with the results of an add(), see below
	onRemoveDiceComplete: () => {}, // called when dice removed via remove() finish clearing
}
```

Note: dice colorsets were redesigned in this release for WCAG AAA text legibility (numeral/outline contrast against each die's body color). A few colorsets also had their body colors adjusted or textures swapped as part of this pass; the colorset names and selection API (`theme_colorset`) are unchanged.

## Changing The Theme At Runtime: `loadTheme()`
`Box.loadTheme({ colorset, texture, material })` reloads the dice colors/texture/material without recreating the `DiceBox` instance (`initialize()` also calls this internally at startup using `theme_colorset`/`theme_texture`/`theme_material` from the constructor config, so you don't need to call it yourself just to apply the initial theme). All three properties are optional:
- `colorset` (string) — a colorset name, same values as `theme_colorset` above
- `texture` (string) — a texture name, same values as `theme_texture` above
- `material` (string) — `"none" | "metal" | "wood" | "glass" | "plastic"`, same values as `theme_material` above

```js
await Box.loadTheme({ colorset: 'fire' })
```

Note: if `theme_customColorset` is set (in the constructor config, or via a later `updateConfig({ theme_customColorset: ... })`), `loadTheme()` ignores the `colorset`/`texture`/`material` arguments above entirely and rebuilds that custom colorset instead. Clear it first (`updateConfig({ theme_customColorset: null })`) if you want a `loadTheme()` call to switch back to a named colorset.

## Getting Results
### There are three ways to get results
1. You can define an `onRollComplete` callback function when creating the Dice Box
```
const Box = new DiceBox("#scene-container",{
  onRollComplete: (results) => {
    console.log(`I've got results :>> `, results);
  }
});
```
2. You can listen for the custom event that is triggered when results are ready
```
document.addEventListener("rollComplete",(e => {
  console.log(`I've got custom event results :>> `, e.detail);
}))
```
3. You can await the results from the `roll` method. Just be sure the function this call is in is `async`
```
setTimeout(async () => {
  const result = await Box.roll("6d6")
  console.log('result :>> ', result);
}, 1000);
```

## Predetermined Outcomes
As mentioned previously, this project was forked for it's predeterministic rolling capability. The notation to roll your predetermined outcomes looks like this:
```
Box.roll("6d6@4,4,4,4,4,4") // rolls six dice that will land on 4's
```

## Rolling Multiple Colorsets At Once: `rollMulti()`
`rollMulti()` lets you roll several independently-parsed dice notations as a single combined physics throw, with each notation using its own colorset. This is useful for things like "roll 2d6 as fire damage dice and 1d4 as poison damage dice" in one throw.

```js
const results = await Box.rollMulti([
  { notation: '2d6', colorset: 'fire', label: 'fire' },
  { notation: '1d4', colorset: 'poison', label: 'poison' },
])
```

Each entry in the `specs` array is an object:
- `notation` (string, required) — standard dice notation for that set, e.g. `"2d6+1"`
- `colorset` (string, optional) — a colorset name (see `theme_colorset` above) applied to just this set's dice
- `label` (string, optional) — an arbitrary label echoed back on the result's `sets[]` entry for that notation (defaults to `colorset` if omitted)

`rollMulti()` returns a Promise that resolves with the same shape as `roll()`'s result (a `sets[]` array, one entry per spec, each with its own `rolls`, `total`, `colorset`, and `label`, plus an overall `total`). Note that two specs of the same die type are never merged into a single set — each spec always produces its own `sets[]` entry, even if two specs use the same dice type.

## Adding Multiple Colorsets At Once: `addMulti()`
`addMulti()` is the additive counterpart to `rollMulti()`: it adds several independently-parsed dice notations to the table as a single combined physics throw, each notation using its own colorset, **without** clearing the dice already on the table (like `add()`, but for more than one notation/colorset at a time).

```js
const results = await Box.addMulti([
  { notation: '1d6', colorset: 'fire', label: 'fire' },
  { notation: '1d6', colorset: 'poison', label: 'poison' },
])
```

The `specs` array uses the exact same per-entry shape as `rollMulti()` (`notation` required, `colorset`/`label` optional). `addMulti()` returns a Promise that resolves with the same flat per-die results array shape as `add()` (one entry per newly-added die, each with its own `colorset`), not `rollMulti()`'s `sets[]` shape. If the table is empty when `addMulti()` is called, it falls back to `rollMulti(specs)` (mirroring `add()`'s existing fallback to `roll()`) — in that case the resolved shape is `rollMulti()`'s `sets[]` shape instead. `Box.add(notationSting)` is now a thin wrapper around `Box.addMulti([{ notation: notationSting }])`.

## Removing And Rerolling Dice
- `Box.reroll(diceIdArray)` — re-throws the specific dice (by `id`, from a previous result) and resolves with just their updated results. Fires `onRerollComplete` / the `rerollComplete` event.
- `Box.add(notationSting)` — adds more dice to the ones already on the table without re-rolling existing dice. Fires `onAddDiceComplete` / the `addDiceComplete` event.
- `Box.addMulti(specs)` — same as `add()`, but adds several independently-colorset-tagged notations as one combined throw. See [Adding Multiple Colorsets At Once](#adding-multiple-colorsets-at-once-addmulti) above. Also fires `onAddDiceComplete` / the `addDiceComplete` event.
- `Box.remove(diceIdArray)` — removes specific dice from the table. Fires `onRemoveDiceComplete` / the `removeDiceComplete` event.

## Error Handling
`roll()`, `rollMulti()`, `add()`, `addMulti()`, and `reroll()` all return Promises that can **reject**, so calls should be wrapped in `try`/`catch` (or given a `.catch()`):
- Malformed/unparseable dice notation (e.g. an unknown die type, or a malformed forced-result suffix like `2d6@1,garbage`) rejects with an `Error` describing the parse failure, and any dice already on the table are cleared.
- If a new roll-type call (`roll()`/`add()`/`addMulti()`/`reroll()`/`rollMulti()`) supersedes a still-in-flight previous call (for example a rapid double-click, or calling `reroll()` before a prior roll's animation has finished), the **earlier** call's Promise rejects with `new Error('Roll superseded by a new roll')`. This is expected and can usually just be ignored — it means a newer roll took over.
- Calling `Box.reroll(diceIdArray)` while a previous roll is still animating (the table hasn't settled yet) supersedes that previous call as above, but `reroll()` itself **also** rejects — with an `Error` explaining the table wasn't settled — instead of rerolling whatever dice happen to still be falling. The still-falling dice are cleared. Wait for the previous call's Promise (or its completion event) before calling `reroll()`.

## Cleaning Up: `destroy()`
Call `Box.destroy()` when a `DiceBox` instance is no longer needed (e.g. unmounting a component). It stops any in-flight roll/animation (rejecting its Promise), removes the window resize listener, disposes all GPU resources, and removes the canvas from the DOM. The instance cannot be used again after `destroy()` is called.

## Unsupported Notation
The reroll-function notation `{r,...}` (e.g. `{r,2}` for "reroll all 2s") is accepted by the notation parser but is **not implemented** — using it has no effect on the roll. Treat it as reserved syntax, not a working feature.

## Notes
In order to use textures or sounds, you will need to manually copy the assets out of the `./public` folder and into your static assets folder where you're building your app, or set the `assetPath` config option to point at wherever you host them.

Sound playback uses the Web Audio API internally. On browsers that require a user gesture before audio can play (notably iOS Safari), sounds may be silent on the very first roll if it happens before any click/tap on the page; subsequent user-triggered rolls (click-to-roll, `add()`, `addMulti()`, `reroll()`, `rollMulti()`) will have unlocked audio automatically.

This package is ESM-only (`"type": "module"` in `package.json`) — there is no CommonJS build, so it must be `import`ed rather than `require`d.
