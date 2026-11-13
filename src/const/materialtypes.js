export const MATERIALTYPES = {
  'none': {
    name: 'Phong plastic'
  },
  // PBR plastic: same lighting model as metal, wood and glass, so it picks
  // up the studio reflections. 'none' above keeps the original simpler look.
  // The studio environment lights a matte surface evenly from all sides, which
  // drowns the key light and its shadows. Plastic takes less of it, and a
  // brighter base keeps the lit faces as bright as before.
  'plastic': {
    name: 'PBR plastic',
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.0,
    envMapIntensity: 0.4
  },
  'perfectmetal': {
    name: 'Perfect Metal',
    color: 0xdddddd,
    roughness: 0,
    metalness: 1,
    envMapIntensity: 1
  },
  'metal': {
    name: 'Metal',
    color: 0xdddddd,
    roughness: 0.5,
    metalness: 0.6,
    envMapIntensity: 1
  },
  'wood': {
    name: 'Wood',
    color: 0xdddddd,
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 1
  },
  'glass': {
    name: 'Glass',
    color: 0xdddddd,
    roughness: 0.1,
    metalness: 0.0,
    envMapIntensity: 1
  }
}