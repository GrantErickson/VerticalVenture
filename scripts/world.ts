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
  addedActiveBlocks: Block[] = []
  removedActiveBlocks: Block[] = []
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
    if (block && this.addedActiveBlocks.indexOf(block) === -1) {
      this.addedActiveBlocks.push(block)
      block.isActive = true
    }
  }
  removeActiveBlock(block: Block | null) {
    if (block && this.removedActiveBlocks.indexOf(block) === -1) {
      this.removedActiveBlocks.push(block)
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

  removeRow(y: number) {
    for (let x = 0; x < this.width; x++) {
      if (this.blocks[x][y].isActive) {
        this.removeActiveBlock(this.blocks[x][y])
      }
      if (this.blocks[x][y].item) {
        this.removeLight(this.blocks[x][y])
      }
      this.blocks[x].pop()
    }
    this.processActiveBlocks()
  }
  insertRow(y: number) {
    const row = []
    for (let x = 0; x < this.width; x++) {
      row.push(new Block(this, x, y, this.blockTypes.get('empty')!))
    }
    // Update the y position of all blocks above the inserted row
    for (let x1 = 0; x1 < this.width; x1++) {
      for (let y1 = this.height - 2; y1 >= y; y1--) {
        this.blocks[x1][y1].y++
      }
    }
    // Insert the row in blocks
    for (let x = 0; x < this.width; x++) {
      this.blocks[x].splice(y, 0, row[x])
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
    // Reconcile added and removed blocks
    // This is necessary so we don't remove blocks that should be active.
    // Remove any remove blocks that are remaining active

    for (const block of this.removedActiveBlocks) {
      let index = this.activeBlocks.indexOf(block)
      if (index > -1) {
        this.activeBlocks.splice(index, 1)
        block.isActive = false
      }
    }

    for (const block of this.addedActiveBlocks) {
      if (this.activeBlocks.indexOf(block) === -1) {
        this.activeBlocks.push(block)
      }
      block.isActive = true
    }
    this.addedActiveBlocks = []
    this.removedActiveBlocks = []
  }

  clearBrightness(brightness = 0) {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        this.blocks[x][y].brightness = brightness
      }
    }
  }
}
