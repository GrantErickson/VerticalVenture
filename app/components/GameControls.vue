<template>
  <div>
    <v-row align="center">
      <v-col cols="2">
        <v-text-field
          v-model="seed"
          label="Seed"
          append-icon="mdi-refresh"
          hide-details
          @click:append="$emit('newKey')"
        />
      </v-col>
      <v-col cols="1">
        <v-btn @click="$emit('reset')">Reset</v-btn>
      </v-col>
      <v-col cols="2">
        <v-btn @click="$emit('addWater')">Add Water</v-btn>
      </v-col>
      <v-col cols="2">
        <v-switch v-model="drains" label="Drain" hide-details />
      </v-col>
      <v-col cols="3">
        <v-switch
          v-model="dark"
          label="Dark (shift-click to add lights)"
          hide-details
        />
      </v-col>
      <v-col cols="2">
        <v-switch v-model="scrolling" label="Scroll" hide-details />
      </v-col>
    </v-row>

    <v-row class="mt-1">
      <v-col cols="12">
        <v-btn-toggle :model-value="active" density="comfortable" divided>
          <v-btn to="/" value="dom" prepend-icon="mdi-view-grid">DOM</v-btn>
          <v-btn to="/three" value="three" prepend-icon="mdi-cube-outline">
            three.js
          </v-btn>
        </v-btn-toggle>
        <span class="text-caption text-medium-emphasis ml-4">{{ blurb }}</span>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** Which renderer page is currently showing. */
  active: 'dom' | 'three'
  blurb: string
}>()

defineEmits<{
  newKey: []
  reset: []
  addWater: []
}>()

const seed = defineModel<string>('seed', { required: true })
const drains = defineModel<boolean>('drains', { required: true })
const dark = defineModel<boolean>('dark', { required: true })
const scrolling = defineModel<boolean>('scrolling', { required: true })
</script>
