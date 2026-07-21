/**
 * A FLIP/PIC water simulation.
 *
 * This is a second, unrelated take on the water in this game. The original
 * engine (see waterProcessor.ts) models water as an amount per block and settles
 * connected bodies to a level; it is cheap and always comes to rest, but it can
 * only ever move water a whole block at a time and has no notion of momentum, so
 * nothing sloshes, splashes or flows sideways under its own weight.
 *
 * This one is the standard hybrid used by real liquid solvers:
 *
 *   1. Particles carry the water and its velocity. They are the fluid — where
 *      they are is where water is.
 *   2. Their velocities are splatted onto a staggered grid, because momentum is
 *      easy to move around on particles but incompressibility is not.
 *   3. Gravity, then a pressure solve on the grid makes the velocity field
 *      divergence free: water stops flowing into itself, piles up, and pushes
 *      back against rock.
 *   4. The corrected velocities are interpolated back to the particles, which
 *      then move.
 *
 * The FLIP half of the name is step 4: rather than replacing a particle's
 * velocity with the grid's (that is PIC, which is stable but loses almost all
 * its energy to interpolation and comes out looking like syrup), it adds the
 * *change* the grid made to the velocity the particle already had. Pure FLIP
 * keeps every bit of energy and eventually rattles itself apart, so the two are
 * blended — `flipRatio` — which is the single knob with the most effect on how
 * the water feels.
 *
 * Everything here works in grid cells, not blocks and not pixels: positions are
 * in cells, velocities in cells per second. The caller decides how many cells a
 * block is worth.
 */

export const SOLID = 0
export const FLUID = 1
export const AIR = 2

export interface FlipFluidOptions {
  /** Cells across and up. The border is expected to be marked solid. */
  width: number
  height: number
  maxParticles: number
  /** Cells per second squared. Negative is down. */
  gravity?: number
  /** 0 is pure PIC (viscous, lifeless), 1 pure FLIP (energetic, unstable). */
  flipRatio?: number
  /** Gauss-Seidel sweeps in the pressure solve. More is stiffer water. */
  pressureIterations?: number
  /** Over-relaxation for those sweeps; 1.9 converges far faster than 1.0. */
  overRelaxation?: number
  /**
   * How hard the pressure solve pushes back when a cell holds more or less than
   * its share of particles. Crowded cells are always corrected; under-filled
   * ones only where they are submerged, since a cell at a free surface is meant
   * to be short of particles.
   */
  driftCorrection?: number
  /**
   * How strongly neighbouring particles pull each other towards a shared
   * velocity. This is the only damping in the model — without it a body of
   * water never stops shivering, because nothing in FLIP removes energy.
   */
  viscosity?: number
  /** Relaxation sweeps that keep the particles evenly spread. */
  separationIterations?: number
}

export class FlipFluid {
  readonly width: number
  readonly height: number
  readonly maxParticles: number

  gravity: number
  flipRatio: number
  pressureIterations: number
  overRelaxation: number
  driftCorrection: number
  viscosity: number
  separationIterations: number

  // Staggered ("MAC") velocity grid: u lives on the vertical faces between
  // cells and v on the horizontal ones, rather than both at the centre. That is
  // what turns the pressure solve below into a local sum over four faces
  // instead of something that needs a wider stencil to stay stable.
  readonly u: Float32Array
  readonly v: Float32Array
  private uPrev: Float32Array
  private vPrev: Float32Array
  private uWeight: Float32Array
  private vWeight: Float32Array

  readonly cell: Uint8Array
  readonly solid: Uint8Array
  /** Particles per cell, splatted. Used to undo FLIP's tendency to clump. */
  readonly density: Float32Array
  restDensity = 0

  count = 0
  readonly px: Float32Array
  readonly py: Float32Array
  readonly pvx: Float32Array
  readonly pvy: Float32Array

  /** Particles sit about this far apart when the water is at rest. */
  readonly spacing = 0.5
  private readonly radius = 0.25

  // Counting-sort buckets, one per cell, for finding a particle's neighbours.
  private readonly cellStart: Int32Array
  private readonly cellEntries: Int32Array

