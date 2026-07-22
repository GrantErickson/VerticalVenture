import * as THREE from 'three'
import { FLUID, type FlipFluid } from './flipFluid'

/**
 * Draws a FlipFluid as liquid rather than as the cloud of particles it is.
 *
 * Two passes:
 *
 *   1. Every particle is splatted into an offscreen texture as a soft round
 *      blob, added together. That gives a density field: high where particles
 *      overlap, falling away to nothing at the edges. Speed rides along in a
 *      second channel so the shading can tell churning water from still.
 *   2. A full screen pass cuts that field at a threshold. Everything above it
 *      is water, and the width of the falloff either side of the cut is a
 *      surface to light — which is what turns a dotted line of particles into
 *      a continuous sheet that merges and separates on its own.
 *
 * That threshold is the whole trick: two particles near each other overlap into
 * one blob and read as one body. A lone particle's blob never reaches the cut,
 * so what falls under it — droplets, spray, the leading edge of a splash — is
 * drawn faintly instead of not at all. Nothing has to decide which is which.
 *
 * The rock is drawn in the same final pass from a block sized data texture, so
 * water is composited against terrain without a second geometry pass.
 */
export class FluidRenderer {
  private renderer: THREE.WebGLRenderer
  private density: THREE.WebGLRenderTarget
  private particleScene = new THREE.Scene()
  private particles: THREE.Points
  private positions: Float32Array
  private speeds: Float32Array
  private compositeScene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)
  private splatMaterial: THREE.ShaderMaterial
  private compositeMaterial: THREE.ShaderMaterial
  private rockTexture: THREE.DataTexture
  private rockData: Uint8Array
  private depthTexture: THREE.DataTexture
  private depthData: Uint8Array
  private blockWidth: number
  private blockHeight: number
  private disposed = false

  constructor(
    canvas: HTMLCanvasElement,
    blockWidth: number,
    blockHeight: number,
    cellsPerBlock: number,
    maxParticles: number,
  ) {
    this.blockWidth = blockWidth
    this.blockHeight = blockHeight
    const cellWidth = blockWidth * cellsPerBlock
    const cellHeight = blockHeight * cellsPerBlock

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2))

    // Half resolution is plenty: the field is smooth by construction, and the
    // threshold in the second pass sharpens the edge back up anyway.
    this.density = new THREE.WebGLRenderTarget(512, 256, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    })

    this.positions = new Float32Array(maxParticles * 3)
    this.speeds = new Float32Array(maxParticles)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    geometry.setAttribute(
      'speed',
      new THREE.BufferAttribute(this.speeds, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    geometry.setDrawRange(0, 0)

    this.splatMaterial = new THREE.ShaderMaterial({
      uniforms: { uPointSize: { value: 24 }, uWeightScale: { value: 1 } },
      vertexShader: SPLAT_VERTEX,
      fragmentShader: SPLAT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Plain addition of the channels. THREE.AdditiveBlending is (SRC_ALPHA,
      // ONE), which would multiply every blob by its own alpha on the way in
      // and accumulate the square of the weight instead of the weight.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    })
    this.particles = new THREE.Points(geometry, this.splatMaterial)
    this.particles.frustumCulled = false
    this.particleScene.add(this.particles)

    this.rockData = new Uint8Array(blockWidth * blockHeight * 4)
    this.rockTexture = new THREE.DataTexture(
      this.rockData,
      blockWidth,
      blockHeight,
    )
    this.rockTexture.minFilter = THREE.NearestFilter
    this.rockTexture.magFilter = THREE.NearestFilter
    this.rockTexture.needsUpdate = true

    this.depthData = new Uint8Array(cellWidth * cellHeight)
    this.depthTexture = new THREE.DataTexture(
      this.depthData,
      cellWidth,
      cellHeight,
      THREE.RedFormat,
    )
    // Linear, unlike the block textures: this one is a smooth quantity and the
    // filtering is what hides that it is stored per cell.
    this.depthTexture.minFilter = THREE.LinearFilter
    this.depthTexture.magFilter = THREE.LinearFilter
    this.depthTexture.needsUpdate = true

    const rock = new THREE.TextureLoader().load('/dirtBlock.webp')
    rock.wrapS = THREE.RepeatWrapping
    rock.wrapT = THREE.RepeatWrapping
    rock.colorSpace = THREE.SRGBColorSpace

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uDensity: { value: this.density.texture },
        uDepth: { value: this.depthTexture },
        uBlocks: { value: this.rockTexture },
        uRock: { value: rock },
        uSize: { value: new THREE.Vector2(blockWidth, blockHeight) },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 256) },
        uTime: { value: 0 },
      },
      vertexShader: COMPOSITE_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
    })
    this.compositeScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.compositeMaterial),
    )
  }

  setSize(cssWidth: number, cssHeight: number) {
    this.renderer.setSize(cssWidth, cssHeight, false)
  }

  /** Rebuild the rock layer. Only needed when the terrain actually changes. */
  setBlocks(isSolid: (x: number, y: number) => boolean) {
    for (let x = 0; x < this.blockWidth; x++) {
      for (let y = 0; y < this.blockHeight; y++) {
        const i = (y * this.blockWidth + x) * 4
        this.rockData[i] = isSolid(x, y) ? 255 : 0
      }
    }
    this.rockTexture.needsUpdate = true
  }

  render(fluid: FlipFluid, elapsedSeconds: number) {
    if (this.disposed) return

    // Particle positions are in fluid cells; the shaders want clip space.
    const toClipX = 2 / fluid.width
    const toClipY = 2 / fluid.height
    for (let i = 0; i < fluid.count; i++) {
      this.positions[i * 3] = fluid.px[i]! * toClipX - 1
      this.positions[i * 3 + 1] = fluid.py[i]! * toClipY - 1
      this.speeds[i] = Math.hypot(fluid.pvx[i]!, fluid.pvy[i]!)
    }
    const position = this.particles.geometry.getAttribute('position')
    const speed = this.particles.geometry.getAttribute('speed')
    position.needsUpdate = true
    speed.needsUpdate = true
    this.particles.geometry.setDrawRange(0, fluid.count)

    // A particle's blob spans about three times the rest spacing, so
    // neighbours overlap into a continuous sheet rather than reading as a row
    // of beads, and finer particles draw as proportionally finer detail.
    const pixelsPerCell = this.density.width / fluid.width
    const pointSize = Math.max(pixelsPerCell * fluid.spacing * 6.4, 2)
    this.splatMaterial.uniforms.uPointSize!.value = pointSize

    // Scale the blobs so that water packed at its resting spacing sums to 1,
    // whatever the point size works out at. Without this the threshold in the
    // second pass is an arbitrary number that has to be re-tuned every time
    // anything changes, and set too low it cuts the field in the sparse tail
    // of the blobs, where every individual particle still shows as a lump.
    //
    // A blob of radius R integrates to πR²/4 of its peak, and rest packing
    // puts 1/spacing² particles in a cell, so full water sums to that many
    // blobs. Halving the spacing quarters R² and quadruples the count, so the
    // lone-particle peak the spray pass keys on stays put as well.
    const radiusInCells = pointSize / 2 / pixelsPerCell
    const particlesPerCell = 1 / (fluid.spacing * fluid.spacing)
    this.splatMaterial.uniforms.uWeightScale!.value =
      4 / (particlesPerCell * Math.PI * radiusInCells * radiusInCells)

    this.updateDepth(fluid)

    this.renderer.setRenderTarget(this.density)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.clear()
    this.renderer.render(this.particleScene, this.camera)

    this.renderer.setRenderTarget(null)
    this.compositeMaterial.uniforms.uTime!.value = elapsedSeconds
    this.renderer.render(this.compositeScene, this.camera)
  }

  /**
   * How much water stands above each cell.
   *
   * The density field cannot answer this: it is flat inside a body of water,
   * because it only measures how tightly packed the particles are locally, so
   * shading from it makes a puddle and the bottom of a lake the same colour.
   * Walking down each column of the solver's own grid is both cheap and exact.
   * It is uploaded at grid resolution and read back with linear filtering,
   * which smooths the steps out for free.
   */
  private updateDepth(fluid: FlipFluid) {
    const data = this.depthData
    for (let i = 0; i < fluid.width; i++) {
      let above = 0
      for (let j = fluid.height - 1; j >= 0; j--) {
        const cell = fluid.cell[i * fluid.height + j]
        // Rock and air both start the count again, so water under a ledge is
        // shaded by its own depth and not by whatever is above the ledge.
        above = cell === FLUID ? above + 1 : 0
        data[j * fluid.width + i] = Math.min(above * 8, 255)
      }
    }
    this.depthTexture.needsUpdate = true
  }

  dispose() {
    this.disposed = true
    this.depthTexture.dispose()
    this.density.dispose()
    this.particles.geometry.dispose()
    this.splatMaterial.dispose()
    this.compositeMaterial.dispose()
    this.rockTexture.dispose()
    this.renderer.dispose()
  }
}

