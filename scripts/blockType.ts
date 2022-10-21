import { World } from './world'
import { Block } from './block'

export enum BlockNature {
  empty = 0,
  solid = 1,
  liquid = 2,
}

export abstract class BlockType {
  name: string
  nature: BlockNature
  background: string
  opacity: number

  constructor(
    name: string,
    nature: BlockNature,
    background: string,
    opacity: number = 1
  ) {
    this.name = name
    this.nature = nature
    this.background = background
    this.opacity = opacity
  }

  abstract process(block: Block, world: World): void

  abstract changeType(block: Block, world: World): void
}
