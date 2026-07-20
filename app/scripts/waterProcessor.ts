import { Block } from './block'
import { BlockNature, BlockType } from './blockType'
import { World } from './world'

// `private` rather than `#private` — see the note in block.ts.
/**
 * Settles the world's water.
 *
 * The rule this replaces was per block: push half your water into the block
 * below, then average with your side neighbours. It never reached hydrostatic
 * rest — a draining pool turned into a haze of partly filled blocks stacked on
 * each other (67% with 99% sitting on top of it), and even at rest a flat
 * surface came out ragged (51/51/50/49/49/49).
 *
 * This works on connected bodies instead, two passes per tick:
 *
 *   1. Gravity. Each block empties as far as it can into the block below,
 *      lowest row first so nothing falls more than one block per tick.
 *   2. Level. Flood fill each connected body of water — plus the dry blocks
 *      immediately left and right of it, which is what lets it spread — and lay
 *      the body's volume back down from its lowest row up.
 *
 * Pass 2 is what buys the invariant: a body is full to the brim everywhere
 * below its surface, and only the one row at the surface is partial. It is also
 * what keeps colour consistent, since every block of a body then shares one
 * surface height and one maximum depth for the renderer to shade from.
 *
 * The body only reaches one block outwards per tick, so this still animates —
 * water creeps across a floor and down a shaft rather than snapping to its
 * equilibrium the instant it is poured.
 */
export class WaterProcessor {
  /** A body holding less than this (in percent-blocks) is too faint to see. */
  minimumVolume = 1

  private _world: World
  // Allocated once; the world never changes size.
  private seen: Uint8Array
  private supported: Uint8Array

  constructor(world: World) {
    this._world = world
    this.seen = new Uint8Array(world.width * world.height)
    this.supported = new Uint8Array(world.width * world.height)
  }

  process(): void {
    this.fall()
    this.level()
  }

