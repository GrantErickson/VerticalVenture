import { Block } from './block'
import { BlockType } from './blockType'
import { EmptyBlockType } from './emptyBlockType'
import { LiquidBlockType } from './liquidBlockType'
import { SolidBlockType } from './solidBlockType'

export class World {
  // 0,0 is lower left corner.
  blocks: Block[][]
  width: number
  height: number
  activeBlocks: Block[] = []
  blockTypes = new Map<string, BlockType>()

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.blocks = []

    // Create Block Types
    // TODO: This needs to be more data driven at some level eventually.
    this.addBlockType(new EmptyBlockType())
    this.addBlockType(new LiquidBlockType('water', 'blue'))
    this.addBlockType(new SolidBlockType('rock', 'gray'))

    // Create the blocks, all empty
    for (let x = 0; x < width; x++) {
      this.blocks[x] = []
      for (let y = 0; y < height; y++) {
        this.blocks[x][y] = new Block(x, y, this.blockTypes.get('empty')!)
      }
    }
  }

  addBlockType(blockType: BlockType) {
    this.blockTypes.set(blockType.name, blockType)
  }

  getBlock(x: number, y: number): Block | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null
    return this.blocks[x][y]
  }

  addActiveBlock(block?: Block) {
    if (block && this.activeBlocks.indexOf(block) === -1) {
      this.activeBlocks.push(block)
      block.isActive = true
    }
  }
  removeActiveBlock(block?: Block) {
    if (block) {
      let index = this.activeBlocks.indexOf(block)
      if (index > -1) {
        this.activeBlocks.splice(index, 1)
        block.isActive = false
      }
    }
  }

  processActiveBlocks() {
    this.activeBlocks.forEach((block) => {
      block.blockType.process(block, this)
    })
  }
}