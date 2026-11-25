import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera.js'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js'
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import '@babylonjs/core/Meshes/thinInstanceMesh.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { Scene } from '@babylonjs/core/scene.js'
import earcut from 'earcut'

// Scene materials and landmark models live here so artwork can change independently of gameplay.
const colors = {
  sky: 0xffe2ad, earth: 0x264d43, wall: 0x24857b, wallShade: 0x206d6a,
  cap: 0xffbb6f, plinth: 0x163d39, stripe: 0x73c5b2, path: 0xdba068,
  entry: 0x9febaf, exit: 0xffcf4d,
}
const eye = .65
const wallHeight = .98

const hintCapacity = 75
const engineOptions = { antialias: true, powerPreference: 'high-performance' }
const color3 = hex => Color3.FromInts(hex >> 16, (hex >> 8) & 255, hex & 255)

async function createWebGLEngine(canvas) {
  const { Engine } = await import('@babylonjs/core/Engines/engine.js')
  return new Engine(canvas, engineOptions.antialias, engineOptions)
}

function surface(scene, name, color, glow = 0) {
  const material = new StandardMaterial(name, scene)
  material.diffuseColor = color3(color)
  material.specularColor = Color3.Black()
  material.emissiveColor = material.diffuseColor.scale(glow)
  return material
}

function writeTransforms(items, buffer, pitch = 0) {
  const position = Vector3.Zero()
  const scale = Vector3.Zero()
  const rotation = Quaternion.Identity()
  const matrix = Matrix.Identity()
  for (const [i, { at, scale: size, yaw = 0 }] of items.entries()) {
    position.set(...at)
    scale.set(...size)
    Quaternion.RotationYawPitchRollToRef(yaw, pitch, 0, rotation)
    Matrix.ComposeToRef(scale, rotation, position, matrix)
    matrix.copyToArray(buffer, i * 16)
  }
}

function addBatch(scene, name, build, options, items, color = 0xffffff) {
  if (!items.length) return
  const mesh = build(name, options, scene)
  mesh.material = surface(scene, name, color)
  mesh.isPickable = false
  const transforms = new Float32Array(items.length * 16)
  writeTransforms(items, transforms)
  mesh.thinInstanceSetBuffer('matrix', transforms)
  if (items[0].tint !== undefined) {
    const tints = new Float32Array(items.length * 4)
    items.forEach(({ tint }, i) => {
      const { r, g, b } = color3(tint)
      tints.set([r, g, b, 1], i * 4)
    })
    mesh.thinInstanceSetBuffer('color', tints, 4)
  }
}

function wallMeshes(scene, layout) {
  const panels = [], caps = [], plinths = [], stripes = [], posts = [], rims = []
  const joints = new Map()
  const width = layout.wallWidth
  for (const [[ax, az], [bx, bz]] of layout.segments) {
    const dx = bx - ax
    const dz = bz - az
    const length = Math.hypot(dx, dz)
    const yaw = -Math.atan2(dz, dx)
    const x = (ax + bx) / 2
    const z = (az + bz) / 2
    const wallTint = Math.abs(dx) > Math.abs(dz) ? colors.wall : colors.wallShade
    panels.push({ at: [x, wallHeight / 2, z], scale: [length, wallHeight, width], yaw, tint: wallTint })
    caps.push({ at: [x, wallHeight, z], scale: [length, .055, width * 1.15], yaw })
    plinths.push({ at: [x, .053, z], scale: [length, .106, width * 1.05], yaw })
    stripes.push({ at: [x, .785, z], scale: [length, .025, width * 1.04], yaw })
    joints.set(`${ax},${az}`, [ax, az])
    joints.set(`${bx},${bz}`, [bx, bz])
  }
  for (const [x, z] of joints.values()) {
    posts.push({ at: [x, wallHeight / 2, z], scale: [width / 2, wallHeight, width / 2] })
    rims.push({ at: [x, wallHeight + .001, z], scale: [width * .575, .055, width * .575] })
  }
  const column = { diameter: 2, height: 1, tessellation: 8 }
  addBatch(scene, 'walls', CreateBox, {}, panels)
  addBatch(scene, 'wall caps', CreateBox, {}, caps, colors.cap)
  addBatch(scene, 'wall bases', CreateBox, {}, plinths, colors.plinth)
  addBatch(scene, 'wall stripes', CreateBox, {}, stripes, colors.stripe)
  addBatch(scene, 'wall joints', CreateCylinder, column, posts, colors.wallShade)
  addBatch(scene, 'joint caps', CreateCylinder, column, rims, colors.cap)
}

