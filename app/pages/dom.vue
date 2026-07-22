<template>
  <div>
    <v-row align="center">
      <v-col cols="auto">
        <v-btn icon variant="text" aria-label="New world" @click="newKey">
          <v-icon>mdi-refresh</v-icon>
          <v-tooltip activator="parent" location="bottom">
            New world — a fresh seed goes into the URL, so the address bar is
            always shareable
          </v-tooltip>
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <v-btn @click="generateWorld">
          Reset
          <v-tooltip activator="parent" location="bottom">
            Rebuild this same world from its seed
          </v-tooltip>
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <v-btn
          icon
          variant="text"
          aria-label="Add water"
          @click="addLotsOfWater"
        >
          <v-icon>mdi-water-plus</v-icon>
          <v-tooltip activator="parent" location="bottom">
            Pour a layer of water in along the top
          </v-tooltip>
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <v-btn
          icon
          variant="text"
          :color="drains ? 'info' : undefined"
          :aria-label="drains ? 'Close the drain' : 'Open the drain'"
          @click="drains = !drains"
        >
          <v-icon>{{ drains ? 'mdi-valve-open' : 'mdi-valve-closed' }}</v-icon>
          <v-tooltip activator="parent" location="bottom">
            {{
              drains
                ? 'Drain is open — water is leaving through the floor'
                : 'Open the drain in the floor'
            }}
          </v-tooltip>
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <v-btn
          icon
          variant="text"
          :color="dark ? 'secondary' : undefined"
          :aria-label="dark ? 'Turn the lights on' : 'Turn the lights off'"
          @click="dark = !dark"
        >
          <v-icon>
            {{ dark ? 'mdi-weather-night' : 'mdi-lightbulb-on-outline' }}
          </v-icon>
          <v-tooltip activator="parent" location="bottom">
            {{
              dark
                ? 'Turn the lights back on'
                : 'Go dark and see by torchlight — shift-click places torches'
            }}
          </v-tooltip>
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <v-btn
          icon
          variant="text"
          :color="scrolling ? 'info' : undefined"
          :aria-label="scrolling ? 'Stop scrolling' : 'Start scrolling'"
          @click="scrolling = !scrolling"
        >
          <v-icon>mdi-chevron-double-up</v-icon>
          <v-tooltip activator="parent" location="bottom">
            {{
              scrolling
                ? 'Stop the world scrolling'
                : 'Scroll — the world climbs and fresh rows appear below'
            }}
          </v-tooltip>
        </v-btn>
      </v-col>
    </v-row>

    <div
      class="world"
      :data-frame="frame"
      :class="{ scrolling: scrolling }"
      :style="{
        width: game.width * game.blockSize + 'px',
        height: (game.height - (scrolling ? 1 : 0)) * game.blockSize + 'px',
      }"
    >
      <template v-for="(row, rowIndex) in game.world.blocks" :key="rowIndex">
        <div
          v-for="block in row"
          :id="block.key"
          :key="block.key"
          class="block"
          :class="{
            flowing: block.isFlowing,
            static: !block.isFlowing,
          }"
          :style="{
            top:
              game.heightInPx - (block.y + 1) * 20 - game.scrollOffset + 'px',
            left: block.x * 20 + 'px',
          }"
          @click="clickBlock(block, $event)"
          @mouseover="hoverBlock(block)"
          @mouseleave="leaveBlock(block)"
        >
          <div
            class="fill"
            :style="{
              background: block.blockType.background,
              backgroundImage: `url(/${block.blockType.image})`,
              height: block.isFlowing ? '100%' : block.percentFilled + '%',
              width: block.isFlowing ? block.percentFilled + '%' : '100%',
            }"
          />
          <div v-if="block.item" class="item">
            {{ block.item ? '🔦' : '' }}
          </div>
          <div class="overlay" :style="{ opacity: 0.97 - block.brightness }" />
        </div>
      </template>
    </div>

    <div class="text-caption text-medium-emphasis mt-2">
      Click on the world to dig or fill a block. Shift-click places or removes a
      torch.
    </div>

    <v-row class="mt-0">
      <v-col cols="1">Lights: {{ stats.torches }}</v-col>
      <v-col cols="2">Water: {{ stats.waterBlocks }}</v-col>
      <v-col cols="2">Changes: {{ changes }}</v-col>
      <v-col cols="2">Blocks Lit: {{ stats.blocksLit }}</v-col>
      <v-col cols="1">FPS: {{ stats.framesPerSecond }}</v-col>
      <v-col cols="2">Frame Time: {{ stats.msPerTick }}</v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { Game } from '~/scripts/game'
