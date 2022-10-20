import { nextTick } from 'vue/types/umd'
import { World } from './world'
import { BlockType, BlockNature } from './blockType'

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

  createRandomWorld() {
    for (let x = 0; x < this.world.width; x++) {
      for (let y = 0; y < this.world.height; y++) {
        let block = this.world.getBlock(x, y)!
        let newType: BlockType | null = null
        let surroundingBlockType = block.surroundingBlockType
        if (surroundingBlockType) {
          if (Math.random() > 0.3) {
            newType = surroundingBlockType
          }
        }
        if (!newType) {
          let seed = Math.random()
          if (seed > 0.8) {
            newType = this.world.getBlockType('water')
          } else if (seed > 0.4) {
            newType = this.world.getBlockType('rock')
          } else {
            newType = block.blockType
          }
        }
        block.blockType = newType
      }
    }
    this.settleBlocks()
  }

  settleBlocks() {
    // Let all single blocks drop down
    for (let x = 0; x < this.world.width; x++) {
      for (let y = this.world.height - 1; y > 0; y--) {
        // Start at the top
        let block = this.world.getBlock(x, y)!
        if (block.blockType.nature === BlockNature.solid) {
          if (
            block.blockLeft &&
            block.blockLeft.blockType.nature !== BlockNature.solid &&
            block.blockRight &&
            block.blockRight.blockType.nature !== BlockNature.solid &&
            block.blockBelow &&
            block.blockBelow.blockType.nature !== BlockNature.solid &&
            block.blockAbove &&
            block.blockAbove.blockType.nature !== BlockNature.solid
          ) {
            console.log(`settling x: ${x}, y: ${y} - ${block.blockType.name}`)
            block.blockBelow?.blockType == block.blockType
            block.blockType = this.world.getBlockType('empty')
            console.log(
              `settling x: ${x}, y: ${y} - ${block.blockBelow!.blockType.name}`
            )
          }
        }
      }
    }
  }
}

interface Clockable {
  tick(gameTime: number, game: Game): void
}
