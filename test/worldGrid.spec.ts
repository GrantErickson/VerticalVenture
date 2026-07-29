import { describe, expect, test } from 'vitest'
import { FlipFluid } from '@/scripts/fluid/flipFluid'
import {
  CELLS_PER_BLOCK,
  CELL_BORDER,
  cellsForBlocks,
  drainLine,
  fillBlock,
  firstCellOf,
  syncSolids,
} from '@/scripts/fluid/worldGrid'

/** Every particle fineness the settings menu offers: n packs n² into a cell. */
const PARTICLES_PER_AXIS = [1, 2, 3, 4]

const BLOCKS_WIDE = 8
const BLOCKS_TALL = 6

/** A world of open blocks unless `rock` says otherwise. */
function makeWorld(rock: (x: number, y: number) => boolean = () => false) {
  const fluid = new FlipFluid({
    width: cellsForBlocks(BLOCKS_WIDE),
    height: cellsForBlocks(BLOCKS_TALL),
    maxParticles: 20000,
  })
  syncSolids(fluid, BLOCKS_WIDE, BLOCKS_TALL, rock)
  return fluid
}

describe('world grid', () => {
  test('every block gets its own square of cells and nothing else', () => {
    const fluid = makeWorld()
    expect(fluid.width).toEqual(BLOCKS_WIDE * CELLS_PER_BLOCK + 2 * CELL_BORDER)
    expect(fluid.height).toEqual(
      BLOCKS_TALL * CELLS_PER_BLOCK + 2 * CELL_BORDER,
    )

    // Blocks tile the interior exactly: the first cell of one block is the one
    // after the last cell of the block below it.
    expect(firstCellOf(0)).toEqual(CELL_BORDER)
    expect(firstCellOf(BLOCKS_TALL - 1) + CELLS_PER_BLOCK).toEqual(
      fluid.height - CELL_BORDER,
    )
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

  test('an open drain takes water at the floor, not a row above it', () => {
    for (const perAxis of PARTICLES_PER_AXIS) {
      const line = drainLine(1 / perAxis)
      // Above the floor, or the last of the water never leaves...
      expect(line).toBeGreaterThan(firstCellOf(0))
      // ...and inside the bottom row of blocks, or that row is a dead band
      // that water is deleted from before it is ever drawn there. This was
      // the bug: the line sat at firstCellOf(1) + 0.5, a whole block row up,
      // so opening the drain emptied the bottom row rather than draining it.
      expect(line).toBeLessThan(firstCellOf(1))
    }
  })

  test('a settled body of water reaches down past the drain line', () => {
    // The line is only useful if water actually gets to it. Pour a column in
    // and let it settle onto the floor: the bottom of it has to end up below
    // the line, or an open drain would sit there doing nothing.
    const perAxis = 4
    const fluid = makeWorld()
    for (let y = 0; y < 3; y++) fillBlock(fluid, 3, y, perAxis)

    for (let i = 0; i < 300; i++) fluid.step(1 / 60)

    let lowest = Infinity
    for (let i = 0; i < fluid.count; i++)
      lowest = Math.min(lowest, fluid.py[i]!)
    expect(lowest).toBeLessThan(drainLine(1 / perAxis))
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
