<template>
  <div>
    <v-row align="center">
      <v-col cols="auto">
        <v-btn
          icon
          variant="text"
          aria-label="New world"
          @click="$emit('newKey')"
        >
          <v-icon>mdi-refresh</v-icon>
          <v-tooltip activator="parent" location="bottom">
            New world — a fresh seed goes into the URL, so the address bar is
            always shareable
          </v-tooltip>
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <v-btn @click="$emit('reset')">
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

const drains = defineModel<boolean>('drains', { required: true })
</script>
