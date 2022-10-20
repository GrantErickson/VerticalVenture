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

  constructor(name: string, nature: BlockNature, background: string) {
    this.name = name
    this.nature = nature
    this.background = background
  }

  abstract process(block: Block, world: World): void

  abstract changeType(block: Block, world: World): void
}
