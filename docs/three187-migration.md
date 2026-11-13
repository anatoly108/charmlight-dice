# Three.js 0.187 migration

The dependency is pinned to `three@0.187.0`, the npm `latest` stable release
verified on 2026-11-13. Previous version: `0.143.0`.

## Compatibility changes

- Face color canvases now declare `SRGBColorSpace`. Bump textures retain their
  default `NoColorSpace`, so color correction does not distort surface data.
- Spotlight intensity compensates for the distance from the light to the board
  center. The board's physics uses large world units; current inverse-square
  attenuation otherwise makes direct lighting effectively disappear. The
  compensation is recalculated during resize. Light intensity remains controlled
  by the existing `light_intensity` option.
- Hemisphere intensity includes the former renderer's pi scaling. Modern color
  management and inverse-square spotlight decay stay enabled.
- Shadows use current `PCFShadowMap`; the old `PCFSoftShadowMap` is removed in the
  current renderer and otherwise emits a warning while falling back.

The change preserves public method signatures, existing physics, theme assets,
and backend-supplied result notation such as `box.roll('2d20@7,20')`. Modern
lighting/color/shadow calculations can change the precise appearance; this is
a compatibility migration rather than a pixel-identical recreation of r143.

Current Three.js requires **WebGL 2**. Browsers/devices limited to WebGL 1 cannot
use this version of the renderer. No global color-management or legacy-light
switches are used.

## Modern studio rendering

The user additionally authorized visual improvements during this upgrade:

- A procedural `RoomEnvironment`, prefiltered once per renderer, adds studio
  reflections and indirect lighting without external image downloads. Temporary
  room and prefilter resources are disposed after baking.
- `NeutralToneMapping` retains color while compressing bright highlights.
- Opaque, depth-tested materials give overlapping dice correct occlusion.
- Current filtered shadows use a softer radius and desktop/mobile map budgets.
- Device pixel ratio is capped at 2, with density-aware resize checks.
- The original theme colors, texture assets, physics and result handling remain.

## Verification

```sh
npm ci
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
```

The headless suite covers real physics and supplied d20 values 1–20, animation
completion, runtime configuration/audio, generated texture color spaces and
size-independent lighting and solid material depth/reflection settings. The browser suite uses actual canvas textures and
WebGL 2 rendering for plastic, metal, glass and wood at desktop and mobile
viewport sizes. It checks shader/runtime/asset errors, visible pixels, supplied
results, repeated rolls, added dice, rerolls and resize. Screenshots are written
to ignored `test-results/` and uploaded by the GitHub Actions workflow.

The local workspace prevents launching Chromium (socket permission restriction),
so browser execution is delegated to GitHub Actions. Mobile viewport checks in
Chromium do not measure physical iPhone/Safari performance.

## References

- [r187 release](https://github.com/mrdoob/three.js/releases/tag/r187)
- [Migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- [Color management](https://threejs.org/manual/pages/color-management.html)
- [Lighting migration](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)
