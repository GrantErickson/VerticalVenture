import { BlockType, BlockNature } from './blockType'
import { World } from './world'
import { Block } from './block'

export class LiquidBlockType extends BlockType {
  amountToFlow: number = 10

  constructor(name: string, background: string) {
    super(name, BlockNature.liquid, background)
  }

  process(block: Block, world: World): void {
    // Check to see if anything can flow down. If so, flow down.
    let hasChanged = false
    let blockBelow = block.blockBelow(world)
    if (block.percentFilled > 0) {
      if (
        blockBelow &&
        blockBelow.blockType.nature !== BlockNature.solid &&
        blockBelow.percentFilled < 100
      ) {
        // Flow a bit down to the lower block.
        block.percentFilled -= this.amountToFlow
        // TODO: Handle when it is another type of liquid
        blockBelow.blockType = block.blockType
        blockBelow.percentFilled += this.amountToFlow
        blockBelow.flowDirection = 0
        world.addActiveBlock(blockBelow)
        hasChanged = true
      } else {
        // Check to see if anything can flow left or right
        let blocks = []
        // Randomize the order in which this happens.
        let leftBlock = block.blockLeft(world)
        let rightBlock = block.blockRight(world)
        if (block.flowDirection == -1) {
          blocks.push(leftBlock)
          //blocks.push(rightBlock)
        } else if (block.flowDirection == 1) {
          blocks.push(rightBlock)
          //blocks.push(leftBlock)
        } else if (Math.random() > 0.5) {
          blocks.push(leftBlock)
          blocks.push(rightBlock)
        } else {
          blocks.push(rightBlock)
          blocks.push(leftBlock)
        }

        for (let sideBlock of blocks) {
          if (sideBlock) {
            if (
              sideBlock.blockType.nature !== BlockNature.solid &&
              sideBlock.percentFilled < block.percentFilled
            ) {
              // Flow a bit to the block.
              block.percentFilled -= this.amountToFlow
              sideBlock.percentFilled += this.amountToFlow
              // TODO: Handle when it is another type of liquid
              sideBlock.blockType = block.blockType
              if (sideBlock == leftBlock) sideBlock.flowDirection = -1
              else sideBlock.flowDirection = 1
              world.addActiveBlock(sideBlock)
              hasChanged = true
            }
            if (
              sideBlock.blockType.nature !== BlockNature.solid &&
              sideBlock.percentFilled > block.percentFilled
            ) {
              world.addActiveBlock(sideBlock)
            }
            world.addActiveBlock(block.blockAbove(world)!)
          }
        }
      }
      if (block.percentFilled == 0) {
        block.blockType = world.blockTypes.get('empty')!
        block.flowDirection = 0
        world.removeActiveBlock(block)
      }
    }
    if (!hasChanged) {
      // If nothing has changed, then we are done.
      world.removeActiveBlock(block)
      block.flowDirection = 0
    }
  }
}
