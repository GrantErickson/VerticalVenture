<template>
  <v-app>
    <v-app-bar>
      <v-toolbar-title>{{ title }}</v-toolbar-title>
      <v-btn-toggle
        :model-value="route.path"
        density="comfortable"
        divided
        class="mr-4"
      >
        <v-btn to="/" value="/" prepend-icon="mdi-water">Fluid</v-btn>
        <v-btn to="/dom" value="/dom" prepend-icon="mdi-view-grid">DOM</v-btn>
      </v-btn-toggle>
    </v-app-bar>

    <v-main>
      <v-container>
        <slot />
      </v-container>
    </v-main>

    <v-footer app>
      <span>&copy; {{ new Date().getFullYear() }}</span>
    </v-footer>
  </v-app>
</template>

<script setup lang="ts">
const route = useRoute()
const title = 'Vertical Venture'
</script>
