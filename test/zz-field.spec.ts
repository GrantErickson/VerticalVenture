import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { FlipFluid } from '@/scripts/fluid/flipFluid'

// ---------------------------------------------------------------------------
// World: 100 x 50 fluid cells, exactly as the app (50x25 blocks, 2 cells/block).
// A tank inside it: solid columns at x=19 and x=80, water in x=[20,80), y=[1,26)
// => a 60 wide, 25 deep pool.
// ---------------------------------------------------------------------------
const W = 100
const H = 50
const TANK_X0 = 20
const TANK_X1 = 80 // exclusive
const TANK_Y0 = 1
const TANK_Y1 = 26 // exclusive

// Render target, as in fluidRenderer.ts
const RW = 512
const RH = 256
const PX_PER_CELL_X = RW / W // 5.12
const PX_PER_CELL_Y = RH / H // 5.12

const lines: string[] = []
function out(s: string) {
  lines.push(s)
}

function buildTank(perAxis: number, spacing: number) {
  const f = new FlipFluid({ width: W, height: H, maxParticles: 60000 })
  // border rim
  for (let i = 0; i < W; i++) {
    f.setSolid(i, 0, true)
    f.setSolid(i, H - 1, true)
  }
  for (let j = 0; j < H; j++) {
    f.setSolid(0, j, true)
    f.setSolid(W - 1, j, true)
  }
  // tank walls
  for (let j = 0; j < H; j++) {
    f.setSolid(TANK_X0 - 1, j, true)
    f.setSolid(TANK_X1, j, true)
  }
  // solver resting separation must match the seeding density
  ;(f as unknown as { spacing: number }).spacing = spacing
  ;(f as unknown as { radius: number }).radius = spacing / 2

  const step = 1 / perAxis
  for (let ci = TANK_X0; ci < TANK_X1; ci++) {
    for (let cj = TANK_Y0; cj < TANK_Y1; cj++) {
      if (f.isSolid(ci, cj)) continue
      for (let a = 0; a < perAxis; a++)
        for (let b = 0; b < perAxis; b++)
          f.addParticle(ci + (a + 0.5) * step, cj + (b + 0.5) * step)
    }
  }
  return f
}

/** Perfect lattice, no solver at all: the ideal packing control. */
function idealLattice(perAxis: number) {
  const xs: number[] = []
  const ys: number[] = []
  const step = 1 / perAxis
  for (let ci = TANK_X0; ci < TANK_X1; ci++)
    for (let cj = TANK_Y0; cj < TANK_Y1; cj++)
      for (let a = 0; a < perAxis; a++)
        for (let b = 0; b < perAxis; b++) {
          xs.push(ci + (a + 0.5) * step)
          ys.push(cj + (b + 0.5) * step)
        }
  return { px: Float32Array.from(xs), py: Float32Array.from(ys), count: xs.length }
}

/**
 * Reconstruct the splat pass exactly: for each pixel centre, sum
 * (1 - r2)^3 * weightScale over every particle within radiusCells.
 */
function splat(
  px: Float32Array,
  py: Float32Array,
  count: number,
  radiusCells: number,
  weightScale: number,
) {
  const field = new Float32Array(RW * RH)
  const rx = radiusCells * PX_PER_CELL_X
  const ry = radiusCells * PX_PER_CELL_Y
  for (let i = 0; i < count; i++) {
    const cx = px[i]! * PX_PER_CELL_X - 0.5 // pixel-centre coordinates
    const cy = py[i]! * PX_PER_CELL_Y - 0.5
    const i0 = Math.max(0, Math.ceil(cx - rx))
    const i1 = Math.min(RW - 1, Math.floor(cx + rx))
    const j0 = Math.max(0, Math.ceil(cy - ry))
    const j1 = Math.min(RH - 1, Math.floor(cy + ry))
    for (let jj = j0; jj <= j1; jj++) {
      const dy = (jj - cy) / ry
      const dy2 = dy * dy
      if (dy2 >= 1) continue
      const row = jj * RW
      for (let ii = i0; ii <= i1; ii++) {
        const dx = (ii - cx) / rx
        const r2 = dx * dx + dy2
        if (r2 >= 1) continue
        const w = 1 - r2
        field[row + ii] = field[row + ii]! + w * w * w * weightScale
      }
    }
  }
  return field
}

