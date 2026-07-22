# Vertical Venture

A test of what it would take to create a web-based terraria-style environment.

Check it out [HERE](https://witty-bay-010181f1e.2.azurestaticapps.net)

## History

I wanted to see what it would take to create a little 2d digging game. There were a few aspects that seemed interesting to me.

1. Creating a basic environment (3h)
2. Water in a block-style game (4h)
3. Lighting using rudimentary ray-tracing techniques (4h)

It is somewhat mesmerizing watching the water drain out of the caverns. It took a couple of tries to get it 'right.' It isn't right yet, but it is ok. The basic paradigm is to see if the block below is empty or has space and transfer up to 50% of the current volume of the block to that block. If that block is full or solid, then average the levels of the blocks on either side. Then activate all these blocks and the block above to be processed in the next round.

## The other water

The main page throws all of the above away and does it properly — the block engine described above lives on the `/dom` page. That engine is a good fit for a block game — cheap, always settles, easy to reason about — but water in it has no momentum. It cannot slosh, surge, splash or run round a corner, because the only thing it knows how to do is move a block's worth of itself down or sideways.

The main page runs a FLIP/PIC solver instead, the hybrid real liquid simulations use, drawn with three.js. Particles carry the water and its velocity; every step they are splatted onto a staggered grid, gravity is applied there, and a Gauss-Seidel pressure solve makes the velocity field divergence free — which is what stops water flowing into itself, makes it pile up and press outwards, and holds it against rock. The corrected velocities go back to the particles, which then move. It shares the terrain generator with the `/dom` page, so the same seed is the same cave system, and the water blocks it generates are cashed in for particles at the start. The water is drawn as metaballs rather than as particles: each one is splatted as a soft blob into a density field and the field is cut at a threshold, so particles near each other merge into one surface while a lone one reads as a droplet. A gear menu on the page holds the simulation dials — particle fineness, solver iterations, and how lively the water feels — remembered in the browser from run to run. Digging and filling is a click or a drag, shift-click plants a torch, and the lights-out toggle leaves the caves lit only by torchlight, using the same ray-traced block lighting as the block engine. The world seed lives in the URL and the path names the sim, so copying the address bar shares exactly what you are looking at.

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
4. Create some kind of a server back end to hold best scores from any gamification of this.

## Build Setup

Requires Node 22.12 or newer.

```bash
# install dependencies
$ npm install

# serve with hot reload at localhost:3000
$ npm run dev

# generate the static site into .output/public
$ npm run generate

# preview the generated site
$ npm run preview

# type check and run unit tests
$ npm run typecheck
$ npm test
```