const SPLAT_VERTEX = /* glsl */ `
uniform float uPointSize;
attribute float speed;
varying float vSpeed;
void main() {
  vSpeed = speed;
  gl_Position = vec4(position.xy, 0.0, 1.0);
  gl_PointSize = uPointSize;
}
`

const SPLAT_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uWeightScale;
varying float vSpeed;
void main() {
  // A smooth radial falloff, so overlapping particles add up to one lump with
  // no seam where they meet. A hard disc would tile visibly.
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(offset, offset);
  if (r2 > 1.0) discard;
  float weight = 1.0 - r2;
  weight = weight * weight * weight * uWeightScale;
  gl_FragColor = vec4(weight, weight * vSpeed, 0.0, weight);
}
`

const COMPOSITE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`

const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uDensity;
uniform sampler2D uDepth;
uniform sampler2D uBlocks;
uniform sampler2D uRock;
uniform vec2 uSize;
uniform vec2 uTexel;
uniform float uTime;

varying vec2 vUv;

// Water begins where the field crosses this. The splat pass is scaled so that
// water at its resting packing comes to 1, which makes half of that the honest
// place to put the surface — far enough up the blobs that the cut lands on
// their steep flank instead of out in the tail where every particle is its own
// lump.
const float SURFACE = 0.5;

