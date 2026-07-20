import { describe, expect, test } from 'vitest'
import { World } from '@/scripts/world'
import { BlockNature } from '@/scripts/blockType'

/** A walled box with a rock floor, so water has somewhere to pool. */
function makeBasin(width: number, height: number) {
  const world = new World(width, height)
  for (let x = 0; x < width; x++)
    world.getBlock(x, 0)!.blockType = world.getBlockType('rock')
  for (let y = 0; y < height; y++) {
    world.getBlock(0, y)!.blockType = world.getBlockType('rock')
    world.getBlock(width - 1, y)!.blockType = world.getBlockType('rock')
  }
  return world
}

function addWater(world: World, x: number, y: number, amount = 100) {
  const block = world.getBlock(x, y)!
  block.blockType = world.getBlockType('water')
  block.percentFilled = amount
  return block
}

/** Every block that has water resting on top of it must be full. */
function submergedBlocksAreFull(world: World) {
  for (let x = 0; x < world.width; x++) {
    for (let y = 0; y < world.height - 1; y++) {
      const block = world.getBlock(x, y)!
      const above = world.getBlock(x, y + 1)!
      if (above.blockType.nature !== BlockNature.liquid) continue
      if (above.percentFilled <= 0) continue
      if (block.blockType.nature === BlockNature.solid) continue
      // A pour is exempt: it is not submerged, it is passing through, and
      // every block of it carries its own thickness on the way down.
      if (block.isFlowing) continue
      // Loose enough to ignore the last bit of floating point in a split row.
      if (block.percentFilled < 100 - 1e-6)
        return `${x},${y} is ${block.percentFilled}`
    }
  }
  return null
}

function totalWater(world: World) {
  let total = 0
  for (let x = 0; x < world.width; x++)
    for (let y = 0; y < world.height; y++)
      total +=
        world.getBlock(x, y)!.percentFilled *
        (world.getBlock(x, y)!.blockType.nature === BlockNature.liquid ? 1 : 0)
  return total
}

