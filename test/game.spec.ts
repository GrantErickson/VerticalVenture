import { Game } from '@/scripts/game'

describe('game', () => {
  test('Create Game', () => {
    const game = new Game(100, 25)

    expect(game.world.width).toEqual(100)
    expect(game.world.height).toEqual(25)
  })
})
