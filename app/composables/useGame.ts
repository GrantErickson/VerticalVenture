import { Game } from '~/scripts/game'
import type { Block } from '~/scripts/block'
import { BlockNature } from '~/scripts/blockType'
import { Item } from '~/scripts/item'

export const WORLD_WIDTH = 50
export const WORLD_HEIGHT = 25

/**
 * Owns the simulation and all the controls around it, so the DOM renderer and
 * the three.js renderer drive an identical game and can be compared fairly.
 *
 * `onFrame` runs once per animation frame, after the stats have been refreshed
 * — that is where a renderer pushes the current world state at the screen.
 */
export function useGame(onFrame?: (game: Game) => void) {
  // `shallowRef`, so the 1250 blocks stay plain objects. Making them deeply
  // reactive costs ~50x per simulation tick (0.17ms -> 8.6ms measured), because
  // the game loop touches every block several times per tick and each access
  // pays proxy + dependency-tracking overhead.
  const game = shallowRef(new Game(WORLD_WIDTH, WORLD_HEIGHT))
  const frame = ref(0)
  const gameSeed = ref('')
  const changes = ref(0)

  // Counters are rendered inside <v-col> slots. Vue only re-invokes a child
  // component's slot when a *reactive* dependency read inside it changes, and
  // the game instance is deliberately raw — so mirror them into reactive state
  // once per frame rather than binding the raw fields directly.
  const stats = reactive({
    torches: 0,
    waterBlocks: 0,
    blocksLit: 0,
    framesPerSecond: 0,
    msPerTick: 0,
  })

  // Same reason: these drive <v-switch> props, so the UI owns them and pushes
  // into the raw game. Binding game.drains/dark/isScrolling directly leaves the
  // switch stuck in its old position even though the game state has changed.
  const drains = ref(false)
  const dark = ref(false)
  const scrolling = ref(false)

  watch(drains, (v) => (game.value.drains = v))
  watch(dark, (v) => (game.value.dark = v))
  watch(scrolling, (v) => (game.value.isScrolling = v))

  let rafHandle = 0

  onMounted(() => {
    newKey()
    const loop = () => {
      const g = game.value
      stats.torches = g.torches
      stats.waterBlocks = g.waterBlocks
      stats.blocksLit = g.blocksLit
      stats.framesPerSecond = g.framesPerSecond
      stats.msPerTick = g.msPerTick
      frame.value++
      onFrame?.(g)
      rafHandle = requestAnimationFrame(loop)
    }
    loop()
  })

  // The game owns two intervals; without this they outlive the page.
  onBeforeUnmount(() => {
    cancelAnimationFrame(rafHandle)
    game.value.isScrolling = false
    game.value.stop()
  })

  function newKey() {
    gameSeed.value = Math.random().toString(36).split('.')[1]!.substring(0, 4)
    generateWorld()
  }

  function generateWorld() {
    game.value.isScrolling = false
    game.value.stop()

    const next = new Game(WORLD_WIDTH, WORLD_HEIGHT)
    next.createRandomWorld(gameSeed.value)
    // Carry the switch positions over, otherwise the toggles would still read
    // "on" while the fresh game had them off.
    next.drains = drains.value
    next.dark = dark.value
    next.isScrolling = scrolling.value
    next.start()

    game.value = next
    changes.value = 0
  }

  function addLotsOfWater() {
    for (let x = 0; x < game.value.world.width; x++) {
      const block = game.value.world.getBlock(x, game.value.world.height - 1)!
      if (block.blockType.nature === BlockNature.empty)
        block.blockType = game.value.world.getBlockType('water')
    }
  }

  function hoverBlock(block: Block | null) {
    if (block) game.value.world.addLight(block)
  }

  function leaveBlock(block: Block | null) {
    if (block && !block.item?.luminosity) game.value.world.removeLight(block)
  }

  function clickBlock(block: Block, shiftKey: boolean) {
    if (shiftKey) {
      if (block.item) {
        block.item = null
      } else {
        block.item = new Item('torch', 1, 'Torch')
        game.value.world.processLighting()
      }
      return
    }

    if (block.blockType.name === 'water') {
      block.blockType = game.value.world.getBlockType('rock')
      block.percentFilled = 100
      block.isFlowing = false
    } else if (block.blockType.name === 'rock') {
      block.blockType = game.value.world.getBlockType('empty')
      block.percentFilled = 0
    } else if (block.blockType.name === 'empty') {
      block.blockType = game.value.world.getBlockType('rock')
      block.percentFilled = 100
      block.isFlowing = false
    }
    changes.value++
    game.value.world.addActiveBlock(block)
    game.value.world.addActiveBlock(block.blockBelow)
    game.value.world.addActiveBlock(block.blockLeft)
    game.value.world.addActiveBlock(block.blockRight)
    game.value.world.addActiveBlock(block.blockAbove)
  }

  return {
    game,
    frame,
    stats,
    gameSeed,
    changes,
    drains,
    dark,
    scrolling,
    newKey,
    generateWorld,
    addLotsOfWater,
    hoverBlock,
    leaveBlock,
    clickBlock,
  }
}
