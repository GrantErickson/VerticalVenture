<template>
  <v-row class="mt-2">
    <v-col cols="1">Lights: {{ stats.torches }}</v-col>
    <v-col cols="2">Water: {{ stats.waterBlocks }}</v-col>
    <v-col cols="2">Changes: {{ changes }}</v-col>
    <v-col cols="2">Blocks Lit: {{ stats.blocksLit }}</v-col>
    <v-col cols="1">FPS: {{ stats.framesPerSecond }}</v-col>
    <v-col cols="2">Frame Time: {{ stats.msPerTick }}</v-col>
  </v-row>
</template>

<script setup lang="ts">
defineProps<{
  stats: {
    torches: number
    waterBlocks: number
    blocksLit: number
    framesPerSecond: number
    msPerTick: number
  }
  changes: number
}>()
</script>