/** Cell classification from final particle positions: 0 solid, 1 fluid, 2 air. */
function classify(f: FlipFluid, px: Float32Array, py: Float32Array, count: number) {
  const cls = new Uint8Array(W * H)
  for (let c = 0; c < W * H; c++) cls[c] = f.solid[c] === 1 ? 0 : 2
  for (let i = 0; i < count; i++) {
    const ci = Math.min(Math.max(Math.floor(px[i]!), 0), W - 1)
    const cj = Math.min(Math.max(Math.floor(py[i]!), 0), H - 1)
    const c = ci * H + cj
    if (cls[c] === 2) cls[c] = 1
  }
  return cls
}

/** Cells whose whole (2k+1)^2 neighbourhood is fluid => >= k cells from air/rock. */
function deepCells(cls: Uint8Array, k = 2) {
  const deep = new Uint8Array(W * H)
  for (let i = k; i < W - k; i++) {
    for (let j = k; j < H - k; j++) {
      let ok = true
      for (let a = -k; a <= k && ok; a++)
        for (let b = -k; b <= k && ok; b++)
          if (cls[(i + a) * H + (j + b)] !== 1) ok = false
      if (ok) deep[i * H + j] = 1
    }
  }
  return deep
}

/** AIR cells with fluid on all four sides: real voids the solver left behind. */
function enclosedAirCells(cls: Uint8Array) {
  let n = 0
  for (let i = 1; i < W - 1; i++)
    for (let j = 1; j < H - 1; j++) {
      if (cls[i * H + j] !== 2) continue
      if (
        cls[(i - 1) * H + j] === 1 &&
        cls[(i + 1) * H + j] === 1 &&
        cls[i * H + j - 1] === 1 &&
        cls[i * H + j + 1] === 1
      )
        n++
    }
  return n
}

/**
 * The composite shader's own darkening of interior pixels:
 *   skin    = 1 - smoothstep(SURFACE+0.05, SURFACE+0.40, density)
 *   normal  = normalize(vec3(-dx, -dy, 0.35))  (central differences, 1 texel)
 *   diffuse = clamp(dot(normal, L) * 0.5 + 0.6, 0, 1.2)
 *   colour *= mix(1.0, diffuse, skin)
 * Values below 1 are dark speckles, above 1 bright ones.
 */
function shadingFactors(field: Float32Array, deep: Uint8Array, surface: number) {
  const L = [-0.4, 0.85, 0.5]
  const ln = Math.hypot(L[0]!, L[1]!, L[2]!)
  const lx = L[0]! / ln
  const ly = L[1]! / ln
  const lz = L[2]! / ln
  const vals: number[] = []
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1)
    return t * t * (3 - 2 * t)
  }
  for (let jj = 1; jj < RH - 1; jj++) {
    for (let ii = 1; ii < RW - 1; ii++) {
      const cx = Math.min(Math.max(Math.floor((ii + 0.5) / PX_PER_CELL_X), 0), W - 1)
      const cy = Math.min(Math.max(Math.floor((jj + 0.5) / PX_PER_CELL_Y), 0), H - 1)
      if (deep[cx * H + cy] !== 1) continue
      const d = field[jj * RW + ii]!
      const skin = 1 - smooth(surface + 0.05, surface + 0.4, d)
      const dx = field[jj * RW + ii + 1]! - field[jj * RW + ii - 1]!
      const dy = field[(jj + 1) * RW + ii]! - field[(jj - 1) * RW + ii]!
      const nl = Math.hypot(-dx, -dy, 0.35)
      const nx = -dx / nl
      const ny = -dy / nl
      const nz = 0.35 / nl
      const dot = nx * lx + ny * ly + nz * lz
      const diffuse = Math.min(Math.max(dot * 0.5 + 0.6, 0), 1.2)
      vals.push(1 + skin * (diffuse - 1))
    }
  }
  vals.sort((a, b) => a - b)
  const n = vals.length
  const q = (p: number) => vals[Math.min(n - 1, Math.floor(p * n))]!
  let dark = 0
  for (const v of vals) if (v < 0.95) dark++
  return {
    n,
    min: vals[0] ?? 1,
    p01: q(0.01),
    p05: q(0.05),
    p50: q(0.5),
    max: vals[n - 1] ?? 1,
    fracDark: dark / n,
  }
}

