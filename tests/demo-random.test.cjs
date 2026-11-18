const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../demo/random.js')

test('the same seed always gives the same random look', async () => {
  const { randomLook } = await load()
  for (const seed of ['1-k7f3q9', '1-aaaaaa', '1-000000', 'x']) {
    assert.deepEqual(randomLook(seed), randomLook(seed))
  }
})

test('different seeds give different looks', async () => {
  const { randomLook } = await load()
  const looks = new Set()
  for (let i = 0; i < 40; i++) looks.add(JSON.stringify(randomLook(`1-seed${i}`)))
  assert.ok(looks.size >= 38, `only ${looks.size} different looks out of 40`)
})

test('a seed does not depend on what ran before it', async () => {
  const { randomLook } = await load()
  const first = randomLook('1-k7f3q9')
  randomLook() // unseeded
  randomLook('1-other')
  assert.deepEqual(randomLook('1-k7f3q9'), first)
})

test('newSeed gives versioned seeds that make valid looks', async () => {
  const { newSeed, randomLook, RECIPE_VERSION } = await load()
  for (let i = 0; i < 20; i++) {
    const seed = newSeed()
    assert.match(seed, new RegExp(`^${RECIPE_VERSION}-[0-9a-z]{6}$`))
    const { options } = randomLook(seed)
    assert.ok(options.theme_customColorset.material)
    assert.match(options.theme_customColorset.background, /^#[0-9a-f]{6}$/)
  }
})

// Shared links must keep showing the same look. If this fails after editing the
// recipes, bump RECIPE_VERSION in demo/random.js and keep the old recipes.
test('seed 1-k7f3q9 still gives the look it gave when links were first shared', async () => {
  const { randomLook } = await load()
  const { theme_customColorset: skin, light_direction } = randomLook('1-k7f3q9').options
  assert.deepEqual(
    { material: skin.material, texture: skin.texture, background: skin.background, azimuth: light_direction.azimuth },
    { material: 'glass', texture: 'none', background: '#e9d7c8', azimuth: 235 },
  )
})
