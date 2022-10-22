# Vertical Venture

A test of what it would take to create a web-based terraria-style environment.

Check it out [HERE](https://witty-bay-010181f1e.2.azurestaticapps.net)

## History

I wanted to see what it would take to create a little 2d digging game. There were a few aspects that seemed interesting to me. 
1. Creating a basic environment  (3h)
2. Water in a block-style game (4h)
3. Lighting using rudimentary ray-tracing techniques (4h)

It is somewhat mesmerizing watching the water drain out of the caverns. It took a couple of tries to get it 'right.' It isn't right yet, but it is ok. The basic paradigm is to see if the block below is empty or has space and transfer up to 50% of the current volume of the block to that block. If that block is full or solid, then average the levels of the blocks on either side. Then activate all these blocks and the block above to be processed in the next round.

The lighting is simple ray tracing in 8 directions from the light source. The cardinal directions go straight and branch out falling off at a percentage based on the material of the block. The diagonals also propagate and also have some scattering to give a more realistic look.

## Games this could be
1. See if you can drain all the water in the minimum of changes.
2. See if you can light the entire map with a minimum of lights.
3. See if you can fill the cavern with water with a minimum of additional blocks. 

## Performance
I added some performance counters to see how things were working. The water and lighting is somewhat costly. It would be hard to scale beyond this size without using better logic for these calculations. They are very naive at this point. While Vue is fast, this pushes it a bit. Settling the water at the beginning is the most time-consuming part of the process.

## Other ideas
1. Better world randomization
2. Allow for changing the clumping of solid blocks on generation
3. Make the water flow down the sides of the blocks and look more realistic
4. Implement the rendering with three.js
5. Create some kind of a server back end to hold best scores from any gamification of this.

## Build Setup

```bash
# install dependencies
$ npm install

# serve with hot reload at localhost:3000
$ npm run dev

# build for production and launch server
$ npm run build
$ npm run start

# generate static project
$ npm run generate
```
