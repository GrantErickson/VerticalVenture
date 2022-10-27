<template>
  <div>
    <v-row>
      <v-col cols="2"
        ><v-text-field
          v-model="gameSeed"
          label="Seed"
          append-icon="mdi-refresh"
          @click:append="newKey"
        ></v-text-field>
      </v-col>
      <v-col cols="1" class="pt-6"
        ><v-btn @click="generateWorld">Reset</v-btn></v-col
      >
      <v-col cols="2" class="pt-6"
        ><v-btn @click="addLotsOfWater">Add Water</v-btn></v-col
      >
      <v-col cols="2"
        ><v-switch v-model="game.drains" label="Drain"></v-switch
      ></v-col>
      <v-col cols="3"
        ><v-switch
          v-model="game.dark"
          label="Dark (shift-click to add lights)"
        ></v-switch
      ></v-col>
      <v-col cols="2"
        ><v-switch v-model="game.isScrolling" label="Scroll"></v-switch
      ></v-col>
    </v-row>
    <div class="world">
      <template v-for="row in game.world.blocks">
        <div
          class="block"
          v-for="block in row"
          v-bind:key="block.key"
          :id="block.key"
          @click="clickBlock(block, $event)"
          @mouseover="hoverBlock(block)"
          @mouseleave="leaveBlock(block)"
          v-bind:class="{
            flowing: block.isFlowing,
            static: !block.isFlowing,
          }"
          v-bind:style="{
            top:
              game.heightInPx - (block.y + 1) * 20 - game.scrollOffset + 'px',
            left: block.x * 20 + 'px',
          }"
        >
          <div
            class="fill"
            v-bind:style="{
              background: block.blockType.background,
              backgroundImage: `url(/${block.blockType.image})`,
              height: block.isFlowing ? '100%' : block.percentFilled + '%',
              width: block.isFlowing ? block.percentFilled + '%' : '100%',
            }"
          ></div>
          <div v-if="block.item" class="item">
            {{ block.item ? '🔦' : '' }}
          </div>
          <div
            class="overlay"
            v-bind:style="{ opacity: 0.97 - block.brightness }"
          ></div>
        </div>
      </template>
    </div>
    <v-row class="mt-2">
      <v-col cols="1">Lights: {{ game.torches }}</v-col
      ><v-col cols="2"> Water: {{ game.waterBlocks }}</v-col>
      <v-col cols="2">Changes: {{ changes }}</v-col
      ><v-col cols="2"> Blocks Lit: {{ game.blocksLit }}</v-col>
      <v-col cols="1">FPS: {{ game.framesPerSecond }} </v-col
      ><v-col cols="2">Frame Time: {{ game.msPerTick }} </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Game } from '@/scripts/game'
import { Block } from '@/scripts/block'
import Vue from 'vue'
import Component from 'vue-class-component'
import { BlockNature } from '~/scripts/blockType'
import { Item } from '~/scripts/item'

@Component({})
export default class GamePage extends Vue {
  game = new Game(50, 25)
  gameSeed: string = ''
  changes: number = 0

  mounted() {
    this.newKey()
  }

  newKey() {
    this.gameSeed = Math.random().toString(36).split('.')[1].substring(0, 4)
    this.generateWorld()
    this.game.start()
  }

  addLotsOfWater() {
    for (let x = 0; x < this.game.world.width; x++) {
      let block = this.game.world.getBlock(x, this.game.world.height - 1)!
      if (block.blockType.nature == BlockNature.empty)
        block.blockType = this.game.world.getBlockType('water')
    }
  }

  hoverBlock(block: Block | null) {
    if (block) {
      this.game.world.addLight(block)
    }
  }
  leaveBlock(block: Block | null) {
    if (block && !block.item?.luminosity) {
      this.game.world.removeLight(block)
    }
  }

  generateWorld() {
    this.game.stop()
    this.game = new Game(50, 25)
    this.game.createRandomWorld(this.gameSeed)
    this.game.start()
    this.changes = 0
  }
  clickBlock(block: Block, event: MouseEvent) {
    if (event.shiftKey) {
      if (block.item) {
        block.item = null
      } else {
        block.item = new Item('torch', 1, 'Torch')
        this.game.world.processLighting()
      }
    } else {
      if (block.blockType.name == 'water') {
        block.blockType = this.game.world.getBlockType('rock')
        block.percentFilled = 100
        block.isFlowing = false
      } else if (block.blockType.name == 'rock') {
        block.blockType = this.game.world.getBlockType('empty')
        block.percentFilled = 0
      } else if (block.blockType.name == 'empty') {
        block.blockType = this.game.world.getBlockType('rock')
        block.percentFilled = 100
        block.isFlowing = false
      }
      this.changes++
      this.game.world.addActiveBlock(block)
      this.game.world.addActiveBlock(block.blockBelow)
      this.game.world.addActiveBlock(block.blockLeft)
      this.game.world.addActiveBlock(block.blockRight)
      this.game.world.addActiveBlock(block.blockAbove)
    }
  }
}
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
  width: 1000px;
  height: 480px;
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
