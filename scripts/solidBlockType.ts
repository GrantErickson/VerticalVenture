import { BlockType, BlockNature } from './blockType'
import { World } from './world'
import { Block } from './block'

export class SolidBlockType extends BlockType {
  amountToFlow: number = 10

  constructor(name: string, background: string) {
    super(name, BlockNature.solid, background)
  }

  process(block: Block, world: World): void {
    // Solid blocks don't do anything. They are just there.
    world.removeActiveBlock(block)
  }
}
