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
      @click="onClick"
    />

    <v-row class="mt-2">
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
  toggleBlock,
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

function onClick(event: MouseEvent) {
  const element = canvas.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * WORLD_WIDTH)
  // Canvas y runs down the screen, the world's y runs up it.
  const fromTop = ((event.clientY - rect.top) / rect.height) * WORLD_HEIGHT
  toggleBlock(x, Math.floor(WORLD_HEIGHT - fromTop))
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
