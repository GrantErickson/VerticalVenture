# Vertical Venture

A test of what it would take to create a web-based terraria-style environment.

Check it out [HERE](https://witty-bay-010181f1e.2.azurestaticapps.net)

## History

I wanted to see what it would take to create a little 2d digging game. There were a few aspects that seemed interesting to me.

1. Creating a basic environment (3h)
2. Water in a block-style game (4h)
3. Lighting using rudimentary ray-tracing techniques (4h)

It is somewhat mesmerizing watching the water drain out of the caverns. It took a couple of tries to get it 'right.' It isn't right yet, but it is ok. The basic paradigm is to see if the block below is empty or has space and transfer up to 50% of the current volume of the block to that block. If that block is full or solid, then average the levels of the blocks on either side. Then activate all these blocks and the block above to be processed in the next round.

The lighting is simple ray tracing in 8 directions from the light source. The cardinal directions go straight and branch out falling off at a percentage based on the material of the block. The diagonals also propagate and also have some scattering to give a more realistic look.

## How the water grew up

That block water was the first version, and it is still here — the whole block engine lives on the `/dom` page, unchanged. It is a good fit for a block game: cheap, always settles, easy to reason about. But it has a ceiling built into its bones. Water in it has no momentum. It cannot slosh, surge, splash or run round a corner, because the only thing it knows how to do is move a block's worth of itself down or sideways.

I ran into that ceiling twice before accepting it for what it was. One attempt rewrote the block water to settle whole connected bodies to a single level — flatter ponds and nicer draining, but still nothing that could splash. Another put a three.js renderer over the block world, which made it prettier without making it any wetter. Both are gone now. What they taught was that the limit was the paradigm, not the polish, and that the right move was to leave the honest little block engine alone and build a real fluid beside it.

The main page is that fluid: a FLIP/PIC solver, the hybrid that real liquid simulators use, drawn with three.js. Particles carry the water and its velocity; every step they are splatted onto a staggered grid, gravity is applied there, and a Gauss-Seidel pressure solve makes the velocity field divergence free — which is what stops water flowing into itself, makes it pile up and press outwards, and holds it against rock. The corrected velocities go back to the particles, which then move. The water is drawn as metaballs rather than as particles: each one is splatted as a soft blob into a density field and the field is cut at a threshold, so particles near each other merge into one surface while a lone one reads as a droplet.

Getting the solver running turned out to be about half the work. The other half was making it behave like water:

- Fresh out of the box it moved like syrup. The two damping knobs — how much grid velocity a particle adopts each step, and how strongly neighbours drag each other along — came down step by step until a splash could live out its whole life, with a test pinning the point where a sealed tank still comes to a genuine dead stop instead of shivering forever.
- Water vanished when it splashed. A lone droplet's blob never reaches the surface threshold, so spray simply wasn't drawn — it blinked out mid-air and popped back into existence wherever it landed. Sub-threshold water is now drawn as faint droplets that brighten with speed.
- Water slowly leaked out of sealed caves. Sloshing could press a particle into the corner cell of a pocket, and the rescue that lifts particles out of rock would teleport it clean through a block-thick wall into the next cavern. The fix was one line — consider the diagonal neighbours before looking further out — and pockets hold their water for good.
- Then the particles were halved in size, sixteen to a cell instead of four, which is 4x the particles for the same water. That was affordable once the neighbour search got its own grid matched to the particle spacing instead of borrowing the simulation cells, which had every particle wading through sixteen times the candidates that could possibly touch it.

And then it grew into the game around it: dig and fill by clicking or dragging, torches and a lights-out mode that reuse the block engine's ray-traced lighting, and the same endless scrolling descent as the block game — with the water carried along and fresh water arriving with the new rows. A gear menu holds the solver dials, remembered in the browser from run to run. The world generator now smooths its random noise into caverns and carves a tunnel from every sealed pocket to the main system, so the water always has somewhere to go. And the seed lives in the URL with the path naming the sim — `/` for the fluid, `/dom` for the blocks — so copying the address bar shares exactly what you are looking at, and the same seed is the same cave system in both.

## Games this could be

1. See if you can drain all the water in the minimum of changes.
2. See if you can light the entire map with a minimum of lights.
3. See if you can fill the cavern with water with a minimum of additional blocks.

## Performance

I added some performance counters to see how things were working. In the block engine the water and lighting are somewhat costly. It would be hard to scale beyond this size without using better logic for these calculations. They are very naive at this point. While Vue is fast, this pushes it a bit. Settling the water at the beginning is the most time-consuming part of the process.

The fluid is a different budget entirely: a watery world runs twenty to thirty thousand particles, and a full step — transfer to grid, pressure solve, separation, move — lands around 10-15ms a frame at the fine particle setting. The gear menu exists for machines where that is too much; particle fineness is the dial that matters, and the coarse setting is still a real fluid at a fraction of the cost.

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
