import { Block } from './block'
import { World } from './world'

export class LightProcessor {
  #world: World
  propagationFactor = 0.8
  minimumLight = 0.1
  scatterAmount = 0.2 // The amount the light scatters on the diagonals

  constructor(world: World) {
    this.#world = world
  }

  process(): void {
    //console.log('Processing Lights')
    // Clear brightnesses from all blocks
    this.#world.clearBrightness()

    // Iterate all the lights in the world
    for (const light of this.#world.lights) {
      //console.log('Processing light at ' + light.x + ', ' + light.y)
      if (light.item) {
        light.brightness = light.item!.luminosity
      } else {
        light.brightness = 1.2
      }
      let luminosity = light.brightness * this.propagationFactor
      this.processBlock(light.blockAbove, luminosity, Direction.north)
      this.processBlock(
        light.blockAbove?.blockRight,
        luminosity,
        Direction.northEast
      )
      this.processBlock(light.blockRight, luminosity, Direction.east)
      this.processBlock(
        light.blockRight?.blockBelow,
        luminosity,
        Direction.southEast
      )
      this.processBlock(light.blockBelow, luminosity, Direction.south)
      this.processBlock(
        light.blockBelow?.blockLeft,
        luminosity,
        Direction.southWest
      )
      this.processBlock(light.blockLeft, luminosity, Direction.west)
      this.processBlock(
        light.blockLeft?.blockAbove,
        luminosity,
        Direction.northWest
      )
    }
  }

  private processBlock(
    block: Block | null | undefined,
    luminosity: number,
    direction: Direction
  ): void {
    if (!block) {
      return
    }
    // Calculate the luminosity of the block
    block.brightness += luminosity
    if (block.brightness > 1) block.brightness = 1
    // console.log(
    //   `${block.x}, ${block.y} set to ${block.brightness} heading ${direction}`
    // )
    luminosity *= this.propagationFactor // Reduce based on fall off of light
    luminosity *= 1 - block.blockType.opacity * (block.percentFilled / 100) // Reduce based on opacity of block
    // console.log(`Luminosity reduced to ${luminosity}`)
    if (luminosity < this.minimumLight) return // It is too dim to continue
    switch (direction) {
      case Direction.north:
        this.processBlock(
          block.blockAbove?.blockLeft,
          luminosity,
          Direction.northWest
        )
        this.processBlock(block.blockAbove, luminosity, Direction.north)
        this.processBlock(
          block.blockAbove?.blockRight,
          luminosity,
          Direction.northEast
        )
        break
      case Direction.northEast:
        this.processBlock(
          block.blockAbove?.blockRight,
          luminosity,
          Direction.northEast
        )
        this.processBlock(
          block.blockRight,
          luminosity * this.scatterAmount,
          Direction.northEast
        )
        this.processBlock(
          block.blockAbove,
          luminosity * this.scatterAmount,
          Direction.northEast
        )
        break
      case Direction.east:
        this.processBlock(
          block.blockRight?.blockAbove,
          luminosity,
          Direction.northEast
        )
        this.processBlock(block.blockRight, luminosity, Direction.east)
        this.processBlock(
          block.blockRight?.blockBelow,
          luminosity,
          Direction.southEast
        )
        break
      case Direction.southEast:
        this.processBlock(
          block.blockRight?.blockBelow,
          luminosity,
          Direction.southEast
        )
        this.processBlock(
          block.blockRight,
          luminosity * this.scatterAmount,
          Direction.southEast
        )
        this.processBlock(
          block.blockBelow,
          luminosity * this.scatterAmount,
          Direction.southEast
        )
        break
      case Direction.south:
        this.processBlock(
          block.blockBelow?.blockRight,
          luminosity,
          Direction.southEast
        )
        this.processBlock(block.blockBelow, luminosity, Direction.south)
        this.processBlock(
          block.blockBelow?.blockLeft,
          luminosity,
          Direction.southWest
        )
        break
      case Direction.southWest:
        this.processBlock(
          block.blockBelow?.blockLeft,
          luminosity,
          Direction.southWest
        )
        this.processBlock(
          block.blockBelow,
          luminosity * this.scatterAmount,
          Direction.southWest
        )
        this.processBlock(
          block.blockBelow,
          luminosity * this.scatterAmount,
          Direction.southWest
        )
        break
      case Direction.west:
        this.processBlock(
          block.blockLeft?.blockBelow,
          luminosity,
          Direction.southWest
        )
        this.processBlock(block.blockLeft, luminosity, Direction.west)
        this.processBlock(
          block.blockLeft?.blockAbove,
          luminosity,
          Direction.northWest
        )
        break
      case Direction.northWest:
        this.processBlock(
          block.blockLeft?.blockAbove,
          luminosity,
          Direction.northWest
        )
        this.processBlock(
          block.blockLeft,
          luminosity * this.scatterAmount,
          Direction.northWest
        )
        this.processBlock(
          block.blockAbove,
          luminosity * this.scatterAmount,
          Direction.northWest
        )
        break
    }
  }
}

enum Direction {
  north,
  northEast,
  east,
  southEast,
  south,
  southWest,
  west,
  northWest,
}
