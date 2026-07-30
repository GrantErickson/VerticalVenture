import { describe, expect, test } from 'vitest'
import { FlipFluid } from '@/scripts/fluid/flipFluid'
import {
  CELLS_PER_BLOCK,
  CELL_BORDER,
  HEADROOM_BLOCKS,
  STAGING_BLOCKS,
  fillBlock,
  firstCellOfColumn,
  firstCellOfRow,
  gridHeightFor,
  gridWidthFor,
  syncSolids,
  type FloorState,
} from '@/scripts/fluid/worldGrid'

const BLOCKS_WIDE = 8
const BLOCKS_TALL = 6

/** A world of open blocks unless `rock` says otherwise. */
function makeWorld(
  rock: (x: number, y: number) => boolean = () => false,
  floor: FloorState = {},
) {
  const fluid = new FlipFluid({
    width: gridWidthFor(BLOCKS_WIDE),
    height: gridHeightFor(BLOCKS_TALL),
    maxParticles: 20000,
  })
  syncSolids(fluid, BLOCKS_WIDE, BLOCKS_TALL, rock, floor)
  return fluid
}

/** The highest, and lowest, any particle has got to, in cells. */
function highest(fluid: FlipFluid) {
  let top = 0
  for (let i = 0; i < fluid.count; i++) top = Math.max(top, fluid.py[i]!)
  return top
}
function lowest(fluid: FlipFluid) {
  let bottom = Infinity
  for (let i = 0; i < fluid.count; i++) bottom = Math.min(bottom, fluid.py[i]!)
  return bottom
}

