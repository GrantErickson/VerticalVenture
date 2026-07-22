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
      <v-col cols="1">
        <FluidSettings />
      </v-col>
      <v-col cols="4">
        <span class="text-caption text-medium-emphasis">
          Click to dig or fill a block.
        </span>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  newKey: []
  reset: []
  addWater: []
}>()

const seed = defineModel<string>('seed', { required: true })
const drains = defineModel<boolean>('drains', { required: true })
</script>
