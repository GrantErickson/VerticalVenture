<template>
  <v-menu :close-on-content-click="false" location="bottom end">
    <template #activator="{ props: activator }">
      <v-btn
        v-bind="activator"
        icon="mdi-cog"
        variant="text"
        aria-label="Simulation settings"
      />
    </template>

    <v-card min-width="360">
      <v-card-title class="text-subtitle-1">Water simulation</v-card-title>
      <v-card-text>
        <v-select
          v-model="settings.particlesPerAxis"
          :items="fineness"
          label="Particle fineness"
          density="compact"
          hint="The main cost dial. Changing it rebuilds the world."
          persistent-hint
          class="mb-3"
        />
        <v-slider
          v-model="settings.pressureIterations"
          label="Pressure sweeps"
          :min="10"
          :max="50"
          :step="5"
          density="compact"
          thumb-label
          hide-details
        />
        <v-slider
          v-model="settings.separationIterations"
          label="Separation passes"
          :min="0"
          :max="3"
          :step="1"
          density="compact"
          thumb-label
          hide-details
        />
        <v-slider
          v-model="settings.flipRatio"
          label="Liveliness"
          :min="0.8"
          :max="0.99"
          :step="0.01"
          density="compact"
          thumb-label
          hide-details
        />
        <v-slider
          v-model="settings.viscosity"
          label="Viscosity"
          :min="0"
          :max="0.12"
          :step="0.01"
          density="compact"
          thumb-label
          hide-details
        />
      </v-card-text>
      <v-card-actions>
        <span class="text-caption text-medium-emphasis ml-2">
          Saved on this device.
        </span>
        <v-spacer />
        <v-btn @click="reset()">Defaults</v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
const { settings, reset } = useFluidSettings()

const fineness = [
  { title: 'Coarse — 4 per cell', value: 2 },
  { title: 'Medium — 9 per cell', value: 3 },
  { title: 'Fine — 16 per cell', value: 4 },
]
</script>
