<template>
  <v-row class="mt-1">
    <v-col cols="12">
      <v-btn-toggle :model-value="active" density="comfortable" divided>
        <v-btn to="/" value="dom" prepend-icon="mdi-view-grid">DOM</v-btn>
        <v-btn to="/three" value="three" prepend-icon="mdi-cube-outline">
          three.js
        </v-btn>
        <v-btn to="/fluid" value="fluid" prepend-icon="mdi-water">
          fluid
        </v-btn>
      </v-btn-toggle>
      <span class="text-caption text-medium-emphasis ml-4">{{ blurb }}</span>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
defineProps<{
  /** Which page is currently showing. */
  active: 'dom' | 'three' | 'fluid'
  blurb: string
}>()
</script>
