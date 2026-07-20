import * as THREE from 'three'
import type { Game } from './game'
import { BlockNature } from './blockType'

/**
 * Renders the world with three.js.
 *
 * The whole scene is a single quad. Each frame the world is uploaded as two
 * tiny RGBA data textures (one texel per block) and a fragment shader
 * reconstructs the picture from them.
 *
 * The field texture is what the block is:
 *
 *   R  water fill of the block, 0..1
 *   G  1 if the block is solid rock
 *   B  block brightness, 0..1
 *   A  1 if the block holds a torch
 *
 * The body texture is which body of water the block belongs to, as the engine's
 * WaterProcessor worked it out. Every block of a body carries the same values,
 * which is what keeps a pool one continuous colour instead of shading it by
 * whatever happens to be stacked in each column:
 *
 *   R,G  height of the body's surface above this block, 16 bit, in blocks
 *   B    depth of the body at its deepest point, in blocks
 *   A    1 if this water is pouring rather than resting on something
 *
 * Doing it this way — rather than a mesh per block — is what buys the
 * realistic water. The surface is a continuous line at the body's own water
 * level rather than the per-block staircase the DOM renderer draws, and there
 * is then a real surface to put waves, foam, specular glints and depth-based
 * colour on.
 */
export class WaterRenderer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)
  private field: THREE.DataTexture
  private data: Uint8Array
  private body: THREE.DataTexture
  private bodyData: Uint8Array
  private material: THREE.ShaderMaterial
  private width: number
  private height: number
  private disposed = false

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.width = width
    this.height = height

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    })
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2))

    this.data = new Uint8Array(width * height * 4)
    this.field = new THREE.DataTexture(this.data, width, height)
    // Nearest, because the shader does its own interpolation — it must
    // interpolate horizontally only, so that stacked caverns stay separate.
    this.field.minFilter = THREE.NearestFilter
    this.field.magFilter = THREE.NearestFilter
    this.field.needsUpdate = true

    this.bodyData = new Uint8Array(width * height * 4)
    this.body = new THREE.DataTexture(this.bodyData, width, height)
    // Nearest for the same reason, and here it also matters that neighbouring
    // blocks of one body read back bit-for-bit identical values.
    this.body.minFilter = THREE.NearestFilter
    this.body.magFilter = THREE.NearestFilter
    this.body.needsUpdate = true

    const rock = new THREE.TextureLoader().load('/dirtBlock.webp')
    rock.wrapS = THREE.RepeatWrapping
    rock.wrapT = THREE.RepeatWrapping
    rock.colorSpace = THREE.SRGBColorSpace

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uField: { value: this.field },
        uBody: { value: this.body },
        uRock: { value: rock },
        uSize: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0 },
        uDark: { value: 0 },
        uScroll: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    })

    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material))
  }

  setSize(cssWidth: number, cssHeight: number) {
    this.renderer.setSize(cssWidth, cssHeight, false)
  }

  render(game: Game, elapsedSeconds: number) {
    if (this.disposed) return

    const world = game.world
    const data = this.data
    const bodyData = this.bodyData
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const block = world.getBlock(x, y)
        const i = (y * this.width + x) * 4
        if (!block) {
          data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0
          bodyData[i] = bodyData[i + 1] = bodyData[i + 2] = bodyData[i + 3] = 0
          continue
        }
        const nature = block.blockType.nature
        const water = nature === BlockNature.liquid ? block.percentFilled : 0
        data[i] = Math.round(Math.min(water, 100) * 2.55)
        data[i + 1] = nature === BlockNature.solid ? 255 : 0
        data[i + 2] = Math.round(
          Math.min(Math.max(block.brightness, 0), 1) * 255,
        )
        data[i + 3] = block.item ? 255 : 0

        // Heights are relative to this block and scaled by the world height, so
        // the shader can decode them knowing nothing but uSize. Eight bits over
        // 25 blocks would quantise the surface to a tenth of a block and leave
        // a faint seam at every row boundary, hence the 16 bit split.
        const surface = water > 0 ? (block.waterSurface - y) / this.height : 0
        const scaled = Math.min(Math.max(surface, 0), 1) * 255
        const high = Math.floor(scaled)
        bodyData[i] = high
        bodyData[i + 1] = Math.round((scaled - high) * 255)
        bodyData[i + 2] =
          water > 0
            ? Math.round(
                Math.min(Math.max(block.waterDepth / this.height, 0), 1) * 255,
              )
            : 0
        bodyData[i + 3] = water > 0 && block.isFlowing ? 255 : 0
      }
    }
    this.field.needsUpdate = true
    this.body.needsUpdate = true

    this.material.uniforms.uTime!.value = elapsedSeconds
    this.material.uniforms.uDark!.value = game.dark ? 1 : 0
    // The DOM renderer shifts the grid by scrollOffset pixels; match it here in
    // block units so both views scroll together.
    this.material.uniforms.uScroll!.value = game.scrollOffset / game.blockSize

    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    this.field.dispose()
    this.body.dispose()
    this.material.dispose()
    this.renderer.dispose()
  }
}

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uField;
uniform sampler2D uBody;
uniform sampler2D uRock;
uniform vec2 uSize;
uniform float uTime;
uniform float uDark;
uniform float uScroll;

