#!/usr/bin/env node
// Copies the dice textures and sounds into the host app's static folder:
//   charmlight-dice-assets public/dice
// Then create the dice box with assetPath: "/dice/".
import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const target = process.argv[2]
if (!target) {
  console.error('Usage: charmlight-dice-assets <target folder>, e.g. public/dice')
  process.exit(1)
}
const source = fileURLToPath(new URL('../public', import.meta.url))
await mkdir(resolve(target), { recursive: true })
await cp(source, resolve(target), { recursive: true })
console.log(`Dice assets copied to ${resolve(target)}`)