import type { Block } from '~/scripts/block'
import { BlockNature } from '~/scripts/blockType'
import { Item } from '~/scripts/item'

// `shallowRef`, so the 1250 blocks stay plain objects. Making them deeply
// reactive costs ~50x per simulation tick (0.17ms -> 8.6ms measured), because
// the game loop touches every block several times per tick and each access
// pays proxy + dependency-tracking overhead.
//
// Instead, rendering is driven by `frame`, bumped once per animation frame and
// read by the template (see :data-frame on .world). That re-runs the render
// effect, which re-reads the raw blocks — so simulation runs at its own rate
// and painting happens at most once per frame.
const game = shallowRef(new Game(50, 25))
const frame = ref(0)
const gameSeed = ref('')
const changes = ref(0)

// The counters below are rendered inside <v-col> slots. Vue only re-invokes a
// child component's slot when a *reactive* dependency read inside it changes,
// and the game instance is deliberately raw — so read them off the game once
// per frame into reactive state rather than binding the raw fields directly.
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

const route = useRoute()
const router = useRouter()

/** The seed lives in the URL; adopt it, or mint one if the address is blank. */
function loadFromUrl() {
  const fromUrl = typeof route.query.seed === 'string' ? route.query.seed : ''
  gameSeed.value = fromUrl || randomSeed()
  if (!fromUrl)
    router.replace({ query: { ...route.query, seed: gameSeed.value } })
  generateWorld()
}

// Back/forward and pasted links change the seed without remounting the page.
watch(
  () => route.query.seed,
  (value) => {
    if (typeof value === 'string' && value && value !== gameSeed.value) {
      gameSeed.value = value
      generateWorld()
    }
  },
)

onMounted(() => {
  loadFromUrl()
  const loop = () => {
    const g = game.value
    stats.torches = g.torches
    stats.waterBlocks = g.waterBlocks
    stats.blocksLit = g.blocksLit
    stats.framesPerSecond = g.framesPerSecond
    stats.msPerTick = g.msPerTick
    frame.value++
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

function randomSeed() {
  return Math.random().toString(36).split('.')[1]!.substring(0, 4)
}

function newKey() {
  gameSeed.value = randomSeed()
  router.push({ query: { ...route.query, seed: gameSeed.value } })
  generateWorld()
}

function generateWorld() {
  game.value.isScrolling = false
  game.value.stop()

  const next = new Game(50, 25)
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

function clickBlock(block: Block, event: MouseEvent) {
  if (event.shiftKey) {
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
</script>

<style scoped>
.block {
  border: 0px solid rgba(50, 50, 10, 0.1);
  margin: 0px;
  display: inline-block;
  width: 20px;
  height: 20px;
  background-color: transparent;
  font-size: 0.55em;
  position: absolute;
  box-sizing: border-box;
}

.world {
  position: relative;
  background-image: url('https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/0be993e7-c7f4-46f2-aab1-46cbf7c572c5/d3kpvx8-b5b3fe3f-ea8c-4fe0-a26f-20ba52385a01.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiJcL2ZcLzBiZTk5M2U3LWM3ZjQtNDZmMi1hYWIxLTQ2Y2JmN2M1NzJjNVwvZDNrcHZ4OC1iNWIzZmUzZi1lYThjLTRmZTAtYTI2Zi0yMGJhNTIzODVhMDEuanBnIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.sFTYZyh8xXS4wEmQ7SeoafcJFdRVL3k2WOHiefPFADQ');
  overflow: auto;
}
.world.scrolling {
  overflow: hidden;
}

.block.static .fill {
  position: absolute;
  bottom: 0px;
  left: 0px;
  width: 100%;
  z-index: 500;
  background-size: cover;
}

.block.flowing .fill {
  position: absolute;
  top: 0px;
  left: 50%;
  right: 50%;
  height: 100%;
  z-index: 500;
  background-size: cover;
}

.block .item {
  top: 0px;
  left: 0px;
  width: 100%;
  height: 100%;
  background-color: transparent;
  z-index: 800;
}

.block .overlay {
  position: absolute;
  top: 0px;
  left: 0px;
  width: 100%;
  height: 100%;
  background-color: #000;
  z-index: 1000;
}
</style>
