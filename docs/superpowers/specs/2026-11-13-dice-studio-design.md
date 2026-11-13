# Modern dice studio

The user authorized visual and implementation improvements during the Three.js
upgrade. The established direction is heavy, important, physical dice with rich
textures/reflections. Supplied backend results and the existing physics stay intact.

| Approach | Tradeoff |
| --- | --- |
| Compatibility adjustments only | Lowest rendering cost; keeps the older flat lighting setup. |
| **Procedural studio environment, modern tone mapping, soft shadows** | Richer metallic/glossy highlights without remote assets; adds one environment prefilter per renderer. Chosen implementation default under the user's modernization authorization. |
| Full cinematic post-processing stack | More effects and tuning, with a larger mobile rendering cost and integration surface. Deferred. |

Use Three.js's documented RoomEnvironment and PMREMGenerator to generate local
studio reflections. Use NeutralToneMapping to compress bright highlights while
retaining material color. Keep the transparent canvas so the app supplies its own
table/background. Use actual depth-tested opaque dice, current PCF shadows with
soft filtering, and resolution capped at twice the CSS size for sharp phone dice.

Retain existing theme assets and body shape. Glass remains the existing glossy
finish; creating true transmissive glass is a separate aesthetic decision.
Dispose temporary room geometry and prefilter helpers after baking. Keep the
environment render target for the life of the renderer and replace/dispose it
when rebaking. Resize logic must account for high-density canvases.

Verification must prove that reflections contribute light, shadows actually draw,
opaque dice use depth testing, device pixel ratio is capped, and exact supplied
outcomes survive repeated rolls and viewport resizing. Browser screenshots are
the visual review artifact. Physical Safari performance still needs device testing.