function groundTexture(scene) {
  const texture = new DynamicTexture('floor tiles', 128, scene, true, Texture.TRILINEAR_SAMPLINGMODE)
  const ctx = texture.getContext()
  ctx.fillStyle = '#eee0be'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#e3d1ae'
  ctx.fillRect(64, 0, 64, 64)
  ctx.fillRect(0, 64, 64, 64)
  ctx.strokeStyle = '#bfa17b'
  ctx.lineWidth = 1.5
  ctx.strokeRect(0, 0, 128, 128)
  ctx.beginPath()
  ctx.moveTo(64, 0)
  ctx.lineTo(64, 128)
  ctx.moveTo(0, 64)
  ctx.lineTo(128, 64)
  ctx.stroke()
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE
  texture.anisotropicFilteringLevel = 4
  texture.update()
  return texture
}

function floorMesh(scene, { polygons }) {
  const positions = [], normals = [], uvs = [], indices = []
  for (const polygon of polygons) {
    if (!polygon) continue
    const offset = positions.length / 3
    for (const [x, z] of polygon) {
      positions.push(x, 0, z)
      normals.push(0, 1, 0)
      uvs.push(x, z)
    }
    for (const index of earcut(polygon.flat())) indices.push(offset + index)
  }
  const mesh = new Mesh('maze floor', scene)
  const geometry = new VertexData()
  Object.assign(geometry, { positions, normals, uvs, indices })
  geometry.applyToMesh(mesh)
  const material = surface(scene, 'tiles', colors.path)
  material.diffuseTexture = groundTexture(scene)
  material.backFaceCulling = false
  mesh.material = material
}

function gateway(scene, [, [x, z], [nx, nz]], tint, isExit) {
  const name = isExit ? 'exit gate' : 'entry gate'
  const gate = new TransformNode(name, scene)
  const gold = surface(scene, `${name} accents`, tint, .19)
  const dark = surface(scene, `${name} posts`, 0x285342)
  function piece(material, at, scale, crystal = false) {
    const mesh = crystal ? CreatePolyhedron('exit crystal', { type: 1, size: .15 }, scene) :
      CreateBox(name, {}, scene)
    mesh.material = material
    mesh.parent = gate
    mesh.position.set(...at)
    mesh.scaling.set(...scale)
  }
  for (const side of [-1, 1]) {
    piece(dark, [side * .42, .44, 0], [.085, .88, .12])
    piece(gold, [side * .42, .53, 0], [.1, .055, .14])
    piece(gold, [side * .42, .85, 0], [.1, .055, .14])
  }
  piece(gold, [0, 1.035, 0], [.96, .115, .15])
  piece(gold, [0, .015, 0], [.8, .025, .22])
  if (isExit) piece(gold, [0, 1.21, 0], [1, 1.25, 1], true)
  gate.position.set(x, 0, z)
  gate.rotation.y = Math.atan2(nx, nz)
}

