import { nextTick } from 'vue/types/umd'
import { World } from './world'
import { BlockType, BlockNature } from './blockType'
import { Block } from './block'
import { RandomSeed } from 'random-seed'

export class Game {
  world: World
  private clockedItems: Clockable[] = []
  private intervalIndex: ReturnType<typeof setTimeout> | null = null
  gameSpeed: number = 10 // In Milliseconds
  gameTime: number = 0
  heightInPx: number
  blockSize: number = 20
  drains: boolean = false
  dark: boolean = false
  torches: number = 0
  waterBlocks: number = 0
  blocksLit: number = 0
  framesPerSecond: number = 0
  fpsSecond: number = 0
  frames: number = 0
  msPerTick: number = 0
  tickMsThisSecond: number = 0

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
    const msStart = performance.now()
    if (this.fpsSecond != Math.floor(performance.now() / 1000)) {
      this.framesPerSecond = this.frames
      this.msPerTick =
        Math.floor((this.tickMsThisSecond / this.frames) * 100) / 100
      this.frames = 0
      this.fpsSecond = Math.floor(performance.now() / 1000)
      this.tickMsThisSecond = 0
    }
    this.frames++
    if (this.drains) {
      for (let x = 0; x < this.world.width; x++) {
        let block = this.world.getBlock(x, 0)!
        if (block.blockType.nature == BlockNature.liquid)
          block.blockType = this.world.getBlockType('empty')
      }
    }
    //console.log(this.world.activeBlocks.length)
    this.gameTime += this.gameSpeed / 1000
    this.world.processActiveBlocks()
    if (this.dark) {
      this.world.processLighting()
    } else {
      this.world.clearBrightness(1)
    }
    // Count torches and water blocks
    this.torches = 0
    this.waterBlocks = 0
    this.blocksLit = 0
    for (let x = 0; x < this.world.width; x++) {
      for (let y = 0; y < this.world.height; y++) {
        let block = this.world.getBlock(x, y)!
        if (block.item?.name == 'torch') this.torches++
        if (
          block.blockType.nature == BlockNature.liquid &&
          block.percentFilled > 10
        )
          this.waterBlocks++
        if (block.brightness > 0.1) this.blocksLit++
      }
    }
    this.tickMsThisSecond += performance.now() - msStart
  }

  createRandomWorld(seed: string) {
    var rand = require('random-seed').create(seed)
    for (let x = 0; x < this.world.width; x++) {
      for (let y = 0; y < this.world.height; y++) {
        let block = this.world.getBlock(x, y)!
        let newType: BlockType | null = null
        let surroundingBlockType = block.surroundingBlockType
        if (surroundingBlockType) {
          if (rand.random() > 0.3) {
            newType = surroundingBlockType
          }
        }
        if (!newType) {
          let seed = rand.random()
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
            block.blockBelow?.blockType == block.blockType
            block.blockType = this.world.getBlockType('empty')
          }
        }
      }
    }
  }
}

interface Clockable {
  tick(gameTime: number, game: Game): void
}
