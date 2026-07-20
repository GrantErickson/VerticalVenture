<template>
  <v-app>
    <v-navigation-drawer v-model="drawer" :rail="miniVariant">
      <v-list nav>
        <v-list-item
          v-for="(item, i) in items"
          :key="i"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          exact
        />
      </v-list>
    </v-navigation-drawer>

    <v-app-bar>
      <v-app-bar-nav-icon @click.stop="drawer = !drawer" />
      <v-btn
        icon="mdi-chevron-left"
        :class="{ 'flip-x': miniVariant }"
        @click.stop="miniVariant = !miniVariant"
      />
      <v-toolbar-title>{{ title }}</v-toolbar-title>
      <v-spacer />
      <v-btn icon="mdi-menu" @click.stop="rightDrawer = !rightDrawer" />
    </v-app-bar>

    <v-main>
      <v-container>
        <slot />
      </v-container>
    </v-main>

    <v-navigation-drawer v-model="rightDrawer" location="right" temporary>
      <v-list nav>
        <v-list-item
          prepend-icon="mdi-repeat"
          title="Close"
          @click="rightDrawer = false"
        />
      </v-list>
    </v-navigation-drawer>

    <v-footer app>
      <span>&copy; {{ new Date().getFullYear() }}</span>
    </v-footer>
  </v-app>
</template>

<script setup lang="ts">
const drawer = ref(false)
const rightDrawer = ref(false)
const miniVariant = ref(false)
const title = 'Vertical Venture'

const items = [
  { icon: 'mdi-view-grid', title: 'DOM renderer', to: '/' },
  { icon: 'mdi-cube-outline', title: 'three.js renderer', to: '/three' },
]
</script>

<style scoped>
.flip-x {
  transform: scaleX(-1);
}
</style>
