import type { FlipFluid } from './flipFluid'

/**
 * Where the block world and the fluid simulation meet.
 *
 * The solver knows nothing about blocks — it works in cells — and the block
 * world knows nothing about the solver. This is the whole of the mapping
 * between them, kept out of the composable so it can be tested on its own.
 */

/**
 * How many fluid cells a block is worth along each axis. Three would give finer
 * flow but costs more than twice as much per frame — most of the visible detail
 * comes from where the particles are, not from how fine the grid under them is.
 */
export const CELLS_PER_BLOCK = 2

/**
 * A ring of solid cells around the simulation, laid *outside* the block world.
 *
 * The pressure solve reaches a cell's four neighbours by plain index
 * arithmetic, so no cell that can hold water may sit on the edge of the grid;
 * this ring is what guarantees that. It used to be carved out of the outermost
 * blocks instead, on the grounds that half a block of rim is invisible against
 * the terrain. It was invisible, but it was not harmless: the bottom row of the
 * world could then only ever hold half its water, and it held it on a ledge
 * halfway up a block that nothing was drawing. Water arriving on the floor
 * seemed to drain away into a row that plainly had room for it.
 */
export const CELL_BORDER = 1

/** Cells needed along an axis to hold a world this many blocks across. */
export function cellsForBlocks(blocks: number): number {
  return blocks * CELLS_PER_BLOCK + 2 * CELL_BORDER
}

/** The lowest — or leftmost — cell that a block owns. */
export function firstCellOf(block: number): number {
  return block * CELLS_PER_BLOCK + CELL_BORDER
}

/**
 * The line an open drain takes water away at, in cells.
 *
 * The floor of the world plus one particle spacing, which is where the bottom
 * layer of a body of water comes to rest. Tighter than that and the last of the
 * water sits on the drain forever; looser, and it is drawn from water that has
 * not reached the floor yet — which turns the bottom row into a dead band that
 * water crosses without ever being drawn in it. It must stay inside the bottom
 * row of blocks, whatever the particles are set to.
 */
export function drainLine(spacing: number): number {
  return firstCellOf(0) + spacing
}

/**
 * Copy the rock into the simulation and lay the border back down around it.
 * Every block maps onto its own square of cells and nothing else, so the floor
 * the water rests on is exactly the floor that is drawn.
 */
export function syncSolids(
  fluid: FlipFluid,
  blockWidth: number,
  blockHeight: number,
  isSolidBlock: (x: number, y: number) => boolean,
) {
  for (let x = 0; x < blockWidth; x++) {
    for (let y = 0; y < blockHeight; y++) {
      const solid = isSolidBlock(x, y)
      const i0 = firstCellOf(x)
      const j0 = firstCellOf(y)
      for (let ci = 0; ci < CELLS_PER_BLOCK; ci++)
        for (let cj = 0; cj < CELLS_PER_BLOCK; cj++)
          fluid.setSolid(i0 + ci, j0 + cj, solid)
    }
  }
  for (let b = 0; b < CELL_BORDER; b++) {
    for (let i = 0; i < fluid.width; i++) {
      fluid.setSolid(i, b, true)
      fluid.setSolid(i, fluid.height - 1 - b, true)
    }
    for (let j = 0; j < fluid.height; j++) {
      fluid.setSolid(b, j, true)
      fluid.setSolid(fluid.width - 1 - b, j, true)
    }
  }
}

/** Fill one block's worth of cells with particles at the rest packing. */
export function fillBlock(
  fluid: FlipFluid,
  blockX: number,
  blockY: number,
  particlesPerAxis: number,
) {
  const step = 1 / particlesPerAxis
  const i0 = firstCellOf(blockX)
  const j0 = firstCellOf(blockY)
  for (let ci = 0; ci < CELLS_PER_BLOCK; ci++) {
    for (let cj = 0; cj < CELLS_PER_BLOCK; cj++) {
      const cellX = i0 + ci
      const cellY = j0 + cj
      if (fluid.isSolid(cellX, cellY)) continue
      for (let px = 0; px < particlesPerAxis; px++)
        for (let py = 0; py < particlesPerAxis; py++)
          fluid.addParticle(
            cellX + (px + 0.5) * step,
            cellY + (py + 0.5) * step,
          )
    }
  }
}
