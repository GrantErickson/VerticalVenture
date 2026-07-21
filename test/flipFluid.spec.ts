import { describe, expect, test } from 'vitest'
import { FlipFluid } from '@/scripts/fluid/flipFluid'

/** A tank with solid walls and a solid floor, empty inside. */
function makeTank(width: number, height: number, maxParticles = 8000) {
  const fluid = new FlipFluid({ width, height, maxParticles })
  for (let i = 0; i < width; i++) {
    fluid.setSolid(i, 0, true)
    fluid.setSolid(i, height - 1, true)
  }
  for (let j = 0; j < height; j++) {
    fluid.setSolid(0, j, true)
    fluid.setSolid(width - 1, j, true)
  }
  return fluid
}

/** Fill a rectangle of cells with particles at the resting spacing. */
function fill(
  fluid: FlipFluid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  for (let x = x0; x < x1; x += fluid.spacing)
    for (let y = y0; y < y1; y += fluid.spacing)
      fluid.addParticle(x + 0.25, y + 0.25)
}

function run(fluid: FlipFluid, steps: number, dt = 1 / 60) {
  for (let i = 0; i < steps; i++) fluid.step(dt)
}

function extent(fluid: FlipFluid) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (let i = 0; i < fluid.count; i++) {
    minX = Math.min(minX, fluid.px[i]!)
    maxX = Math.max(maxX, fluid.px[i]!)
    minY = Math.min(minY, fluid.py[i]!)
    maxY = Math.max(maxY, fluid.py[i]!)
  }
  return { minX, maxX, minY, maxY }
}

function kineticEnergy(fluid: FlipFluid) {
  let total = 0
  for (let i = 0; i < fluid.count; i++)
    total += fluid.pvx[i]! ** 2 + fluid.pvy[i]! ** 2
  return total / Math.max(fluid.count, 1)
}

describe('flip fluid', () => {
  test('falls under gravity', () => {
    const fluid = makeTank(20, 40)
    fill(fluid, 8, 30, 12, 34)
    const before = extent(fluid)

    run(fluid, 20)

    expect(extent(fluid).minY).toBeLessThan(before.minY - 1)
  })

  test('does not fall through the floor or leak into rock', () => {
    const fluid = makeTank(20, 40)
    fill(fluid, 2, 20, 18, 34)

    run(fluid, 400)

    expect(fluid.count).toBeGreaterThan(0)
    for (let i = 0; i < fluid.count; i++) {
      const x = fluid.px[i]!
      const y = fluid.py[i]!
      expect(fluid.isSolid(Math.floor(x), Math.floor(y))).toBe(false)
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(40)
    }
  })

  test('a dropped column spreads sideways and levels off', () => {
    const fluid = makeTank(40, 30)
    // A tall narrow column against the left wall. A block-at-a-time engine can
    // only push this down and average it with its neighbours; a real one should
    // have it collapse, surge across the floor and slosh back.
    fill(fluid, 1, 1, 9, 25)
    const poured = fluid.count
    const before = extent(fluid)

    run(fluid, 600)

    expect(fluid.count).toEqual(poured)
    // It got there under its own weight, not by being told to spread.
    expect(extent(fluid).maxX).toBeGreaterThan(before.maxX + 10)

    // Both ends of the tank should end up at about the same depth.
    let leftTop = 0
    let rightTop = 0
    for (let i = 0; i < fluid.count; i++) {
      const x = fluid.px[i]!
      if (x < 8) leftTop = Math.max(leftTop, fluid.py[i]!)
      if (x > 32) rightTop = Math.max(rightTop, fluid.py[i]!)
    }
    expect(rightTop).toBeGreaterThan(1)
    expect(Math.abs(leftTop - rightTop)).toBeLessThan(2.5)
  })

  test('comes to rest instead of jittering forever', () => {
    const fluid = makeTank(30, 30)
    fill(fluid, 1, 1, 29, 12)

    run(fluid, 500)
    const settled = kineticEnergy(fluid)

    // Left alone, water in a sealed tank should end up genuinely still, not
    // merely slow. This is the one that catches the step order coming apart:
    // move the particles before the pressure solve rather than after it and
    // every particle falls a little and is shoved back every frame, which
    // holds the tank at a permanent simmer of about 9 no matter how much
    // damping is added on top.
    expect(settled).toBeLessThan(0.5)
  })

  test('settled water keeps its packing instead of slowly inflating', () => {
    const fluid = makeTank(40, 30)
    fill(fluid, 1, 1, 39, 20)

    const waterCells = () => {
      let n = 0
      for (let c = 0; c < fluid.cell.length; c++) if (fluid.cell[c] === 1) n++
      return n
    }

    run(fluid, 400)
    const settled = waterCells()

    run(fluid, 1600)

    // Nothing in this model pulls particles together — pushParticlesApart only
    // ever pushes — so if the density term in the pressure solve only answers
    // crowding, thin patches are permanent while dense ones are pushed out and
    // the water ratchets itself apart. Measured before that was fixed, the same
    // water spread over 14% more cells in 3000 steps, packing fell from 3.9 to
    // 3.4 per cell, and holes opened up through the middle of it.
    expect(waterCells()).toBeLessThan(settled * 1.03)

    // ...and it should still be sitting at its rest packing, not stretched thin.
    let deepCells = 0
    let deepParticles = 0
    const counts = new Float32Array(fluid.width * fluid.height)
    for (let i = 0; i < fluid.count; i++)
      counts[
        Math.floor(fluid.px[i]!) * fluid.height + Math.floor(fluid.py[i]!)
      ]!++
    for (let i = 2; i < fluid.width - 2; i++)
      for (let j = 2; j < fluid.height - 2; j++) {
        let deep = true
        for (let a = -2; a <= 2 && deep; a++)
          for (let b = -2; b <= 2 && deep; b++)
            if (fluid.cell[(i + a) * fluid.height + (j + b)] !== 1) deep = false
        if (!deep) continue
        deepCells++
        deepParticles += counts[i * fluid.height + j]!
      }
    expect(deepCells).toBeGreaterThan(100)
    expect(deepParticles / deepCells).toBeGreaterThan(fluid.restDensity * 0.95)
  })

  test('stays evenly packed rather than clumping into voids', () => {
    const fluid = makeTank(30, 30)
    fill(fluid, 1, 1, 29, 15)

    run(fluid, 400)

    // Count how full each cell below the surface is. FLIP drifts particles
    // between cells, so without the density term in the pressure solve this
    // develops holes.
    let empty = 0
    let submerged = 0
    const counts = new Float32Array(fluid.width * fluid.height)
    for (let i = 0; i < fluid.count; i++) {
      const ci = Math.floor(fluid.px[i]!)
      const cj = Math.floor(fluid.py[i]!)
      counts[ci * fluid.height + cj]!++
    }
    for (let i = 1; i < fluid.width - 1; i++) {
      // Walk up each column to just under its surface.
      let top = 0
      for (let j = 1; j < fluid.height - 1; j++)
        if (counts[i * fluid.height + j]! > 0) top = j
      for (let j = 1; j < top - 1; j++) {
        submerged++
        if (counts[i * fluid.height + j]! === 0) empty++
      }
    }
    expect(submerged).toBeGreaterThan(50)
    expect(empty / submerged).toBeLessThan(0.02)
  })
})
