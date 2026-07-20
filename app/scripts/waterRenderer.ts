import * as THREE from 'three'
import type { Game } from './game'
import { BlockNature } from './blockType'

/**
 * Renders the world with three.js.
 *
 * The whole scene is a single quad. Each frame the world is uploaded as a tiny
 * RGBA data texture (one texel per block) and a fragment shader reconstructs
 * the picture from it:
 *
 *   R  water fill of the block, 0..1
 *   G  1 if the block is solid rock
 *   B  block brightness, 0..1
 *   A  1 if the block holds a torch
 *
 * Doing it this way — rather than a mesh per block — is what buys the
 * realistic water. The shader interpolates the fill value *between adjacent
 * columns*, so the surface becomes a continuous sloped line instead of the
 * per-block staircase the DOM renderer draws, and there is then a real surface
 * to put waves, foam, specular glints and depth-based colour on.
 */
export class WaterRenderer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)
  private field: THREE.DataTexture
  private data: Uint8Array
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

    const rock = new THREE.TextureLoader().load('/dirtBlock.webp')
    rock.wrapS = THREE.RepeatWrapping
    rock.wrapT = THREE.RepeatWrapping
    rock.colorSpace = THREE.SRGBColorSpace

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uField: { value: this.field },
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
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const block = world.getBlock(x, y)
        const i = (y * this.width + x) * 4
        if (!block) {
          data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0
          continue
        }
        const nature = block.blockType.nature
        data[i] =
          nature === BlockNature.liquid
            ? Math.round(Math.min(block.percentFilled, 100) * 2.55)
            : 0
        data[i + 1] = nature === BlockNature.solid ? 255 : 0
        data[i + 2] = Math.round(
          Math.min(Math.max(block.brightness, 0), 1) * 255,
        )
        data[i + 3] = block.item ? 255 : 0
      }
    }
    this.field.needsUpdate = true

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

  float row = floor(p.y);
  float fy = fract(p.y);

  vec4 here = blockAt(p);
  float solid = here.g;

  // --- water surface -------------------------------------------------------
  // Interpolate the fill of the two nearest columns so the surface slopes
  // smoothly across blocks instead of stepping. Only horizontal, so water in
  // one cavern never bleeds into another stacked above or below it.
  vec4 colA = blockAt(vec2(p.x - 0.5, row));
  vec4 colB = blockAt(vec2(p.x + 0.5, row));
  // Only blend between two columns that both hold water. Ramping a full column
  // down to a dry or solid neighbour would draw a diagonal wedge across the
  // boundary; real water meets air there as a vertical face.
  bool joinA = colA.g < 0.5 && colA.r > 0.004 && here.r > 0.004;
  bool joinB = colB.g < 0.5 && colB.r > 0.004 && here.r > 0.004;
  float fillA = joinA ? colA.r : here.r;
  float fillB = joinB ? colB.r : here.r;
  float fill = mix(fillA, fillB, fract(p.x + 0.5));

  // A free surface only exists where the block is not brim-full; a submerged
  // block should not have ripples running through the middle of it.
  float isFreeSurface = 1.0 - smoothstep(0.90, 0.99, fill);

  float waves =
      sin(p.x * 2.7 - uTime * 1.9) * 0.030
    + sin(p.x * 6.1 + uTime * 2.7) * 0.016
    + (noise(vec2(p.x * 1.7, uTime * 0.65)) - 0.5) * 0.045;

  float surfaceY = fill + waves * isFreeSurface;
  float depth = surfaceY - fy;              // > 0 => this fragment is underwater
  float water = smoothstep(-0.02, 0.03, depth) * step(0.004, fill);

  // Approximate the water column above this point, for a depth gradient that
  // keeps getting darker through a deep body rather than resetting per block.
  // The weight is a function of the *absolute* distance above the fragment
  // (i - fy), not of the loop index alone. A window tied to the block index
  // would drop a whole term each time the row index ticks over, banding the
  // water with a visible seam at every block boundary.
  float above = 0.0;
  for (int i = 1; i <= 12; i++) {
    float distanceAbove = float(i) - fy;
    float w = 1.0 - smoothstep(6.0, 11.0, distanceAbove);
    above += blockAt(vec2(p.x, row + float(i))).r * w;
  }
  float totalDepth = max(depth, 0.0) + above;

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
  // Two-stage ramp over a longer distance, so a tall body of water keeps
  // shading instead of saturating to flat navy after a couple of blocks.
  float d = clamp(totalDepth * 0.20, 0.0, 1.0);
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

  // Thicker water hides the rock behind it.
  float opacity = mix(0.40, 0.90, clamp(totalDepth * 0.28, 0.0, 1.0));
  vec3 col = mix(base, waterCol, water * opacity);

  // Contact shading where water meets rock, so the boundary reads as depth
  // rather than two flat colours butted together.
  col *= 1.0 - 0.22 * water * solid;

  // Surface band: foam plus a specular sheen right at the waterline.
  float band = 1.0 - smoothstep(0.0, 0.055, abs(depth));
  band *= isFreeSurface * step(0.004, fill);
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
