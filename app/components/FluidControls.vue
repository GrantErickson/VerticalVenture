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
      <v-col cols="auto">
        <v-btn
          icon
          variant="text"
          aria-label="Add water"
          @click="$emit('addWater')"
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
        <FluidSettings />
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
