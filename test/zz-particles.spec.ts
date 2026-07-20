import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { FlipFluid } from '@/scripts/fluid/flipFluid'

const OUT: string[] = []
function log(s = '') {
  OUT.push(s)
}
function f(n: number, d = 3) {
  return Number.isFinite(n) ? n.toFixed(d) : String(n)
}

// ---------------------------------------------------------------- build

interface TankOpts {
  width: number
  height: number
  fillTo: number
  driftCorrection?: number
  extraSolid?: (i: number, j: number) => boolean
  skipFill?: (i: number, j: number) => boolean
}

function makeTank(o: TankOpts) {
  const fluid = new FlipFluid({
    width: o.width,
    height: o.height,
    maxParticles: 60000,
    ...(o.driftCorrection === undefined
      ? {}
      : { driftCorrection: o.driftCorrection }),
  })
  for (let i = 0; i < o.width; i++) {
    fluid.setSolid(i, 0, true)
    fluid.setSolid(i, o.height - 1, true)
  }
  for (let j = 0; j < o.height; j++) {
    fluid.setSolid(0, j, true)
    fluid.setSolid(o.width - 1, j, true)
  }
  if (o.extraSolid) {
    for (let i = 0; i < o.width; i++)
      for (let j = 0; j < o.height; j++)
        if (o.extraSolid(i, j)) fluid.setSolid(i, j, true)
  }
  // 2x2 particles per cell, exactly like useFluidWorld.fillBlock
  for (let i = 0; i < o.width; i++) {
    for (let j = 1; j <= o.fillTo; j++) {
      if (fluid.isSolid(i, j)) continue
      if (o.skipFill && o.skipFill(i, j)) continue
      for (let px = 0; px < 2; px++)
        for (let py = 0; py < 2; py++)
          fluid.addParticle(i + (px + 0.5) * 0.5, j + (py + 0.5) * 0.5)
    }
  }
  return fluid
}

// ---------------------------------------------------------------- hash

class Hash {
  bins: number[][] = []
  constructor(
    readonly w: number,
    readonly h: number,
    readonly px: Float32Array,
    readonly py: Float32Array,
    readonly n: number,
  ) {
    this.bins = new Array(w * h)
    for (let k = 0; k < w * h; k++) this.bins[k] = []
    for (let i = 0; i < n; i++) {
      const bi = Math.min(Math.max(Math.floor(px[i]!), 0), w - 1)
      const bj = Math.min(Math.max(Math.floor(py[i]!), 0), h - 1)
      this.bins[bi * h + bj]!.push(i)
    }
  }
  /** Exact nearest particle distance to (x,y), optionally skipping index `self`. */
  nearest(x: number, y: number, self = -1): number {
    const bi = Math.min(Math.max(Math.floor(x), 0), this.w - 1)
    const bj = Math.min(Math.max(Math.floor(y), 0), this.h - 1)
    let best = Infinity
    for (let r = 0; r < Math.max(this.w, this.h); r++) {
      for (let i = bi - r; i <= bi + r; i++) {
        if (i < 0 || i >= this.w) continue
        for (let j = bj - r; j <= bj + r; j++) {
          if (j < 0 || j >= this.h) continue
          if (r > 0 && Math.max(Math.abs(i - bi), Math.abs(j - bj)) !== r)
            continue
          for (const p of this.bins[i * this.h + j]!) {
            if (p === self) continue
            const dx = this.px[p]! - x
            const dy = this.py[p]! - y
            const d2 = dx * dx + dy * dy
            if (d2 < best) best = d2
          }
        }
      }
      // Anything not yet searched is at least this far away.
      const safe = Math.min(
        x - (bi - r),
        bi + r + 1 - x,
        y - (bj - r),
        bj + r + 1 - y,
      )
      if (best <= safe * safe) break
    }
    return Math.sqrt(best)
  }

  /**
   * Exactly the fluidRenderer splat kernel, in cell units.
   * point sprite diameter = 3.2 cells so R = 1.6 cells;
   * weight = (1 - r2)^3 * uWeightScale, uWeightScale = 1/(PI*R^2).
   */
  density(x: number, y: number, R = 1.6): number {
    const scale = 1 / (Math.PI * R * R)
    const bi = Math.floor(x)
    const bj = Math.floor(y)
    const reach = Math.ceil(R)
    let sum = 0
    for (let i = bi - reach; i <= bi + reach; i++) {
      if (i < 0 || i >= this.w) continue
      for (let j = bj - reach; j <= bj + reach; j++) {
        if (j < 0 || j >= this.h) continue
        for (const p of this.bins[i * this.h + j]!) {
          const dx = this.px[p]! - x
          const dy = this.py[p]! - y
          const r2 = (dx * dx + dy * dy) / (R * R)
          if (r2 >= 1) continue
          const w = 1 - r2
          sum += w * w * w
        }
      }
    }
    return sum * scale
  }
}

