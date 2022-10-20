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
            <span
              class="block"
              v-for="block in row"
              v-bind:key="block.key"
              v-bind:style="{
                backgroundColor: block.blockType.background,
                borderColor: block.isActive ? 'red' : 'black',
                top: game.heightInPx - block.y * 20 + 'px',
                left: block.x * 20 + 'px',
              }"
              @click="clickBlock(block)"
              >{{ Math.round(block.percentFilled) }}
            </span>
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
    console.log(this.game.world.width)
    console.log(this.game.world.height)
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
    } else if (block.blockType.name == 'rock') {
      block.blockType = this.game.world.blockTypes.get('empty')!
      block.percentFilled = 0
    } else if (block.blockType.name == 'empty') {
      block.blockType = this.game.world.blockTypes.get('rock')!
      block.percentFilled = 100
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
  border: 1px solid black;
  margin: 0px;
  display: inline-block;
  width: 20px;
  height: 20px;
  background-color: #000;
  border-color: white;
  font-size: 0.55em;
  position: absolute;
}
.world {
  top: 100px;
  position: relative;
}
</style>
