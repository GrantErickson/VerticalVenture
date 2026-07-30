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

/**
 * Open air above the world, in blocks. Simulated, never drawn.
 *
 * Water needs somewhere to keep its surface. A cell of water with solid
 * directly above it is under a lid, and the solver treats it as one twice over:
 * the face against it is pinned shut, so the pressure solve has no free surface
 * to work against, and a solid neighbour counts as covered, so as the cell
 * drains the drift correction reads it as submerged and pulls water back up
 * into it. Both are right for water under a rock ceiling, which really is held
 * up like water in a straw with a finger over the end.
 *
 * Neither is right for the top of the world, which is meant to be open sky. Sat
 * straight against the border, a row of water poured in along the top would
 * hang there and refuse to fall. One block of air is all it takes: the surface
 * has somewhere to be, and the water pours in the way it should.
 */
export const HEADROOM_BLOCKS = 1

/**
 * Hidden rows below the world, where the next row to scroll in is built.
 *
 * A scroll glides the world upwards, and whatever is drawn in the strip that
 * opens up along the bottom has to be *something*. With nothing down there it
 * was the bottom row of blocks smeared downwards, with no water in it, and the
 * real row appeared in its place with a jolt at the end of every glide.
 *
 * So the row is grown here first, a whole glide early, out of sight below the
 * world. It is terrain and water like any other row from the moment it is made
 * — the solver has it, water falls into it and settles in it — and the scroll
 * simply slides it up into view. Block row -1 is where it lives.
 */
export const STAGING_BLOCKS = 1

/** Cells across the simulation for a world this many blocks wide. */
export function gridWidthFor(blockWidth: number): number {
  return blockWidth * CELLS_PER_BLOCK + 2 * CELL_BORDER
}

/** Cells up the simulation: the staging row, the world, and the sky. */
export function gridHeightFor(blockHeight: number): number {
  return (
    (STAGING_BLOCKS + blockHeight + HEADROOM_BLOCKS) * CELLS_PER_BLOCK +
    2 * CELL_BORDER
  )
}

/** The leftmost cell that a column of blocks owns. */
export function firstCellOfColumn(blockX: number): number {
  return blockX * CELLS_PER_BLOCK + CELL_BORDER
}

/**
 * The lowest cell that a row of blocks owns.
 *
 * Row 0 is the bottom of the *drawn* world, so the staging rows below it are
 * at negative indices and the grid starts lower down than the world does — the
 * two axes do not line up, and using one of these for the other was worth a
 * whole afternoon. Passed the height of the world it gives the row just above
 * the top block, where the sky starts.
 */
export function firstCellOfRow(blockY: number): number {
  return (blockY + STAGING_BLOCKS) * CELLS_PER_BLOCK + CELL_BORDER
}

export interface FloorState {
  /**
   * The staging row holds real terrain rather than being the world's floor.
   * True while scrolling, when it is about to become the bottom row and water
   * has to be able to settle into it before it arrives.
   *
   * False otherwise, and then it is solid: the drawn bottom of the world has
   * to be a floor water rests on, not a lip it quietly pours over into a row
   * nobody can see.
   */
  staged?: boolean
  /**
   * The drain: the floor is a hole. Water is not deleted where it stands, it
   * falls out of the bottom of the world, which is both what the valve claims
   * to do and the only way to have it drain quickly *and* have the bottom row
   * full of water on the way down. Deleting a band instead — however thin —
   * leaves that band permanently dry, and a band thin enough not to show is
   * too thin to drain through, a solid floor being exactly what the pressure
   * solve uses to stop water falling.
   *
   * The caller must set {@link FlipFluid.drainFloor} to match: it is what
   * keeps the opened row clear of water for the pressure solve.
   */
  openFloor?: boolean
}

/**
 * Copy the rock into the simulation and lay the border back down around it.
 * Every block maps onto its own square of cells and nothing else, so the floor
 * the water rests on is exactly the floor that is drawn.
 *
 * `isSolidBlock` is asked about the staging rows too, at negative y.
 */
export function syncSolids(
  fluid: FlipFluid,
  blockWidth: number,
  blockHeight: number,
  isSolidBlock: (x: number, y: number) => boolean,
  { staged = false, openFloor = false }: FloorState = {},
) {
  for (let x = 0; x < blockWidth; x++) {
    for (let y = -STAGING_BLOCKS; y < blockHeight; y++) {
      // A staged row is terrain like any other, drain or no drain — water
      // leaves through the border below it, past whatever rock it happens to
      // have. Unstaged, it is not a row at all but the floor the world stands
      // on, and the drain is a hole in that floor.
      const solid = y >= 0 || staged ? isSolidBlock(x, y) : !openFloor
      const i0 = firstCellOfColumn(x)
      const j0 = firstCellOfRow(y)
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
  // The sky is always open, whatever the blocks below it are doing. The side
  // columns are left alone, so it is open upwards and not sideways.
  for (let i = CELL_BORDER; i < fluid.width - CELL_BORDER; i++)
    for (
      let j = firstCellOfRow(blockHeight);
      j < fluid.height - CELL_BORDER;
      j++
    )
      fluid.setSolid(i, j, false)

  // The floor comes back out from under the world, but only from under the
  // world: the side columns stay solid all the way down, so the grid keeps a
  // frame on three sides and the only way out is straight down.
  if (openFloor)
    for (let i = CELL_BORDER; i < fluid.width - CELL_BORDER; i++)
      for (let b = 0; b < CELL_BORDER; b++) fluid.setSolid(i, b, false)
}

/** Fill one block's worth of cells with particles at the rest packing. */
export function fillBlock(
  fluid: FlipFluid,
  blockX: number,
  blockY: number,
  particlesPerAxis: number,
) {
  const step = 1 / particlesPerAxis
  const i0 = firstCellOfColumn(blockX)
  const j0 = firstCellOfRow(blockY)
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
