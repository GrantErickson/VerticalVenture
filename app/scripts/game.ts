import { World } from './world'
import { BlockType, BlockNature } from './blockType'
import { create as createRandomizer, type RandomSeed } from 'random-seed'

/**
 * Grow the row that belongs directly under the one described by `solidAbove`.
 *
 * `createRandomRow` scatters rock and water block by block, which is fine for
 * the first pass of a whole world: openCaverns and connectCaverns then smooth
 * that confetti into rooms and join them up. A row grown one at a time under a
 * scrolling world never gets that treatment, and arrived as confetti — walls
 * that stopped dead, caves that closed for no reason, single blocks hanging in
 * the air.
 *
 * So each column takes its lead from the three blocks above it: the more rock
 * there is over a column, the likelier that column is rock. Walls and caverns
 * carry on downwards, and because it is only ever odds they wander as they go
 * rather than copying the row above. A pass along the row afterwards flips any
 * block that disagrees with both its neighbours, which closes one-block pits
 * and knocks out one-block pillars — the same tidying openCaverns does.
 *
 * Water goes in by the run rather than by the block, so a cave arrives wet or
 * dry rather than speckled.
 */
export function growRow(
  solidAbove: boolean[],
  random: () => number,
): { solid: boolean[]; water: boolean[] } {
  const width = solidAbove.length
  // How likely a column is to be rock, by how many of the three above it are.
  const chance = [0.1, 0.32, 0.72, 0.94]

  const grown: boolean[] = []
  for (let x = 0; x < width; x++) {
    let above = 0
    for (let dx = -1; dx <= 1; dx++) {
      // Off the ends, read the edge column again rather than counting the void
      // as rock, or every world would grow walls down its sides.
      const at = Math.min(Math.max(x + dx, 0), width - 1)
      if (solidAbove[at]) above++
    }
    grown[x] = random() < chance[above]!
  }

  // Sweep until it settles, reading the row as it goes rather than a snapshot
  // of it: flipping one speck can leave its neighbour looking like another, so
  // a single pass over a frozen copy puts back roughly as many as it takes out.
  const solid = grown.slice()
  for (let pass = 0; pass < 4; pass++) {
    let flipped = false
    for (let x = 1; x < width - 1; x++)
      if (solid[x] !== solid[x - 1] && solid[x] !== solid[x + 1]) {
        solid[x] = !solid[x]!
        flipped = true
      }
    if (!flipped) break
  }

  const water: boolean[] = new Array(width).fill(false)
  for (let x = 0; x < width;) {
    if (solid[x]) {
      x++
      continue
    }
    let end = x
    while (end < width && !solid[end]) end++
    if (random() < 0.35) for (let i = x; i < end; i++) water[i] = true
    x = end
  }

  return { solid, water }
}

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
  /** How far into the next row the scroll has glided, in pixels. */
  scrollOffset: number = 0
  private scrolling: boolean = false
  private randomizer: RandomSeed = createRandomizer()

  /** Matches the fluid page's pace: one row of descent every two seconds. */
  static readonly secondsPerRow = 2

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
    return this.scrolling
  }
  set isScrolling(value: boolean) {
    if (value === this.scrolling) return
    this.scrolling = value
    this.scrollOffset = 0
  }

  /**
   * Glide the world up by this much real time, stepping a whole row in
   * whenever the glide passes one.
   *
   * Driven by the page's animation frame rather than by a timer of its own.
   * A whole pixel every 100ms is ten discrete jumps a second however smoothly
   * the rest of the page is painting, and that is exactly what a scroll looks
   * like when it is described as jerky.
   */
  advanceScroll(seconds: number) {
    if (!this.scrolling) return
    this.scrollOffset += (seconds / Game.secondsPerRow) * this.blockSize
    while (this.scrollOffset >= this.blockSize) {
      this.scrollOffset -= this.blockSize
      // remove the last row from the world
      this.world.removeRow(this.height - 1)
      // add a new row to the bottom of the world, carrying on the shape of the
      // one it arrives under rather than starting again from noise
      this.world.insertRow(0)
      this.growRandomRow(0)
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

  /**
   * The row that belongs under row `aboveY`, grown but not placed. The fluid
   * page keeps its next row out of the world entirely until it scrolls in.
   */
  rowBelow(aboveY: number): { solid: boolean[]; water: boolean[] } {
    const solidAbove: boolean[] = []
    for (let x = 0; x < this.world.width; x++)
      solidAbove.push(
        this.world.getBlock(x, aboveY)?.blockType.nature === BlockNature.solid,
      )
    return growRow(solidAbove, () => this.randomizer.random())
  }

  /** Grow row `y` from the row above it and put it in the world. */
  growRandomRow(y: number) {
    const { solid, water } = this.rowBelow(y + 1)
    for (let x = 0; x < this.world.width; x++) {
      const block = this.world.getBlock(x, y)!
      block.blockType = this.world.getBlockType(
        solid[x] ? 'rock' : water[x] ? 'water' : 'empty',
      )
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
