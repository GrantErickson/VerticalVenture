# Vertical Venture

A test of what it would take to create a web-based terraria-style environment.

Check it out [HERE](https://witty-bay-010181f1e.2.azurestaticapps.net)

## Items to complete

1. Update readme with more interesting info about the implementation
2. Maybe: Allow for changing the clumping of dirt on generation?
3. Other cool features

## History

I wanted to see what it would take to create a little 2d digging game. There were a few aspects that seemed interesting to me. 
1. Creating a basic environment  (3h)
2. Water in a block-style game (4h)
3. Lighting using rudimentary ray-tracing techniques (4h)

It is somewhat mesmerizing watching the water drain out of the caverns. It took a couple of tries to get it 'right.' It isn't right yet, but it is closish. The basic paradigm is to see if the block below is empty or has space and transfer up to 50% of the current volume of the block to that block. If that block is full or solid, then average the levels of the blocks on either side. Then activate all these blocks and the block above to be processed in the next round.

The lighting is simple ray tracing in 8 directions from the light source. The cardinal directions go straight and branch out falling off at a percentage based on the material of the block. The diagonals also propagate and also have some scattering to give a more realistic look.

## Games this could be
1. See if you can drain all the water in the minimum of changes
2. See if you can light the entire map with a minimum of lights
3. See if you can fill the cavern with water with a minimum of additional blocks. 

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

For detailed explanation on how things work, check out the [documentation](https://nuxtjs.org).

## Special Directories

You can create the following extra directories, some of which have special behaviors. Only `pages` is required; you can delete them if you don't want to use their functionality.

### `assets`

The assets directory contains your uncompiled assets such as Stylus or Sass files, images, or fonts.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/assets).

### `components`

The components directory contains your Vue.js components. Components make up the different parts of your page and can be reused and imported into your pages, layouts and even other components.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/components).

### `layouts`

Layouts are a great help when you want to change the look and feel of your Nuxt app, whether you want to include a sidebar or have distinct layouts for mobile and desktop.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/layouts).

### `pages`

This directory contains your application views and routes. Nuxt will read all the `*.vue` files inside this directory and setup Vue Router automatically.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/get-started/routing).

### `plugins`

The plugins directory contains JavaScript plugins that you want to run before instantiating the root Vue.js Application. This is the place to add Vue plugins and to inject functions or constants. Every time you need to use `Vue.use()`, you should create a file in `plugins/` and add its path to plugins in `nuxt.config.js`.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/plugins).

### `static`

This directory contains your static files. Each file inside this directory is mapped to `/`.

Example: `/static/robots.txt` is mapped as `/robots.txt`.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/static).

### `store`

This directory contains your Vuex store files. Creating a file in this directory automatically activates Vuex.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/store).
