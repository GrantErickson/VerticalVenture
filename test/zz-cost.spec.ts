import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { FlipFluid } from '@/scripts/fluid/flipFluid'

// ---------------------------------------------------------------- world build

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/**
 * Blobby rock at block resolution, thresholded so that exactly ROCK_FRACTION of
 * the interior blocks are solid.
 */
const ROCK_FRACTION = 0.35

function rockMask(blocksW: number, blocksH: number, seed: number) {
  const rng = makeRng(seed)
  let field = new Float64Array(blocksW * blocksH)
  for (let i = 0; i < field.length; i++) field[i] = rng()
  // Two box blurs so the rock comes out in contiguous blobs with caves between
  // them rather than as salt and pepper.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float64Array(field.length)
    for (let x = 0; x < blocksW; x++)
      for (let y = 0; y < blocksH; y++) {
        let sum = 0
        let n = 0
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= blocksW || ny >= blocksH) continue
            sum += field[nx * blocksH + ny]!
            n++
          }
        next[x * blocksH + y] = sum / n
      }
    field = next
  }
  const sorted = [...field].sort((a, b) => a - b)
  const threshold = sorted[Math.floor(sorted.length * ROCK_FRACTION)]!
  const m = new Uint8Array(field.length)
  for (let i = 0; i < field.length; i++) m[i] = field[i]! < threshold ? 1 : 0
  return m
}

interface Case {
  name: string
  cellsPerBlock: number
  particlesPerAxis: number
  waterFraction?: number
  tweak?: (f: FlipFluid) => void
}

const BLOCKS_W = 50
const BLOCKS_H = 25
const WATER_FRACTION = 0.6

function build(c: Case) {
  const cpb = c.cellsPerBlock
  const width = BLOCKS_W * cpb
  const height = BLOCKS_H * cpb
  const f = new FlipFluid({ width, height, maxParticles: 90000 })

  const mask = rockMask(BLOCKS_W, BLOCKS_H, 0x9e3779b9)
  for (let x = 0; x < BLOCKS_W; x++)
    for (let y = 0; y < BLOCKS_H; y++) {
      const solid = mask[x * BLOCKS_H + y] === 1
      for (let ci = 0; ci < cpb; ci++)
        for (let cj = 0; cj < cpb; cj++)
          f.setSolid(x * cpb + ci, y * cpb + cj, solid)
    }
  for (let i = 0; i < width; i++) {
    f.setSolid(i, 0, true)
    f.setSolid(i, height - 1, true)
  }
  for (let j = 0; j < height; j++) {
    f.setSolid(0, j, true)
    f.setSolid(width - 1, j, true)
  }

  let open = 0
  for (let i = 0; i < width; i++)
    for (let j = 0; j < height; j++) if (!f.isSolid(i, j)) open++

  const targetCells = Math.round(open * (c.waterFraction ?? WATER_FRACTION))
  const ppa = c.particlesPerAxis
  const step = 1 / ppa
  let waterCells = 0
  // Fill from the bottom up: a settled body of water, which is the case the
  // voids complaint is about.
  outer: for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      if (f.isSolid(i, j)) continue
      for (let px = 0; px < ppa; px++)
        for (let py = 0; py < ppa; py++)
          f.addParticle(i + (px + 0.5) * step, j + (py + 0.5) * step)
      waterCells++
      if (waterCells >= targetCells) break outer
    }
  }

  // The separation pass must agree with how the water was seeded, or it
  // expands the body like foam on the first step.
  const anyF = f as unknown as Record<string, number>
  anyF.spacing = step
  anyF.radius = step / 2
  c.tweak?.(f)

  return { f, width, height, open, waterCells, spacing: step }
}

// ------------------------------------------------------------------ measuring

const DT = 1 / 60
const WARMUP = 20
const MEASURE = 60
const REPEATS = 3

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}

