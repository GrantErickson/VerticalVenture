import { Block } from './block'
import { BlockNature, BlockType } from './blockType'
import { World } from './world'

export class EmptyBlockType extends BlockType {
  constructor() {
    super('empty', BlockNature.empty, 'transparent', 0)
  }

  process(block: Block, world: World): void {
    world.removeActiveBlock(block)
  }

  changeType(block: Block, world: World): void {
    block.isFlowing = false
    block.percentFilled = 0
    world.addActiveBlock(block.blockAbove)
    world.addActiveBlock(block.blockLeft)
    world.addActiveBlock(block.blockRight)
  }
}
