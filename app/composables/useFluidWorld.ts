import { Game } from '~/scripts/game'
import { BlockNature } from '~/scripts/blockType'
import { FlipFluid } from '~/scripts/fluid/flipFluid'

/** World size in blocks for the fluid page. */
export const WORLD_WIDTH = 50
export const WORLD_HEIGHT = 25

/**
 * How many fluid cells a block is worth along each axis. The simulation is a
 * grid of its own laid over the block world, and this is the only thing tying
 * the two together. Three would give finer flow but costs more than twice as
 * much per frame — most of the visible detail comes from where the particles
 * are, not from how fine the grid under them is.
 */
export const CELLS_PER_BLOCK = 2

/** Sized for the finest particle setting; coarser ones simply use less. */
const MAX_PARTICLES = 96000

/**
 * The same world as the /dom page, with the block water replaced by a real
 * fluid.
 *
 * The terrain still comes from Game's generator, so a seed opened here and on
 * the /dom page is the same cave system. Everything below the rock is new:
 * the water blocks it generates are cashed in for particles up front and the
 * block grid keeps only the rock from then on.
 */
export function useFluidWorld() {
  const { settings } = useFluidSettings()
  const route = useRoute()
  const router = useRouter()
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
      spacing: 1 / settings.particlesPerAxis,
      flipRatio: settings.flipRatio,
      viscosity: settings.viscosity,
      pressureIterations: settings.pressureIterations,
      separationIterations: settings.separationIterations,
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

  /** Fill one block's worth of cells with particles at the rest packing. */
  function fillBlock(blockX: number, blockY: number) {
    const f = fluid.value
    const perAxis = settings.particlesPerAxis
    const step = 1 / perAxis
    for (let ci = 0; ci < CELLS_PER_BLOCK; ci++) {
      for (let cj = 0; cj < CELLS_PER_BLOCK; cj++) {
        const cellX = blockX * CELLS_PER_BLOCK + ci
        const cellY = blockY * CELLS_PER_BLOCK + cj
        if (f.isSolid(cellX, cellY)) continue
        for (let px = 0; px < perAxis; px++)
          for (let py = 0; py < perAxis; py++)
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

  function randomSeed() {
    return Math.random().toString(36).split('.')[1]!.substring(0, 4)
  }

  /**
   * Adopt the seed in the URL, minting one into it first if the address was
   * blank, and build that world. The URL is the only home the seed has, so
   * the address bar is always shareable and a plain browser refresh comes
   * back to the same world.
   */
  function loadFromUrl() {
    const fromUrl = typeof route.query.seed === 'string' ? route.query.seed : ''
    seed.value = fromUrl || randomSeed()
    if (!fromUrl)
      router.replace({ query: { ...route.query, seed: seed.value } })
    generateWorld()
  }

  /** A fresh seed, pushed into the URL so back walks through old worlds. */
  function newKey() {
    seed.value = randomSeed()
    router.push({ query: { ...route.query, seed: seed.value } })
    generateWorld()
  }

  // Back/forward navigation changes the seed without touching the page, and
  // a shared link pasted over the current one should take effect too.
  watch(
    () => route.query.seed,
    (value) => {
      if (typeof value === 'string' && value && value !== seed.value) {
        seed.value = value
        generateWorld()
      }
    },
  )

  /** A row of water along the top of the world, as on the other pages. */
  function addWater() {
    for (let x = 0; x < WORLD_WIDTH; x++) fillBlock(x, WORLD_HEIGHT - 1)
    stats.particles = fluid.value.count
  }

  /** Whether the block at these coordinates is rock. Null out of bounds. */
  function isSolidBlock(blockX: number, blockY: number): boolean | null {
    const block = game.value.world.getBlock(blockX, blockY)
    return block ? block.blockType.nature === BlockNature.solid : null
  }

  /** Set one block to rock or empty; a no-op if it already is. */
  function paintBlock(blockX: number, blockY: number, makeSolid: boolean) {
    const world = game.value.world
    const block = world.getBlock(blockX, blockY)
    if (!block) return
    if ((block.blockType.nature === BlockNature.solid) === makeSolid) return
    block.blockType = world.getBlockType(makeSolid ? 'rock' : 'empty')
    changes.value++
    syncSolids()
    // Filling a block in can bury water. Anything with nowhere to go is gone.
    if (makeSolid) fluid.value.evictFromSolids()
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

  // The feel and cost knobs take hold in the running water on the spot; the
  // solver reads them every step. Fineness changes what a block of water is
  // worth in particles, so it rebuilds the world from the current seed.
  watch(
    () => [
      settings.flipRatio,
      settings.viscosity,
      settings.pressureIterations,
      settings.separationIterations,
    ],
    () => {
      const f = fluid.value
      f.flipRatio = settings.flipRatio
      f.viscosity = settings.viscosity
      f.pressureIterations = settings.pressureIterations
      f.separationIterations = settings.separationIterations
    },
  )
  watch(
    () => settings.particlesPerAxis,
    () => generateWorld(),
  )

  return {
    game,
    fluid,
    seed,
    drains,
    changes,
    stats,
    terrainVersion,
    loadFromUrl,
    newKey,
    generateWorld,
    addWater,
    isSolidBlock,
    paintBlock,
    step,
  }
}
