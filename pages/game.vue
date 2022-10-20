<template>
  <div>
    <v-row>
      <v-col class="text-center"> The Game </v-col>
      <v-col><v-btn @click="addWater">Water</v-btn></v-col>
      <v-col><v-btn @click="addLotsOfWater">Lots of Water</v-btn></v-col>
      <v-col><v-btn @click="generateWorld">Generate</v-btn></v-col>
      <v-col cols="3"
        ><v-switch v-model="game.drains" label="Drain"></v-switch
      ></v-col>
    </v-row>
    <v-row>
      <v-col>
        <div class="world">
          <template v-for="row in game.world.blocks">
            <div
              class="block"
              v-for="block in row"
              v-bind:key="block.key"
              v-bind:class="{
                flowing: block.isFlowing,
                static: !block.isFlowing,
              }"
              v-bind:style="{
                borderWidth: block.isActive ? '1px' : '0px',
                top: game.heightInPx - block.y * 20 + 'px',
                left: block.x * 20 + 'px',
              }"
              @click="clickBlock(block)"
            >
              <!-- {{ block.blockType.name }} -->
              <div
                class="fill"
                v-bind:style="{
                  backgroundColor: block.blockType.background,
                  height: block.isFlowing ? '100%' : block.percentFilled + '%',
                  width: block.isFlowing ? block.percentFilled + '%' : '100%',
                }"
              ></div>
              <div class="overlay"></div>
            </div>
          </template>
        </div>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Game } from '@/scripts/game'
import { Block } from '@/scripts/block'
import Vue from 'vue'
import Component from 'vue-class-component'
import { BlockNature } from '~/scripts/blockType'

@Component({})
export default class GamePage extends Vue {
  game = new Game(50, 25)

  mounted() {
    this.game.start()
  }

  addWater() {
    let block = this.game.world.getBlock(5, 20)!
    block.blockType = this.game.world.getBlockType('water')
    block.percentFilled = 100
    this.game.world.addActiveBlock(block)
  }

  addLotsOfWater() {
    for (let x = 0; x < this.game.world.width; x++) {
      let block = this.game.world.getBlock(x, this.game.world.height - 1)!
      if (block.blockType.nature == BlockNature.empty)
        block.blockType = this.game.world.getBlockType('water')
    }
  }
  generateWorld() {
    this.game.stop()
    this.game = new Game(50, 25)
    this.game.createRandomWorld()
    this.game.start()
  }
  clickBlock(block: Block) {
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
    this.game.world.addActiveBlock(block)
    this.game.world.addActiveBlock(block.blockBelow)
    this.game.world.addActiveBlock(block.blockLeft)
    this.game.world.addActiveBlock(block.blockRight)
    this.game.world.addActiveBlock(block.blockAbove)
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
  background-color: #000;
  font-size: 0.55em;
  position: absolute;
  box-sizing: border-box;
}

.world {
  top: 100px;
  position: relative;
}

.block.static .fill {
  position: absolute;
  bottom: 0px;
  left: 0px;
  width: 100%;
}

.block.flowing .fill {
  position: absolute;
  top: 0px;
  left: 50%;
  right: 50%;
  height: 100%;
}
</style>
