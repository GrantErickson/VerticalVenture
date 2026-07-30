import { describe, expect, test } from 'vitest'
import { growRow } from '@/scripts/game'
import { create as createRandomizer } from 'random-seed'

const WIDTH = 50

function seeded(seed: string) {
  const randomizer = createRandomizer(seed)
  return () => randomizer.random()
}

/** A row: '#' is rock, '.' is open. */
function row(pattern: string): boolean[] {
  return [...pattern].map((c) => c === '#')
}

function agreement(a: boolean[], b: boolean[]) {
  let same = 0
  for (let x = 0; x < a.length; x++) if (a[x] === b[x]) same++
  return same / a.length
}

/** Blocks that disagree with both their neighbours — noise, not shape. */
function specks(solid: boolean[]) {
  let count = 0
  for (let x = 1; x < solid.length - 1; x++)
    if (solid[x] !== solid[x - 1] && solid[x] !== solid[x + 1]) count++
  return count
}

describe('growing a row under a scrolling world', () => {
  test('carries on the shape above it', () => {
    // Half rock, half open. What comes out should look like a continuation of
    // that, not a fresh scattering that ignores it.
    const above = row('#'.repeat(25) + '.'.repeat(25))
    const random = seeded('shape')

    let leftRock = 0
    let rightRock = 0
    const runs = 40
    for (let n = 0; n < runs; n++) {
      const { solid } = growRow(above, random)
      for (let x = 0; x < 25; x++) if (solid[x]) leftRock++
      for (let x = 25; x < 50; x++) if (solid[x]) rightRock++
    }
    // The wall carries on down, the cavern carries on down.
    expect(leftRock / (runs * 25)).toBeGreaterThan(0.8)
    expect(rightRock / (runs * 25)).toBeLessThan(0.2)
  })

  test('is not a direct copy', () => {
    const above = row(
      '###...####..#####....###..######...##....####..###.',
    ).slice(0, WIDTH)
    const random = seeded('wander')

    let total = 0
    const runs = 40
    for (let n = 0; n < runs; n++)
      total += agreement(above, growRow(above, random).solid)
    const average = total / runs

    // It follows the row above without tracing it: close enough that walls and
    // caverns continue, loose enough that they wander as they go.
    expect(average).toBeGreaterThan(0.6)
    expect(average).toBeLessThan(0.95)
  })

  test('does not arrive as confetti', () => {
    // The old scroll called createRandomRow, which decides each block on its
    // own and leaves single blocks hanging in the air and one-block pits in
    // the floor. Compare against that: a coin flip per block.
    const above = row(
      '##..####...###..##....#####..##..####...##..###..#.',
    ).slice(0, WIDTH)
    const random = seeded('confetti')
    const coinFlip = seeded('coins')

    let grownSpecks = 0
    let scatteredSpecks = 0
    const runs = 40
    for (let n = 0; n < runs; n++) {
      grownSpecks += specks(growRow(above, random).solid)
      const scattered: boolean[] = []
      for (let x = 0; x < WIDTH; x++) scattered[x] = coinFlip() < 0.5
      scatteredSpecks += specks(scattered)
    }
    expect(grownSpecks).toEqual(0)
    expect(scatteredSpecks).toBeGreaterThan(runs * 5)
  })

  test('water arrives by the cave, not by the block', () => {
    const above = row(
      '#####.....#####.....#####.....#####.....#####.....',
    ).slice(0, WIDTH)
    const random = seeded('wet')

    for (let n = 0; n < 20; n++) {
      const { solid, water } = growRow(above, random)
      // Water only ever goes in open blocks, and a run of open blocks is
      // either wet end to end or dry end to end — never speckled.
      for (let x = 0; x < WIDTH; x++) if (solid[x]) expect(water[x]).toBe(false)
      for (let x = 1; x < WIDTH; x++)
        if (!solid[x] && !solid[x - 1]) expect(water[x]).toEqual(water[x - 1])
    }
  })

  test('does not grow walls down the edges of the world', () => {
    // Reading off the end as rock would pull the outermost columns solid.
    const above = row('.'.repeat(WIDTH))
    const random = seeded('edges')

    let edgeRock = 0
    const runs = 60
    for (let n = 0; n < runs; n++) {
      const { solid } = growRow(above, random)
      if (solid[0]) edgeRock++
      if (solid[WIDTH - 1]) edgeRock++
    }
    expect(edgeRock / (runs * 2)).toBeLessThan(0.25)
  })
})
