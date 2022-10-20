import { Game } from '@/scripts/game'

describe('world', () => {
  const game = new Game(100, 25)
  test('Create World', () => {
    expect(game.world.width).toEqual(100)
    expect(game.world.height).toEqual(25)
  })

  test('GetBlock', () => {
    expect(game.world.getBlock(25, 25)).toBeNull()
    expect(game.world.getBlock(-1, 25)).toBeNull()
    expect(game.world.getBlock(5, -1)).toBeNull()
    expect(game.world.getBlock(0, 0)).toBeTruthy()
    expect(game.world.getBlock(5, 5)).toBeTruthy()
    game.world.getBlock(0, 24)
  })

  test('AddWater', () => {
    let waterBlock = game.world.getBlock(0, 24)!
    expect(waterBlock).toBeTruthy()
    waterBlock.blockType = game.world.blockTypes.get('water')!
    waterBlock.percentFilled = 100
    expect(waterBlock.blockType.name).toEqual('water')
    expect(waterBlock.percentFilled).toEqual(100)
  })

  test('AddSolid', () => {
    let solidBlock = game.world.getBlock(0, 23)!
    expect(solidBlock).toBeTruthy()
    solidBlock.blockType = game.world.blockTypes.get('rock')!
    solidBlock.percentFilled = 100
    expect(solidBlock.blockType.name).toEqual('rock')
    expect(solidBlock.percentFilled).toEqual(100)
  })
})
