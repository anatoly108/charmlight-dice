/** Where the key light sits, in degrees. */
export interface LightAngles {
  /** Compass angle on the screen: 0 = top, 90 = right, 180 = bottom, 270 = left. */
  azimuth?: number
  /** Height above the table: 90 = straight above, 20 = low. Values under 15 are raised to 15. */
  elevation?: number
}

/** Points from the table towards the light: x = right, y = up the screen, z = towards the viewer. */
export interface LightVector {
  x?: number
  y?: number
  z?: number
}

export type LightDirection = LightAngles | LightVector

/** "none" is Phong plastic: a big soft sheen, no reflections. "plastic" is PBR plastic: physically based, with studio reflections. */
export type DiceMaterial = 'none' | 'plastic' | 'metal' | 'wood' | 'glass' | 'perfectmetal'
/** Every key is optional. A missing key keeps the material's own value. */
export interface MaterialTuning {
  /** Base colour multiplier, every material. 1 = unchanged. */
  brightness?: number
  /** Relief strength multiplier, every material. 0 = smooth, 1 = unchanged. */
  texture_depth?: number
  /** Every material: how strongly the numbers emit their own light. 0 = off. */
  glow?: number
  /** Every material: colour of that light. Default: the number colour. */
  glow_color?: number | string
  /** Phong plastic only: strength of the soft white sheen. 0 = none, 1 = full. */
  sheen?: number
  /** Phong plastic only: how tight the sheen is. 5 = wide and soft (default), 60 = a small sharp highlight. */
  sheen_tightness?: number
  /** PBR materials only: 0 = mirror-smooth, 1 = fully matte. */
  roughness?: number
  /** PBR materials only: 0 = plastic-like, 1 = metal. */
  metalness?: number
  /** PBR materials only: share of the studio environment the die takes. 0 = none, 1 = all of it. */
  reflections?: number
  /** PBR materials only: glossy lacquer layer over the colour. 0 = none, 1 = full. */
  clearcoat?: number
  /** PBR materials only: 0 = glass-smooth lacquer, 1 = satin. */
  clearcoat_roughness?: number
  /** PBR materials only: pearly colour shift as the die turns. 0 = none, 1 = full. */
  iridescence?: number
  /** PBR materials only: thickness of the colour-shifting film in nanometres, 100 to 900. It picks the colours. Default 400. */
  iridescence_thickness?: number
  /** PBR materials only: stretches highlights along a grain, as on brushed metal. 0 = none, 1 = full. */
  anisotropy?: number
  /** PBR materials only: direction of that grain on each face, in degrees. */
  anisotropy_angle?: number
}

export type ShadowQuality = 'auto' | 'low' | 'medium' | 'high'
export type DiceColor = string | string[]

export interface CustomColorset {
  name: string
  foreground: DiceColor
  background: DiceColor
  outline?: DiceColor
  edge?: DiceColor
  /** A name from the texture list, or "none". Textures need the assets, see assetPath. */
  texture?: string | string[]
  material?: DiceMaterial
  [key: string]: unknown
}

export interface DieResult {
  type: string
  sides: number
  id: number
  value: number
  label?: string | number
  reason?: string
  [key: string]: unknown
}

export interface RollSet {
  num: number
  type: string
  sides: number
  rolls: DieResult[]
  total: number
}

export interface RollResult {
  notation: string
  sets: RollSet[]
  modifier: number
  total: number
}

