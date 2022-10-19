import { nextTick } from 'vue/types/umd'
import { World } from './world'

export class Game {
  world: World
  private clockedItems: Clockable[] = []
  private intervalIndex: ReturnType<typeof setTimeout> | null = null
  gameSpeed: number = 10 // In Milliseconds
  gameTime: number = 0
  heightInPx: number
  blockSize: number = 20

  constructor(width: number, height: number) {
    this.world = new World(width, height)
    this.heightInPx = height * this.blockSize
  }

  get IsRunning(): boolean {
    return this.intervalIndex !== null
  }

  start() {
    if (this.IsRunning) return
    this.intervalIndex = setInterval(() => {
      this.tick()
    }, this.gameSpeed)
  }
  stop() {
    if (!this.IsRunning) return
    clearInterval(this.intervalIndex!)
    this.intervalIndex = null
  }

  // Moves the game ahead by a number of seconds
  tick(seconds: number = 1) {
    //console.log(this.world.activeBlocks.length)
    this.gameTime += this.gameSpeed / 1000
    this.world.processActiveBlocks()
  }
}

interface Clockable {
  tick(gameTime: number, game: Game): void
}