float densityAt(vec2 uv) {
  return texture2D(uDensity, uv).r;
}

void main() {
  vec2 blockPos = vUv * uSize;
  float solid = texture2D(uBlocks, (floor(blockPos) + 0.5) / uSize).r;

  vec3 cave = vec3(0.045, 0.040, 0.055);
  vec3 rock = texture2D(uRock, blockPos).rgb;
  vec3 col = mix(cave, rock, solid);

  vec4 field = texture2D(uDensity, vUv);
  float density = field.r;
  float speed = field.r > 0.0001 ? field.g / field.r : 0.0;

  // The gradient of the field is the surface normal, free of charge, and it is
  // what lets flat shading read as a rounded body of water.
  float dx =
    densityAt(vUv + vec2(uTexel.x, 0.0)) - densityAt(vUv - vec2(uTexel.x, 0.0));
  float dy =
    densityAt(vUv + vec2(0.0, uTexel.y)) - densityAt(vUv - vec2(0.0, uTexel.y));
  vec3 normal = normalize(vec3(-dx, -dy, 0.35));

  float water = smoothstep(SURFACE - 0.22, SURFACE + 0.06, density);
  // How much water stands above this point, worked out on the grid rather than
  // from the field above, which is flat inside a body and so cannot tell a
  // puddle from the bottom of a lake.
  float depth = clamp(texture2D(uDepth, vUv).r * 255.0 / 8.0 / 9.0, 0.0, 1.0);

  vec3 shallow = vec3(0.36, 0.72, 0.78);
  vec3 deep = vec3(0.02, 0.13, 0.34);
  vec3 waterCol = mix(shallow, deep, depth);

  // Churn shows as white water. Mostly that is speed; a little of it is water
  // thin enough to be spray rather than a body, but only just — leaning on
  // thinness alone puts a bright rim around everything.
  float foam = smoothstep(16.0, 55.0, speed) * (1.0 - depth * 0.7);
  foam += smoothstep(SURFACE - 0.1, SURFACE - 0.45, density) * water * 0.18;
  waterCol = mix(waterCol, vec3(0.92, 0.97, 1.0), clamp(foam, 0.0, 0.8));

  // A light from the upper left, and a tight specular for wet highlights —
  // both kept to the skin of the water. The gradient of the field is only a
  // surface normal near the surface; deeper in it is the noise between one
  // particle and the next, and lighting the whole volume with it mottles the
  // inside of every pool with dark blotches.
  float skin = 1.0 - smoothstep(SURFACE + 0.05, SURFACE + 0.40, density);
  vec3 toLight = normalize(vec3(-0.4, 0.85, 0.5));
  float diffuse = clamp(dot(normal, toLight) * 0.5 + 0.6, 0.0, 1.2);
  float specular = pow(clamp(dot(normal, toLight), 0.0, 1.0), 28.0);
  waterCol *= mix(1.0, diffuse, skin);
  waterCol += vec3(1.0) * specular * 0.5 * skin;

  // Thicker water hides more of the rock behind it.
  float opacity = mix(0.55, 0.95, depth);
  col = mix(col, waterCol, water * opacity);

  // Water below the cut has not stopped existing — a lone particle's blob
  // peaks around 0.12 and a resting pair around 0.25, both under it — so
  // without this, spray and droplets vanish into thin air and pop back into
  // being wherever they land. Drawn faint, and faded up with speed, so flying
  // spray shows clearly while the thin tail of a calm pool's field reads as a
  // narrow wet rim at the waterline rather than a glow around every body.
  float spray = smoothstep(0.05, 0.115, density) * (1.0 - water);
  float sprayOpacity = spray * (0.25 + 0.45 * smoothstep(6.0, 30.0, speed));
  vec3 sprayCol = mix(waterCol, vec3(0.85, 0.94, 1.0), 0.45);
  col = mix(col, sprayCol, sprayOpacity);

  // Rock in front of the water rather than behind it, so a splash against a
  // wall is cut off at the wall instead of smeared over it.
  col = mix(col, rock, solid);

  gl_FragColor = vec4(col, 1.0);
}
`
