<template>
  <div>
    <GameControls
      v-model:seed="gameSeed"
      v-model:drains="drains"
      v-model:dark="dark"
      v-model:scrolling="scrolling"
      active="dom"
      blurb="DOM renderer — one absolutely positioned div per block."
      @new-key="newKey"
      @reset="generateWorld"
      @add-water="addLotsOfWater"
    />

    <div
      class="world"
      :data-frame="frame"
      :class="{ scrolling: scrolling }"
      :style="{
        width: game.width * game.blockSize + 'px',
        height: (game.height - (scrolling ? 1 : 0)) * game.blockSize + 'px',
      }"
    >
      <template v-for="(row, rowIndex) in game.world.blocks" :key="rowIndex">
        <div
          v-for="block in row"
          :id="block.key"
          :key="block.key"
          class="block"
          :class="{
            flowing: block.isFlowing,
            static: !block.isFlowing,
          }"
          :style="{
            top:
              game.heightInPx - (block.y + 1) * 20 - game.scrollOffset + 'px',
            left: block.x * 20 + 'px',
          }"
          @click="clickBlock(block, $event.shiftKey)"
          @mouseover="hoverBlock(block)"
          @mouseleave="leaveBlock(block)"
        >
          <div
            class="fill"
            :style="{
              background: block.blockType.background,
              backgroundImage: `url(/${block.blockType.image})`,
              height: block.isFlowing ? '100%' : block.percentFilled + '%',
              width: block.isFlowing ? block.percentFilled + '%' : '100%',
            }"
          />
          <div v-if="block.item" class="item">
            {{ block.item ? '🔦' : '' }}
          </div>
          <div class="overlay" :style="{ opacity: 0.97 - block.brightness }" />
        </div>
      </template>
    </div>

    <GameStats :stats="stats" :changes="changes" />
  </div>
</template>

<script setup lang="ts">
const {
  game,
  frame,
  stats,
  gameSeed,
  changes,
  drains,
  dark,
  scrolling,
  newKey,
  generateWorld,
  addLotsOfWater,
  hoverBlock,
  leaveBlock,
  clickBlock,
} = useGame()
</script>

<style scoped>
.block {
  border: 0px solid rgba(50, 50, 10, 0.1);
  margin: 0px;
  display: inline-block;
  width: 20px;
  height: 20px;
  background-color: transparent;
  font-size: 0.55em;
  position: absolute;
  box-sizing: border-box;
}

.world {
  position: relative;
  background-image: url('https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/0be993e7-c7f4-46f2-aab1-46cbf7c572c5/d3kpvx8-b5b3fe3f-ea8c-4fe0-a26f-20ba52385a01.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiJcL2ZcLzBiZTk5M2U3LWM3ZjQtNDZmMi1hYWIxLTQ2Y2JmN2M1NzJjNVwvZDNrcHZ4OC1iNWIzZmUzZi1lYThjLTRmZTAtYTI2Zi0yMGJhNTIzODVhMDEuanBnIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.sFTYZyh8xXS4wEmQ7SeoafcJFdRVL3k2WOHiefPFADQ');
  overflow: auto;
}
.world.scrolling {
  overflow: hidden;
}

.block.static .fill {
  position: absolute;
  bottom: 0px;
  left: 0px;
  width: 100%;
  z-index: 500;
  background-size: cover;
}

.block.flowing .fill {
  position: absolute;
  top: 0px;
  left: 50%;
  right: 50%;
  height: 100%;
  z-index: 500;
  background-size: cover;
}

.block .item {
  top: 0px;
  left: 0px;
  width: 100%;
  height: 100%;
  background-color: transparent;
  z-index: 800;
}

.block .overlay {
  position: absolute;
  top: 0px;
  left: 0px;
  width: 100%;
  height: 100%;
  background-color: #000;
  z-index: 1000;
}
</style>