  constructor(options: FlipFluidOptions) {
    this.width = options.width
    this.height = options.height
    this.maxParticles = options.maxParticles
    this.gravity = options.gravity ?? -110
    // 0.9 read as syrup: with 10% PIC blended in every step, a splash died in
    // a couple of dozen frames and the water crawled. 0.95 keeps sloshing and
    // splashing alive while the remaining PIC still bleeds off jitter.
    this.flipRatio = options.flipRatio ?? 0.95
    // 30 sweeps and 2 separation passes measured out at about 7ms a frame for
    // the ~7500 particles a generated world holds, with the water still coming
    // to a dead stop and no voids opening up under the surface.
    this.pressureIterations = options.pressureIterations ?? 30
    this.overRelaxation = options.overRelaxation ?? 1.9
    this.driftCorrection = options.driftCorrection ?? 1.0
    // Shared per pair per separation pass, so the effective smoothing is about
    // double this number. 0.12 made the water move as one gluey mass; 0.05 is
    // still enough, with the PIC fraction above, for a sealed tank to reach a
    // dead stop (the settling test holds), but drops and streams break apart
    // instead of stringing.
    this.viscosity = options.viscosity ?? 0.05
    this.separationIterations = options.separationIterations ?? 2

    const cells = this.width * this.height
    this.u = new Float32Array((this.width + 1) * this.height)
    this.v = new Float32Array(this.width * (this.height + 1))
    this.uPrev = new Float32Array(this.u.length)
    this.vPrev = new Float32Array(this.v.length)
    this.uWeight = new Float32Array(this.u.length)
    this.vWeight = new Float32Array(this.v.length)
    this.cell = new Uint8Array(cells)
    this.solid = new Uint8Array(cells)
    this.density = new Float32Array(cells)

    this.px = new Float32Array(this.maxParticles)
    this.py = new Float32Array(this.maxParticles)
    this.pvx = new Float32Array(this.maxParticles)
    this.pvy = new Float32Array(this.maxParticles)
    this.cellStart = new Int32Array(cells + 1)
    this.cellEntries = new Int32Array(this.maxParticles)
    this.fluidCells = new Int32Array(cells)
    this.submerged = new Uint8Array(cells)
  }

  private cellIndex(i: number, j: number): number {
    return i * this.height + j
  }

  isSolid(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return true
    return this.solid[i * this.height + j] === 1
  }

  setSolid(i: number, j: number, value: boolean) {
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return
    this.solid[i * this.height + j] = value ? 1 : 0
  }

  addParticle(x: number, y: number, vx = 0, vy = 0): boolean {
    if (this.count >= this.maxParticles) return false
    const i = this.count++
    this.px[i] = x
    this.py[i] = y
    this.pvx[i] = vx
    this.pvy[i] = vy
    return true
  }

  /** Drop every particle the predicate rejects, keeping the rest packed. */
  removeParticles(keep: (x: number, y: number) => boolean) {
    let out = 0
    for (let i = 0; i < this.count; i++) {
      if (!keep(this.px[i]!, this.py[i]!)) continue
      this.px[out] = this.px[i]!
      this.py[out] = this.py[i]!
      this.pvx[out] = this.pvx[i]!
      this.pvy[out] = this.pvy[i]!
      out++
    }
    this.count = out
  }

  /** Any particle now buried in rock is deleted — the player filled it in. */
  evictFromSolids() {
    this.removeParticles((x, y) => !this.isSolid(Math.floor(x), Math.floor(y)))
  }

  // Cells holding water, gathered as the types are worked out, so the pressure
  // sweeps walk only the water instead of the whole grid — in a world that is
  // half rock and air that is most of the work saved.
  private readonly fluidCells: Int32Array
  private fluidCellCount = 0
  /** Parallel to fluidCells: 1 where the cell is under the surface. */
  private readonly submerged: Uint8Array

  /**
   * Order matters here, and getting it wrong is invisible until you notice the
   * water never quite holds still. Gravity goes on the grid and the particles
   * are moved *last*, with velocities the pressure solve has already corrected.
   * Moving them first — falling a little, then being shoved back every frame —
   * pumps energy in on every step, and the water shivers forever at rest no
   * matter how much damping is piled on top.
   */
  step(dt: number, substeps = 1) {
    const sub = dt / substeps
    for (let s = 0; s < substeps; s++) {
      this.transferToGrid()
      this.updateDensity()
      this.applyGravity(sub)
      this.solveIncompressibility()
      this.transferFromGrid()
      this.pushParticlesApart()
      this.integrate(sub)
    }
  }

