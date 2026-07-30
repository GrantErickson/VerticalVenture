import { Game } from '~/scripts/game'
import { BlockNature } from '~/scripts/blockType'
import { Item } from '~/scripts/item'
import { FlipFluid } from '~/scripts/fluid/flipFluid'
import {
  CELLS_PER_BLOCK,
  CELL_BORDER,
  cellsForBlocks,
  fillBlock,
  syncSolids,
} from '~/scripts/fluid/worldGrid'

/** World size in blocks for the fluid page. */
export const WORLD_WIDTH = 50
export const WORLD_HEIGHT = 25

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
  const dark = ref(false)
  const scrolling = ref(false)
  const changes = ref(0)
  /** Bumped whenever the rock changes, so a renderer knows to re-read it. */
  const terrainVersion = ref(0)
  /** Bumped whenever block lighting is recomputed. */
  const lightVersion = ref(0)

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
      width: cellsForBlocks(WORLD_WIDTH),
      height: cellsForBlocks(WORLD_HEIGHT),
      maxParticles: MAX_PARTICLES,
      spacing: 1 / settings.particlesPerAxis,
      flipRatio: settings.flipRatio,
      viscosity: settings.viscosity,
      pressureIterations: settings.pressureIterations,
      separationIterations: settings.separationIterations,
    })
  }

  /** Rock blocks become solid cells; the outside of the world is solid too. */
  function syncTerrain() {
    const world = game.value.world
    syncSolids(
      fluid.value,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      (x, y) => world.getBlock(x, y)?.blockType.nature === BlockNature.solid,
      drains.value,
    )
    fluid.value.drainFloor = drains.value
    terrainVersion.value++
  }

  // The valve is a change to the world's floor, so it is re-laid like any
  // other. Closing it must not lift water that had already left back into the
  // world along with the floor it fell through.
  watch(drains, (open) => {
    syncTerrain()
    if (!open) fluid.value.evictFromSolids()
  })

  /** Cash one block of generated water in for particles. */
  function pourBlock(blockX: number, blockY: number) {
    fillBlock(fluid.value, blockX, blockY, settings.particlesPerAxis)
  }

  function generateWorld() {
    const next = new Game(WORLD_WIDTH, WORLD_HEIGHT)
    next.createRandomWorld(seed.value)
    game.value = next
    fluid.value = makeFluid()
    syncTerrain()

    // Cash the generated water in for particles, then take it out of the block
    // world — from here on the blocks are only terrain and the particles are
    // the only water there is.
    const world = next.world
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const block = world.getBlock(x, y)!
        if (block.blockType.nature !== BlockNature.liquid) continue
        block.blockType = world.getBlockType('empty')
        pourBlock(x, y)
      }
    }
    changes.value = 0
    stats.particles = fluid.value.count
    scrollProgress = 0
    relight()
  }

  // How far into the next row the scroll has glided, 0..1 blocks. Drawn as a
  // smooth offset; the world itself only ever moves in whole-row steps.
  let scrollProgress = 0
  /** Matches the block game's pace: one row of descent every two seconds. */
  const SECONDS_PER_ROW = 2

  /**
   * Glide the world up by this much *real* time, stepping a whole row in
   * whenever the glide passes one.
   *
   * Deliberately not driven by the solver's fixed step. The offset is the one
   * number the eye follows across the whole frame, so it has to be a function
   * of the wall clock: tied to how many frames have been drawn instead, every
   * long frame — and the solver has plenty of them — lands the same distance of
   * travel in a longer slice of time and reads as a stutter, and a display that
   * is not 60Hz scrolls at the wrong speed entirely.
   */
  function advanceScroll(seconds: number) {
    if (!scrolling.value) return
    scrollProgress += seconds / SECONDS_PER_ROW
    while (scrollProgress >= 1) {
      scrollProgress -= 1
      scrollRow()
    }
  }

  // Stopping mid-glide would otherwise leave the world drawn part of a block
  // off its own grid for as long as the scroll stayed off.
  watch(scrolling, (on) => {
    if (!on) scrollProgress = 0
  })

  /** One row of descent: the world slides up and a fresh row rises in. */
  function scrollRow() {
    const g = game.value
    const world = g.world
    // The same mutation the block game's scroll makes: drop the top row,
    // grow a fresh random one at the bottom.
    world.removeRow(WORLD_HEIGHT - 1)
    world.insertRow(0)
    g.createRandomRow(0)

    // The terrain just moved up a block, so the water goes with it, and
    // whatever gets pushed past the top has scrolled off the world. The
    // predicate names what to KEEP.
    const f = fluid.value
    f.shiftParticles(CELLS_PER_BLOCK)
    f.removeParticles((_x, y) => y < f.height - CELL_BORDER)
    syncTerrain()

    // The fresh row may bring water of its own; cash it in for particles
    // exactly as at generation time.
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const block = world.getBlock(x, 0)!
      if (block.blockType.nature !== BlockNature.liquid) continue
      block.blockType = world.getBlockType('empty')
      pourBlock(x, 0)
    }
    stats.particles = f.count
    if (dark.value) relight()
  }

  /**
   * Recompute block brightness from the torches. Cheap enough to run on every
   * event that can move light around — torches and terrain — but not needed
   * per frame, because nothing else in this world ever moves a light.
   */
  function relight() {
    game.value.world.processLighting()
    lightVersion.value++
  }
  watch(dark, relight)

  /** Place a torch on an open block, or pick up the one already there. */
  function toggleTorch(blockX: number, blockY: number) {
    const block = game.value.world.getBlock(blockX, blockY)
    if (!block || block.blockType.nature === BlockNature.solid) return
    // The Block item setter registers and unregisters the light itself.
    block.item = block.item ? null : new Item('torch', 1, 'Torch')
    changes.value++
    // The renderer carries torch positions alongside the rock layer.
    terrainVersion.value++
    relight()
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

  /** A row of water along the top of the world, as on the /dom page. */
  function addWater() {
    for (let x = 0; x < WORLD_WIDTH; x++) pourBlock(x, WORLD_HEIGHT - 1)
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
    // Filling over a torch buries it; a light inside rock is no light at all.
    if (makeSolid && block.item) block.item = null
    changes.value++
    syncTerrain()
    if (dark.value) relight()
    // Filling a block in can bury water. Anything with nowhere to go is gone.
    if (makeSolid) fluid.value.evictFromSolids()
  }

  function step(dt: number) {
    const f = fluid.value
    const started = performance.now()

    // Draining needs nothing here: an open valve is an open floor, and the
    // water leaves through it under its own weight.
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
    dark,
    scrolling,
    advanceScroll,
    /** The smooth part of the scroll, in fluid cells, for the renderer. */
    scrollCells: () => scrollProgress * CELLS_PER_BLOCK,
    changes,
    stats,
    terrainVersion,
    lightVersion,
    loadFromUrl,
    newKey,
    generateWorld,
    addWater,
    isSolidBlock,
    paintBlock,
    toggleTorch,
    step,
  }
}