function scenery(scene, bounds) {
  const [left, top, right, bottom] = bounds
  const cx = (left + right) / 2
  const cz = (top + bottom) / 2
  const reach = Math.max(right - left, bottom - top) * .5
  const terrain = CreateGround('terrain', { width: 160, height: 160 }, scene)
  terrain.material = surface(scene, 'earth', colors.earth)
  terrain.position.set(cx, -.045, cz)

  let randomSeed = 72
  function random() {
    randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0
    return randomSeed / 4294967296
  }
  const mountains = [], trunks = [], leaves = [], boulders = []
  for (let i = 0; i < 30; i++) {
    const angle = i / 30 * Math.PI * 2
    const radius = reach + 12 + random() * 12
    const height = 3 + random() * 13
    const span = 4 + random() * 8
    mountains.push({ at: [cx + Math.cos(angle) * radius, height / 2 - 1, cz + Math.sin(angle) * radius],
      scale: [span, height, span], yaw: random() * 6, tint: i % 2 ? 0x608d75 : 0x456953 })
  }
  for (let i = 0; i < 105; i++) {
    const x = left - 12 + random() * (right - left + 24)
    const z = top - 12 + random() * (bottom - top + 24)
    if (x > left - .65 && x < right + .65 && z > top - .65 && z < bottom + .65) continue
    const size = .5 + random() * 1.5
    if (i % 4 === 0) {
      boulders.push({ at: [x, .14 * size, z], scale: [.52 * size, .31 * size, .37 * size],
        yaw: random() * 6, tint: i % 3 ? 0x718263 : 0xaf8662 })
      continue
    }
    trunks.push({ at: [x, size * .36, z], scale: [.075 * size, size * .72, .075 * size] })
    for (let tier = 0; tier < 2; tier++) {
      const branch = size * (.48 - tier * .12)
      leaves.push({ at: [x, size * (.77 + tier * .39), z], scale: [branch, size * .92, branch],
        yaw: random() * 6, tint: tier ? 0x80b452 : 0x4f823f })
    }
  }
  const cone = { diameterBottom: 2, diameterTop: 0, height: 1, tessellation: 5 }
  addBatch(scene, 'mountains', CreateCylinder, cone, mountains)
  addBatch(scene, 'foliage', CreateCylinder, cone, leaves)
  addBatch(scene, 'trunks', CreateCylinder, { diameter: 2, height: 1, tessellation: 8 }, trunks, 0x8e6a4a)
  addBatch(scene, 'boulders', CreateIcoSphere, { subdivisions: 1 }, boulders)
}

function dinosaur(scene, [, top, right, bottom]) {
  const model = new TransformNode('dinosaur', scene)
  const skin = surface(scene, 'dinosaur skin', 0x75b755)
  const belly = surface(scene, 'dinosaur belly', 0xd1cf77)
  const pupil = surface(scene, 'dinosaur eyes', 0x203b2a)
  function part(material, position, scale, tilt = 0) {
    const mesh = CreateIcoSphere('dinosaur part', { subdivisions: 2 }, scene)
    mesh.material = material
    mesh.parent = model
    mesh.position.set(...position)
    mesh.scaling.set(...scale)
    mesh.rotation.z = tilt
  }
  part(skin, [0, .8, 0], [.73, .39, .32])
  part(belly, [-.04, .67, 0], [.59, .25, .28])
  for (const x of [-.36, .38]) {
    for (const z of [-.19, .19]) part(skin, [x, .38, z], [.14, .39, .14], -.08)
  }
  part(skin, [-.72, .75, 0], [.56, .14, .14], .22)
  part(skin, [.47, 1.26, 0], [.20, .65, .18], -.23)
  part(skin, [.70, 1.81, 0], [.33, .17, .20], -.13)
  part(belly, [.79, 1.73, 0], [.22, .09, .16])
  for (const z of [-.174, .174]) part(pupil, [.77, 1.86, z], [.046, .055, .035])
  model.position.set(right + 1.18, 0, (top + bottom) / 2 + .8)
  model.rotation.y = -2.25
  model.scaling.setAll(1.35)
}

