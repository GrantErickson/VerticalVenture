import { Game } from '~/scripts/game'
import { BlockNature } from '~/scripts/blockType'
import { FlipFluid } from '~/scripts/fluid/flipFluid'
import { WORLD_WIDTH, WORLD_HEIGHT } from './useGame'

/**
 * How many fluid cells a block is worth along each axis. The simulation is a
 * grid of its own laid over the block world, and this is the only thing tying
 * the two together. Three would give finer flow but costs more than twice as
 * much per frame — most of the visible detail comes from where the particles
 * are, not from how fine the grid under them is.
 */
export const CELLS_PER_BLOCK = 2

/** Particles per cell along each axis: four to a cell, the usual choice. */
const PARTICLES_PER_AXIS = 2

const MAX_PARTICLES = 24000

/**
 * The same world as the other two pages, with the block water replaced by a
 * real fluid.
 *
 * The terrain still comes from Game's generator, so a seed opened here and on
 * the other pages is the same cave system. Everything below the rock is new:
 * the water blocks it generates are cashed in for particles up front and the
 * block grid keeps only the rock from then on.
 */
export function useFluidWorld() {
  const seed = ref('')
  const drains = ref(false)
  const changes = ref(0)
  /** Bumped whenever the rock changes, so a renderer knows to re-read it. */
  const terrainVersion = ref(0)

  const stats = reactive({
    particles: 0,
    framesPerSecond: 0,
    msPerStep: 0,
  })

  // Deliberately shallow: the solver's typed arrays are touched millions of
  // times a second and must never be handed to Vue's reactivity.
  const game = shallowRef(new Game(WORLD_WIDTH, WORLD_HEIGHT))
  const fluid = shallowRef(makeFluid())

  let frames = 0
  let framesSecond = 0
  let stepMsThisSecond = 0

  function makeFluid() {
    return new FlipFluid({
      width: WORLD_WIDTH * CELLS_PER_BLOCK,
      height: WORLD_HEIGHT * CELLS_PER_BLOCK,
      maxParticles: MAX_PARTICLES,
    })
  }

  /** Rock blocks become solid cells; the outside of the world is solid too. */
  function syncSolids() {
    const f = fluid.value
    const world = game.value.world
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const solid =
          world.getBlock(x, y)?.blockType.nature === BlockNature.solid
        for (let ci = 0; ci < CELLS_PER_BLOCK; ci++)
          for (let cj = 0; cj < CELLS_PER_BLOCK; cj++)
            f.setSolid(
              x * CELLS_PER_BLOCK + ci,
              y * CELLS_PER_BLOCK + cj,
              solid,
            )
      }
    }
    // A one cell rim around the world. Half a block thick, so it is invisible
    // against the terrain, and it means every cell holding water has a real
    // cell on all four sides for the pressure solve to lean on.
    for (let i = 0; i < f.width; i++) {
      f.setSolid(i, 0, true)
      f.setSolid(i, f.height - 1, true)
    }
    for (let j = 0; j < f.height; j++) {
      f.setSolid(0, j, true)
      f.setSolid(f.width - 1, j, true)
    }
    terrainVersion.value++
  }

  /** Fill one block's worth of cells with particles. */
  function fillBlock(blockX: number, blockY: number) {
    const f = fluid.value
    const step = 1 / PARTICLES_PER_AXIS
    for (let ci = 0; ci < CELLS_PER_BLOCK; ci++) {
      for (let cj = 0; cj < CELLS_PER_BLOCK; cj++) {
        const cellX = blockX * CELLS_PER_BLOCK + ci
        const cellY = blockY * CELLS_PER_BLOCK + cj
        if (f.isSolid(cellX, cellY)) continue
        for (let px = 0; px < PARTICLES_PER_AXIS; px++)
          for (let py = 0; py < PARTICLES_PER_AXIS; py++)
            f.addParticle(cellX + (px + 0.5) * step, cellY + (py + 0.5) * step)
      }
    }
  }

  function generateWorld() {
    const next = new Game(WORLD_WIDTH, WORLD_HEIGHT)
    next.createRandomWorld(seed.value)
    game.value = next
    fluid.value = makeFluid()
    syncSolids()

    // Cash the generated water in for particles, then take it out of the block
    // world — from here on the blocks are only terrain and the particles are
    // the only water there is.
    const world = next.world
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const block = world.getBlock(x, y)!
        if (block.blockType.nature !== BlockNature.liquid) continue
        block.blockType = world.getBlockType('empty')
        fillBlock(x, y)
      }
    }
    changes.value = 0
    stats.particles = fluid.value.count
  }

  function newKey() {
    seed.value = Math.random().toString(36).split('.')[1]!.substring(0, 4)
    generateWorld()
  }

  /** A row of water along the top of the world, as on the other pages. */
  function addWater() {
    for (let x = 0; x < WORLD_WIDTH; x++) fillBlock(x, WORLD_HEIGHT - 1)
    stats.particles = fluid.value.count
  }

  function toggleBlock(blockX: number, blockY: number) {
    const world = game.value.world
    const block = world.getBlock(blockX, blockY)
    if (!block) return
    const solid = block.blockType.nature === BlockNature.solid
    block.blockType = world.getBlockType(solid ? 'empty' : 'rock')
    changes.value++
    syncSolids()
    // Filling a block in can bury water. Anything with nowhere to go is gone.
    if (!solid) fluid.value.evictFromSolids()
  }

  function step(dt: number) {
    const f = fluid.value
    const started = performance.now()

    if (drains.value) {
      // Let water out through the floor, which here means deleting anything
      // that reaches the lowest open row.
      const floor = CELLS_PER_BLOCK + 0.5
      f.removeParticles((_x, y) => y > floor)
    }

    f.step(dt)

    stepMsThisSecond += performance.now() - started
    frames++
    const second = Math.floor(performance.now() / 1000)
    if (second !== framesSecond) {
      stats.framesPerSecond = frames
      stats.msPerStep = Math.round((stepMsThisSecond / frames) * 100) / 100
      frames = 0
      stepMsThisSecond = 0
      framesSecond = second
    }
    stats.particles = f.count
  }

  return {
    game,
    fluid,
    seed,
    drains,
    changes,
    stats,
    terrainVersion,
    newKey,
    generateWorld,
    addWater,
    toggleBlock,
    step,
  }
}
