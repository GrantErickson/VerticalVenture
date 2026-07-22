import { describe, expect, test } from 'vitest'
import { World } from '@/scripts/world'

// addActiveBlock only queues: a block joins world.activeBlocks when
// processActiveBlocks next reconciles its added/removed lists, at the end of
// the call. Each test therefore opens with one process call that moves no
// water — it exists to flush the queue so the water is active for the next.

describe('liquid', () => {
  test('Drain Down', () => {
    const world = new World(100, 25)

    const waterBlock = world.getBlock(0, 24)!
    waterBlock.blockType = world.getBlockType('water')
    waterBlock.percentFilled = 100
    expect(waterBlock.blockType.name).toEqual('water')
    expect(waterBlock.percentFilled).toEqual(100)
    world.addActiveBlock(waterBlock)
    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(100)

    // Half flows into the empty block below on every step...
    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(50)
    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(25)
    world.processActiveBlocks()
    world.processActiveBlocks()
    world.processActiveBlocks()
    world.processActiveBlocks()
    world.processActiveBlocks()
    // ...until what would flow is under amountToEvaporate and the remainder
    // empties in one go.
    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(0)
    expect(waterBlock.blockBelow!.percentFilled < 5).toBeTruthy()
  })

  test('Drain Around Solid', () => {
    const world = new World(100, 25)

    const waterBlock = world.getBlock(1, 24)!
    waterBlock.blockType = world.getBlockType('water')
    waterBlock.percentFilled = 100
    world.addActiveBlock(waterBlock)
    const leftBlock = waterBlock.blockLeft!
    expect(leftBlock).toBeTruthy()
    const rightBlock = waterBlock.blockRight!
    expect(rightBlock).toBeTruthy()

    const solidBlock = world.getBlock(1, 23)!
    solidBlock.blockType = world.getBlockType('rock')!

    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(100)
    expect(world.activeBlocks.length).toEqual(1)
    expect(solidBlock.blockType.name).toEqual('rock')

    // Blocked below by the rock, the water averages itself with both sides.
    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(100 / 3)
    expect(world.activeBlocks.includes(leftBlock)).toBeTruthy()
    expect(world.activeBlocks.includes(rightBlock)).toBeTruthy()
    expect(world.activeBlocks.includes(waterBlock)).toBeTruthy()
    expect(world.activeBlocks.length).toEqual(3)

    // The sides drain down past the rock; the middle, already level with its
    // neighbours, holds — and stays active only because the flowing sides
    // re-add it after it asks to retire.
    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(100 / 3)
    expect(world.activeBlocks.length).toEqual(6)
  })
})