  /** Gravity on every face the water can actually move through. */
  private applyGravity(dt: number) {
    const stride = this.height + 1
    const change = this.gravity * dt
    for (let i = 0; i < this.width; i++) {
      for (let j = 1; j < this.height; j++) {
        if (this.isSolid(i, j - 1) || this.isSolid(i, j)) continue
        const below = this.cell[i * this.height + j - 1]
        const here = this.cell[i * this.height + j]
        if (below !== FLUID && here !== FLUID) continue
        this.v[i * stride + j] = this.v[i * stride + j]! + change
      }
    }
  }

  /**
   * Move the particles, one axis at a time so that a particle sliding along a
   * wall keeps sliding instead of stopping dead when either axis is blocked.
   */
  private integrate(dt: number) {
    // Never let a particle cross a whole cell in one substep, or it could jump
    // clean through a one cell thick wall without ever being inside it.
    const limit = 0.9 / dt

    for (let i = 0; i < this.count; i++) {
      let vx = this.pvx[i]!
      let vy = this.pvy[i]!
      const speed = Math.hypot(vx, vy)
      if (speed > limit) {
        vx = (vx / speed) * limit
        vy = (vy / speed) * limit
      }

      let x = this.px[i]!
      let y = this.py[i]!
      const nx = x + vx * dt
      if (this.isSolid(Math.floor(nx), Math.floor(y))) vx = 0
      else x = nx
      const ny = y + vy * dt
      if (this.isSolid(Math.floor(x), Math.floor(ny))) vy = 0
      else y = ny

      this.px[i] = x
      this.py[i] = y
      this.pvx[i] = vx
      this.pvy[i] = vy
    }
  }

  /** Bucket the particles by cell so neighbours are cheap to walk. */
  private buildBuckets() {
    const counts = this.cellStart
    counts.fill(0)
    for (let i = 0; i < this.count; i++) {
      const ci = this.clampCell(this.px[i]!, this.width)
      const cj = this.clampCell(this.py[i]!, this.height)
      counts[this.cellIndex(ci, cj)]!++
    }
    let total = 0
    for (let c = 0; c < counts.length - 1; c++) {
      total += counts[c]!
      counts[c] = total
    }
    counts[counts.length - 1] = total
    for (let i = 0; i < this.count; i++) {
      const ci = this.clampCell(this.px[i]!, this.width)
      const cj = this.clampCell(this.py[i]!, this.height)
      const c = this.cellIndex(ci, cj)
      this.cellEntries[--counts[c]!] = i
    }
  }

  private clampCell(value: number, limit: number): number {
    const cell = Math.floor(value)
    return cell < 0 ? 0 : cell >= limit ? limit - 1 : cell
  }

