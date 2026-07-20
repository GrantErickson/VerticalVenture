import { BlockType, BlockNature } from './blockType'
import { World } from './world'
import { Block } from './block'

export class LiquidBlockType extends BlockType {
  constructor(name: string, background: string) {
    super(name, BlockNature.liquid, background, null, 0.1)
  }

  process(block: Block, world: World): void {
    // Liquid does not flow block by block any more — WaterProcessor settles the
    // whole world in one pass per tick, working on connected bodies. Nothing
    // here needs waking up, so drop straight back out of the active list.
    world.removeActiveBlock(block)
  }

  changeType(block: Block, _world: World): void {
    block.isFlowing = false
    if (block.percentFilled == 0) {
      block.percentFilled = 100
    }
  }
}
