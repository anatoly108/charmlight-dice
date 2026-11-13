# dice-box-threejs

Charmlight's private maintenance copy. See [upstream fixes and verification](docs/upstream-fixes.md) for imported bug fixes, backend-supplied results, and test instructions.
3D Dice implemented with ThreeJS and Cannon ES

Based on [Major's 3D Dice](https://majorvictory.github.io/3DDiceRoller/)

The goal of this project is to decouple the UI of Major's 3D Dice and strip down the dice box to just the essentials. Just a module that accepts simple dice notation input and outputs a JSON object when the dice finish rolling.

Why another dice roller when you have [@3d-dice/dice-box](https://github.com/3d-dice/dice-box)?
Teall dice had already solved predeterministic rolling, which is a feature some developers really need. Major's 3D dice are based on Teall Dice.

## Demo
https://codesandbox.io/s/dice-box-threejs-j79h35?file=/src/index.js

## Install
The package is private and installs straight from this repo. It ships as source, so there is no build step.
```
npm install github:anatoly108/charmlight-dice#main
```
Pin a commit instead of `main` for repeatable installs. The machine that installs needs read access to this repo.

Optional: textures and impact sounds. Skip this if you use `texture: "none"` and your own sounds.
```
npx charmlight-dice-assets public/dice
```
Then pass `assetPath: "/dice/"`.

## Use
```
import DiceBox from "charmlight-dice"

const box = new DiceBox("#dice", {
  assetPath: "/dice/",
  light_direction: { azimuth: 315, elevation: 58 },
  shadow_softness: 1,
})
await box.initialize()
const result = await box.roll("2d20@7,20")

await box.updateConfig({ shadow_opacity: 0.4 }) // change any option later
box.destroy() // when the dice leave the page
```

- TypeScript types are included.
- The canvas is see-through. Your page draws the table behind it.
- Importing is safe on the server, but `new DiceBox()` needs the browser. In React, create it in an effect and call `destroy()` in the cleanup.

## Config Options
```
const defaultConfig = {
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
	theme_material: "glass", // "none" | "metal" | "wood" | "glass" | "plastic"
	gravity_multiplier: 400,
	light_intensity: 0.7,
	light_direction: { azimuth: 315, elevation: 58 }, // degrees, see "Light and shadows"
	shadow_opacity: 0.5, // darkness of shadows on the table, 0 to 1
	shadow_color: 0x000000,
	shadow_softness: 1, // size of the light source: 0 = hard edges, 2 = very soft
	shadow_quality: "auto", // "auto" | "low" | "medium" | "high"
	baseScale: 100,
	strength: 1, // toss strength of dice
	onRollComplete: () => {}
}
```

## Light and shadows
`light_direction` says where the key light sits:

- `azimuth`: compass angle on the screen. 0 = top, 90 = right, 180 = bottom, 270 = left.
- `elevation`: height above the table. 90 = straight above (short shadows), 20 = low (long shadows). Values under 15 are raised to 15.
- A vector also works: `{ x: -1, y: 1, z: 2 }` points from the table towards the light (x = right, y = up the screen, z = towards the viewer).

Change it at any time:
```
Box.setLightDirection({ azimuth: 45, elevation: 40 }) // instant, good for dragging
await Box.updateConfig({ light_direction: { azimuth: 45, elevation: 40 }, shadow_softness: 1.5 })
```

Shadows behave like those of a real lamp: dark and sharp where a die touches the table, wider and lighter further away. Each die also darkens the table right under it, and dice shade one another.

`shadow_quality` sets how many lights form the soft key light: `low` = 1, `medium` = 3, `high` = 5. `auto` uses `medium` on small screens and `high` elsewhere. Use `low` if a device struggles.

`npx vite . --port 5199` then `http://localhost:5199/demo/index.html` opens a playground with sliders for all of this.

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