describe('liquid', () => {
  test('falls one block per tick', () => {
    const world = makeBasin(5, 10)
    addWater(world, 2, 8)

    world.processWater()
    expect(world.getBlock(2, 8)!.percentFilled).toEqual(0)
    expect(world.getBlock(2, 7)!.percentFilled).toEqual(100)

    world.processWater()
    expect(world.getBlock(2, 7)!.percentFilled).toEqual(0)
    expect(world.getBlock(2, 6)!.percentFilled).toEqual(100)

    // ...and a block it has left behind is air again, not 0% water.
    expect(world.getBlock(2, 7)!.blockType.name).toEqual('empty')
  })

  test('a body settles to a flat surface with nothing partial below it', () => {
    const world = makeBasin(6, 10)
    // 250 percent-blocks dropped into a single column of a 4 wide basin.
    for (const y of [5, 6]) addWater(world, 2, y)
    addWater(world, 2, 7, 50)

    for (let i = 0; i < 40; i++) world.processWater()

    expect(submergedBlocksAreFull(world)).toBeNull()
    expect(totalWater(world)).toBeCloseTo(250, 6)
    // 250 spread over the 4 open columns is a flat 62.5% in the bottom row.
    for (let x = 1; x <= 4; x++) {
      expect(world.getBlock(x, 1)!.percentFilled).toBeCloseTo(62.5, 6)
      expect(world.getBlock(x, 2)!.percentFilled).toEqual(0)
    }
  })

  test('every block of a body shares one surface and one depth', () => {
    const world = makeBasin(6, 10)
    // A stepped floor, so the body is 1 block deep on the left and 3 on the
    // right. This is the case that used to come out mismatched: the columns
    // hold different amounts of water but must still be coloured alike.
    for (let x = 1; x <= 2; x++)
      for (const y of [1, 2])
        world.getBlock(x, y)!.blockType = world.getBlockType('rock')
    for (let x = 1; x <= 4; x++) for (const y of [3, 4]) addWater(world, x, y)

    for (let i = 0; i < 40; i++) world.processWater()

    const cells = []
    for (let x = 1; x <= 4; x++)
      for (let y = 1; y < 10; y++) {
        const block = world.getBlock(x, y)!
        if (
          block.blockType.nature === BlockNature.liquid &&
          block.percentFilled > 0
        )
          cells.push(block)
      }
    expect(cells.length).toBeGreaterThan(4)
    for (const cell of cells) {
      expect(cell.waterSurface).toBeCloseTo(cells[0]!.waterSurface, 6)
      expect(cell.waterDepth).toBeCloseTo(cells[0]!.waterDepth, 6)
    }
    // Deepest point of the body, not the depth of whichever column we asked.
    expect(cells[0]!.waterDepth).toBeCloseTo(cells[0]!.waterSurface - 1, 6)
  })

  test('a whole pour is marked flowing, a pool is not', () => {
    const world = makeBasin(5, 12)
    for (const y of [8, 9, 10]) addWater(world, 2, y)

    world.processWater()

    // Every block of the falling slug, not just the one with a gap under it:
    // the two above it are resting on full water, so asking about the block
    // below alone would draw a pour as one stream under two solid blocks.
    for (const y of [7, 8, 9])
      expect(world.getBlock(2, y)!.isFlowing).toBe(true)

    for (let i = 0; i < 40; i++) world.processWater()

    // Once it has landed and levelled off, nothing is pouring any more.
    for (let x = 1; x <= 3; x++)
      for (let y = 1; y < 12; y++)
        expect(world.getBlock(x, y)!.isFlowing).toBe(false)
  })

  test('a pour is not levelled into the pool feeding it', () => {
    const world = makeBasin(12, 16)
    for (let x = 5; x <= 10; x++)
      world.getBlock(x, 9)!.blockType = world.getBlockType('rock')
    for (let x = 5; x <= 10; x++)
      for (const y of [10, 11]) addWater(world, x, y)
    const poured = 6 * 2 * 100

    for (let i = 0; i < 3; i++) world.processWater()

    // The falling column is water-connected to the pool it came over the edge
    // of. Levelling the two as one body would lay the pool into the shaft from
    // the bottom up and empty the ledge in a step or two.
    let onLedge = 0
    for (let x = 5; x <= 10; x++)
      for (let y = 10; y < 16; y++)
        onLedge += world.getBlock(x, y)!.percentFilled
    expect(onLedge).toBeGreaterThan(poured * 0.6)

    // Keep the pool topped up, so what comes over the edge is a steady pour.
    for (let i = 0; i < 10; i++) {
      for (let x = 5; x <= 10; x++)
        for (const y of [10, 11]) addWater(world, x, y)
      world.processWater()
    }

    // Walk down from under the ledge. Falling water keeps what it is carrying
    // rather than being compacted down its own column, so a steady pour is an
    // unbroken ribbon — compacting it leaves gaps, and the run stops at the
    // first one. It stops for real where the pour lands in the pool below.
    let run = 0
    for (let y = 8; y >= 1; y--) {
      const block = world.getBlock(4, y)!
      if (!block.isFlowing) break
      expect(block.percentFilled).toBeGreaterThan(0)
      run++
    }
    expect(run).toBeGreaterThanOrEqual(4)
  })

  test('separate bodies keep their own level', () => {
    const world = makeBasin(7, 10)
    // The divider has to be taller than either body, or they are one body.
    for (let y = 1; y <= 8; y++)
      world.getBlock(3, y)!.blockType = world.getBlockType('rock')
    addWater(world, 1, 5)
    for (const y of [5, 6, 7]) addWater(world, 5, y)

    for (let i = 0; i < 40; i++) world.processWater()

    expect(world.getBlock(1, 1)!.waterSurface).toBeCloseTo(1.5, 6)
    expect(world.getBlock(5, 1)!.waterSurface).toBeCloseTo(2.5, 6)
  })

  test('draining never leaves water stacked on a partial block', () => {
    const world = makeBasin(8, 10)
    for (let x = 1; x <= 6; x++)
      for (let y = 1; y <= 4; y++) addWater(world, x, y)
    for (let i = 0; i < 40; i++) world.processWater()

    // Punch a hole in the floor and pull whatever reaches it out of the world,
    // the way Game.tick does when "drains" is on.
    world.getBlock(3, 0)!.blockType = world.getBlockType('empty')
    for (let i = 0; i < 400; i++) {
      const drain = world.getBlock(3, 0)!
      if (drain.blockType.nature === BlockNature.liquid)
        drain.blockType = world.getBlockType('empty')
      world.processWater()
      expect(submergedBlocksAreFull(world)).toBeNull()
    }

    // ...and it drains dry rather than settling into an invisible film.
    expect(totalWater(world)).toEqual(0)
  })
})
