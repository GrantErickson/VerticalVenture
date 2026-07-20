import { BlockType } from './blockType'
import { World } from './world'
import { Item } from './item'
import { v4 as uuid } from 'uuid'

export class Block {
  #world: World
  public x: number
  public y: number
  #blockType: BlockType
  percentFilled: number = 0
  isActive: boolean = false
  isFlowing: boolean = false
  brightness: number = 0
  #item: Item | null = null
  readonly key: string

  constructor(world: World, x: number, y: number, blockType: BlockType) {
    this.#world = world
    this.x = x
    this.y = y
    this.#blockType = blockType
    this.key = uuid()
  }

  get blockType(): BlockType {
    return this.#blockType
  }
  set blockType(blockType: BlockType) {
    this.#blockType = blockType
    this.#blockType.changeType(this, this.#world)
  }

  // Handle the item on this block
  get item(): Item | null {
    return this.#item
  }
  set item(item: Item | null) {
    if (this.#item && this.#item.luminosity) {
      this.#world.removeLight(this)
    }
    if (item && item.luminosity) {
      this.#world.addLight(this)
    }
    this.#item = item
  }

  get blockBelow(): Block | null {
    return this.#world.getBlock(this.x, this.y - 1)
  }
  get blockAbove(): Block | null {
    return this.#world.getBlock(this.x, this.y + 1)
  }
  get blockLeft(): Block | null {
    return this.#world.getBlock(this.x - 1, this.y)
  }
  get blockRight(): Block | null {
    return this.#world.getBlock(this.x + 1, this.y)
  }

  get location(): string {
    return `${this.x},${this.y}`
  }

  get surroundingBlockType(): BlockType | null {
    const types: { [name: string]: number } = {}
    for (const neighbor of [
      this.blockAbove,
      this.blockBelow,
      this.blockLeft,
      this.blockRight,
    ]) {
      if (neighbor) {
        const name = neighbor.blockType.name
        types[name] = (types[name] ?? 0) + 1
      }
    }

    let bestCount = 0
    let bestType: BlockType | null = null
    for (const [name, count] of Object.entries(types)) {
      if (count > bestCount && name !== 'empty') {
        bestCount = count
        bestType = this.#world.getBlockType(name)
      }
    }
    return bestType
  }
}