varying vec2 vUv;

// One texel = one block. Sampling is nearest, so this reads a whole block.
vec4 blockAt(vec2 cell) {
  vec2 uv = (floor(cell) + 0.5) / uSize;
  return texture2D(uField, clamp(uv, vec2(0.0), vec2(1.0)));
}

// The body of water a block belongs to, same texel layout.
vec4 bodyAt(vec2 cell) {
  vec2 uv = (floor(cell) + 0.5) / uSize;
  return texture2D(uBody, clamp(uv, vec2(0.0), vec2(1.0)));
}

/**
 * Where the water in a block runs if it is pouring: x is the centre of the
 * stream across the block, y its half width, z whether it is pouring at all.
 *
 * Water that has nothing holding it up should not fill its block the way a
 * pool does — it is a stream, and a stream falling past a rock face clings to
 * it rather than hanging in the middle of the gap.
 */
vec3 streamAt(vec2 cell) {
  float fill = blockAt(cell).r;
  // Nothing here, so pinch the ribbon away to a point: a pour should taper off
  // at its ends rather than being chopped square at a block boundary.
  if (fill < 0.004) return vec3(0.5, 0.0, 0.0);
  // Resting water fills its block, and a ribbon meeting it opens out into it.
  if (bodyAt(cell).a < 0.5) return vec3(0.5, 0.5, 0.0);
  // A trickle is narrow, a full block coming over the edge is a wide sheet.
  float halfWidth = mix(0.14, 0.40, clamp(fill, 0.0, 1.0));
  float leftRock = blockAt(cell + vec2(-1.0, 0.0)).g;
  float rightRock = blockAt(cell + vec2(1.0, 0.0)).g;
  float centre = 0.5;
  if (leftRock > 0.5 && rightRock < 0.5) centre = halfWidth + 0.03;
  else if (rightRock > 0.5 && leftRock < 0.5) centre = 1.0 - halfWidth - 0.03;
  return vec3(centre, halfWidth, 1.0);
}

