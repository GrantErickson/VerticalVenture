<template>
  <div>
    <v-row>
      <v-col class="text-center"> The Game </v-col>
      <v-col><v-btn @click="addWater">Water</v-btn></v-col>
      <v-col><v-btn @click="addRock">Rock</v-btn></v-col>
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
              <!-- {{ Math.round(block.percentFilled) }} -->
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

@Component({})
export default class GamePage extends Vue {
  game = new Game(50, 25)

  mounted() {
    this.game.start()
  }

  addWater() {
    let block = this.game.world.getBlock(5, 20)!
    block.blockType = this.game.world.blockTypes.get('water')!
    block.percentFilled = 100
    this.game.world.addActiveBlock(block)
  }
  addRock() {
    let block = this.game.world.getBlock(5, 19)!
    block.blockType = this.game.world.blockTypes.get('rock')!
    block.percentFilled = 100
  }
  clickBlock(block: Block) {
    if (block.blockType.name == 'water') {
      block.blockType = this.game.world.blockTypes.get('rock')!
      block.percentFilled = 100
      block.isFlowing = false
    } else if (block.blockType.name == 'rock') {
      block.blockType = this.game.world.blockTypes.get('empty')!
      block.percentFilled = 0
    } else if (block.blockType.name == 'empty') {
      block.blockType = this.game.world.blockTypes.get('rock')!
      block.percentFilled = 100
      block.isFlowing = false
    }
    this.game.world.addActiveBlock(block)
    this.game.world.addActiveBlock(block.blockBelow(this.game.world)!)
    this.game.world.addActiveBlock(block.blockLeft(this.game.world)!)
    this.game.world.addActiveBlock(block.blockRight(this.game.world)!)
    this.game.world.addActiveBlock(block.blockAbove(this.game.world)!)
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
