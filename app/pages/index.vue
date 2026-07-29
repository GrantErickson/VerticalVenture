<template>
  <div>
    <FluidControls
      v-model:drains="drains"
      v-model:dark="dark"
      v-model:scrolling="scrolling"
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
      Click or drag on the world to dig and fill blocks. Shift-click places or
      removes a torch.
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
  drains,
  dark,
  scrolling,
  advanceScroll,
  scrollCells,
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
} = useFluidWorld()

let renderer: FluidRenderer | null = null
let resizeObserver: ResizeObserver | null = null
let rafHandle = 0
let start = 0
let previousFrame = 0
let owed = 0

// A fixed step: if the machine cannot keep up the water runs slow rather than
// exploding, which is the right way round for a solver like this. Real elapsed
// time is banked and spent a whole step at a time, at most one step a frame.
//
// The bank is what stops the water running at double time on a 120Hz screen.
// The one-step ceiling is what keeps the old bargain: a machine that cannot
// manage 60 steps a second simply gets slow water, and never a frame asked to
// do two steps' work because the last one ran long.
const FIXED_STEP = 1 / 60
/** Never bank more than a step's worth of arrears; the rest is written off. */
const MAX_OWED = 2 * FIXED_STEP
/** A backgrounded tab comes back with minutes owed. None of it gets simulated. */
const MAX_FRAME_SECONDS = 0.25

function pushTerrain() {
  const world = game.value.world
  renderer?.setBlocks(
    (x, y) => world.getBlock(x, y)?.blockType.nature === BlockNature.solid,
    (x, y) => world.getBlock(x, y)?.item != null,
  )
}

function pushLight() {
  const world = game.value.world
  renderer?.setLight(
    (x, y) => world.getBlock(x, y)?.brightness ?? 0,
    dark.value,
  )
}

// The renderer keeps its own copies of the rock and the lighting, so they only
// need rebuilding when something actually changes rather than every frame.
watch(terrainVersion, pushTerrain)
watch(lightVersion, pushLight)

onMounted(() => {
  const element = canvas.value!
  renderer = new FluidRenderer(
    element,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    fluid.value.maxParticles,
  )

  const fit = () => renderer?.setSize(element.clientWidth, element.clientHeight)
  fit()
  resizeObserver = new ResizeObserver(fit)
  resizeObserver.observe(element)

  loadFromUrl()
  pushTerrain()
  pushLight()

  const loop = (now: number) => {
    if (!start) {
      start = now
      previousFrame = now
    }
    const elapsed = Math.min((now - previousFrame) / 1000, MAX_FRAME_SECONDS)
    previousFrame = now

    // The scroll rides the wall clock, so the world glides at the same speed
    // however long the frame that draws it took. The solver behind it can fall
    // behind without that showing up as a stutter.
    advanceScroll(elapsed)

    owed = Math.min(owed + elapsed, MAX_OWED)
    if (owed >= FIXED_STEP) {
      step(FIXED_STEP)
      owed -= FIXED_STEP
    }

    renderer?.render(fluid.value, (now - start) / 1000, scrollCells())
    rafHandle = requestAnimationFrame(loop)
  }
  rafHandle = requestAnimationFrame(loop)
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
  if (event.shiftKey) {
    toggleTorch(cell.x, cell.y)
    return
  }
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
