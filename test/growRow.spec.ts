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

  test('stays open however long the world scrolls', () => {
    // Row grown from row grown from row, the way a scroll actually uses this.
    // The first cut at the odds had its standstill at about three quarters
    // rock, so the caverns silted up a row at a time and a long scroll ended
    // in solid ground with nowhere for water to go.
    for (const start of [
      '#'.repeat(WIDTH),
      '.'.repeat(WIDTH),
      '#.'.repeat(25),
    ]) {
      const random = seeded(`long-${start.length}-${start[0]}`)
      let above = row(start)
      let worst = 1
      let total = 0
      const rows = 400
      for (let n = 0; n < rows; n++) {
        above = growRow(above, random).solid
        const open = above.filter((s) => !s).length / WIDTH
        worst = Math.min(worst, open)
        total += open
      }
      // Never closes over, wherever it started...
      expect(worst).toBeGreaterThanOrEqual(0.4)
      // ...and settles around half and half rather than drifting to one end.
      const average = total / rows
      expect(average).toBeGreaterThan(0.42)
      expect(average).toBeLessThan(0.62)
    }
  })

  test('does not grow walls down the edges of the world', () => {
    // Reading off the end as rock would pull the outermost columns solid. The
    // test is the edges against the middle, not against a number: whatever the
    // world is doing overall, the sides should be doing the same thing.
    const random = seeded('edges')
    let above = row('#.'.repeat(25))

    let edgeRock = 0
    let middleRock = 0
    const runs = 200
    for (let n = 0; n < runs; n++) {
      above = growRow(above, random).solid
      if (above[0]) edgeRock++
      if (above[WIDTH - 1]) edgeRock++
      for (let x = 10; x < 40; x++) if (above[x]) middleRock++
    }
    const edges = edgeRock / (runs * 2)
    const middle = middleRock / (runs * 30)
    expect(Math.abs(edges - middle)).toBeLessThan(0.12)
  })
})
