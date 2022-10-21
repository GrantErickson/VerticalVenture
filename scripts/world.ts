import { Block } from './block'
import { BlockType } from './blockType'
import { EmptyBlockType } from './emptyBlockType'
import { LiquidBlockType } from './liquidBlockType'
import { SolidBlockType } from './solidBlockType'
import { LightProcessor } from './lightProcessor'

export class World {
  // 0,0 is lower left corner.
  blocks: Block[][]
  width: number
  height: number
  activeBlocks: Block[] = []
  lights: Block[] = []
  private blockTypes = new Map<string, BlockType>()
  lightProcessor: LightProcessor

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.blocks = []

    // Create Block Types
    // TODO: This needs to be more data driven at some level eventually.
    this.addBlockType(new EmptyBlockType())
    this.addBlockType(new LiquidBlockType('water', 'rgba(0,0,255,0.5)'))
    this.addBlockType(new SolidBlockType('rock', '', 'dirtBlock.webp'))

    // Create the blocks, all empty
    for (let x = 0; x < width; x++) {
      this.blocks[x] = []
      for (let y = 0; y < height; y++) {
        this.blocks[x][y] = new Block(this, x, y, this.blockTypes.get('empty')!)
      }
    }

    this.lightProcessor = new LightProcessor(this)
  }

  processLighting() {
    this.lightProcessor.process()
  }

  addBlockType(blockType: BlockType) {
    this.blockTypes.set(blockType.name, blockType)
  }

  getBlock(x: number, y: number): Block | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null
    return this.blocks[x][y]
  }

  addActiveBlock(block: Block | null) {
    if (block && this.activeBlocks.indexOf(block) === -1) {
      this.activeBlocks.push(block)
      block.isActive = true
    }
  }
  removeActiveBlock(block: Block | null) {
    if (block) {
      let index = this.activeBlocks.indexOf(block)
      if (index > -1) {
        this.activeBlocks.splice(index, 1)
        block.isActive = false
      }
    }
  }

  addLight(block: Block | null) {
    if (block && this.lights.indexOf(block) === -1) {
      this.lights.push(block)
    }
  }
  removeLight(block: Block | null) {
    if (block) {
      let index = this.lights.indexOf(block)
      if (index > -1) {
        this.lights.splice(index, 1)
      }
    }
  }

  getBlockType(name: string): BlockType {
    let result = this.blockTypes.get(name)
    if (!result) throw new Error(`Block type ${name} not found`)
    return result
  }

  processActiveBlocks() {
    this.activeBlocks.forEach((block) => {
      block.blockType.process(block, this)
    })
  }

  clearBrightness(brightness = 0) {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        this.blocks[x][y].brightness = brightness
      }
    }
  }
}
