import { Block } from './block'
import { BlockNature, BlockType } from './blockType'
import { World } from './world'

export class EmptyBlockType extends BlockType {
  constructor() {
    super('empty', BlockNature.empty, 'transparent')
  }

  process(block: Block, world: World): void {
    world.removeActiveBlock(block)
  }
}
