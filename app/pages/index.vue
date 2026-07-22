<template>
  <div>
    <FluidControls
      v-model:seed="seed"
      v-model:drains="drains"
      @new-key="newKey"
      @reset="generateWorld"
      @add-water="addWater"
    />

    <canvas
      ref="canvas"
      class="world"
      :style="{ maxWidth: WORLD_WIDTH * 20 + 'px' }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />

    <div class="text-caption text-medium-emphasis mt-2">
      Click or drag on the world to dig and fill blocks.
    </div>

    <v-row class="mt-0">
      <v-col cols="2">Particles: {{ stats.particles }}</v-col>
      <v-col cols="2">Changes: {{ changes }}</v-col>
      <v-col cols="2">FPS: {{ stats.framesPerSecond }}</v-col>
      <v-col cols="3">Sim Time: {{ stats.msPerStep }} ms</v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { FluidRenderer } from '~/scripts/fluid/fluidRenderer'
import { BlockNature } from '~/scripts/blockType'

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

const {
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
  isSolidBlock,
  paintBlock,
  step,
} = useFluidWorld()

let renderer: FluidRenderer | null = null
let resizeObserver: ResizeObserver | null = null
let rafHandle = 0
let start = 0

function pushTerrain() {
  const world = game.value.world
  renderer?.setBlocks(
    (x, y) => world.getBlock(x, y)?.blockType.nature === BlockNature.solid,
  )
}

// The renderer keeps its own copy of the rock, so it only needs rebuilding when
// the terrain actually changes rather than every frame.
watch(terrainVersion, pushTerrain)

onMounted(() => {
  const element = canvas.value!
  renderer = new FluidRenderer(
    element,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    CELLS_PER_BLOCK,
    fluid.value.maxParticles,
  )

  const fit = () => renderer?.setSize(element.clientWidth, element.clientHeight)
  fit()
  resizeObserver = new ResizeObserver(fit)
  resizeObserver.observe(element)

  newKey()
  pushTerrain()

  const loop = () => {
    if (!start) start = performance.now()
    // A fixed step: if the machine cannot keep up the water runs slow rather
    // than exploding, which is the right way round for a solver like this.
    step(1 / 60)
    renderer?.render(fluid.value, (performance.now() - start) / 1000)
    rafHandle = requestAnimationFrame(loop)
  }
  loop()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafHandle)
  resizeObserver?.disconnect()
  resizeObserver = null
  renderer?.dispose()
  renderer = null
})

// Click paints one block; click and drag paints everything the pointer
// crosses. The block under the first press picks the mode for the whole
// stroke — dig if it was rock, fill if it was open — so a stroke never
// flickers blocks back and forth as it passes over a mix of both.
let painting = false
let paintSolid = false
let lastBlockX = -1
let lastBlockY = -1

function blockAt(event: PointerEvent): { x: number; y: number } | null {
  const element = canvas.value
  if (!element) return null
  const rect = element.getBoundingClientRect()
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * WORLD_WIDTH)
  // Canvas y runs down the screen, the world's y runs up it.
  const fromTop = ((event.clientY - rect.top) / rect.height) * WORLD_HEIGHT
  return { x, y: Math.floor(WORLD_HEIGHT - fromTop) }
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  const cell = blockAt(event)
  if (!cell) return
  const solid = isSolidBlock(cell.x, cell.y)
  if (solid === null) return
  painting = true
  paintSolid = !solid
  canvas.value?.setPointerCapture(event.pointerId)
  paintBlock(cell.x, cell.y, paintSolid)
  lastBlockX = cell.x
  lastBlockY = cell.y
}

function onPointerMove(event: PointerEvent) {
  if (!painting) return
  const cell = blockAt(event)
  if (!cell || (cell.x === lastBlockX && cell.y === lastBlockY)) return
  // Walk the whole segment from the last painted block, so a fast drag
  // paints a continuous stroke instead of a dotted line.
  const steps = Math.max(
    Math.abs(cell.x - lastBlockX),
    Math.abs(cell.y - lastBlockY),
  )
  for (let i = 1; i <= steps; i++) {
    paintBlock(
      Math.round(lastBlockX + ((cell.x - lastBlockX) * i) / steps),
      Math.round(lastBlockY + ((cell.y - lastBlockY) * i) / steps),
      paintSolid,
    )
  }
  lastBlockX = cell.x
  lastBlockY = cell.y
}

function onPointerUp() {
  painting = false
}
</script>

<style scoped>
.world {
  display: block;
  width: 100%;
  aspect-ratio: v-bind('`${WORLD_WIDTH} / ${WORLD_HEIGHT}`');
  border-radius: 2px;
  /* Dragging paints blocks; without this a touch drag scrolls the page. */
  touch-action: none;
}
</style>
