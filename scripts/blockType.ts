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
  image: string | null
  opacity: number

  constructor(
    name: string,
    nature: BlockNature,
    background: string,
    image: string | null,
    opacity: number
  ) {
    this.name = name
    this.nature = nature
    this.background = background
    this.image = image
    this.opacity = opacity
  }

  abstract process(block: Block, world: World): void

  abstract changeType(block: Block, world: World): void
}
