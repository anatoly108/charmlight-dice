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
	theme_material: "glass", // "none" (Phong plastic) | "plastic" (PBR plastic) | "metal" | "wood" | "glass"
	gravity_multiplier: 400,
	light_intensity: 0.7,
	light_direction: { azimuth: 315, elevation: 58 }, // degrees, see "Light and shadows"
	shadow_opacity: 0.5, // darkness of shadows on the table, 0 to 1
	shadow_color: 0x000000,
	shadow_softness: 1, // size of the light source: 0 = hard edges, 2 = very soft
	shadow_quality: "auto", // "auto" | "low" | "medium" | "high"
	edge_roundness: 1, // 0 = hard bevelled edges, 1 = soft, 2 = softer and wider
	material_tuning: {}, // see "Material tuning"
	fill_intensity: 1, // soft light from all around: 0 = deep shadows on the dice, 2 = flat
	fill_color: 0xffffbb,
	rim_intensity: 0, // light from behind the dice: 0 = off, 1 = as strong as the main light
	rim_color: 0xdfe8ff,
	reflections_follow_light: true, // studio reflections turn with the main light
	normal_maps: true, // relief from normal maps; false = the older bump maps
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

The playground also has:
- **Random**: a new look from a recipe that is known to work, with its knobs varied inside the range where it looks good. The recipes are in `demo/random.js`.
- **Preset**: 31 saved looks from `demo/presets/`, one JSON file each, in the same format Export writes.

The playground's **Export** button saves the current look as `dice-settings.json`; **Import** loads one back. The `options` part of that file is exactly what `new DiceBox(selector, options)` and `updateConfig(options)` take, so you can paste it into your app.

## Edges and plastic
- `edge_roundness` softens the edges and corners of every die. It only changes how light falls on the existing bevel, so it costs nothing extra to draw. Physics and results are untouched. A change applies to dice thrown afterwards.
- There are two plastics:
  - `"none"` is **Phong plastic**. It uses a simple, older lighting model with a big soft sheen and deep contrast. It does not reflect the studio. Cheapest to draw.
  - `"plastic"` is **PBR plastic** (physically based rendering). It uses the same model as metal, wood and glass and picks up the studio reflections. It looks flatter and more matte.

## Material tuning
`material_tuning` fine-tunes how the dice surface answers the light. Every key is optional; leave one out to keep the material's own value. Changes apply at once, also to dice already on the table.
```
await Box.updateConfig({ material_tuning: { sheen: 0.5, texture_depth: 2 } })
```

| Key | Works on | What it does |
| --- | --- | --- |
| `brightness` | every material | Multiplies the base colour. 1 = unchanged. |
| `texture_depth` | every material | Multiplies the relief strength. 0 = smooth, 1 = unchanged. |
| `glow` | every material | How strongly the numbers emit their own light. 0 = off. |
| `glow_color` | every material | Colour of that light. Default: the number colour. |
| `sheen` | Phong plastic | Strength of the soft white sheen. 0 = none, 1 = full. |
| `sheen_tightness` | Phong plastic | 5 = wide and soft (default), 60 = a small sharp highlight. |
| `roughness` | PBR materials | 0 = mirror-smooth, 1 = fully matte. |
| `metalness` | PBR materials | 0 = plastic-like, 1 = metal. |
| `reflections` | PBR materials | Share of the studio environment the die takes. 0 = none, 1 = all of it. |
| `clearcoat` | PBR materials | Glossy lacquer layer over the colour. 0 = none, 1 = full. |
| `clearcoat_roughness` | PBR materials | 0 = glass-smooth lacquer, 1 = satin. |
| `iridescence` | PBR materials | Pearly colour shift as the die turns. 0 = none, 1 = full. |
| `iridescence_thickness` | PBR materials | Film thickness in nanometres, 100 to 900. It picks the colours. Default 400. |
| `anisotropy` | PBR materials | Stretches highlights along a grain, as on brushed metal. Pair it with the `brushed` texture. |
| `anisotropy_angle` | PBR materials | Direction of that grain on each face, in degrees. |

PBR materials are `"plastic"`, `"metal"`, `"glass"` and `"wood"`. Their own values are in `src/const/materialtypes.js`.

`fill_intensity` is a lighting option, not a material one: it scales the soft light from all around. Lower it for deeper shadows on the dice without dimming the main light.

## Light colour and rim light
- `color_spotlight` is the colour of the main light. A warm tone (`0xffd9a8`) reads as lamp light, a cool one (`0xd8e6ff`) as daylight.
- `fill_color` is the colour of the soft light from all around. A cool fill under a warm main light gives depth.
- `rim_intensity` turns on a light from behind the dice, low and opposite the main light. It draws a bright line along their far edges and lifts them off the table. It casts no shadow. `rim_color` sets its colour.

## Reflections and relief
- `reflections_follow_light` turns the studio room so its brightest side sits where the main light is. Reflections then come from the same side as the light that casts the shadows. Set it to `false` to keep the room fixed.
- `normal_maps` draws the surface relief (texture bumps and engraved numbers) from normal maps. They are made in the browser from each texture's height image when a die is first created, so they need no extra files. They stay crisper and steadier than bump maps when a die is small or seen at an angle. A change applies to dice thrown afterwards.

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
