import { BlockType } from './blockType'
import { World } from './world'

export class Block {
  public x: number
  public y: number
  public blockType: BlockType
  percentFilled: number = 0
  isActive: boolean = false
  // TODO: Flow Direction may solve the problem of jittery water
  flowDirection: number = 0 // - 1: Left, 1: Right, 0: None

  constructor(x: number, y: number, blockType: BlockType) {
    this.x = x
    this.y = y
    this.blockType = blockType
  }

  blockBelow(world: World): Block | null {
    return world.getBlock(this.x, this.y - 1)
  }
  blockAbove(world: World): Block | null {
    return world.getBlock(this.x, this.y + 1)
  }
  blockLeft(world: World): Block | null {
    return world.getBlock(this.x - 1, this.y)
  }
  blockRight(world: World): Block | null {
    return world.getBlock(this.x + 1, this.y)
  }

  get key(): string {
    return `${this.x},${this.y}`
  }
}
