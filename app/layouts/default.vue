<template>
  <v-app>
    <v-app-bar>
      <v-toolbar-title>{{ title }}</v-toolbar-title>
      <!-- Switching sims keeps the query string, so the seed in the URL
           carries over and both pages show the same cave system. -->
      <v-btn-toggle
        :model-value="route.path"
        density="comfortable"
        divided
        class="mr-4"
      >
        <v-btn
          :to="{ path: '/', query: route.query }"
          value="/"
          prepend-icon="mdi-water"
        >
          Fluid
        </v-btn>
        <v-btn
          :to="{ path: '/dom', query: route.query }"
          value="/dom"
          prepend-icon="mdi-view-grid"
        >
          DOM
        </v-btn>
      </v-btn-toggle>
      <v-btn
        icon
        variant="text"
        href="https://github.com/GrantErickson/VerticalVenture"
        target="_blank"
        rel="noopener"
        aria-label="Source on GitHub"
        class="mr-2"
      >
        <v-icon>mdi-github</v-icon>
        <v-tooltip activator="parent" location="bottom">
          Source on GitHub
        </v-tooltip>
      </v-btn>
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
