import * as THREE from './vendor/three.mjs'

// Scene materials and landmark models live here so artwork can change independently of gameplay.
const colors = {
  sky: 0xffe2ad, earth: 0x264d43, wall: 0x24857b, wallShade: 0x206d6a,
  cap: 0xffbb6f, plinth: 0x163d39, stripe: 0x73c5b2, path: 0xdba068,
  entry: 0x9febaf, exit: 0xffcf4d,
}
const box = new THREE.BoxGeometry()
const post = new THREE.CylinderGeometry(1, 1, 1, 8)
const eye = .65
const wallHeight = .98

function addBatch(scene, geometry, items, { color = 0xffffff, ...options } = {}) {
  const batch = new THREE.InstancedMesh(geometry.clone(), new THREE.MeshLambertMaterial({ color, ...options }), items.length)
  const transform = new THREE.Object3D()
  const tint = new THREE.Color()
  items.forEach(({ at, scale, yaw = 0, tint: shade }, index) => {
    transform.position.set(...at)
    transform.scale.set(...scale)
    transform.rotation.y = yaw
    transform.updateMatrix()
    batch.setMatrixAt(index, transform.matrix)
    if (shade !== undefined) batch.setColorAt(index, tint.setHex(shade))
  })
  scene.add(batch)
  return batch
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
    rims.push({ at: [x, wallHeight, z], scale: [width * .575, .055, width * .575] })
  }
  addBatch(scene, box, panels)
  addBatch(scene, box, caps, { color: colors.cap })
  addBatch(scene, box, plinths, { color: colors.plinth })
  addBatch(scene, box, stripes, { color: colors.stripe })
  addBatch(scene, post, posts, { color: colors.wallShade })
  addBatch(scene, post, rims, { color: colors.cap })
}

function groundTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
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
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function floorMesh(scene, { polygons }, texture) {
  const positions = [], uvs = []
  for (const polygon of polygons) {
    if (!polygon) continue
    const contour = polygon.map(([x, z]) => new THREE.Vector2(x, z))
    for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
      for (const index of triangle) {
        const { x, y: z } = contour[index]
        positions.push(x, 0, z)
        uvs.push(x, z)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  const material = new THREE.MeshLambertMaterial({ color: colors.path, map: texture, side: THREE.DoubleSide })
  scene.add(new THREE.Mesh(geometry, material))
}

function gateway(scene, [, [x, z], [nx, nz]], tint, isExit) {
  const yaw = Math.atan2(nx, nz)
  const gate = new THREE.Group()
  const gold = new THREE.MeshLambertMaterial({ color: tint, emissive: tint, emissiveIntensity: .19 })
  const dark = new THREE.MeshLambertMaterial({ color: 0x285342 })
  function piece(geometry, material, position, scale) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    gate.add(mesh)
  }
  for (const side of [-1, 1]) {
    piece(box, dark, [side * .42, .44, 0], [.085, .88, .12])
    piece(box, gold, [side * .42, .53, 0], [.1, .055, .14])
    piece(box, gold, [side * .42, .85, 0], [.1, .055, .14])
  }
  piece(box, gold, [0, 1.035, 0], [.96, .115, .15])
  piece(box, gold, [0, .015, 0], [.8, .025, .22])
  if (isExit) {
    const crystal = new THREE.OctahedronGeometry(.15)
    piece(crystal, gold, [0, 1.21, 0], [1, 1.25, 1])
  }
  gate.position.set(x, 0, z)
  gate.rotation.y = yaw
  scene.add(gate)
}

function scenery(scene, bounds) {
  const [left, top, right, bottom] = bounds
  const cx = (left + right) / 2
  const cz = (top + bottom) / 2
  const reach = Math.max(right - left, bottom - top) * .5
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(160, 160),
    new THREE.MeshLambertMaterial({ color: colors.earth }))
  terrain.position.set(cx, -.045, cz)
  terrain.rotation.x = -Math.PI / 2
  scene.add(terrain)

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
  const peak = new THREE.ConeGeometry(1, 1, 5)
  const rock = new THREE.IcosahedronGeometry(1)
  addBatch(scene, peak, mountains)
  addBatch(scene, peak, leaves)
  addBatch(scene, post, trunks, { color: 0x8e6a4a })
  addBatch(scene, rock, boulders)
  peak.dispose()
  rock.dispose()
}