function stats(field: Float32Array, deep: Uint8Array, surface: number) {
  const vals: number[] = []
  for (let jj = 0; jj < RH; jj++) {
    for (let ii = 0; ii < RW; ii++) {
      const cx = Math.min(Math.max(Math.floor((ii + 0.5) / PX_PER_CELL_X), 0), W - 1)
      const cy = Math.min(Math.max(Math.floor((jj + 0.5) / PX_PER_CELL_Y), 0), H - 1)
      if (deep[cx * H + cy] !== 1) continue
      vals.push(field[jj * RW + ii]!)
    }
  }
  vals.sort((a, b) => a - b)
  const n = vals.length
  const q = (p: number) => vals[Math.min(n - 1, Math.max(0, Math.floor(p * n)))]!
  let belowSurface = 0
  let belowClear = 0
  let belowOpaque = 0
  let belowSkin = 0
  const clear = surface - 0.22
  const opaque = surface + 0.06 // above this the water term is fully 1
  const skinEnd = surface + 0.4 // above this no volume lighting is applied
  let sum = 0
  for (const v of vals) {
    if (v < surface) belowSurface++
    if (v < clear) belowClear++
    if (v < opaque) belowOpaque++
    if (v < skinEnd) belowSkin++
    sum += v
  }
  return {
    n,
    mean: sum / n,
    min: vals[0] ?? 0,
    p01: q(0.01),
    p05: q(0.05),
    p50: q(0.5),
    max: vals[n - 1] ?? 0,
    fracBelowSurface: belowSurface / n,
    fracBelowClear: belowClear / n,
    fracBelowOpaque: belowOpaque / n,
    fracBelowSkin: belowSkin / n,
    surface,
    clear,
    opaque,
    skinEnd,
  }
}

function report(label: string, s: ReturnType<typeof stats>, extra = '') {
  out(
    `${label.padEnd(44)} n=${String(s.n).padStart(6)}  ` +
      `min=${s.min.toFixed(3)} p01=${s.p01.toFixed(3)} p05=${s.p05.toFixed(3)} p50=${s.p50.toFixed(3)} ` +
      `max=${s.max.toFixed(3)} mean=${s.mean.toFixed(3)}  ` +
      `<${s.surface.toFixed(2)}(hole)=${(s.fracBelowSurface * 100).toFixed(2)}%  ` +
      `<${s.clear.toFixed(2)}(clear)=${(s.fracBelowClear * 100).toFixed(2)}%  ` +
      `<${s.opaque.toFixed(2)}(part-transp)=${(s.fracBelowOpaque * 100).toFixed(2)}%  ` +
      `<${s.skinEnd.toFixed(2)}(lit)=${(s.fracBelowSkin * 100).toFixed(2)}%${extra}`,
  )
}

// weight scale so that full water sums to 1:
//   per-particle integral of (1-r2)^3 over the disc = pi*R^2/4  (R in cells)
//   N particles per cell area => N * pi*R^2/4 * scale = 1
//   => scale = 4 / (N * pi * R^2)
function weightScale(perCell: number, radiusCells: number) {
  return 4 / (perCell * Math.PI * radiusCells * radiusCells)
}