function timeCase(c: Case) {
  const runs: number[] = []
  let info: ReturnType<typeof build> | null = null
  let endSpeed = 0
  for (let r = 0; r < REPEATS; r++) {
    const built = build(c)
    info = built
    const f = built.f
    for (let s = 0; s < WARMUP; s++) f.step(DT)
    const t0 = performance.now()
    for (let s = 0; s < MEASURE; s++) f.step(DT)
    const t1 = performance.now()
    runs.push((t1 - t0) / MEASURE)
    let sum = 0
    for (let i = 0; i < f.count; i++) sum += Math.hypot(f.pvx[i]!, f.pvy[i]!)
    endSpeed = f.count > 0 ? sum / f.count : 0
  }
  return {
    name: c.name,
    grid: `${info!.width}x${info!.height}`,
    openCells: info!.open,
    waterCells: info!.waterCells,
    particles: info!.f.count,
    spacing: info!.spacing,
    msPerStepRuns: runs.map((x) => +x.toFixed(3)),
    msPerStep: +median(runs).toFixed(3),
    meanSpeedAtEnd: +endSpeed.toFixed(3),
  }
}

const PHASES = [
  'integrate',
  'pushParticlesApart',
  'transferToGrid',
  'updateDensity',
  'applyGravity',
  'solveIncompressibility',
  'transferFromGrid',
]

function phaseBreakdown(c: Case) {
  const built = build(c)
  const f = built.f
  const target = f as unknown as Record<string, (...a: unknown[]) => unknown>
  const totals: Record<string, number> = {}
  for (const name of PHASES) {
    totals[name] = 0
    const orig = target[name]!.bind(f)
    target[name] = (...args: unknown[]) => {
      const t0 = performance.now()
      const out = orig(...args)
      totals[name]! += performance.now() - t0
      return out
    }
  }
  for (let s = 0; s < WARMUP; s++) f.step(DT)
  for (const name of PHASES) totals[name] = 0
  const t0 = performance.now()
  for (let s = 0; s < MEASURE; s++) f.step(DT)
  const wall = performance.now() - t0
  const out: Record<string, number> = {}
  for (const name of PHASES) out[name] = +(totals[name]! / MEASURE).toFixed(3)
  out.__instrumentedTotal = +(wall / MEASURE).toFixed(3)
  out.__particles = f.count
  return out
}

describe('fluid particle-size cost', () => {
  it('measures', () => {
    const cases: Case[] = [
      { name: '(a) 4 per cell, 2 cells/block', cellsPerBlock: 2, particlesPerAxis: 2 },
      { name: '(b) 9 per cell, 2 cells/block', cellsPerBlock: 2, particlesPerAxis: 3 },
      { name: '(c) 16 per cell, 2 cells/block', cellsPerBlock: 2, particlesPerAxis: 4 },
      { name: '(d) 4 per cell, 3 cells/block', cellsPerBlock: 3, particlesPerAxis: 2 },
      // extra data points to separate "more particles" from "smaller spacing"
      {
        name: '(e) 4 per cell, 2 cells/block, 100% water (count control)',
        cellsPerBlock: 2,
        particlesPerAxis: 2,
        waterFraction: 1,
      },
      { name: '(f) 9 per cell, 3 cells/block', cellsPerBlock: 3, particlesPerAxis: 3 },
      { name: '(g) 25 per cell, 2 cells/block', cellsPerBlock: 2, particlesPerAxis: 5 },
      // can the extra cost be tuned back down?
      {
        name: '(h) 9 per cell, separationIterations 1',
        cellsPerBlock: 2,
        particlesPerAxis: 3,
        tweak: (f) => {
          f.separationIterations = 1
        },
      },
      {
        name: '(i) 9 per cell, sep 1 + pressureIterations 20',
        cellsPerBlock: 2,
        particlesPerAxis: 3,
        tweak: (f) => {
          f.separationIterations = 1
          f.pressureIterations = 20
        },
      },
      {
        name: '(j) 16 per cell, separationIterations 1',
        cellsPerBlock: 2,
        particlesPerAxis: 4,
        tweak: (f) => {
          f.separationIterations = 1
        },
      },
    ]

    const lines: string[] = []
    const results = cases.map((c) => timeCase(c))
    lines.push('=== wall clock, median of 3 runs of 60 steps after 20 warmup ===')
    for (const r of results) lines.push(JSON.stringify(r))

    lines.push('')
    lines.push('=== phase breakdown (instrumented; adds wrapper overhead) ===')
    for (const c of cases) {
      lines.push(c.name + ' -> ' + JSON.stringify(phaseBreakdown(c)))
    }

    lines.push('')
    lines.push('node ' + process.version)
    writeFileSync('zz-cost-out.txt', lines.join('\n'))
  }, 600000)
})
