import { BlockType } from './blockType'
import { World } from './world'
import { Item } from './item'
import { v4 as uuid } from 'uuid'

// NOTE: these use TypeScript `private` rather than ES `#private` fields.
// Blocks are wrapped in a Vue reactive proxy, and a `#field` access through a
// proxy throws ("Cannot read private member ... from an object whose class did
// not declare it") because the proxy does not carry the private brand.
export class Block {
  private _world: World
  public x: number
  public y: number
  private _blockType: BlockType
  percentFilled: number = 0
  isActive: boolean = false
  isFlowing: boolean = false
  brightness: number = 0
  // Both maintained by WaterProcessor, and shared by every block of a body, so
  // that a renderer can shade water by the body it belongs to rather than by
  // what happens to be stacked in this one column.
  /** Height of the surface of the body this block's water belongs to. */
  waterSurface: number = 0
  /** Distance from that surface down to the deepest point of the body. */
  waterDepth: number = 0
  private _item: Item | null = null
  readonly key: string

  constructor(world: World, x: number, y: number, blockType: BlockType) {
    this._world = world
    this.x = x
    this.y = y
    this._blockType = blockType
    this.key = uuid()
  }

  get blockType(): BlockType {
    return this._blockType
  }
  set blockType(blockType: BlockType) {
    this._blockType = blockType
    this._blockType.changeType(this, this._world)
  }

  // Handle the item on this block
  get item(): Item | null {
    return this._item
  }
  set item(item: Item | null) {
    if (this._item && this._item.luminosity) {
      this._world.removeLight(this)
    }
    if (item && item.luminosity) {
      this._world.addLight(this)
    }
    this._item = item
  }

  get blockBelow(): Block | null {
    return this._world.getBlock(this.x, this.y - 1)
  }
  get blockAbove(): Block | null {
    return this._world.getBlock(this.x, this.y + 1)
  }
  get blockLeft(): Block | null {
    return this._world.getBlock(this.x - 1, this.y)
  }
  get blockRight(): Block | null {
    return this._world.getBlock(this.x + 1, this.y)
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
        bestType = this._world.getBlockType(name)
      }
    }
    return bestType
  }
}