export class World {
  static async create(canvas, preferWebGPU = true) {
    if (preferWebGPU && navigator.gpu) {
      // A failed WebGPU attempt can claim the canvas context. Keep the original
      // canvas available for WebGL until the new engine is fully initialized.
      const candidate = canvas.cloneNode()
      let engine
      try {
        const { WebGPUEngine } = await import('@babylonjs/core/Engines/webgpuEngine.js')
        if (await WebGPUEngine.IsSupportedAsync) {
          engine = new WebGPUEngine(candidate, engineOptions)
          await engine.initAsync()
          canvas.replaceWith(candidate)
          return new World(candidate, engine)
        }
      } catch (error) {
        engine?.dispose()
        console.warn('Babylon.js will use WebGL after WebGPU initialization failed.', error)
      }
    }
    return new World(canvas, await createWebGLEngine(canvas))
  }

  constructor(canvas, engine) {
    this.target = Vector3.Zero()
    this.hintTransforms = new Float32Array(hintCapacity * 16)
    this.attachEngine(canvas, engine)
  }

  attachEngine(canvas, engine) {
    this.canvas = canvas
    this.engine = engine
    canvas.dataset.renderer = engine.isWebGPU ? 'webgpu' : 'webgl'
    engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.65))
    if (engine.isWebGPU) engine.onContextLostObservable.addOnce(() => this.fallbackToWebGL())
  }

  async fallbackToWebGL() {
    this.switchingEngine = true
    const canvas = this.canvas.cloneNode()
    let engine
    try {
      engine = await createWebGLEngine(canvas)
    } catch (error) {
      this.switchingEngine = false
      console.warn('WebGL recovery failed after the WebGPU device was lost.', error)
      return
    }

    const previousEngine = this.engine
    this.canvas.replaceWith(canvas)
    // Babylon may already be restoring the old device. Dispose it when that
    // attempt finishes, with a timeout for devices that never recover.
    const release = setTimeout(() => previousEngine.dispose(), 3000)
    previousEngine.onContextRestoredObservable.addOnce(() => {
      clearTimeout(release)
      previousEngine.dispose()
    })
    this.scene = null
    this.attachEngine(canvas, engine)
    this.switchingEngine = false
    if (!this.layout) return
    const { layout, hintPoints, lastPlayer } = this
    // Babylon owns the GPU resources. Rebuild them from the same layout and
    // keep the simulation state and input surface in place.
    this.load(layout)
    this.setHint(hintPoints)
    if (lastPlayer) this.draw(lastPlayer)
    else this.showPreview()
  }

  load(layout) {
    this.layout = layout
    this.hintPoints = []
    this.lastPlayer = null
    if (this.switchingEngine) return
    this.scene?.dispose()
    const scene = this.scene = new Scene(this.engine)
    // Match the original world axes and the headings used by controls and the map.
    scene.useRightHandedSystem = true
    scene.skipPointerMovePicking = true
    const sky = color3(colors.sky)
    scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1)
    scene.fogColor = sky
    scene.fogMode = Scene.FOGMODE_EXP2
    scene.fogDensity = .028
    const hemisphere = new HemisphericLight('sky', Vector3.Up(), scene)
    hemisphere.diffuse = color3(0xffedcf)
    hemisphere.groundColor = color3(0x699b89)
    hemisphere.intensity = .8
    const sun = new DirectionalLight('sun', new Vector3(9, -15, -8).normalize(), scene)
    sun.diffuse = color3(0xffdeaa)
    sun.intensity = .85

    this.camera = new TargetCamera('first person', Vector3.Zero(), scene)
    this.camera.minZ = .025
    this.camera.maxZ = 130
    this.overhead = new TargetCamera('overhead', Vector3.Zero(), scene)
    this.overhead.mode = Camera.ORTHOGRAPHIC_CAMERA
    this.overhead.minZ = .1
    this.overhead.maxZ = 170

    scenery(scene, layout.data.bounds)
    floorMesh(scene, layout.data)
    wallMeshes(scene, layout)
    dinosaur(scene, layout.data.bounds)
    gateway(scene, layout.data.openings[0], colors.entry, false)
    gateway(scene, layout.data.openings[1], colors.exit, true)

    this.hint = CreateDisc('footprints', { tessellation: 12 }, scene)
    this.hint.material = surface(scene, 'footprint glow', 0xffeb89, 1)
    this.hint.material.disableLighting = true
    this.hint.material.backFaceCulling = false
    this.hint.isPickable = false
    this.hint.alwaysSelectAsActiveMesh = true
    this.hint.doNotSyncBoundingInfo = true
    this.hint.thinInstanceSetBuffer('matrix', this.hintTransforms, 16, false)
    this.hint.setEnabled(false)
    this.resize()

    // The menu is static, so redraw once the asynchronously loaded shaders are ready.
    scene.executeWhenReady(() => {
      if (this.scene !== scene) return
      if (this.lastPlayer) this.draw(this.lastPlayer)
      else this.showPreview()
    })
  }

  resize() {
    if (this.switchingEngine) return
    this.engine.resize()
    if (!this.layout) return
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    const aspect = width / height
    this.camera.fov = (aspect < 1 ? 78 : 65) * Math.PI / 180
    const [left, top, right, bottom] = this.layout.data.bounds
    const x = (left + right) / 2
    const z = (top + bottom) / 2
    const size = Math.max(right - left, bottom - top)
    const mobile = width <= 630
    const halfHeight = size * (mobile ? .74 / Math.min(aspect, 1) : .60)
    const halfWidth = halfHeight * aspect
    const horizontalOffset = mobile ? 0 : -.36 * halfWidth
    const verticalOffset = mobile ? -.40 * halfHeight : 0
    this.overhead.orthoLeft = horizontalOffset - halfWidth
    this.overhead.orthoRight = horizontalOffset + halfWidth
    this.overhead.orthoTop = verticalOffset + halfHeight
    this.overhead.orthoBottom = verticalOffset - halfHeight
    this.overhead.position.set(x + 14, 30, z + 20)
    this.overhead.setTarget(this.target.set(x, 0, z))
  }

  setHint(points) {
    this.hintPoints = points
    if (this.switchingEngine) return
    const prints = []
    for (let i = 1; i < points.length && prints.length < hintCapacity; i++) {
      const [x, z] = points[i - 1]
      const [tx, tz] = points[i]
      const distance = Math.hypot(tx - x, tz - z)
      const steps = Math.max(1, Math.round(distance / .18))
      const yaw = Math.atan2(tx - x, tz - z)
      for (let step = 0; step < steps && prints.length < hintCapacity; step++) {
        const t = (step + .5) / steps
        const offset = prints.length % 2 ? -.062 : .062
        prints.push({
          at: [x + (tx - x) * t + Math.cos(yaw) * offset, .007, z + (tz - z) * t - Math.sin(yaw) * offset],
          scale: [.037, .063, 1],
          yaw,
        })
      }
    }
    this.hint.setEnabled(prints.length > 0)
    if (!prints.length) return
    writeTransforms(prints, this.hintTransforms, Math.PI / 2)
    this.hint.thinInstanceCount = prints.length
    this.hint.thinInstanceBufferUpdated('matrix')
  }

  render(camera, fogDensity) {
    this.scene.activeCamera = camera
    this.scene.fogDensity = fogDensity
    this.engine.beginFrame()
    try {
      this.scene.render()
    } finally {
      this.engine.endFrame()
    }
  }

  showPreview() {
    this.lastPlayer = null
    if (this.scene && !this.switchingEngine) this.render(this.overhead, .013)
  }

  draw(player) {
    this.lastPlayer = player
    if (this.switchingEngine) return
    const { x, z, yaw, pitch } = player
    this.camera.position.set(x, eye, z)
    const horizontal = Math.cos(pitch)
    this.camera.setTarget(this.target.set(x + Math.sin(yaw) * horizontal, eye + Math.sin(pitch),
      z + Math.cos(yaw) * horizontal))
    this.render(this.camera, .028)
  }
}