// ---------------------------------------------------------------- stats

function pct(sorted: number[], p: number) {
  if (!sorted.length) return NaN
  const k = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[k]!
}

/**
 * Cells that hold water and are at least `margin` cells (Chebyshev) from
 * anything that is not water: rock, or an empty (air) cell.
 */
function interiorCells(fluid: FlipFluid, counts: Int32Array, margin = 2) {
  const { width, height } = fluid
  const isWater = (i: number, j: number) =>
    i >= 0 &&
    j >= 0 &&
    i < width &&
    j < height &&
    !fluid.isSolid(i, j) &&
    counts[i * height + j]! > 0
  const out: number[] = []
  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      if (!isWater(i, j)) continue
      let ok = true
      for (let a = -margin; a <= margin && ok; a++)
        for (let b = -margin; b <= margin && ok; b++)
          if (!isWater(i + a, j + b)) ok = false
      if (ok) out.push(i * height + j)
    }
  }
  return out
}

function cellCounts(fluid: FlipFluid) {
  const counts = new Int32Array(fluid.width * fluid.height)
  for (let i = 0; i < fluid.count; i++) {
    const ci = Math.min(Math.max(Math.floor(fluid.px[i]!), 0), fluid.width - 1)
    const cj = Math.min(Math.max(Math.floor(fluid.py[i]!), 0), fluid.height - 1)
    counts[ci * fluid.height + cj]!++
  }
  return counts
}

function measure(fluid: FlipFluid, label: string, doCircle = true) {
  const counts = cellCounts(fluid)
  const interior = interiorCells(fluid, counts, 2)
  const h = fluid.height

  // (1) particles per cell over the interior
  const vals = interior.map((c) => counts[c]!)
  const n = vals.length
  const mean = vals.reduce((a, b) => a + b, 0) / n
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const sd = Math.sqrt(
    vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n,
  )
  const hist = new Array(13).fill(0)
  for (const v of vals) hist[Math.min(v, 12)]!++

  log(`--- ${label}`)
  log(`  particles alive       ${fluid.count}`)
  log(`  interior cells        ${n} (of ${interior.length ? '' : ''}water)`)
  log(
    `  per-cell  mean ${f(mean)}  min ${min}  max ${max}  sd ${f(sd)}  cv ${f(sd / mean)}`,
  )
  log(
    `  histogram ${hist.map((c, k) => `${k === 12 ? '12+' : k}:${c}`).join(' ')}`,
  )

  // (2) nearest neighbour, particles whose home cell is interior
  const interiorSet = new Set(interior)
  const hash = new Hash(fluid.width, fluid.height, fluid.px, fluid.py, fluid.count)
  const nn: number[] = []
  for (let i = 0; i < fluid.count; i++) {
    const ci = Math.min(Math.max(Math.floor(fluid.px[i]!), 0), fluid.width - 1)
    const cj = Math.min(Math.max(Math.floor(fluid.py[i]!), 0), fluid.height - 1)
    if (!interiorSet.has(ci * h + cj)) continue
    nn.push(hash.nearest(fluid.px[i]!, fluid.py[i]!, i))
  }
  nn.sort((a, b) => a - b)
  log(
    `  nn-dist   n ${nn.length}  mean ${f(nn.reduce((a, b) => a + b, 0) / nn.length)}  p50 ${f(pct(nn, 50))}  p95 ${f(pct(nn, 95))}  p99 ${f(pct(nn, 99))}  max ${f(nn[nn.length - 1]!)}`,
  )

  // (3) largest empty circle inside the water
  if (doCircle) {
    const step = 0.1
    const empt: number[] = []
    const dens: number[] = []
    for (const c of interior) {
      const ci = Math.floor(c / h)
      const cj = c % h
      for (let a = step / 2; a < 1; a += step)
        for (let b = step / 2; b < 1; b += step) {
          empt.push(hash.nearest(ci + a, cj + b))
          dens.push(hash.density(ci + a, cj + b))
        }
    }
    empt.sort((a, b) => a - b)
    log(
      `  empty-r   samples ${empt.length}  mean ${f(empt.reduce((a, b) => a + b, 0) / empt.length)}  p95 ${f(pct(empt, 95))}  p99 ${f(pct(empt, 99))}  p99.9 ${f(pct(empt, 99.9))}  max ${f(empt[empt.length - 1]!)}`,
    )
    log(`  empty-d   max hole diameter ${f(2 * empt[empt.length - 1]!)} cells`)

    // What the renderer would actually see at those same interior points.
    const ds = dens.slice().sort((x, y) => x - y)
    const below = (t: number) => ds.filter((v) => v < t).length
    log(
      `  rendered  mean ${f(dens.reduce((x, y) => x + y, 0) / dens.length)}  min ${f(ds[0]!)}  p0.1 ${f(pct(ds, 0.1))}  p1 ${f(pct(ds, 1))}  p5 ${f(pct(ds, 5))}  p50 ${f(pct(ds, 50))}`,
    )
    log(
      `  rendered  frac < 0.56 (water fading) ${f(below(0.56) / ds.length, 5)}  frac < 0.5 (SURFACE) ${f(below(0.5) / ds.length, 5)}  frac < 0.28 (fully air) ${f(below(0.28) / ds.length, 5)}`,
    )
  }
  return { mean, min, max, sd, n }
}