describe('world grid', () => {
  test('the grid is the world, plus somewhere to stage, sky and a border', () => {
    const fluid = makeWorld()
    expect(fluid.width).toEqual(BLOCKS_WIDE * CELLS_PER_BLOCK + 2 * CELL_BORDER)
    expect(fluid.height).toEqual(
      firstCellOfRow(BLOCKS_TALL) +
        HEADROOM_BLOCKS * CELLS_PER_BLOCK +
        CELL_BORDER,
    )

    // Block 0 is the bottom of the *drawn* world. Below it are the staging
    // rows and then the border; above the top block is sky.
    expect(firstCellOfRow(0)).toEqual(
      STAGING_BLOCKS * CELLS_PER_BLOCK + CELL_BORDER,
    )
    expect(firstCellOfRow(-STAGING_BLOCKS)).toEqual(CELL_BORDER)
    // Blocks tile exactly: one starts where the one below it ends.
    expect(firstCellOfRow(1)).toEqual(firstCellOfRow(0) + CELLS_PER_BLOCK)
  })

  test('the border sits outside the blocks, not inside them', () => {
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
              fluid.isSolid(firstCellOfColumn(x) + ci, firstCellOfRow(y) + cj),
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
    // the border or the staging row would be easiest to miss.
    const fluid = makeWorld((x, y) => x === 0 && y === 0)
    expect(fluid.isSolid(firstCellOfColumn(0), firstCellOfRow(0))).toBe(true)
    expect(fluid.isSolid(firstCellOfColumn(1), firstCellOfRow(0))).toBe(false)
    expect(fluid.isSolid(firstCellOfColumn(0), firstCellOfRow(1))).toBe(false)
  })

  test('the sky above the world is open air', () => {
    // Rock everywhere it is allowed to put rock; the sky is not one of those
    // places, whatever the blocks below it say.
    const fluid = makeWorld(() => true)
    for (let i = CELL_BORDER; i < fluid.width - CELL_BORDER; i++) {
      for (
        let j = firstCellOfRow(BLOCKS_TALL);
        j < fluid.height - CELL_BORDER;
        j++
      )
        expect(fluid.isSolid(i, j)).toBe(false)
      expect(fluid.isSolid(i, fluid.height - 1)).toBe(true)
    }
    // Open upwards, not sideways.
    for (let j = 0; j < fluid.height; j++) {
      expect(fluid.isSolid(0, j)).toBe(true)
      expect(fluid.isSolid(fluid.width - 1, j)).toBe(true)
    }
  })

  test('water poured in along the top falls instead of hanging from the sky', () => {
    // Sat straight against a solid border, the top row of water is under a lid:
    // its top face is pinned shut so the pressure solve has no free surface
    // there, and a solid neighbour counts as covered, so the drift correction
    // reads the draining cell as submerged and pulls the water back up into it.
    // The row hung there and would not fall.
    const fluid = makeWorld()
    for (let x = 0; x < BLOCKS_WIDE; x++)
      fillBlock(fluid, x, BLOCKS_TALL - 1, 4)
    const poured = fluid.count
    expect(highest(fluid)).toBeGreaterThan(firstCellOfRow(BLOCKS_TALL - 1))

    for (let i = 0; i < 60; i++) fluid.step(1 / 60)

    expect(fluid.count).toEqual(poured)
    expect(highest(fluid)).toBeLessThan(firstCellOfRow(2))
  })

  test('an unstaged world stands on a floor, not over a hole', () => {
    // Nothing is scrolling, so the row below the world is not a row at all —
    // it is the floor the drawn world rests on. Water reaching the bottom has
    // to stay there and be seen, not pour quietly into a row nobody can see.
    const fluid = makeWorld()
    for (let x = 0; x < BLOCKS_WIDE; x++)
      for (let cj = 0; cj < CELLS_PER_BLOCK; cj++)
        expect(
          fluid.isSolid(firstCellOfColumn(x), firstCellOfRow(-1) + cj),
        ).toBe(true)

    for (let x = 0; x < BLOCKS_WIDE; x++) fillBlock(fluid, x, 0, 4)
    const poured = fluid.count
    for (let i = 0; i < 180; i++) fluid.step(1 / 60)

    expect(fluid.count).toEqual(poured)
    expect(lowest(fluid)).toBeGreaterThanOrEqual(firstCellOfRow(0))
  })

  test('a staged row is terrain, and water settles into it before it arrives', () => {
    // Scrolling: the row below the world is the one about to slide into view,
    // and it has to behave like a row for the whole glide it spends hidden —
    // that is the point of building it early.
    const staging = [true, false, true, false, false, true, false, true]
    const fluid = makeWorld((x, y) => (y < 0 ? staging[x]! : false), {
      staged: true,
    })
    for (let x = 0; x < BLOCKS_WIDE; x++)
      expect(fluid.isSolid(firstCellOfColumn(x), firstCellOfRow(-1))).toBe(
        staging[x],
      )

    // Water poured into the open blocks of it stays in it and settles.
    for (let x = 0; x < BLOCKS_WIDE; x++)
      if (!staging[x]) fillBlock(fluid, x, -1, 4)
    const poured = fluid.count
    expect(poured).toBeGreaterThan(0)

    for (let i = 0; i < 120; i++) fluid.step(1 / 60)

    expect(fluid.count).toEqual(poured)
    expect(lowest(fluid)).toBeGreaterThan(firstCellOfRow(-STAGING_BLOCKS))
  })

  test('an open floor opens below the world and nowhere else', () => {
    const fluid = makeWorld(() => false, { openFloor: true })

    // Straight down is the only way out: the staging row and the border under
    // it are both open...
    for (let i = CELL_BORDER; i < fluid.width - CELL_BORDER; i++)
      for (let j = 0; j < firstCellOfRow(0); j++)
        expect(fluid.isSolid(i, j)).toBe(false)
    // ...and the side columns are untouched, corners included, so no cell the
    // pressure solve can reach sits on the edge of the grid.
    for (let j = 0; j < fluid.height; j++) {
      expect(fluid.isSolid(0, j)).toBe(true)
      expect(fluid.isSolid(fluid.width - 1, j)).toBe(true)
    }
    for (let i = 0; i < fluid.width; i++)
      expect(fluid.isSolid(i, fluid.height - 1)).toBe(true)
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
    syncSolids(fluid, BLOCKS_WIDE, BLOCKS_TALL, () => false, {
      openFloor: true,
    })
    fluid.drainFloor = true
    for (let i = 0; i < 120; i++) fluid.step(1 / 60)
    expect(fluid.count).toEqual(0)
  })

  test('an open floor drains a scrolling world too', () => {
    // The valve and the scroll are independent: a staged row below the world
    // is terrain, and water leaves past it through the border underneath.
    const fluid = makeWorld(() => false, { staged: true, openFloor: true })
    for (let x = 0; x < BLOCKS_WIDE; x++)
      for (let y = 0; y < 3; y++) fillBlock(fluid, x, y, 4)
    expect(fluid.count).toBeGreaterThan(1000)
    fluid.drainFloor = true

    for (let i = 0; i < 180; i++) fluid.step(1 / 60)

    expect(fluid.count).toEqual(0)
  })

  test('water crosses the bottom row on its way out of an open floor', () => {
    const fluid = makeWorld(() => false, { openFloor: true })
    for (let x = 0; x < BLOCKS_WIDE; x++)
      for (let y = 2; y < 5; y++) fillBlock(fluid, x, y, 4)
    fluid.drainFloor = true

    // The water starts two rows up, so it has to cross the bottom row to
    // leave, and it has to be *in* that row while it does. The old drain
    // deleted it a row early, so the bottom row was never water at all.
    let mostInBottomRow = 0
    for (let i = 0; i < 90; i++) {
      fluid.step(1 / 60)
      let here = 0
      for (let p = 0; p < fluid.count; p++)
        if (
          fluid.py[p]! >= firstCellOfRow(0) &&
          fluid.py[p]! < firstCellOfRow(1)
        )
          here++
      mostInBottomRow = Math.max(mostInBottomRow, here)
    }
    expect(mostInBottomRow).toBeGreaterThan(100)
  })

  test('a block of water is worth the same wherever it is poured', () => {
    const fluid = makeWorld()
    const perAxis = 4
    const full = CELLS_PER_BLOCK * CELLS_PER_BLOCK * perAxis * perAxis

    fillBlock(fluid, 3, 0, perAxis)
    expect(fluid.count).toEqual(full)

    fillBlock(fluid, 3, BLOCKS_TALL - 1, perAxis)
    fillBlock(fluid, 0, 2, perAxis)
    fillBlock(fluid, BLOCKS_WIDE - 1, 2, perAxis)
    expect(fluid.count).toEqual(full * 4)
  })

  test('water poured into the bottom row stays in the bottom row', () => {
    const fluid = makeWorld()
    for (let x = 0; x < BLOCKS_WIDE; x++) fillBlock(fluid, x, 0, 4)
    const poured = fluid.count

    for (let i = 0; i < 300; i++) fluid.step(1 / 60)

    // None of it leaks away, and it settles filling the block row it was poured
    // into rather than half of it.
    expect(fluid.count).toEqual(poured)
    expect(highest(fluid)).toBeGreaterThan(
      firstCellOfRow(0) + CELLS_PER_BLOCK - 0.5,
    )
    expect(highest(fluid)).toBeLessThan(firstCellOfRow(1) + CELLS_PER_BLOCK)
  })
})
