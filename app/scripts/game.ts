import { World } from './world'
import { BlockType, BlockNature } from './blockType'
import { create as createRandomizer, type RandomSeed } from 'random-seed'

export class Game {
  world: World
  private clockedItems: Clockable[] = []
  private intervalIndex: ReturnType<typeof setTimeout> | null = null
  gameSpeed: number = 10 // In Milliseconds
  gameTime: number = 0
  heightInPx: number
  blockSize: number = 20
  drains: boolean = false
  /**
   * Ticks between water steps. Water moves a whole block at a time, so this is
   * the dial for how fast it falls and how slowly a cavern empties — at the
   * default 10ms tick, 5 puts it at 20 blocks a second. Stepping it every tick
   * drains a world in a quarter of a second, which is far too quick to watch.
   */
  waterTicks: number = 5
  private ticksSinceWater = 0
  /**
   * How much of a block each hole in the floor lets out per water step, in
   * percent. Emptying the whole block at once makes the level fall in a few
   * visible jumps however slowly the water itself is stepped.
   */
  drainRate: number = 20
  dark: boolean = false
  torches: number = 0
  waterBlocks: number = 0
  blocksLit: number = 0
  framesPerSecond: number = 0
  fpsSecond: number = 0
  frames: number = 0
  msPerTick: number = 0
  tickMsThisSecond: number = 0
  scrollOffset: number = 1
  private scrollIndex: ReturnType<typeof setTimeout> | null = null
  private randomizer: RandomSeed = createRandomizer()

  constructor(
    public width: number,
    public height: number,
  ) {
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

  get isScrolling() {
    return this.scrollIndex !== null
  }
  set isScrolling(value: boolean) {
    if (value) {
      if (this.scrollIndex !== null) return
      this.scrollOffset = 0
      this.scrollIndex = setInterval(this.scroll.bind(this), 100)
    } else {
      if (this.scrollIndex === null) return
      clearInterval(this.scrollIndex)
      this.scrollIndex = null
      this.scrollOffset = 0
    }
  }

  scroll() {
    this.scrollOffset += 1
    if (this.scrollOffset > this.blockSize) {
      this.scrollOffset = 0
      // remove the last row from the world
      this.world.removeRow(this.height - 1)
      // add a new row to the bottom of the world
      this.world.insertRow(0)
      this.createRandomRow(0)
    }
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
    this.gameTime += this.gameSpeed / 1000
    this.world.processActiveBlocks()
    // Draining is part of a water step rather than of every tick, so that the
    // rate water leaves by keeps pace with the rate it can flow in at.
    if (++this.ticksSinceWater >= this.waterTicks) {
      this.ticksSinceWater = 0
      if (this.drains) this.drain()
      this.world.processWater()
    }
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

  /** Let a little water out of every hole in the floor of the world. */
  private drain() {
    for (let x = 0; x < this.world.width; x++) {
      const block = this.world.getBlock(x, 0)!
      if (block.blockType.nature !== BlockNature.liquid) continue
      block.percentFilled -= this.drainRate
      // Anything the water above it owes gets settled by the next water step,
      // which pulls the body of water down to meet what has left.
      if (block.percentFilled <= 0)
        block.blockType = this.world.getBlockType('empty')
    }
  }

  createRandomWorld(seed: string) {
    this.randomizer = createRandomizer(seed)
    for (let y = 0; y < this.world.height; y++) {
      this.createRandomRow(y)
    }
    this.settleBlocks()
  }

  createRandomRow(y: number) {
    for (let x = 0; x < this.world.width; x++) {
      let block = this.world.getBlock(x, y)!
      let newType: BlockType | null = null
      let surroundingBlockType = block.surroundingBlockType
      if (surroundingBlockType) {
        if (this.randomizer.random() > 0.3) {
          newType = surroundingBlockType
        }
      }
      if (!newType) {
        let seed = this.randomizer.random()
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

  settleBlocks() {
    // Let all single blocks drop down
    for (let x = 0; x < this.world.width; x++) {
      for (let y = this.world.height - 1; y > 0; y--) {
        // Start at the top
        let block = this.world.getBlock(x, y)!
        if (block.blockType.nature === BlockNature.solid) {
          if (
            block.blockLeft?.blockType.nature !== BlockNature.solid &&
            block.blockRight?.blockType.nature !== BlockNature.solid &&
            block.blockBelow?.blockType.nature !== BlockNature.solid &&
            block.blockAbove?.blockType.nature !== BlockNature.solid
          ) {
            const blockBelow = block.blockBelow
            if (blockBelow) {
              blockBelow.blockType = block.blockType
            }
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
