<template>
  <div>
    <GameControls
      v-model:seed="gameSeed"
      v-model:drains="drains"
      v-model:dark="dark"
      v-model:scrolling="scrolling"
      active="three"
      blurb="Shader renderer — one quad, world uploaded as a data texture."
      @new-key="newKey"
      @reset="generateWorld"
      @add-water="addLotsOfWater"
    />

    <canvas
      ref="canvas"
      class="world"
      :style="{ maxWidth: WORLD_WIDTH * game.blockSize + 'px' }"
      @click="onClick"
      @mousemove="onMove"
      @mouseleave="onLeave"
    />

    <GameStats :stats="stats" :changes="changes" />
  </div>
</template>

<script setup lang="ts">
import { WaterRenderer } from '~/scripts/waterRenderer'
import type { Block } from '~/scripts/block'

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

let renderer: WaterRenderer | null = null
let start = 0

const {
  game,
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
} = useGame((g) => {
  if (!renderer) return
  if (!start) start = performance.now()
  renderer.render(g, (performance.now() - start) / 1000)
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = canvas.value!
  renderer = new WaterRenderer(el, WORLD_WIDTH, WORLD_HEIGHT)

  // The canvas is fluid (CSS aspect-ratio keeps the world's proportions), so
  // track its rendered size rather than assuming the full 1000x500.
  const fit = () => renderer?.setSize(el.clientWidth, el.clientHeight)
  fit()
  resizeObserver = new ResizeObserver(fit)
  resizeObserver.observe(el)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  renderer?.dispose()
  renderer = null
})

/** Canvas pixel position -> the block under the cursor. */
function blockAt(event: MouseEvent): Block | null {
  const el = canvas.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * WORLD_WIDTH)
  // Canvas y runs downward, the world's y runs upward. Subtract the scroll for
  // the same reason the shader does — keep this in step with it.
  const fromTop = ((event.clientY - rect.top) / rect.height) * WORLD_HEIGHT
  const y = Math.floor(
    WORLD_HEIGHT - fromTop - game.value.scrollOffset / game.value.blockSize,
  )
  return game.value.world.getBlock(x, y)
}

let hovered: Block | null = null

function onMove(event: MouseEvent) {
  const block = blockAt(event)
  if (block === hovered) return
  leaveBlock(hovered)
  hovered = block
  hoverBlock(block)
}

function onLeave() {
  leaveBlock(hovered)
  hovered = null
}

function onClick(event: MouseEvent) {
  const block = blockAt(event)
  if (block) clickBlock(block, event.shiftKey)
}
</script>

<style scoped>
.world {
  display: block;
  width: 100%;
  aspect-ratio: v-bind('`${WORLD_WIDTH} / ${WORLD_HEIGHT}`');
  border-radius: 2px;
}
</style>
