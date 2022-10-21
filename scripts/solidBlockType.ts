import { BlockType, BlockNature } from './blockType'
import { World } from './world'
import { Block } from './block'

export class SolidBlockType extends BlockType {
  constructor(name: string, background: string) {
    super(name, BlockNature.solid, background, 0.8)
  }

  process(block: Block, world: World): void {
    // Solid blocks don't do anything. They are just there.
    world.removeActiveBlock(block)
  }

  changeType(block: Block, world: World): void {
    block.isFlowing = false
    block.percentFilled = 100
  }
}