  /** Pass 1: everything falls as far as it can, up to one block per tick. */
  private fall(): void {
    const world = this._world
    // Lowest row first. A block that has just been drained into is already
    // behind us, so no water moves more than one row in a single tick.
    for (let y = 1; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const block = world.getBlock(x, y)!
        if (block.blockType.nature !== BlockNature.liquid) continue
        if (block.percentFilled <= 0) continue
        const below = block.blockBelow!
        if (below.blockType.nature === BlockNature.solid) continue
        const space = 100 - below.percentFilled
        if (space <= 0) continue
        const amount = Math.min(block.percentFilled, space)
        this.setFill(below, below.percentFilled + amount, block.blockType)
        this.setFill(block, block.percentFilled - amount, block.blockType)
      }
    }
  }

  /**
   * Which blocks have something solid enough under them to push sideways
   * against: everything below them, down to rock or to the floor of the world,
   * is full. Water only spreads out when it cannot go down, so a parcel in
   * mid-air falls as a parcel instead of smearing across the sky.
   */
  private markSupported(): void {
    const world = this._world
    for (let x = 0; x < world.width; x++) {
      // The bottom of the world holds up the lowest row.
      let resting = true
      for (let y = 0; y < world.height; y++) {
        const block = world.getBlock(x, y)!
        if (block.blockType.nature === BlockNature.solid) {
          resting = true
          continue
        }
        this.supported[this.index(block)] = resting ? 1 : 0
        // This block can only hold up the next one if it is full itself.
        resting = resting && block.percentFilled >= 100
      }
    }
  }

  /** Pass 2: every connected body finds its level. */
  private level(): void {
    const world = this._world
    this.seen.fill(0)
    this.markSupported()
    for (let x = 0; x < world.width; x++) {
      for (let y = 0; y < world.height; y++) {
        const block = world.getBlock(x, y)!
        if (this.seen[this.index(block)]) continue
        if (!this.holdsWater(block)) continue
        if (this.supported[this.index(block)] === 0) continue
        this.settle(this.collect(block))
      }
    }
    this.markFalling()
  }

  /**
   * Water in free fall keeps whatever it is carrying, and stands in as its own
   * body for the renderer: a stream is as deep as it is thick. This runs after
   * the bodies so that a block a body has just spilled into — part of that
   * body, but with nothing under it — is described as the pour it is about to
   * become rather than as the pool it came from.
   */
  private markFalling(): void {
    const world = this._world
    for (let x = 0; x < world.width; x++) {
      for (let y = 0; y < world.height; y++) {
        const block = world.getBlock(x, y)!
        if (!this.holdsWater(block)) continue
        if (this.supported[this.index(block)] === 1) continue
        const thickness = block.percentFilled / 100
        block.waterSurface = block.y + thickness
        block.waterDepth = thickness
        block.isFlowing = true
      }
    }
  }

  /**
   * The blocks one body of water occupies: everything reachable through water,
   * plus the dry blocks to either side of it that it is free to spread into.
   */
  private collect(start: Block): Block[] {
    const cells: Block[] = []
    const stack: Block[] = [start]
    this.seen[this.index(start)] = 1

    while (stack.length) {
      const block = stack.pop()!
      cells.push(block)
      if (this.holdsWater(block)) {
        // Water carries the body in every direction, and out into the dry
        // blocks beside it — but only where it is resting on something, or a
        // falling parcel would smear sideways across open air.
        const spreads = this.supported[this.index(block)] === 1
        this.visit(block.blockBelow, stack, false)
        this.visit(block.blockAbove, stack, false)
        this.visit(block.blockLeft, stack, spreads)
        this.visit(block.blockRight, stack, spreads)
      } else {
        // A dry block carries the body on to the water immediately around it
        // but no further, so a body still only reaches one block into dry
        // ground per tick. Without this a column that has just drained away
        // underneath a pool would cut the pool into two halves that each keep
        // their own level, and the water in the drain below it would be left
        // out of the body it plainly belongs to.
        this.visit(block.blockLeft, stack, false)
        this.visit(block.blockRight, stack, false)
        this.visit(block.blockBelow, stack, false)
      }
    }
    return cells
  }

  private visit(block: Block | null, stack: Block[], allowDry: boolean): void {
    if (!block || block.blockType.nature === BlockNature.solid) return
    const index = this.index(block)
    if (this.seen[index]) return
    const holdsWater = this.holdsWater(block)
    // Water already on its way down belongs to no body. It is connected to the
    // pool it is pouring out of, so levelling the two together would lay that
    // pool into the shaft from the bottom up — the pool empties down the hole
    // in a step or two — and would compact a steady trickle into slugs with
    // gaps between them. Gravity alone owns it until it lands on something.
    if (holdsWater && this.supported[index] === 0) return
    if (!holdsWater && !allowDry) return
    this.seen[index] = 1
    stack.push(block)
  }

  private holdsWater(block: Block): boolean {
    return (
      block.blockType.nature === BlockNature.liquid && block.percentFilled > 0
    )
  }

  /** Lay a body's volume back down from its lowest row up. */
  private settle(cells: Block[]): void {
    const type = cells[0]!.blockType
    let volume = 0
    for (const cell of cells) volume += cell.percentFilled

    if (volume < this.minimumVolume) {
      // What is left would render as an invisible film that never drains away.
      for (const cell of cells) this.setFill(cell, 0, type)
      return
    }

    const rows = new Map<number, Block[]>()
    for (const cell of cells) {
      const row = rows.get(cell.y)
      if (row) row.push(cell)
      else rows.set(cell.y, [cell])
    }
    const heights = [...rows.keys()].sort((a, b) => a - b)

    const floor = heights[0]!
    let surface = floor
    let remaining = volume
    for (const height of heights) {
      const row = rows.get(height)!
      // Split evenly across the row, so a surface comes out flat rather than
      // stepped and neighbouring blocks always agree.
      const each = Math.min(100, Math.max(remaining, 0) / row.length)
      for (const cell of row) this.setFill(cell, each, type)
      remaining -= each * row.length
      if (each > 0) surface = height + each / 100
    }

    const depth = surface - floor
    for (const cell of cells) {
      if (cell.percentFilled <= 0) continue
      cell.waterSurface = surface
      cell.waterDepth = depth
      // Pouring, rather than merely having a gap under it. Asking only about
      // the block below marks the bottom of a falling slug and nothing else,
      // since everything above it is resting on full water — so a three block
      // pour would draw as one stream with two solid blocks stacked on it.
      cell.isFlowing = this.supported[this.index(cell)] === 0
    }
  }

  /**
   * Write a fill level, turning the block into water or back into air as
   * needed. Order matters: assigning a block type runs BlockType.changeType,
   * and the liquid one fills an empty block to the brim, so the fill has to be
   * written after the type rather than before it.
   */
  private setFill(block: Block, amount: number, type: BlockType): void {
    if (amount <= 0) {
      if (block.blockType.nature === BlockNature.liquid)
        block.blockType = this._world.getBlockType('empty')
      block.percentFilled = 0
      block.waterSurface = 0
      block.waterDepth = 0
      return
    }
    if (block.blockType !== type) block.blockType = type
    block.percentFilled = amount
  }

  private index(block: Block): number {
    return block.y * this._world.width + block.x
  }
}
