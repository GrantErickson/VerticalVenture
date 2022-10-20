import { World } from '@/scripts/world'

describe('liquid', () => {
  test('Drain Down', () => {
    const world = new World(100, 25)

    let waterBlock = world.getBlock(0, 24)!
    waterBlock.blockType = world.getBlockType('water')
    waterBlock.percentFilled = 100
    expect(waterBlock.blockType.name).toEqual('water')
    expect(waterBlock.percentFilled).toEqual(100)
    world.addActiveBlock(waterBlock)
    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(50)
    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(25)
    world.processActiveBlocks()
    world.processActiveBlocks()
    world.processActiveBlocks()
    world.processActiveBlocks()
    world.processActiveBlocks()
    world.processActiveBlocks()
    //world.processActiveBlocks()
    //world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(0)
    expect(waterBlock.blockBelow!.percentFilled < 5).toBeTruthy()
  })

  test('Drain Around Solid', () => {
    const world = new World(100, 25)

    let waterBlock = world.getBlock(1, 24)!
    waterBlock.blockType = world.getBlockType('water')
    waterBlock.percentFilled = 100
    world.addActiveBlock(waterBlock)
    let leftBlock = waterBlock.blockLeft!
    expect(leftBlock).toBeTruthy()
    let rightBlock = waterBlock.blockRight!
    expect(rightBlock).toBeTruthy()

    let solidBlock = world.getBlock(1, 23)!
    solidBlock.blockType = world.getBlockType('rock')!

    expect(waterBlock.percentFilled).toEqual(100)
    expect(world.activeBlocks.length).toEqual(1)
    expect(solidBlock.blockType.name).toEqual('rock')
    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(100 / 3)
    expect(world.activeBlocks.includes(leftBlock)).toBeTruthy()
    expect(world.activeBlocks.includes(rightBlock)).toBeTruthy()
    expect(world.activeBlocks.includes(waterBlock)).toBeTruthy()
    expect(world.activeBlocks.length).toEqual(3)

    world.processActiveBlocks()
    expect(waterBlock.percentFilled).toEqual(100 / 3)
    expect(world.activeBlocks.length).toEqual(8)
  })
})
