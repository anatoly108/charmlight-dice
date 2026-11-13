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

export type DiceMaterial = 'none' | 'metal' | 'wood' | 'glass' | 'plastic' | 'perfectmetal'
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
  /** Color of the key light. Default 0xefdfd5. */
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

  /** Frees the WebGL context and listeners and removes the canvas. The instance is dead afterwards. */
  destroy(): void
}

export default DiceBox