// ---------------------------------------------------------------- runs

describe('particle void investigation', () => {
  it('measures', () => {
    const t0 = Date.now()

    // ---- A: default tank over time
    log('=========== A. 60x40 tank, filled to y=25, default settings')
    const a = makeTank({ width: 60, height: 40, fillTo: 25 })
    log(`seeded particles ${a.count}`)
    let step = 0
    for (const target of [100, 400, 1500, 4000]) {
      while (step < target) {
        a.step(1 / 60)
        step++
      }
      measure(a, `default drift=1.0, ${step} steps`)
    }
    log(`restDensity ${f(a.restDensity)}`)
    log()

    // ---- B: drift correction sweep at 1500 steps
    log('=========== B. driftCorrection sweep, 1500 steps')
    for (const dc of [0, 1.0, 3.0]) {
      const b = makeTank({
        width: 60,
        height: 40,
        fillTo: 25,
        driftCorrection: dc,
      })
      for (let s = 0; s < 1500; s++) b.step(1 / 60)
      measure(b, `driftCorrection=${dc}, 1500 steps`)
      log(`  restDensity ${f(b.restDensity)}`)
    }
    log()

    // ---- C: diving bell / overhang, trapped air
    log('=========== C. diving bell (overhang open at the bottom)')
    // Walls x=15 and x=35 from y=8..14, roof y=14 spanning x=15..35.
    const bellSolid = (i: number, j: number) =>
      (j === 14 && i >= 15 && i <= 35) ||
      ((i === 15 || i === 35) && j >= 8 && j <= 14)
    // Water everywhere up to y=25 EXCEPT inside the bell, so the bell starts
    // as an air pocket that water can only reach from below.
    const insideBell = (i: number, j: number) => i > 15 && i < 35 && j >= 8 && j < 14
    const c = makeTank({
      width: 60,
      height: 40,
      fillTo: 25,
      extraSolid: bellSolid,
      skipFill: insideBell,
    })
    log(`seeded particles ${c.count}`)
    const bellCells: number[] = []
    for (let i = 16; i <= 34; i++)
      for (let j = 8; j <= 13; j++) bellCells.push(i * 40 + j)
    let cs = 0
    for (const target of [1, 60, 200, 600, 1500, 4000]) {
      while (cs < target) {
        c.step(1 / 60)
        cs++
      }
      const counts = cellCounts(c)
      let empty = 0
      let tot = 0
      for (const cc of bellCells) {
        tot += counts[cc]!
        if (counts[cc]! === 0) empty++
      }
      // Where is the free surface inside the bell?
      let topFilled = -1
      for (let j = 13; j >= 8; j--) {
        let row = 0
        for (let i = 16; i <= 34; i++) row += counts[i * 40 + j]!
        if (row > 0 && topFilled < 0) topFilled = j
      }
      log(
        `  step ${String(cs).padStart(4)}  bell cells empty ${String(empty).padStart(3)}/${bellCells.length}  particles in bell ${String(tot).padStart(5)}  highest occupied row ${topFilled}`,
      )
    }
    // full interior measurement on the bell scene at the end
    measure(c, 'bell scene, 4000 steps (interior of water only)')
    log()

    // ---- D: sanity — a perfectly settled reference, what does an ideal
    // 4-per-cell lattice look like under the same metrics?
    log('=========== D. reference: ideal 2x2 lattice, no simulation')
    const d = makeTank({ width: 60, height: 40, fillTo: 25 })
    measure(d, 'ideal lattice, 0 steps')

    log()
    log(`elapsed ${Date.now() - t0} ms`)
    writeFileSync('zz-particles-out.txt', OUT.join('\n'))
  }, 900000)
})