export interface DiceBoxOptions {
  /** URL prefix of the copied textures and sounds, with a trailing slash. Default "./". */
  assetPath?: string
  /** Seconds per physics step. Default 1/60. */
  framerate?: number
  sounds?: boolean
  volume?: number
  /** Colour of the main light. Warm it up or cool it down here. Default 0xefdfd5. */
  color_spotlight?: number | string
  shadows?: boolean
  theme_surface?: string
  sound_dieMaterial?: string
  theme_customColorset?: CustomColorset | null
  theme_colorset?: string
  theme_texture?: string
  theme_material?: DiceMaterial
  gravity_multiplier?: number
  /** Default 0.7. */
  light_intensity?: number
  /** Default { azimuth: 315, elevation: 58 }. */
  light_direction?: LightDirection
  /** Darkness of shadows on the table, 0 to 1. Default 0.5. */
  shadow_opacity?: number
  /** Default 0x000000. */
  shadow_color?: number | string
  /** Size of the light source: 0 = hard edges, 1 = default, 2 = very soft. */
  shadow_softness?: number
  /** Lights in the soft key light: low = 1, medium = 3, high = 5. Default "auto". */
  shadow_quality?: ShadowQuality
  /** 0 = hard bevelled edges, 1 = soft (default), 2 = softer and wider. Applies to dice thrown afterwards. */
  edge_roundness?: number
  /** Fine-tuning of the dice surface. Applies at once, also to dice already on the table. */
  material_tuning?: MaterialTuning
  /** Soft light from all around: 0 = deep shadows on the dice, 1 = default, 2 = flat. */
  fill_intensity?: number
  /** Colour of the soft light from all around. Default 0xffffbb. */
  fill_color?: number | string
  /** Light from behind the dice, opposite the main one. 0 = off (default), 1 = as strong as the main light. */
  rim_intensity?: number
  /** Default 0xdfe8ff. */
  rim_color?: number | string
  /** Turn the studio reflections with the main light, so highlights and shadows agree. Default true. */
  reflections_follow_light?: boolean
  /** Surface relief from normal maps instead of bump maps. Applies to dice thrown afterwards. Default true. */
  normal_maps?: boolean
  /** Plays the throw faster or slower without changing where the dice land. 1 = normal, 2 = twice as fast. */
  roll_speed?: number
  baseScale?: number
  /** Toss strength. Default 1. */
  strength?: number
  iterationLimit?: number
  onRollComplete?: (results: RollResult) => void
  onRerollComplete?: (results: DieResult[]) => void
  onAddDiceComplete?: (results: DieResult[]) => void
  onRemoveDiceComplete?: (results: DieResult[]) => void
}

export class DiceBox {
  /**
   * @param container CSS selector of the element that holds the canvas. Browser only.
   */
  constructor(container: string, options?: DiceBoxOptions)

  initialized: boolean
  readonly destroyed?: boolean

  /** Creates the canvas and loads the theme. Await it before rolling. */
  initialize(): Promise<void>
  /** Changes any option at runtime. Light and shadow options apply at once. */
  updateConfig(options?: DiceBoxOptions): Promise<void>

  /** Rolls dice notation. "2d20@7,20" lands on the supplied values. */
  roll(notation: string): Promise<RollResult>
  reroll(diceIds: number[]): Promise<DieResult[]>
  add(notation: string): Promise<DieResult[]>
  remove(diceIds: number[]): Promise<DieResult[]>
  clearDice(): void
  getDiceResults(): RollResult
  getDiceResults(id: number): DieResult

  /** Aims the key light right away, without awaiting updateConfig(). */
  setLightDirection(direction: LightDirection): void
  setShadows(enabled: boolean): void
  enableShadows(): void
  disableShadows(): void

  /** Where a die sits on screen, in CSS pixels from the container's top-left corner. */
  getDieScreenPosition(id: number): { x: number; y: number; radius: number } | null
  /** The id of the die under a point (CSS pixels from the container's top-left), or null. */
  pickDie(x: number, y: number): number | null
  /** Lights up the number a die landed on. Pass null to switch it off. Cheap enough to call every frame. */
  highlightDie(id: number, highlight?: { glow?: number; color?: number | string } | null): void
  /** A picture of one die as it lies, on a see-through background. */
  snapshotDie(id: number, options?: { size?: number; padding?: number; shadow?: boolean }): HTMLCanvasElement | null

  /** Frees the WebGL context and listeners and removes the canvas. The instance is dead afterwards. */
  destroy(): void
}

export default DiceBox