describe('metaball density field reconstruction', () => {
  it('measures interior holes', () => {
    const STEPS = 400
    const DT = 1 / 60

    out('=== SETUP ===')
    out(`world ${W}x${H} cells, render ${RW}x${RH} px (${PX_PER_CELL_X} px/cell)`)
    out(`tank x=[${TANK_X0},${TANK_X1}) y=[${TANK_Y0},${TANK_Y1}) = 60 wide x 25 deep`)
    out(`settled with ${STEPS} steps at dt=1/60`)
    out('')

    type Cfg = {
      label: string
      perAxis: number
      radiusCells: number
      surface: number
    }
    const cfgs: Cfg[] = [
      { label: '(a) BASELINE 2x2=4/cell, blob dia 3.2', perAxis: 2, radiusCells: 1.6, surface: 0.5 },
      { label: '(b) 3x3=9/cell, blob dia 3.2', perAxis: 3, radiusCells: 1.6, surface: 0.5 },
      { label: '(c) 4x4=16/cell, blob dia 3.2', perAxis: 4, radiusCells: 1.6, surface: 0.5 },
      { label: '(d) 2x2=4/cell, blob dia 4.2', perAxis: 2, radiusCells: 2.1, surface: 0.5 },
      { label: '(e) 2x2=4/cell, blob dia 3.2, SURF 0.40', perAxis: 2, radiusCells: 1.6, surface: 0.4 },
    ]

    // cache settled sims by perAxis so (a),(d),(e) share one run
    const settled = new Map<number, FlipFluid>()
    function getSettled(perAxis: number) {
      const hit = settled.get(perAxis)
      if (hit) return hit
      const f = buildTank(perAxis, 1 / perAxis)
      for (let s = 0; s < STEPS; s++) f.step(DT)
      settled.set(perAxis, f)
      return f
    }

    out('=== SETTLED SIM (real FlipFluid) ===')
    for (const cfg of cfgs) {
      const perCell = cfg.perAxis * cfg.perAxis
      const ws = weightScale(perCell, cfg.radiusCells)
      const f = getSettled(cfg.perAxis)
      const cls = classify(f, f.px, f.py, f.count)
      const deep = deepCells(cls)
      const field = splat(f.px, f.py, f.count, cfg.radiusCells, ws)
      const s = stats(field, deep, cfg.surface)
      report(cfg.label, s, `  [parts=${f.count} ws=${ws.toFixed(5)}]`)
    }
    out('')

    out('=== IDEAL LATTICE CONTROL (no solver, perfect packing) ===')
    for (const cfg of cfgs) {
      const perCell = cfg.perAxis * cfg.perAxis
      const ws = weightScale(perCell, cfg.radiusCells)
      const lat = idealLattice(cfg.perAxis)
      // deep mask from the perfect tank geometry
      const cls = new Uint8Array(W * H)
      for (let c = 0; c < W * H; c++) cls[c] = 2
      for (let i = TANK_X0; i < TANK_X1; i++)
        for (let j = TANK_Y0; j < TANK_Y1; j++) cls[i * H + j] = 1
      const deep = deepCells(cls)
      const field = splat(lat.px, lat.py, lat.count, cfg.radiusCells, ws)
      const s = stats(field, deep, cfg.surface)
      report(cfg.label, s, `  [parts=${lat.count}]`)
    }
    out('')

    out('=== SETTLED TANK: SHADING FACTOR the composite applies to interior px ===')
    out('(mix(1, diffuse, skin); <1 is a dark speckle, measured over the same deep pixels)')
    for (const cfg of cfgs) {
      const perCell = cfg.perAxis * cfg.perAxis
      const ws = weightScale(perCell, cfg.radiusCells)
      const f = getSettled(cfg.perAxis)
      const cls = classify(f, f.px, f.py, f.count)
      const deep = deepCells(cls)
      const field = splat(f.px, f.py, f.count, cfg.radiusCells, ws)
      const sh = shadingFactors(field, deep, cfg.surface)
      out(
        `${cfg.label.padEnd(44)} min=${sh.min.toFixed(3)} p01=${sh.p01.toFixed(3)} ` +
          `p05=${sh.p05.toFixed(3)} p50=${sh.p50.toFixed(3)} max=${sh.max.toFixed(3)} ` +
          `frac<0.95 = ${(sh.fracDark * 100).toFixed(2)}%`,
      )
    }
    out('')

    out('=== SETTLED TANK: laxer interior (>=1 cell from air/rock) + enclosed air ===')
    for (const cfg of cfgs) {
      const perCell = cfg.perAxis * cfg.perAxis
      const ws = weightScale(perCell, cfg.radiusCells)
      const f = getSettled(cfg.perAxis)
      const cls = classify(f, f.px, f.py, f.count)
      const deep = deepCells(cls, 1)
      const field = splat(f.px, f.py, f.count, cfg.radiusCells, ws)
      report(cfg.label, stats(field, deep, cfg.surface), `  [enclosedAir=${enclosedAirCells(cls)}]`)
    }
    out('')

    // ---- particles-per-cell distribution in the settled baseline ----
    out('=== PARTICLES PER CELL, settled, deep cells only ===')
    for (const perAxis of [2, 3, 4]) {
      const f = getSettled(perAxis)
      const cls = classify(f, f.px, f.py, f.count)
      const deep = deepCells(cls)
      const counts = new Int32Array(W * H)
      for (let i = 0; i < f.count; i++) {
        const ci = Math.min(Math.max(Math.floor(f.px[i]!), 0), W - 1)
        const cj = Math.min(Math.max(Math.floor(f.py[i]!), 0), H - 1)
        counts[ci * H + cj]!++
      }
      const vals: number[] = []
      for (let c = 0; c < W * H; c++) if (deep[c] === 1) vals.push(counts[c]!)
      vals.sort((a, b) => a - b)
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      out(
        `${perAxis}x${perAxis} nominal=${perAxis * perAxis}  cells=${vals.length} ` +
          `min=${vals[0]} p05=${vals[Math.floor(0.05 * vals.length)]} ` +
          `p50=${vals[Math.floor(0.5 * vals.length)]} max=${vals[vals.length - 1]} ` +
          `mean=${mean.toFixed(2)}`,
      )
    }
    out('')

    // ------------------------------------------------------------------
    // Solver cost at realistic scale: 100x50 cells, ~35% scattered rock,
    // filled about 60%.
    // ------------------------------------------------------------------
    out('=== SOLVER COST, 100x50 cells, ~35% rock, bottom 60% filled ===')
    let seed = 12345
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    // fixed rock layout shared by all three
    const rock = new Uint8Array(W * H)
    for (let i = 0; i < W; i++)
      for (let j = 0; j < H; j++) if (rand() < 0.35) rock[i * H + j] = 1

    const realistic = new Map<number, FlipFluid>()
    for (const perAxis of [2, 3, 4]) {
      const f = new FlipFluid({ width: W, height: H, maxParticles: 60000 })
      for (let i = 0; i < W; i++)
        for (let j = 0; j < H; j++) if (rock[i * H + j] === 1) f.setSolid(i, j, true)
      for (let i = 0; i < W; i++) {
        f.setSolid(i, 0, true)
        f.setSolid(i, H - 1, true)
      }
      for (let j = 0; j < H; j++) {
        f.setSolid(0, j, true)
        f.setSolid(W - 1, j, true)
      }
      ;(f as unknown as { spacing: number }).spacing = 1 / perAxis
      ;(f as unknown as { radius: number }).radius = 1 / (2 * perAxis)
      const st = 1 / perAxis
      const fillTop = Math.floor(H * 0.6)
      for (let i = 1; i < W - 1; i++)
        for (let j = 1; j < fillTop; j++) {
          if (f.isSolid(i, j)) continue
          for (let a = 0; a < perAxis; a++)
            for (let b = 0; b < perAxis; b++)
              f.addParticle(i + (a + 0.5) * st, j + (b + 0.5) * st)
        }
      const seeded = f.count
      for (let s = 0; s < 200; s++) f.step(DT) // warm up / settle
      const t0 = performance.now()
      const N = 200
      for (let s = 0; s < N; s++) f.step(DT)
      const t1 = performance.now()
      out(
        `${perAxis}x${perAxis}=${perAxis * perAxis}/cell  seeded=${seeded} live=${f.count}  ` +
          `${((t1 - t0) / N).toFixed(2)} ms/frame`,
      )
      realistic.set(perAxis, f)
    }
    out('')

    out('=== REALISTIC SCENE, settled 400 steps: interior density (>=2 cells) ===')
    for (const cfg of cfgs) {
      const ws = weightScale(cfg.perAxis * cfg.perAxis, cfg.radiusCells)
      const f = realistic.get(cfg.perAxis)!
      const cls = classify(f, f.px, f.py, f.count)
      const deep = deepCells(cls, 2)
      const field = splat(f.px, f.py, f.count, cfg.radiusCells, ws)
      report(cfg.label, stats(field, deep, cfg.surface), `  [enclosedAir=${enclosedAirCells(cls)}]`)
    }
    out('')
    out('=== REALISTIC SCENE: interior density (>=1 cell from air/rock) ===')
    for (const cfg of cfgs) {
      const ws = weightScale(cfg.perAxis * cfg.perAxis, cfg.radiusCells)
      const f = realistic.get(cfg.perAxis)!
      const cls = classify(f, f.px, f.py, f.count)
      const deep = deepCells(cls, 1)
      const field = splat(f.px, f.py, f.count, cfg.radiusCells, ws)
      report(cfg.label, stats(field, deep, cfg.surface))
    }
    out('')
    out('=== REALISTIC SCENE: shading factor over >=2 cell interior ===')
    for (const cfg of cfgs) {
      const ws = weightScale(cfg.perAxis * cfg.perAxis, cfg.radiusCells)
      const f = realistic.get(cfg.perAxis)!
      const cls = classify(f, f.px, f.py, f.count)
      const deep = deepCells(cls, 2)
      const field = splat(f.px, f.py, f.count, cfg.radiusCells, ws)
      const sh = shadingFactors(field, deep, cfg.surface)
      out(
        `${cfg.label.padEnd(44)} n=${sh.n} min=${sh.min.toFixed(3)} p01=${sh.p01.toFixed(3)} ` +
          `p05=${sh.p05.toFixed(3)} p50=${sh.p50.toFixed(3)} max=${sh.max.toFixed(3)} ` +
          `frac<0.95 = ${(sh.fracDark * 100).toFixed(2)}%`,
      )
    }

    writeFileSync('zz-field-out.txt', lines.join('\n'))
  }, 900000)
})