function dinosaur(scene, [, top, right, bottom]) {
  const model = new THREE.Group()
  const skin = new THREE.MeshLambertMaterial({ color: 0x75b755, flatShading: true })
  const belly = new THREE.MeshLambertMaterial({ color: 0xd1cf77, flatShading: true })
  const pupil = new THREE.MeshLambertMaterial({ color: 0x203b2a })
  const shape = new THREE.IcosahedronGeometry(1, 1)
  function part(material, position, scale, tilt = 0) {
    const mesh = new THREE.Mesh(shape, material)
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.rotation.z = tilt
    model.add(mesh)
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
  model.scale.setScalar(1.35)
  scene.add(model)
}

export class World {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65))
    this.renderer.setClearColor(colors.sky)
    this.camera = new THREE.PerspectiveCamera(68, 1, .025, 130)
    this.camera.rotation.order = 'YXZ'
    this.overhead = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 170)
    this.texture = groundTexture()
    this.hint = null
  }

  load(layout) {
    this.scene?.traverse(object => {
      object.dispose?.()
      if (!object.isMesh) return
      if (object.geometry !== box) object.geometry.dispose()
      object.material.dispose()
    })
    this.layout = layout
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(colors.sky)
    this.scene.fog = new THREE.FogExp2(colors.sky, .028)
    this.scene.add(new THREE.HemisphereLight(0xffedcf, 0x699b89, 2.15))
    const sun = new THREE.DirectionalLight(0xffdeaa, 2.2)
    sun.position.set(-9, 15, 8)
    this.scene.add(sun)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    scenery(this.scene, layout.data.bounds)
    floorMesh(this.scene, layout.data, this.texture)
    wallMeshes(this.scene, layout)
    dinosaur(this.scene, layout.data.bounds)
    gateway(this.scene, layout.data.openings[0], colors.entry, false)
    gateway(this.scene, layout.data.openings[1], colors.exit, true)

    // Reserve enough instances for the shortest visible trail (four upcoming passages).
    const print = new THREE.CircleGeometry(1, 12)
    print.rotateX(-Math.PI / 2)
    this.hint = new THREE.InstancedMesh(print, new THREE.MeshBasicMaterial({ color: 0xffeb89 }), 75)
    this.hint.frustumCulled = false
    this.hint.count = 0
    this.scene.add(this.hint)
    this.resize()
  }

  resize() {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    this.renderer.setSize(width, height, false)
    const aspect = width / height
    this.camera.aspect = aspect
    this.camera.fov = aspect < 1 ? 78 : 65
    this.camera.updateProjectionMatrix()
    if (!this.layout) return
    const [left, top, right, bottom] = this.layout.data.bounds
    const x = (left + right) / 2
    const z = (top + bottom) / 2
    const size = Math.max(right - left, bottom - top)
    const mobile = width <= 630
    const halfHeight = size * (mobile ? .74 / Math.min(aspect, 1) : .60)
    this.overhead.left = -halfHeight * aspect
    this.overhead.right = halfHeight * aspect
    this.overhead.top = halfHeight
    this.overhead.bottom = -halfHeight
    this.overhead.position.set(x + 14, 30, z + 20)
    this.overhead.lookAt(x, 0, z)
    this.overhead.setViewOffset(width, height, mobile ? 0 : -width * .18, mobile ? height * .20 : 0, width, height)
    this.overhead.updateProjectionMatrix()
  }

  setHint(points) {
    const print = new THREE.Object3D()
    let count = 0
    for (let i = 1; i < points.length && count < 75; i++) {
      const [x, z] = points[i - 1]
      const [tx, tz] = points[i]
      const distance = Math.hypot(tx - x, tz - z)
      const steps = Math.max(1, Math.round(distance / .18))
      for (let step = 0; step < steps && count < 75; step++) {
        const t = (step + .5) / steps
        const yaw = Math.atan2(tx - x, tz - z)
        const offset = count % 2 ? -.062 : .062
        print.position.set(x + (tx - x) * t + Math.cos(yaw) * offset, .007, z + (tz - z) * t - Math.sin(yaw) * offset)
        print.rotation.y = yaw
        print.scale.set(.037, 1, .063)
        print.updateMatrix()
        this.hint.setMatrixAt(count++, print.matrix)
      }
    }
    this.hint.count = count
    this.hint.instanceMatrix.needsUpdate = true
  }

  showPreview() {
    if (!this.scene) return
    const fog = this.scene.fog
    fog.density = .013
    this.renderer.render(this.scene, this.overhead)
    fog.density = .028
  }

  draw({ x, z, yaw, pitch }) {
    this.camera.position.set(x, eye, z)
    this.camera.rotation.set(pitch, yaw + Math.PI, 0)
    this.renderer.render(this.scene, this.camera)
  }
}