  /**
   * Nudge apart particles that have bunched up.
   *
   * FLIP has no opinion about how particles are spread out inside a cell — the
   * pressure solve only sees the grid — so left alone they gather into clumps
   * with visible holes between them, and the surface goes lumpy. This is a
   * cheap relaxation that keeps them roughly a spacing apart.
   */
  private pushParticlesApart(iterations = this.separationIterations) {
    this.buildBuckets()
    const minDist = this.spacing
    const minDistSq = minDist * minDist

    // Every pair is dealt with once, moving both of them. Cells are indexed
    // column first, so of the eight cells around this one, only these four come
    // later — the pairs in the other four were already handled from that end.
    const height = this.height
    const laterI = [0, 1, 1, 1]
    const laterJ = [1, -1, 0, 1]
    const viscosity = this.viscosity

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < this.count; i++) {
        const ci = this.clampCell(this.px[i]!, this.width)
        const cj = this.clampCell(this.py[i]!, this.height)
        const home = ci * height + cj

        for (let n = -1; n < 4; n++) {
          let c = home
          if (n >= 0) {
            const oi = ci + laterI[n]!
            const oj = cj + laterJ[n]!
            if (oi >= this.width || oj < 0 || oj >= height) continue
            c = oi * height + oj
          }
          const end = this.cellStart[c + 1]!
          for (let e = this.cellStart[c]!; e < end; e++) {
            const other = this.cellEntries[e]!
            // Within this particle's own cell, the ones before it in the bucket
            // have already pushed against it.
            if (c === home && other <= i) continue
            let dx = this.px[other]! - this.px[i]!
            let dy = this.py[other]! - this.py[i]!
            const distSq = dx * dx + dy * dy
            if (distSq > minDistSq || distSq === 0) continue
            const dist = Math.sqrt(distSq)
            const push = (0.5 * (minDist - dist)) / dist
            this.px[i] = this.px[i]! - dx * push
            this.py[i] = this.py[i]! - dy * push
            this.px[other] = this.px[other]! + dx * push
            this.py[other] = this.py[other]! + dy * push

            // While these two are in hand, pull their velocities towards each
            // other a little. Neighbours that disagree about where they are
            // going is exactly what jitter is, and nothing else in the model
            // ever takes energy out. Symmetric, so no momentum is invented.
            if (viscosity > 0) {
              const share = viscosity * (1 - dist / minDist)
              const dvx = (this.pvx[other]! - this.pvx[i]!) * share
              const dvy = (this.pvy[other]! - this.pvy[i]!) * share
              this.pvx[i] = this.pvx[i]! + dvx
              this.pvy[i] = this.pvy[i]! + dvy
              this.pvx[other] = this.pvx[other]! - dvx
              this.pvy[other] = this.pvy[other]! - dvy
            }
          }
        }
      }
    }

    for (let i = 0; i < this.count; i++) {
      // Only to keep the indexing honest; the walls are solid cells like any
      // other and pushOutOfSolids is what actually holds the water in.
      this.px[i] = Math.min(Math.max(this.px[i]!, 0.001), this.width - 0.001)
      this.py[i] = Math.min(Math.max(this.py[i]!, 0.001), this.height - 0.001)
    }
    this.pushOutOfSolids()
  }

  /**
   * Lift any particle that has ended up inside rock back out through its
   * nearest open face. Moving a particle never puts it in rock — integrate
   * refuses to step into a solid cell — but shoving them apart to keep them
   * evenly spread can, and so can the player filling a block in underneath one.
   */
  private pushOutOfSolids() {
    for (let i = 0; i < this.count; i++) {
      const x = this.px[i]!
      const y = this.py[i]!
      const ci = Math.floor(x)
      const cj = Math.floor(y)
      if (!this.isSolid(ci, cj)) continue

      let shortest = Infinity
      let outX = x
      let outY = y
      if (!this.isSolid(ci - 1, cj) && x - ci < shortest) {
        shortest = x - ci
        outX = ci - this.radius
        outY = y
      }
      if (!this.isSolid(ci + 1, cj) && ci + 1 - x < shortest) {
        shortest = ci + 1 - x
        outX = ci + 1 + this.radius
        outY = y
      }
      if (!this.isSolid(ci, cj - 1) && y - cj < shortest) {
        shortest = y - cj
        outX = x
        outY = cj - this.radius
      }
      if (!this.isSolid(ci, cj + 1) && cj + 1 - y < shortest) {
        shortest = cj + 1 - y
        outX = x
        outY = cj + 1 + this.radius
      }
      // Nothing next door is open. That happens in the corners where two walls
      // meet, and whenever the player fills in a block around some water, so
      // look further out for somewhere to put it.
      if (shortest === Infinity) {
        const spot = this.nearestOpenCell(ci, cj)
        if (!spot) continue // Truly walled in; evictFromSolids clears these.
        this.px[i] = spot.i + 0.5
        this.py[i] = spot.j + 0.5
        continue
      }

      this.px[i] = outX
      this.py[i] = outY
    }
  }

  private nearestOpenCell(ci: number, cj: number) {
    // Ring 1 matters: its faces are known solid by the time this is called, but
    // its *diagonals* are not, and the corner cell of a pocket has an open
    // diagonal — the cell the particle was shoved out of. Starting at ring 2
    // instead used to teleport such particles through a block-thick wall into
    // whatever cavity lay beyond, and pockets slowly bled water at the corners
    // whenever sloshing pressed a particle in.
    for (let ring = 1; ring <= 4; ring++) {
      let best: { i: number; j: number } | null = null
      let bestDistance = Infinity
      for (let i = ci - ring; i <= ci + ring; i++) {
        for (let j = cj - ring; j <= cj + ring; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue
          if (this.isSolid(i, j)) continue
          const distance = (i - ci) ** 2 + (j - cj) ** 2
          if (distance >= bestDistance) continue
          bestDistance = distance
          best = { i, j }
        }
      }
      if (best) return best
    }
    return null
  }

  /**
   * Particle velocities onto the grid, and a note of which cells hold water.
   * Each component is splatted with bilinear weights onto the four faces around
   * it and then divided by the total weight, which is just a weighted average
   * of the particles near that face.
   */
  private transferToGrid() {
    this.u.fill(0)
    this.v.fill(0)
    this.uWeight.fill(0)
    this.vWeight.fill(0)

    for (let c = 0; c < this.cell.length; c++) {
      this.cell[c] = this.solid[c] === 1 ? SOLID : AIR
    }
    this.fluidCellCount = 0
    for (let i = 0; i < this.count; i++) {
      const ci = this.clampCell(this.px[i]!, this.width)
      const cj = this.clampCell(this.py[i]!, this.height)
      const c = this.cellIndex(ci, cj)
      if (this.cell[c] !== AIR) continue
      this.cell[c] = FLUID
      // The border is solid, so anything reaching here is an interior cell and
      // the pressure sweep can read its neighbours without bounds checks.
      this.fluidCells[this.fluidCellCount++] = c
    }

    for (let i = 0; i < this.count; i++) {
      const x = this.px[i]!
      const y = this.py[i]!
      this.splatU(x, y, this.pvx[i]!)
      this.splatV(x, y, this.pvy[i]!)
    }

    for (let k = 0; k < this.u.length; k++) {
      // A face no particle reached carries no water, so it carries no velocity
      // either. Leaving last frame's value there feeds stale momentum back into
      // whatever arrives next.
      this.u[k] = this.uWeight[k]! > 0 ? this.u[k]! / this.uWeight[k]! : 0
    }
    for (let k = 0; k < this.v.length; k++) {
      this.v[k] = this.vWeight[k]! > 0 ? this.v[k]! / this.vWeight[k]! : 0
    }

    this.enforceSolidFaces()
    this.markSubmerged()

    // The FLIP correction is what *this step* did to the water, so the baseline
    // is the field as the particles just handed it over — before gravity and
    // the pressure solve get to it. Comparing against the previous frame
    // instead hands the particles back the same push over and over, and a tank
    // that should be sitting still jitters forever.
    this.uPrev.set(this.u)
    this.vPrev.set(this.v)
  }

  /**
   * Which of the water cells have nothing but water or rock around them, and
   * so are properly under the surface. Worked out once per step rather than
   * inside the pressure sweeps, which all see the same cell types.
   */
  private markSubmerged() {
    const height = this.height
    for (let n = 0; n < this.fluidCellCount; n++) {
      const c = this.fluidCells[n]!
      this.submerged[n] =
        this.cell[c - height] !== AIR &&
        this.cell[c + height] !== AIR &&
        this.cell[c - 1] !== AIR &&
        this.cell[c + 1] !== AIR
          ? 1
          : 0
    }
  }

  /** No flow through rock: any face touching a solid cell is pinned shut. */
  private enforceSolidFaces() {
    for (let i = 0; i <= this.width; i++) {
      for (let j = 0; j < this.height; j++) {
        if (this.isSolid(i - 1, j) || this.isSolid(i, j))
          this.u[i * this.height + j] = 0
      }
    }
    const stride = this.height + 1
    for (let i = 0; i < this.width; i++) {
      for (let j = 0; j <= this.height; j++) {
        if (this.isSolid(i, j - 1) || this.isSolid(i, j))
          this.v[i * stride + j] = 0
      }
    }
  }

  // u faces sit at x = i, y = j + 0.5. v faces at x = i + 0.5, y = j.
  private splatU(x: number, y: number, value: number) {
    const gx = x
    const gy = y - 0.5
    const i0 = Math.min(Math.max(Math.floor(gx), 0), this.width)
    const j0 = Math.min(Math.max(Math.floor(gy), 0), this.height - 1)
    const i1 = Math.min(i0 + 1, this.width)
    const j1 = Math.min(j0 + 1, this.height - 1)
    const tx = Math.min(Math.max(gx - i0, 0), 1)
    const ty = Math.min(Math.max(gy - j0, 0), 1)
    this.accumulate(
      this.u,
      this.uWeight,
      i0 * this.height + j0,
      value,
      (1 - tx) * (1 - ty),
    )
    this.accumulate(
      this.u,
      this.uWeight,
      i1 * this.height + j0,
      value,
      tx * (1 - ty),
    )
    this.accumulate(
      this.u,
      this.uWeight,
      i0 * this.height + j1,
      value,
      (1 - tx) * ty,
    )
    this.accumulate(this.u, this.uWeight, i1 * this.height + j1, value, tx * ty)
  }

  private splatV(x: number, y: number, value: number) {
    const gx = x - 0.5
    const gy = y
    const i0 = Math.min(Math.max(Math.floor(gx), 0), this.width - 1)
    const j0 = Math.min(Math.max(Math.floor(gy), 0), this.height)
    const i1 = Math.min(i0 + 1, this.width - 1)
    const j1 = Math.min(j0 + 1, this.height)
    const tx = Math.min(Math.max(gx - i0, 0), 1)
    const ty = Math.min(Math.max(gy - j0, 0), 1)
    const stride = this.height + 1
    this.accumulate(
      this.v,
      this.vWeight,
      i0 * stride + j0,
      value,
      (1 - tx) * (1 - ty),
    )
    this.accumulate(
      this.v,
      this.vWeight,
      i1 * stride + j0,
      value,
      tx * (1 - ty),
    )
    this.accumulate(
      this.v,
      this.vWeight,
      i0 * stride + j1,
      value,
      (1 - tx) * ty,
    )
    this.accumulate(this.v, this.vWeight, i1 * stride + j1, value, tx * ty)
  }

  private accumulate(
    field: Float32Array,
    weights: Float32Array,
    index: number,
    value: number,
    weight: number,
  ) {
    field[index] = field[index]! + value * weight
    weights[index] = weights[index]! + weight
  }

  /**
   * How many particles are packed into each cell.
   *
   * The pressure solve on its own conserves volume on the grid but not among
   * the particles, which slowly drift into some cells and out of others. Giving
   * the solve a nudge wherever a cell holds more than its share is what keeps
   * the water evenly filled instead of developing voids.
   */
  private updateDensity() {
    this.density.fill(0)
    for (let i = 0; i < this.count; i++) {
      const gx = this.px[i]! - 0.5
      const gy = this.py[i]! - 0.5
      const i0 = this.clampCell(gx, this.width)
      const j0 = this.clampCell(gy, this.height)
      const i1 = Math.min(i0 + 1, this.width - 1)
      const j1 = Math.min(j0 + 1, this.height - 1)
      const tx = Math.min(Math.max(gx - i0, 0), 1)
      const ty = Math.min(Math.max(gy - j0, 0), 1)
      this.density[this.cellIndex(i0, j0)]! += (1 - tx) * (1 - ty)
      this.density[this.cellIndex(i1, j0)]! += tx * (1 - ty)
      this.density[this.cellIndex(i0, j1)]! += (1 - tx) * ty
      this.density[this.cellIndex(i1, j1)]! += tx * ty
    }

    // The first frame of a full body of water defines what "full" means, so
    // everything afterwards is measured against how it was poured in.
    if (this.restDensity === 0) {
      let sum = 0
      let fluidCells = 0
      for (let c = 0; c < this.cell.length; c++) {
        if (this.cell[c] !== FLUID) continue
        sum += this.density[c]!
        fluidCells++
      }
      if (fluidCells > 0) this.restDensity = sum / fluidCells
    }
  }

  /**
   * Make the velocity field divergence free — the heart of the whole thing.
   *
   * Water is incompressible: as much has to leave every cell as enters it. Each
   * sweep visits every water cell, measures how badly that is violated, and
   * spreads the correction over whichever of its four faces are not against
   * rock. Repeated, this is Gauss-Seidel on the pressure equation, and it is
   * what makes water pile up, push sideways and hold a wall up rather than
   * simply raining straight down.
   */
  private solveIncompressibility() {
    const height = this.height
    const u = this.u
    const v = this.v
    const solid = this.solid
    // A cell's index into `u` is its own index — both stride by the height —
    // and its index into `v` is offset by one row per column.
    for (let iter = 0; iter < this.pressureIterations; iter++) {
      for (let n = 0; n < this.fluidCellCount; n++) {
        const c = this.fluidCells[n]!

        // A face against rock cannot carry any of the correction.
        const left = solid[c - height] === 1 ? 0 : 1
        const right = solid[c + height] === 1 ? 0 : 1
        const below = solid[c - 1] === 1 ? 0 : 1
        const above = solid[c + 1] === 1 ? 0 : 1
        const open = left + right + below + above
        if (open === 0) continue

        const column = (c / height) | 0
        const vIndex = c + column
        let divergence = u[c + height]! - u[c]! + v[vIndex + 1]! - v[vIndex]!

        if (this.restDensity > 0 && this.driftCorrection > 0) {
          const crowding = this.density[c]! - this.restDensity
          // Crowded cells always push back. Under-filled ones pull back in, but
          // only where the cell is submerged — every neighbour is water or rock.
          //
          // Correcting crowding alone is one-way, and the water ratchets itself
          // apart: nothing else in the model ever pulls particles together
          // (pushParticlesApart only ever pushes), so any thin patch is
          // permanent while any dense one is pushed out. Measured over a settled
          // tank, that cost 15% of the packing and 15% of the volume in 3000
          // steps, and holes opened up through the middle of the water.
          //
          // The submerged test is what keeps this safe: a cell at a free
          // surface is *meant* to be short of particles, and pulling there would
          // suck the surface flat and dimple it.
          if (crowding > 0 || this.submerged[n] === 1) {
            divergence -= this.driftCorrection * crowding
          }
        }

        const correction = (-divergence / open) * this.overRelaxation
        u[c] = u[c]! - left * correction
        u[c + height] = u[c + height]! + right * correction
        v[vIndex] = v[vIndex]! - below * correction
        v[vIndex + 1] = v[vIndex + 1]! + above * correction
      }
    }
  }

  /**
   * Grid velocities back onto the particles.
   *
   * PIC takes the grid's velocity outright, FLIP takes only the change the grid
   * made and adds it to what the particle already had. PIC alone is smooth but
   * damps almost everything out; FLIP alone keeps every last bit of energy and
   * shakes itself to pieces. Mostly FLIP with a little PIC is the usual answer.
   */
  private transferFromGrid() {
    for (let i = 0; i < this.count; i++) {
      const x = this.px[i]!
      const y = this.py[i]!

      const picX = this.sampleU(this.u, x, y)
      const picY = this.sampleV(this.v, x, y)
      const deltaX = picX - this.sampleU(this.uPrev, x, y)
      const deltaY = picY - this.sampleV(this.vPrev, x, y)

      this.pvx[i] =
        this.flipRatio * (this.pvx[i]! + deltaX) + (1 - this.flipRatio) * picX
      this.pvy[i] =
        this.flipRatio * (this.pvy[i]! + deltaY) + (1 - this.flipRatio) * picY
    }
  }

  private sampleU(field: Float32Array, x: number, y: number): number {
    const gx = x
    const gy = y - 0.5
    const i0 = Math.min(Math.max(Math.floor(gx), 0), this.width)
    const j0 = Math.min(Math.max(Math.floor(gy), 0), this.height - 1)
    const i1 = Math.min(i0 + 1, this.width)
    const j1 = Math.min(j0 + 1, this.height - 1)
    const tx = Math.min(Math.max(gx - i0, 0), 1)
    const ty = Math.min(Math.max(gy - j0, 0), 1)
    return (
      field[i0 * this.height + j0]! * (1 - tx) * (1 - ty) +
      field[i1 * this.height + j0]! * tx * (1 - ty) +
      field[i0 * this.height + j1]! * (1 - tx) * ty +
      field[i1 * this.height + j1]! * tx * ty
    )
  }

  private sampleV(field: Float32Array, x: number, y: number): number {
    const gx = x - 0.5
    const gy = y
    const i0 = Math.min(Math.max(Math.floor(gx), 0), this.width - 1)
    const j0 = Math.min(Math.max(Math.floor(gy), 0), this.height)
    const i1 = Math.min(i0 + 1, this.width - 1)
    const j1 = Math.min(j0 + 1, this.height)
    const tx = Math.min(Math.max(gx - i0, 0), 1)
    const ty = Math.min(Math.max(gy - j0, 0), 1)
    const stride = this.height + 1
    return (
      field[i0 * stride + j0]! * (1 - tx) * (1 - ty) +
      field[i1 * stride + j0]! * tx * (1 - ty) +
      field[i0 * stride + j1]! * (1 - tx) * ty +
      field[i1 * stride + j1]! * tx * ty
    )
  }
}
