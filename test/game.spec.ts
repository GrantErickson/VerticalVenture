import { describe, expect, test } from 'vitest'
import { Game } from '@/scripts/game'

describe('game', () => {
  test('Create Game', () => {
    const game = new Game(100, 25)

    expect(game.world.width).toEqual(100)
    expect(game.world.height).toEqual(25)
  })

  test('Water steps once every waterTicks ticks', () => {
    const game = new Game(10, 10)
    game.waterTicks = 5
    const block = game.world.getBlock(5, 9)!
    block.blockType = game.world.getBlockType('water')

    // Water moves a whole block at a time, so the tick it moves on is the only
    // thing setting how fast it falls and how slowly a cavern drains.
    for (let i = 0; i < 4; i++) game.tick()
    expect(block.percentFilled).toEqual(100)

    game.tick()
    expect(block.percentFilled).toEqual(0)
    expect(game.world.getBlock(5, 8)!.percentFilled).toEqual(100)
  })

  test('Draining lets water out a bit at a time', () => {
    const game = new Game(10, 10)
    game.waterTicks = 1
    game.drainRate = 20
    game.drains = true
    // Walled in, or the water spreads along the floor as it goes and the
    // block by the hole is not the only thing draining.
    game.world.getBlock(4, 0)!.blockType = game.world.getBlockType('rock')
    game.world.getBlock(6, 0)!.blockType = game.world.getBlockType('rock')
    const block = game.world.getBlock(5, 0)!
    block.blockType = game.world.getBlockType('water')

    game.tick()
    expect(block.percentFilled).toEqual(80)
    game.tick()
    expect(block.percentFilled).toEqual(60)
    for (let i = 0; i < 3; i++) game.tick()
    expect(block.blockType.name).toEqual('empty')
  })
})