// Cheap value noise, used for the wave detail and the caustics.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  // Position in block units. vUv.y is 0 at the bottom of the quad and the
  // world's y is 0 at the bottom too, so these map straight across — flipping
  // v here would draw the world upside down.
  vec2 p = vUv * uSize;
  // The DOM renderer moves blocks up the screen as scrollOffset grows, so at a
  // fixed screen height we need to read a correspondingly lower world row.
  p.y -= uScroll;

  float fy = fract(p.y);

  vec4 here = blockAt(p);
  float solid = here.g;

  // --- water surface -------------------------------------------------------
  // Everything below is measured from the surface of the connected body this
  // block belongs to, which the engine hands over per block. Deriving it from
  // the block's own fill instead — all a shader can do unaided — costs on both
  // counts: the surface steps from column to column wherever a body's floor
  // does, and a full block reads as "surface at my ceiling", so water fades out
  // along the top edge of every submerged block and rules the whole pool with
  // faint horizontal seams.
  vec4 body = bodyAt(p);
  float surfaceOffset = (body.r + body.g / 255.0) * uSize.y;
  float bodyDepth = body.b * uSize.y;

  float pouring = body.a;

  // A free surface only exists in the one row a body's surface passes through;
  // a submerged block should not have ripples running through the middle of it,
  // and falling water has no level to ripple at all.
  float isFreeSurface =
    (1.0 - smoothstep(0.90, 0.99, surfaceOffset)) * (1.0 - pouring);

  float waves =
      sin(p.x * 2.7 - uTime * 1.9) * 0.030
    + sin(p.x * 6.1 + uTime * 2.7) * 0.016
    + (noise(vec2(p.x * 1.7, uTime * 0.65)) - 0.5) * 0.045;

  float surfaceY = surfaceOffset + waves * isFreeSurface;
  float depth = surfaceY - fy;              // > 0 => this fragment is underwater
  // Water meets air at a body's edge as a vertical face, so mask by whether
  // this block holds water at all rather than blending into its neighbours.
  // Resting water stands at its level inside the block. Falling water does not
  // sit at the bottom of a block waiting — it is a stream passing through, so
  // it runs the full height and carries how much of it there is in the width
  // of the ribbon instead. Levelling it inside each block is what would break
  // a steady pour into a dotted line of puddles, one per block.
  float water =
    mix(smoothstep(-0.02, 0.03, depth), 1.0, pouring) * step(0.004, here.r);
  float depthFromSurface = max(depth, 0.0);

  // --- pouring -------------------------------------------------------------
  // Blend the stream shape between the blocks above and below, the same way
  // the surface used to be blended sideways, so a pour is one continuous
  // ribbon down the rock instead of a stack of independent block wide slabs —
  // and so it tapers where it leaves the pool that feeds it.
  vec3 streamBelow = streamAt(vec2(p.x, p.y - 0.5));
  vec3 streamAbove = streamAt(vec2(p.x, p.y + 0.5));
  vec3 stream = mix(streamBelow, streamAbove, fract(p.y + 0.5));
  float pour = stream.z;

  // Wander and pinch as it falls, both scrolling downwards, so the ribbon
  // reads as moving water rather than a painted stripe.
  float wander =
      sin(p.y * 2.3 - uTime * 3.4) * 0.028
    + (noise(vec2(p.y * 0.8 - uTime * 2.4, p.x * 3.1)) - 0.5) * 0.09;
  float centre = stream.x + wander * pour;
  float halfWidth =
    stream.y * (0.82 + 0.36 * noise(vec2(p.x * 2.0, p.y * 1.7 - uTime * 3.8)));
  float across = abs(fract(p.x) - centre);
  float inStream = 1.0 - smoothstep(halfWidth - 0.05, halfWidth + 0.03, across);
  water *= mix(1.0, inStream, pour);

  // --- rock ----------------------------------------------------------------
  // Refract what is behind the water by nudging the texture lookup.
  vec2 refractOffset = vec2(
    sin(p.y * 4.5 + uTime * 1.3) * 0.020,
    cos(p.x * 3.9 - uTime * 1.1) * 0.014
  ) * water;
  vec3 rock = texture2D(uRock, fract(p + refractOffset)).rgb;

  // Caustics: bright rippling bands cast onto submerged rock.
  float caustic = noise(vec2(p.x * 3.0 + uTime * 0.9, p.y * 3.0 - uTime * 0.7));
  caustic += noise(vec2(p.x * 6.5 - uTime * 1.4, p.y * 5.0 + uTime * 0.5)) * 0.5;
  caustic = pow(max(caustic - 0.55, 0.0), 2.0) * 2.6;

  vec3 cave = vec3(0.045, 0.040, 0.055);
  vec3 base = mix(cave, rock * (1.0 + caustic * water * 0.9), solid);

  // --- water colour --------------------------------------------------------
  vec3 shallow = vec3(0.32, 0.68, 0.74);
  vec3 mid = vec3(0.06, 0.32, 0.55);
  vec3 deep = vec3(0.010, 0.075, 0.26);
  // Ramp from the surface of the body to its deepest point, and let that depth
  // decide how dark the bottom is allowed to get: a puddle stays pale all the
  // way down, a deep pool still shades through to navy, and a tall body beside
  // a short one agrees with it at every height they share.
  float darkest = clamp(bodyDepth / 8.0, 0.0, 1.0);
  float d = bodyDepth > 0.0
    ? clamp(depthFromSurface / bodyDepth, 0.0, 1.0) * darkest
    : 0.0;
  vec3 waterCol = d < 0.5
    ? mix(shallow, mid, d * 2.0)
    : mix(mid, deep, (d - 0.5) * 2.0);

  // Light filtering down through the volume: slow drifting bands that keep
  // large bodies alive rather than a flat fill.
  float shimmer = noise(vec2(p.x * 1.1 + uTime * 0.20, p.y * 0.7 - uTime * 0.32));
  shimmer += noise(vec2(p.x * 2.3 - uTime * 0.35, p.y * 1.6 + uTime * 0.22)) * 0.5;
  waterCol *= 0.86 + shimmer * 0.30;
  // Caustic light reaches into the water itself, brightest near the surface.
  waterCol += vec3(0.35, 0.62, 0.70) * caustic * 0.16 * exp(-max(depth, 0.0) * 0.7);

  // A pour is thin and full of air, so it reads paler and lets more of the
  // rock behind it through than the body it came from.
  waterCol = mix(waterCol, vec3(0.62, 0.82, 0.90), pour * 0.45);

  // Thicker water hides the rock behind it.
  float opacity = mix(0.40, 0.90, clamp(depthFromSurface * 0.28, 0.0, 1.0));
  opacity = mix(opacity, 0.62, pour);
  vec3 col = mix(base, waterCol, water * opacity);

  // Bright edges along the ribbon, where a stream catches the light.
  float lip = smoothstep(halfWidth - 0.11, halfWidth - 0.01, across) * inStream;
  col += vec3(0.55, 0.76, 0.92) * lip * pour * water * 0.35;

  // Contact shading where water meets rock, so the boundary reads as depth
  // rather than two flat colours butted together.
  col *= 1.0 - 0.22 * water * solid;

  // Surface band: foam plus a specular sheen right at the waterline.
  float band = 1.0 - smoothstep(0.0, 0.055, abs(depth));
  // Confined to the ribbon as well, or a pour would trail a full block wide
  // line of foam across the gap it is falling through.
  band *= isFreeSurface * step(0.004, here.r) * mix(1.0, inStream, pour);
  float foam = band * (0.35 + 0.65 * noise(vec2(p.x * 9.0 - uTime * 2.2, uTime * 0.8)));
  col += vec3(0.55, 0.78, 0.95) * foam * 0.55;

  float glint = pow(max(sin(p.x * 7.0 - uTime * 2.4), 0.0), 24.0);
  col += vec3(1.0) * glint * band * 0.45;

  // --- lighting ------------------------------------------------------------
  float brightness = here.b;
  // Sample the neighbours so the lit area falls off smoothly rather than in
  // hard block steps like the DOM overlay does.
  brightness += blockAt(vec2(p.x - 1.0, p.y)).b;
  brightness += blockAt(vec2(p.x + 1.0, p.y)).b;
  brightness += blockAt(vec2(p.x, p.y - 1.0)).b;
  brightness += blockAt(vec2(p.x, p.y + 1.0)).b;
  brightness /= 5.0;

  col *= mix(1.0, clamp(brightness, 0.03, 1.0), uDark);

  // Torches read as a warm point light rather than an emoji.
  if (here.a > 0.5) {
    vec2 centre = floor(p) + 0.5;
    float d = length(p - centre);
    float flicker = 0.88 + 0.12 * noise(vec2(uTime * 5.0, 0.0));
    col += vec3(1.0, 0.72, 0.34) * smoothstep(0.55, 0.0, d) * flicker;
  }

  gl_FragColor = vec4(col, 1.0);
}
`
