import { BlockType, BlockNature } from './blockType'
import { World } from './world'
import { Block } from './block'

export class LiquidBlockType extends BlockType {
  percentToFlowDown: number = 50
  amountToEvaporate: number = 0.5

  constructor(name: string, background: string) {
    super(name, BlockNature.liquid, background)
  }

  process(block: Block, world: World): void {
    // Check to see if anything can flow down. If so, flow down.
    let hasChanged = false
    if (block.percentFilled > 0) {
      let blockBelow = block.blockBelow(world)
      let blockBelowFilled = false
      if (
        blockBelow &&
        blockBelow.blockType.nature !== BlockNature.solid &&
        blockBelow.percentFilled < 100
      ) {
        // Flow some down to the lower block.
        let amountToFlow = block.percentFilled * (this.percentToFlowDown / 100)
        if (amountToFlow < this.amountToEvaporate) {
          // Empty the block
          amountToFlow = block.percentFilled
        }
        // See if this fills the lower block
        if (blockBelow.percentFilled + amountToFlow >= 100) {
          amountToFlow = 100 - blockBelow.percentFilled
          blockBelowFilled = true
        }
        block.percentFilled -= amountToFlow
        blockBelow.percentFilled += amountToFlow

        // TODO: Handle when it is another type of liquid
        blockBelow.blockType = block.blockType
        world.addActiveBlock(blockBelow)
        hasChanged = true
      } else {
        blockBelowFilled = true
      }
      if (blockBelowFilled) {
        // Average the amount of liquid to the left and right.
        let leftBlock = block.blockLeft(world)
        let rightBlock = block.blockRight(world)
        let total = block.percentFilled
        let blockCount = 1
        // Add up the totals for the left and right blocks so we can average them.
        if (leftBlock && leftBlock.blockType.nature !== BlockNature.solid) {
          total += leftBlock.percentFilled
          blockCount++
        } else {
          leftBlock = null
        }
        if (rightBlock && rightBlock.blockType.nature !== BlockNature.solid) {
          total += rightBlock.percentFilled
          blockCount++
        } else {
          rightBlock = null
        }

        let average = total / blockCount
        // Make sure this is worth flowing
        if (Math.abs(average - block.percentFilled) > this.amountToEvaporate) {
          if (leftBlock) {
            leftBlock.percentFilled = average
            world.addActiveBlock(leftBlock)
            leftBlock.blockType = block.blockType
          }
          if (rightBlock) {
            rightBlock.percentFilled = average
            world.addActiveBlock(rightBlock)
            rightBlock.blockType = block.blockType
          }
          block.percentFilled = average
          hasChanged = true
        }
      }
      if (block.percentFilled == 0) {
        block.blockType = world.blockTypes.get('empty')!
        world.removeActiveBlock(block)
      }
    }
    if (!hasChanged) {
      // If nothing has changed, then we are done.
      world.removeActiveBlock(block)
    } else {
      world.addActiveBlock(block.blockAbove(world)!)
      world.addActiveBlock(block.blockLeft(world)!)
      world.addActiveBlock(block.blockRight(world)!)
    }
  }
}
