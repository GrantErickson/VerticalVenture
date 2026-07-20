# Vertical Venture

A test of what it would take to create a web-based terraria-style environment.

Check it out [HERE](https://witty-bay-010181f1e.2.azurestaticapps.net)

## History

I wanted to see what it would take to create a little 2d digging game. There were a few aspects that seemed interesting to me.

1. Creating a basic environment (3h)
2. Water in a block-style game (4h)
3. Lighting using rudimentary ray-tracing techniques (4h)

It is somewhat mesmerizing watching the water drain out of the caverns. It took a couple of tries to get it 'right.'

The first attempt worked a block at a time: push up to 50% of your water into the block below, and otherwise average with the blocks on either side. It never settled. A draining pool turned into a haze of half filled blocks stacked on each other — 67% with 99% sitting on top of it — and even at rest a flat surface came out ragged.

It now works on connected bodies instead, two passes per tick. Gravity first: every block empties as far as it can into the block below, lowest row first so nothing falls more than one block per tick. Then each connected body of water is flood filled — along with the dry blocks immediately left and right of it, which is what lets it spread — and its volume is laid back down from its lowest row up. That gives a body one water level: full to the brim everywhere below the surface, partial only in the single row the surface passes through. Because a body only reaches one block outwards per tick it still animates rather than snapping to its equilibrium, and because every block of a body knows its own surface height and deepest point, the renderer can colour a pool as one pool instead of shading it by whatever is stacked in each column.

Water that has nothing holding it up is left out of all of this. It belongs to no body: gravity alone owns it until it lands. That matters because a stream is water-connected to the pool pouring it, and treating the two as one body would lay the pool into the shaft from the bottom up — the ledge empties in a step or two — as well as compacting a steady trickle into slugs with gaps between them. It is also drawn differently. Resting water stands at its level inside a block, but a pour is passing through, so it runs the full height of the block and carries how much of it there is in the width of the ribbon instead — clinging to whichever rock face it is falling past, wandering as it goes.

Water is stepped slower than the game clock on purpose — a block every five ticks, and the holes in the floor only let a fifth of a block out at a time. Run it at one step per tick and a world empties in a quarter of a second, which is no fun to watch at all. `waterTicks` and `drainRate` on the game are the two dials.

## The other water

There is a third page that throws all of the above away and does it properly. The block engine is a good fit for a block game — cheap, always settles, easy to reason about — but water in it has no momentum. It cannot slosh, surge, splash or run round a corner, because the only thing it knows how to do is move a block's worth of itself down or sideways.

The `/fluid` page runs a FLIP/PIC solver instead, the hybrid real liquid simulations use. Particles carry the water and its velocity; every step they are splatted onto a staggered grid, gravity is applied there, and a Gauss-Seidel pressure solve makes the velocity field divergence free — which is what stops water flowing into itself, makes it pile up and press outwards, and holds it against rock. The corrected velocities go back to the particles, which then move. It shares the terrain generator with the other two pages, so the same seed is the same cave system, and the water blocks it generates are cashed in for particles at the start.

Two things about it were worth the trouble to get right. The order of the step matters more than any parameter: move the particles before the pressure solve rather than after it and every particle falls a little and is shoved back every frame, so the water simmers forever at rest — no amount of damping hides it. And it is drawn as metaballs rather than as particles: each one is splatted as a soft blob into a density field and the field is cut at a threshold, so particles near each other merge into one surface while a lone one stays a droplet, and nothing has to decide which is which.

It costs about 5-7ms a frame for the ~5,500 particles a generated world holds, against about 0.1ms for the block engine. That is the trade.

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
3. Create some kind of a server back end to hold best scores from any gamification of this.

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
