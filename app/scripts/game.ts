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
    if (this.drains) {
      for (let x = 0; x < this.world.width; x++) {
        let block = this.world.getBlock(x, 0)!
        if (block.blockType.nature == BlockNature.liquid)
          block.blockType = this.world.getBlockType('empty')
      }
    }
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
    this.randomizer = createRandomizer(seed)
    for (let y = 0; y < this.world.height; y++) {
      this.createRandomRow(y)
    }
    this.settleBlocks()
    this.openCaverns()
    this.connectCaverns()
  }

  /**
   * Smooth the raw noise into caverns. Rock barely attached to anything opens
   * up and one-block pits close over, which turns the specks the random fill
   * scatters everywhere into fewer, larger, rounder rooms.
   */
  private openCaverns(passes: number = 2) {
    const world = this.world
    for (let pass = 0; pass < passes; pass++) {
      // Each pass reads one consistent snapshot, not a half-edited world.
      const solid: boolean[] = []
      for (let x = 0; x < world.width; x++)
        for (let y = 0; y < world.height; y++)
          solid[x * world.height + y] =
            world.getBlock(x, y)!.blockType.nature === BlockNature.solid
      const solidAt = (x: number, y: number) =>
        x < 0 || y < 0 || x >= world.width || y >= world.height
          ? true
          : solid[x * world.height + y]

      for (let x = 0; x < world.width; x++) {
        for (let y = 0; y < world.height; y++) {
          let neighbours = 0
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
              if ((dx || dy) && solidAt(x + dx, y + dy)) neighbours++
          const block = world.getBlock(x, y)!
          if (solid[x * world.height + y]) {
            if (neighbours <= 3) block.blockType = world.getBlockType('empty')
          } else if (
            neighbours >= 7 &&
            block.blockType.nature === BlockNature.empty
          ) {
            block.blockType = world.getBlockType('rock')
          }
        }
      }
    }
  }

  /**
   * Join every open pocket to the largest cavern so water can actually get
   * around. The random fill and the smoothing above still leave sealed rooms,
   * and water shut in one has nowhere to go however nicely it settles. Open
   * cells are flood filled into regions; a lone stray cell is filled back in
   * as a pit not worth plumbing, and every other region gets an L-shaped
   * tunnel carved from where it and the main system come closest.
   */
  private connectCaverns() {
    const world = this.world
    const isOpen = (x: number, y: number) => {
      const block = world.getBlock(x, y)
      return block !== null && block.blockType.nature !== BlockNature.solid
    }

    const seen = new Set<number>()
    const cellKey = (x: number, y: number) => x * world.height + y
    const regions: { x: number; y: number }[][] = []
    for (let x = 0; x < world.width; x++) {
      for (let y = 0; y < world.height; y++) {
        if (!isOpen(x, y) || seen.has(cellKey(x, y))) continue
        const region: { x: number; y: number }[] = []
        const queue = [{ x, y }]
        seen.add(cellKey(x, y))
        while (queue.length > 0) {
          const cell = queue.pop()!
          region.push(cell)
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = cell.x + dx!
            const ny = cell.y + dy!
            if (isOpen(nx, ny) && !seen.has(cellKey(nx, ny))) {
              seen.add(cellKey(nx, ny))
              queue.push({ x: nx, y: ny })
            }
          }
        }
        regions.push(region)
      }
    }
    if (regions.length <= 1) return

    regions.sort((a, b) => b.length - a.length)
    // Close the pits before carving any tunnels, not while: a tunnel is
    // allowed to run through a pocket, and filling that pocket afterwards
    // would cut the tunnel it became part of.
    const rooms = regions.filter((region, r) => {
      if (r === 0 || region.length >= 3) return true
      for (const cell of region)
        world.getBlock(cell.x, cell.y)!.blockType = world.getBlockType('rock')
      return false
    })

    const main = rooms[0]!.slice()
    for (let r = 1; r < rooms.length; r++) {
      const region = rooms[r]!

      let from = region[0]!
      let to = main[0]!
      let bestDistance = Infinity
      for (const a of region) {
        for (const b of main) {
          const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
          if (distance < bestDistance) {
            bestDistance = distance
            from = a
            to = b
          }
        }
      }

      const carve = (x: number, y: number) => {
        const block = world.getBlock(x, y)!
        if (block.blockType.nature === BlockNature.solid) {
          block.blockType = world.getBlockType('empty')
        }
        main.push({ x, y })
      }
      for (let x = from.x; x !== to.x; x += Math.sign(to.x - from.x))
        carve(x, from.y)
      for (let y = from.y; y !== to.y; y += Math.sign(to.y - from.y))
        carve(to.x, y)
      main.push(...region)
    }
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
