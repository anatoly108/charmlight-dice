// Random dice looks for the playground. Not uniform noise: each look starts
// from a recipe that is known to work, and every knob stays inside the range
// where that recipe looks good.

const between = (min, max, step = 0.05) => Math.round((min + Math.random() * (max - min)) / step) * step;
const pick = list => list[Math.floor(Math.random() * list.length)];
const chance = probability => Math.random() < probability;
const round = value => Math.round(value * 100) / 100;

function hsl(hue, saturation, lightness) {
  const s = saturation / 100, l = lightness / 100;
  const k = n => (n + hue / 30) % 12, a = s * Math.min(l, 1 - l);
  const channel = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [0, 8, 4].map(n => channel(n).toString(16).padStart(2, '0')).join('');
}
export const darken = (hex, amount) => '#' + hex.slice(1).match(/../g)
  .map(part => Math.round(parseInt(part, 16) * amount).toString(16).padStart(2, '0')).join('');

// Numbers must read at a glance: pale on dark dice, dark on pale dice.
const paleNumbers = () => pick(['#ffe2a3', '#fff4d6', '#f6d98a', '#f4e6ff', '#e8f6ff', '#ffffff']);
const darkNumbers = () => pick(['#2a1c12', '#1d2433', '#2b2030', '#1f2a22']);
const jewel = () => hsl(between(0, 360, 1), between(45, 75, 1), between(18, 34, 1));
const deep = () => hsl(between(0, 360, 1), between(20, 50, 1), between(8, 18, 1));
const pastel = () => hsl(between(0, 360, 1), between(25, 55, 1), between(72, 86, 1));
const metals = ['#b9bcc4', '#d4a12a', '#c98a7a', '#3c4048', '#b87333', '#8f9aa8', '#e2c275', '#6d5a4a'];
const neons = ['#8fe9ff', '#d6ff4a', '#ff7ad9', '#7dffb2', '#ffb347', '#b69cff', '#ff5a5a'];

