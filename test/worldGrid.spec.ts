import { describe, expect, test } from 'vitest'
import { FlipFluid } from '@/scripts/fluid/flipFluid'
import {
  CELLS_PER_BLOCK,
  CELL_BORDER,
  HEADROOM_BLOCKS,
  fillBlock,
  firstCellOf,
  gridHeightFor,
  gridWidthFor,
  syncSolids,
} from '@/scripts/fluid/worldGrid'

const BLOCKS_WIDE = 8
const BLOCKS_TALL = 6

/** A world of open blocks unless `rock` says otherwise. */
function makeWorld(rock: (x: number, y: number) => boolean = () => false) {
  const fluid = new FlipFluid({
    width: gridWidthFor(BLOCKS_WIDE),
    height: gridHeightFor(BLOCKS_TALL),
    maxParticles: 20000,
  })
  syncSolids(fluid, BLOCKS_WIDE, BLOCKS_TALL, rock)
  return fluid
}

/** The highest any particle has got to, in cells. */
function highest(fluid: FlipFluid) {
  let top = 0
  for (let i = 0; i < fluid.count; i++) top = Math.max(top, fluid.py[i]!)
  return top
}

describe('world grid', () => {
  test('every block gets its own square of cells and nothing else', () => {
    const fluid = makeWorld()
    expect(fluid.width).toEqual(BLOCKS_WIDE * CELLS_PER_BLOCK + 2 * CELL_BORDER)

    // Blocks tile the interior exactly: the first cell of one block is the one
    // after the last cell of the block below it.
    expect(firstCellOf(0)).toEqual(CELL_BORDER)
    // Above the top block is sky, and above that the border.
    expect(fluid.height).toEqual(
      firstCellOf(BLOCKS_TALL) +
        HEADROOM_BLOCKS * CELLS_PER_BLOCK +
        CELL_BORDER,
    )
  })

  test('the sky above the world is open air', () => {
    // Rock everywhere it is allowed to put rock; the sky is not one of those
    // places, whatever the blocks below it say.
    const fluid = makeWorld(() => true)
    for (let i = CELL_BORDER; i < fluid.width - CELL_BORDER; i++) {
      for (
        let j = firstCellOf(BLOCKS_TALL);
        j < fluid.height - CELL_BORDER;
        j++
      )
        expect(fluid.isSolid(i, j)).toBe(false)
      // The lid is still up there, one block higher than it used to be.
      expect(fluid.isSolid(i, fluid.height - 1)).toBe(true)
    }
    // Open upwards, not sideways.
    for (let j = 0; j < fluid.height; j++) {
      expect(fluid.isSolid(0, j)).toBe(true)
      expect(fluid.isSolid(fluid.width - 1, j)).toBe(true)
    }
  })

  test('water poured in along the top falls instead of hanging from the sky', () => {
    // The bug this guards: sat straight against a solid border, the top row of
    // water is under a lid. Its top face is pinned shut so the pressure solve
    // has no free surface there, and a solid neighbour counts as covered, so
    // the drift correction reads the draining cell as submerged and pulls the
    // water back up into it. The row hung there and would not fall.
    const fluid = makeWorld()
    for (let x = 0; x < BLOCKS_WIDE; x++)
      fillBlock(fluid, x, BLOCKS_TALL - 1, 4)
    const poured = fluid.count
    expect(highest(fluid)).toBeGreaterThan(firstCellOf(BLOCKS_TALL - 1))

    // One second is many times over what it takes to fall this far.
    for (let i = 0; i < 60; i++) fluid.step(1 / 60)

    expect(fluid.count).toEqual(poured)
    // All of it poured in as one block row's worth per column, so once it has
    // landed it stands about a block deep and nothing is left up top.
    expect(highest(fluid)).toBeLessThan(firstCellOf(2))
  })

  test('the solid border sits outside the blocks, not inside them', () => {
    const fluid = makeWorld()

    // Every cell of every block of an empty world is open — including the
    // bottom row, which used to have its lower half taken by the border and so
    // could only ever hold half a block of water, resting on a ledge halfway up
    // a block that nothing was drawing.
    for (let x = 0; x < BLOCKS_WIDE; x++)
      for (let y = 0; y < BLOCKS_TALL; y++)
        for (let ci = 0; ci < CELLS_PER_BLOCK; ci++)
          for (let cj = 0; cj < CELLS_PER_BLOCK; cj++)
            expect(
              fluid.isSolid(firstCellOf(x) + ci, firstCellOf(y) + cj),
            ).toBe(false)

    // ...and the ring around them is solid, which is what lets the pressure
    // solve reach a water cell's four neighbours without a bounds check.
    for (let i = 0; i < fluid.width; i++) {
      expect(fluid.isSolid(i, 0)).toBe(true)
      expect(fluid.isSolid(i, fluid.height - 1)).toBe(true)
    }
    for (let j = 0; j < fluid.height; j++) {
      expect(fluid.isSolid(0, j)).toBe(true)
      expect(fluid.isSolid(fluid.width - 1, j)).toBe(true)
    }
  })

  test('rock lands on the right cells', () => {
    // One block of rock, in the bottom left corner, where an off-by-one against
    // the border would be easiest to miss.
    const fluid = makeWorld((x, y) => x === 0 && y === 0)
    expect(fluid.isSolid(firstCellOf(0), firstCellOf(0))).toBe(true)
    expect(fluid.isSolid(firstCellOf(1), firstCellOf(0))).toBe(false)
    expect(fluid.isSolid(firstCellOf(0), firstCellOf(1))).toBe(false)
  })

  test('a block of water is worth the same wherever it is poured', () => {
    const fluid = makeWorld()
    const perAxis = 4
    const full = CELLS_PER_BLOCK * CELLS_PER_BLOCK * perAxis * perAxis

    // The bottom row is the one that mattered: the row a scroll brings in is
    // poured there, and it used to arrive half empty.
    fillBlock(fluid, 3, 0, perAxis)
    expect(fluid.count).toEqual(full)

    fillBlock(fluid, 3, BLOCKS_TALL - 1, perAxis)
    fillBlock(fluid, 0, 2, perAxis)
    fillBlock(fluid, BLOCKS_WIDE - 1, 2, perAxis)
    expect(fluid.count).toEqual(full * 4)
  })

  test('an open floor opens under the world and nowhere else', () => {
    const fluid = makeWorld()
    syncSolids(fluid, BLOCKS_WIDE, BLOCKS_TALL, () => false, true)

    // Straight down is the only way out: the floor under the blocks is open...
    for (let i = CELL_BORDER; i < fluid.width - CELL_BORDER; i++)
      expect(fluid.isSolid(i, 0)).toBe(false)
    // ...and the rest of the frame is untouched, corners included, so no cell
    // the pressure solve can reach sits on the edge of the grid.
    expect(fluid.isSolid(0, 0)).toBe(true)
    expect(fluid.isSolid(fluid.width - 1, 0)).toBe(true)
    for (let j = 0; j < fluid.height; j++) {
      expect(fluid.isSolid(0, j)).toBe(true)
      expect(fluid.isSolid(fluid.width - 1, j)).toBe(true)
    }
    for (let i = 0; i < fluid.width; i++)
      expect(fluid.isSolid(i, fluid.height - 1)).toBe(true)

    // ...and it closes again.
    syncSolids(fluid, BLOCKS_WIDE, BLOCKS_TALL, () => false, false)
    for (let i = 0; i < fluid.width; i++) expect(fluid.isSolid(i, 0)).toBe(true)
  })

  test('an open floor empties the world, and quickly', () => {
    const fluid = makeWorld()
    for (let x = 0; x < BLOCKS_WIDE; x++)
      for (let y = 0; y < 3; y++) fillBlock(fluid, x, y, 4)
    const poured = fluid.count
    expect(poured).toBeGreaterThan(1000)

    // Shut, the floor holds every drop.
    for (let i = 0; i < 120; i++) fluid.step(1 / 60)
    expect(fluid.count).toEqual(poured)

    // Open, it goes — under its own weight, rather than being deleted where it
    // stands. Two seconds is the pace this is held to: draining by nibbling a
    // thin band off the bottom took the better part of a minute, and widening
    // that band is what left the bottom row dry.
    syncSolids(fluid, BLOCKS_WIDE, BLOCKS_TALL, () => false, true)
    fluid.drainFloor = true
    for (let i = 0; i < 120; i++) fluid.step(1 / 60)
    expect(fluid.count).toEqual(0)
  })

  test('water crosses the bottom row on its way out of an open floor', () => {
    const fluid = makeWorld()
    for (let x = 0; x < BLOCKS_WIDE; x++)
      for (let y = 2; y < 5; y++) fillBlock(fluid, x, y, 4)
    syncSolids(fluid, BLOCKS_WIDE, BLOCKS_TALL, () => false, true)
    fluid.drainFloor = true

    // The water starts two rows up, so it has to cross the bottom row to
    // leave, and it has to be *in* that row while it does. The old drain
    // deleted it a row early, so the bottom row was never water at all.
    let mostInBottomRow = 0
    for (let i = 0; i < 90; i++) {
      fluid.step(1 / 60)
      let here = 0
      for (let p = 0; p < fluid.count; p++)
        if (fluid.py[p]! < firstCellOf(1)) here++
      mostInBottomRow = Math.max(mostInBottomRow, here)
    }
    expect(mostInBottomRow).toBeGreaterThan(100)
  })

  test('water poured into the bottom row stays in the bottom row', () => {
    const fluid = makeWorld()
    for (let x = 0; x < BLOCKS_WIDE; x++) fillBlock(fluid, x, 0, 4)
    const poured = fluid.count

    for (let i = 0; i < 300; i++) fluid.step(1 / 60)

    // None of it leaks away, and it settles filling the block row it was poured
    // into rather than half of it.
    expect(fluid.count).toEqual(poured)
    let top = 0
    for (let i = 0; i < fluid.count; i++) top = Math.max(top, fluid.py[i]!)
    expect(top).toBeGreaterThan(firstCellOf(0) + CELLS_PER_BLOCK - 0.5)
    expect(top).toBeLessThan(firstCellOf(1) + CELLS_PER_BLOCK)
  })
})