const recipes = [
  // Polished resin: glossy lacquer over a rich colour and a soft texture.
  { weight: 5, make: () => {
    const background = jewel();
    return { material: 'plastic', background, foreground: paleNumbers(),
      texture: pick(['fire', 'fire', 'cloudy_2', 'water', 'speckles', 'stars', 'astral', 'marble', 'stone', 'none']),
      tuning: { roughness: between(0.25, 0.45), reflections: between(0.4, 0.9), clearcoat: between(0.7, 1),
        clearcoat_roughness: between(0.05, 0.25), iridescence: chance(0.3) ? between(0.15, 0.4) : 0,
        iridescence_thickness: between(300, 650, 10), texture_depth: between(0.8, 1.6, 0.1) } };
  } },
  // Pearl: a dark, plain die whose faces shift colour as it turns.
  { weight: 3, make: () => ({ material: 'plastic', background: deep(), foreground: paleNumbers(), texture: 'none',
    tuning: { roughness: between(0.2, 0.35), reflections: between(0.8, 1), clearcoat: 1, clearcoat_roughness: between(0.1, 0.2),
      iridescence: between(0.7, 1), iridescence_thickness: between(300, 700, 10) } }) },
  // Stone: Phong plastic with a strong relief and a soft sheen.
  { weight: 4, make: () => {
    const pale = chance(0.3), background = pale ? pastel() : jewel();
    return { material: 'none', background, foreground: pale ? darkNumbers() : paleNumbers(),
      texture: pick(['fire', 'fire', 'stone', 'paper', 'speckles', 'marble', 'cloudy_2', 'lizard']),
      tuning: { sheen: between(0.3, 0.8), sheen_tightness: between(4, 12, 1), texture_depth: between(1, 2.2, 0.1) } };
  } },
  // Metal: polished or brushed.
  { weight: 4, make: () => {
    const texture = pick(['brushed', 'brushed', 'metal', 'none', 'none', 'bronze02', 'bronze04']);
    const background = pick(metals), dark = background === '#3c4048' || background === '#6d5a4a';
    return { material: 'metal', background, texture,
      foreground: dark ? pick(['#9fd4ff', '#ffe2a3', '#ffffff']) : pick(['#2a1c12', '#1d2433', '#3a1d00']),
      tuning: { roughness: between(0.25, 0.5), anisotropy: texture === 'brushed' ? between(0.3, 0.6) : chance(0.4) ? between(0.1, 0.3) : 0,
        anisotropy_angle: pick([0, 0, 45, 90]), iridescence: chance(0.2) ? between(0.5, 1) : 0,
        iridescence_thickness: between(350, 700, 10), texture_depth: between(0.8, 1.5, 0.1) } };
  } },
  // Magic: a dark die with numbers that glow.
  { weight: 3, make: () => {
    const foreground = pick(neons), phong = chance(0.35);
    return { material: phong ? 'none' : 'plastic', background: deep(), foreground,
      texture: pick(['stars', 'astral', 'none', 'cloudy_2', 'stone']),
      tuning: { glow: between(1, 2), glow_color: foreground,
        ...(phong ? { sheen: between(0.3, 0.6) } : { clearcoat: between(0.6, 1), clearcoat_roughness: between(0.1, 0.3), roughness: between(0.3, 0.5) }) } };
  } },
  // Gemstone: glassy, cool and clear.
  { weight: 3, make: () => {
    const pale = chance(0.4), background = pale ? pastel() : jewel();
    return { material: 'glass', background, foreground: pale ? darkNumbers() : paleNumbers(),
      texture: pick(['ice', 'water', 'stainedglass', 'marble', 'none', 'cloudy_2']),
      tuning: { reflections: between(0.4, 0.7), clearcoat: between(0.6, 1), clearcoat_roughness: between(0.05, 0.2),
        iridescence: chance(0.25) ? between(0.2, 0.5) : 0, iridescence_thickness: between(300, 600, 10) } };
  } },
  // Wood: warm and matte.
  { weight: 1, make: () => ({ material: 'wood', texture: pick(['wood', 'wood', 'paper']),
    background: hsl(between(18, 38, 1), between(35, 60, 1), between(20, 40, 1)), foreground: pick(['#f3e1c0', '#ffe2a3', '#fff4d6']),
    tuning: { reflections: between(0.2, 0.4), roughness: between(0.7, 0.9), texture_depth: between(1, 1.8, 0.1) } }) },
];

// Light: warm lamp, neutral studio or cool daylight, sometimes with a rim.
const lightMoods = [
  { color_spotlight: '#efdfd5', fill_color: '#ffffbb', rim_color: '#dfe8ff' },
  { color_spotlight: '#ffd9a8', fill_color: '#c8d6ff', rim_color: '#9ec1ff' },
  { color_spotlight: '#fff1dc', fill_color: '#ffe9c4', rim_color: '#ffd0a0' },
  { color_spotlight: '#dfeaff', fill_color: '#eef3ff', rim_color: '#ffffff' },
];

export function randomLook() {
  const total = recipes.reduce((sum, recipe) => sum + recipe.weight, 0);
  let roll = Math.random() * total;
  const recipe = recipes.find(candidate => (roll -= candidate.weight) < 0) || recipes[0];
  const { material, background, foreground, texture, tuning } = recipe.make();
  return {
    version: 1,
    options: {
      light_direction: { azimuth: between(0, 355, 5), elevation: between(40, 65, 1) },
      shadow_softness: round(between(0.8, 1.6, 0.1)),
      shadow_opacity: round(between(0.4, 0.6)),
      fill_intensity: round(between(0.6, 1.1)),
      rim_intensity: chance(0.55) ? round(between(0.3, 0.7)) : 0,
      ...pick(lightMoods),
      material_tuning: Object.fromEntries(Object.entries(tuning).map(([key, value]) => [key, typeof value === 'number' ? round(value) : value])),
      theme_customColorset: { name: 'Random', background, foreground, outline: darken(background, 0.35), texture, material },
    },
  };
}
