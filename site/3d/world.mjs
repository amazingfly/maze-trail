import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js'
import { Hatchling } from './hatchling.mjs'
import { voiceEnvelope, trailheadDinosaurs, trailheadGesture } from './hatchling-play.mjs'
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera.js'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { fern, creeper, broadleaf, hedgeShoot } from './flora.mjs'
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
import { crystals, effectLimit, smokeLimit } from './expedition.mjs'
import { TrackGround, trackShapes, trackMesh } from './tracks.mjs'

// Scene materials and landmark models live here so artwork can change independently of gameplay.
const colors = {
  sky: 0xe3d4b4, earth: 0x586844, path: 0xfff2dc,
  entry: 0x49ede5, exit: 0xffcf4d,
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

function addBatch(scene, name, build, options, items, color = 0xffffff, material = null) {
  if (!items.length) return
  const mesh = build(name, options, scene)
  mesh.material = material ?? surface(scene, name, color)
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
  return mesh
}

function texture(scene, name) {
  const map = new Texture(new URL(`./environment/${name}.webp`, import.meta.url).href, scene)
  map.anisotropicFilteringLevel = 4
  return map
}

function wallMeshes(scene, layout) {
  const geometry = () => ({positions:[], indices:[], uvs:[], normals:[], colors:[]})
  const stoneFace = geometry(), hedgeFace = geometry()
  const outcrops = [], sprays = []
  const vines = [], ferns = [], bushes = [], stones = [], pillars = []
  const ends = new Map()
  let seed = layout.data.centers.length
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296)
  const half = layout.wallWidth / 2
  let distance = 0
  for (const [index,[[ax,az],[bx,bz]]] of layout.originalSegments.entries()) {
    const length = Math.hypot(bx-ax,bz-az)
    const from=distance
    distance+=length
    if (layout.destroyed.has(index)) continue
    seed=Math.imul(index+1,2654435761) ^ layout.data.centers.length
    const nx = (az-bz)/length, nz = (bx-ax)/length
    // A continuous field gives neighbouring wall segments the same habitat.
    const growth = (x,z) => Math.sin(1.27*x+.72*z)+.77*Math.cos(1.63*z-.48*x)
    const hedge = growth((ax+bx)/2,(az+bz)/2) > -.12
    const {positions, indices, uvs, normals, colors} = hedge ? hedgeFace : stoneFace
    const top = (x,z) => wallHeight + .09*Math.sin(3*x+2*z) + .044*Math.sin(9*z-3*x)
      + .10*Math.max(0,growth(x,z))
    function quad(points, normal, light, uv) {
      const start = positions.length/3
      points.forEach((point,i) => {
        positions.push(...point)
        normals.push(...normal)
        colors.push(light[i],light[i],light[i],1)
        uvs.push(...uv[i])
      })
      indices.push(start,start+1,start+2,start,start+2,start+3)
    }
    for (const [x,z] of [[ax,az],[bx,bz]]) {
      const key = x + ',' + z
      const end = ends.get(key)
      if (end) end.count++
      else ends.set(key,{x,z,count:1})
    }
    const u = from/1.36, v = distance/1.36
    for (const sign of [-1,1]) {
      const x=ax+sign*nx*half,z=az+sign*nz*half,xx=bx+sign*nx*half,zz=bz+sign*nz*half
      quad([[x,0,z],[xx,0,zz],[xx,top(bx,bz),zz],[x,top(ax,az),z]],
        [sign*nx,0,sign*nz],[.60,.60,1,1],[[u,0],[v,0],[v,.88],[u,.88]])
      const yaw = Math.atan2(sign*nx,sign*nz)
      const steps = Math.max(1,Math.ceil(length/.19))
      for (let k=0; k<steps; k++) {
        const t=(k+.5)/steps, px=x+(xx-x)*t, pz=z+(zz-z)*t
        const h=top(px,pz)
        if (hedge) {
          for (const layer of [.17,.49,.79,1]) {
            const width=.25+random()*.24
            sprays.push({at:[px,h*layer-random()*.10,pz],
              scale:[width,.21+random()*.25,.16+random()*.08],yaw:yaw+(random()-.5)*.95,
              tint:random()<.27?0xd8cc99:0xe4efd1})
          }
        } else {
          for (const layer of [.14,.45,.76,.96]) {
            if (random()<.32) continue
            outcrops.push({at:[px,h*(layer+(random()-.5)*.17),pz],
              scale:[.13+random()*.22,.08+random()*.14,.045+random()*.07],
              yaw:yaw+(random()-.5)*.28,tint:random()<.26?0x9aa276:0xd2c7ab})
          }
        }
      }
      if (random()<length*(hedge?1.25:2.1)) {
        const t=random(), size=.63+.55*random()
        vines.push({at:[x+(xx-x)*t+.004*sign*nx,top(ax,az),z+(zz-z)*t+.004*sign*nz],
          scale:[size,size,size],yaw:Math.atan2(sign*nx,sign*nz)})
      }
      if (random()<length*.75) {
        const t=random(), size=.10+.13*random()
        const at=[x+(xx-x)*t,0,z+(zz-z)*t]
        bushes.push({at,scale:[size*1.5,size*2.0,size*1.5],yaw:random()*6})
        stones.push({at,scale:[size*.78,size*.48,size*.64],yaw:random()*6,tint:random()<.5?0x787354:0x958475})
        if(random()<.58) ferns.push({at,scale:[size*1.1,size*1.5,size*1.1],yaw:random()*6})
      }
    }
    const pts=[[ax+nx*half,top(ax,az),az+nz*half],[bx+nx*half,top(bx,bz),bz+nz*half],
      [bx-nx*half,top(bx,bz),bz-nz*half],[ax-nx*half,top(ax,az),az-nz*half]]
    quad(pts,[0,1,0],[.84,.84,.84,.84],pts.map(([x,,z])=>[x,z]))
  }
  for(const {x,z,count} of ends.values()) {
    if(count===2) continue
    pillars.push({at:[x,.49,z],scale:[half*1.06,.98,half*1.06],yaw:0})
  }
  addBatch(scene,'exposed rock ends',CreateCylinder,{diameter:2,height:1,tessellation:7},pillars,0x94775a)
  for (const [name,geometry,map] of [['fractured bluff',stoneFace,'fracture'],['living hedge',hedgeFace,'hedge']]) {
    if (!geometry.indices.length) continue
    const mesh=new Mesh(name,scene)
    const data=new VertexData()
    Object.assign(data,geometry)
    data.applyToMesh(mesh)
    mesh.material=surface(scene,name,0xfff6e5)
    mesh.material.diffuseTexture=texture(scene,map)
    mesh.material.backFaceCulling=false
    mesh.material.emissiveColor=color3(0x201c13)
  }
  // Cull the dense relief in patches so a distant wall can leave the draw list.
  for (const [name,build,options,items] of [
    ['weathered outcrops',CreateIcoSphere,{subdivisions:1},outcrops],
    ['hedge shoots',hedgeShoot,{},sprays],
  ]) {
    const patches=new Map()
    for (const item of items) {
      const key=Math.floor(item.at[0]/5)+','+Math.floor(item.at[2]/5)
      if (!patches.has(key)) patches.set(key,[])
      patches.get(key).push(item)
    }
    const material=surface(scene,name,0xffffff)
    if (items===outcrops) material.diffuseTexture=texture(scene,'fracture')
    else material.backFaceCulling=false
    for (const patch of patches.values()) addBatch(scene,name,build,options,patch,0xffffff,material)
  }
  for (const [name,build,items] of [['hanging vines',creeper,vines],['trail ferns',fern,ferns],['understory shrubs',broadleaf,bushes]]) {
    const mesh=addBatch(scene,name,build,{},items)
    if(mesh) mesh.material.backFaceCulling=false
  }
  addBatch(scene,'trail rocks',CreateIcoSphere,{subdivisions:1},stones)
}

function skyDome(scene) {
  const dome=CreateSphere('cloud sky',{diameter:200,segments:32},scene)
  dome.infiniteDistance=true
  dome.isPickable=false
  dome.applyFog=false
  const mat=surface(scene,'sunlit sky',0xffffff)
  mat.disableLighting=true
  mat.backFaceCulling=false
  mat.emissiveTexture=texture(scene,'sky')
  mat.emissiveTexture.vScale=-1
  dome.material=mat
}

function floorMesh(scene, { polygons }) {
  const positions = [], normals = [], uvs = [], indices = []
  for (const polygon of polygons) {
    if (!polygon) continue
    const offset = positions.length / 3
    for (const [x, z] of polygon) {
      positions.push(x, 0, z)
      normals.push(0, 1, 0)
      uvs.push(x*.66, z*.66)
    }
    for (const index of earcut(polygon.flat())) indices.push(offset + index)
  }
  const mesh = new Mesh('maze floor', scene)
  const geometry = new VertexData()
  Object.assign(geometry, { positions, normals, uvs, indices })
  geometry.applyToMesh(mesh)
  const material = surface(scene, 'sandy trail', colors.path)
  material.diffuseTexture = texture(scene,'trail')
  material.backFaceCulling = false
  mesh.material = material
  return mesh
}

function gateway(scene, [, [x, z], [nx, nz]], tint, isExit) {
  const name = isExit ? 'exit gate' : 'entry gate'
  const gate = new TransformNode(name, scene)
  const gold = surface(scene, `${name} accents`, tint, isExit ? .19 : .68)
  const dark = surface(scene, `${name} posts`, isExit ? 0x285342 : 0x245769)
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
  else {
    for(const side of [-1,1]) piece(gold,[side*.42,.29,0],[.10,.049,.14])
    const sign=CreatePlane('entrance plaque',{width:.94,height:.28},scene)
    sign.parent=gate
    sign.position.set(0,1.25,.081)
    const image=new DynamicTexture('entrance lettering',{width:384,height:112},scene,true)
    const ctx=image.getContext()
    ctx.fillStyle='#13314a'
    ctx.fillRect(0,0,384,112)
    ctx.strokeStyle='#63f7e9'
    ctx.lineWidth=6
    ctx.strokeRect(5,5,374,102)
    ctx.font='bold 67px sans-serif'
    ctx.fillStyle='#bafffd'
    ctx.textAlign='center'
    ctx.textBaseline='middle'
    ctx.fillText('ENTER',192,59)
    image.update()
    const material=surface(scene,'illuminated entrance sign',0xffffff)
    material.emissiveTexture=image
    material.disableLighting=true
    material.backFaceCulling=false
    sign.material=material
  }
  gate.position.set(x, 0, z)
  gate.rotation.y = Math.atan2(nx, nz)
}

function scenery(scene, layout) {
  const [left, top, right, bottom] = layout.data.bounds
  const cx = (left + right) / 2
  const cz = (top + bottom) / 2
  const reach = Math.max(right - left, bottom - top) * .5
  const terrain = CreateGround('terrain', { width: 160, height: 160 }, scene)
  terrain.material = surface(scene, 'earth', colors.earth)
  const forestFloor=texture(scene,'trail')
  forestFloor.uScale=forestFloor.vScale=72
  terrain.material.diffuseTexture=forestFloor
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
    const height = 2 + random() * 5
    const span = 4 + random() * 8
    mountains.push({ at: [cx + Math.cos(angle) * radius, height / 2 - 1, cz + Math.sin(angle) * radius],
      scale: [span, height*.7, span], yaw: random() * 6, tint: i % 2 ? 0x608d75 : 0x456953 })
  }
  for (let i = 0; i < 105; i++) {
    const x = left - 12 + random() * (right - left + 24)
    const z = top - 12 + random() * (bottom - top + 24)
    if (layout.trailheadContains(x,z) || x > left - .65 && x < right + .65 && z > top - .65 && z < bottom + .65) continue
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
  addBatch(scene, 'distant ridges', CreateIcoSphere, { subdivisions: 1 }, mountains)
  const crowns = addBatch(scene, 'cycad crowns', fern, {}, leaves.map(({at,scale,yaw}) => ({at,scale:scale.map(v=>v*2.7),yaw})))
  if (crowns) crowns.material.backFaceCulling = false
  addBatch(scene, 'trunks', CreateCylinder, { diameter: 2, height: 1, tessellation: 8 }, trunks, 0x8e6a4a)
  addBatch(scene, 'boulders', CreateIcoSphere, { subdivisions: 1 }, boulders)
  return terrain
}

function displayAtTrailhead(scene,layout,placements) {
  const markers=[]
  for(const distance of [1.18,2.53,4.36,6.06,8.0]) for(const side of [-1,1]) {
    const [x,z]=layout.trailheadPoint(distance,side*.66)
    markers.push({at:[x,.078,z],scale:[.095,.128,.095],yaw:0})
  }
  const beacon=surface(scene,'turquoise trail markers',0x54d5cf,.37)
  addBatch(scene,'turquoise trail markers',CreateCylinder,
    {diameter:1,height:1,tessellation:6},markers,0x54d5cf,beacon)
  return placements.map((actor,index)=>{
    const model=new Hatchling(scene,actor.kind,layout.data.centers.length+index,{adult:actor.adult})
    model.root.position.set(actor.x,layout.groundAt(actor.x,actor.z),actor.z)
    model.root.rotation.y=actor.yaw
    if(!actor.adult) model.root.scaling.setAll(.90)
    model.pose(index*.59)
    return model
  })
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
    const { layout, hintPoints, lastPlayer, run, blueHint } = this
    // Babylon owns the GPU resources. Rebuild them from the same layout and
    // keep the simulation state and input surface in place.
    this.load(layout)
    this.setExpedition(run)
    this.setHint(hintPoints,blueHint)
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

    skyDome(scene)
    const terrain=scenery(scene,layout)
    const floor=floorMesh(scene,{polygons:[...layout.data.polygons,layout.trail]})
    this.trackGround=new TrackGround(scene,layout.boundary,[terrain,floor])
    this.wallVisuals=[]
    this.wallMaterials=[]
    this.refreshWalls()
    this.cliffs()
    this.run=null
    this.crystalVisuals=[]
    this.hatchlings=[]
    this.rescueMarkers=[]
    this.trackVisuals=new Map()
    this.particleVisuals=[]
    this.smokeVisuals=[]
    this.smokeMaterial=null
    this.blastRing=this.blastCore=null
    this.bombVisual=null
    this.heldBomb=null
    this.placements=trailheadDinosaurs(layout)
    this.trailheadModels=displayAtTrailhead(scene,layout,this.placements)
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
    this.pathMesh=null
    this.pathMaterial=surface(scene,'blue route',0x2445d9,1)
    this.pathMaterial.disableLighting=true
    this.pathMaterial.backFaceCulling=false
    this.trackMaterial=null
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

  setHint(points, blue = false) {
    this.hintPoints = points
    this.blueHint=blue
    if (this.switchingEngine) return
    this.pathMesh?.dispose()
    this.pathMesh=null
    if (blue) {
      this.hint.setEnabled(false)
      this.drawRoute(points)
      return
    }
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

  drawRoute(points) {
    if (points.length<2) return
    const positions=[], indices=[], normals=[], colors=[]
    let distance=0
    for (let i=1;i<points.length;i++) {
      const [x,z]=points[i-1], [tx,tz]=points[i]
      const dx=tx-x,dz=tz-z,length=Math.hypot(dx,dz)
      if(length<.001) continue
      const nx=-dz/length*.046,nz=dx/length*.046
      const steps=Math.ceil(length/.11)
      const base=positions.length/3
      for(let j=0;j<=steps;j++){
        const t=j/steps, xx=x+dx*t, zz=z+dz*t
        const ground=this.layout.groundAt(xx,zz)
        positions.push(xx+nx,ground+.014,zz+nz,xx-nx,ground+.014,zz-nz)
        normals.push(0,1,0,0,1,0)
        const light=.66+.24*Math.sin((distance+length*t)*18)
        colors.push(light,light,1,1, light,light,1,1)
        const a=base+j*2
        if(j) indices.push(a-2,a,a-1,a-1,a,a+1)
      }
      distance+=length
    }
    this.pathMesh=new Mesh('shimmering blue route',this.scene)
    const data=new VertexData()
    Object.assign(data,{positions,indices,normals,colors})
    data.applyToMesh(this.pathMesh)
    this.pathMesh.material=this.pathMaterial
    this.pathMesh.isPickable=false
  }

  refreshWalls() {
    if (this.switchingEngine) return
    for (const mesh of this.wallVisuals) mesh.dispose()
    for (const material of this.wallMaterials ?? []) material.dispose(false,true)
    const meshCount=this.scene.meshes.length, materialCount=this.scene.materials.length
    wallMeshes(this.scene,this.layout)
    this.wallVisuals=this.scene.meshes.slice(meshCount)
    this.wallMaterials=this.scene.materials.slice(materialCount)
  }

  cliffs() {
    const [left,top,right,bottom]=this.layout.boundary
    const items=[]
    for (const z of [top,bottom]) for(let x=left;x<=right+1;x+=1.15) {
      items.push({at:[x,1.65,z+(z===top?-.43:.43)],scale:[1.15,2.5+.31*Math.sin(x*2.9),.83],yaw:x*.67,tint:0x756950})
    }
    for (const x of [left,right]) for(let z=top;z<=bottom+1;z+=1.15) {
      items.push({at:[x+(x===left?-.43:.43),1.67,z],scale:[.84,2.55+.45*Math.sin(z*2.1),1.18],yaw:z*.41,tint:0x686250})
    }
    const rock=addBatch(this.scene,'indestructible cliff enclosure',CreateIcoSphere,{subdivisions:1},items)
    rock.material.diffuseTexture=texture(this.scene,'fracture')
  }

  setExpedition(run) {
    this.run=run
    if (this.switchingEngine || !this.scene) return
    for (const mesh of this.crystalVisuals) mesh.dispose(false,true)
    for (const hatchling of this.hatchlings) hatchling.root.dispose(false,true)
    for (const marker of this.rescueMarkers) marker.dispose(false,true)
    this.rescueMarkers=[]
    this.hatchlings=[]
    for (const mesh of this.trackVisuals.values()) mesh.dispose()
    this.trackMaterial?.dispose()
    for (const mesh of this.particleVisuals) mesh.dispose(false,true)
    for (const mesh of this.smokeVisuals) mesh.dispose()
    this.smokeMaterial?.dispose(false,true)
    this.blastRing?.dispose(false,true)
    this.blastCore?.dispose(false,true)
    this.blastRing=this.blastCore=null
    this.smokeMaterial=null
    this.smokeVisuals=[]
    this.bombVisual?.dispose(false,true)
    this.heldBomb?.dispose(false,true)
    this.bombVisual=this.heldBomb=null
    this.crystalVisuals=[]
    this.trackVisuals.clear()
    this.particleVisuals=[]
    this.trackGround.update(run?.marks ?? [])
    if (!run) return
    this.hatchlings=run.hatchlings.map((actor,index)=>{
      const model=new Hatchling(this.scene,actor.kind,index+this.layout.data.centers.length)
      model.root.scaling.setAll(.90)
      const marker=CreatePolyhedron('hatchling rescue marker',{type:1,size:.061},this.scene)
      marker.material=surface(this.scene,'rescue glow',0xe7ffac,.9)
      marker.isPickable=false
      this.rescueMarkers.push(marker)
      return model
    })
    for(const item of run.loot) {
      const type=crystals[item.kind]
      const hex=parseInt(type.color.slice(1),16)
      const mesh=CreatePolyhedron(type.label,{type:type.sides===3?0:type.sides===5?3:1,size:.114},this.scene)
      mesh.scaling.set(type.sides===8?.9:1,1.3+(type.sides-3)*.065,type.sides===4?.68:1)
      mesh.material=surface(this.scene,type.label,hex,item.kind==='bomb'?.1:.38)
      mesh.material.specularColor=color3(0xffffff)
      mesh.material.specularPower=24
      const sparkle=CreatePolyhedron('glint',{type:1,size:.032},this.scene)
      sparkle.parent=mesh
      sparkle.position.set(.07,.08,.07)
      sparkle.material=surface(this.scene,'glint',0xfff9e5,1)
      this.crystalVisuals.push(mesh)
    }
    this.trackMaterial=surface(this.scene,'compressed earth',0xa9885b,.13)
    this.trackMaterial.backFaceCulling=false
    this.bombVisual=this.makeBomb('placed charge')
    this.heldBomb=new TransformNode('held charge and claw',this.scene)
    this.makeBomb('charge in hand').parent=this.heldBomb
    for (let finger=0;finger<3;finger++) {
      const claw=CreateIcoSphere('dinosaur finger',{subdivisions:1,radius:.095},this.scene)
      claw.parent=this.heldBomb
      claw.position.set(-.09+finger*.055,-.093,.064)
      claw.scaling.set(.36,.55,1.15)
      claw.rotation.x=.45
      claw.material=surface(this.scene,'dinosaur claw',0x7a903b)
    }
    for(let i=0;i<effectLimit;i++) {
      const mesh=CreateIcoSphere('effect particle',{subdivisions:1,radius:1},this.scene)
      mesh.material=surface(this.scene,'particle tint',0xffad58,.65)
      mesh.setEnabled(false)
      this.particleVisuals.push(mesh)
    }
    this.createBlastVisuals()
    this.updateTracks()
  }

  createBlastVisuals() {
    const scene=this.scene
    const mist=new DynamicTexture('soft blast smoke',128,scene,true)
    const ctx=mist.getContext()
    for(const [x,y,r] of [[58,63,49],[40,50,32],[74,44,34],[79,76,38],[51,80,34]]) {
      const shade=ctx.createRadialGradient(x,y,3,x,y,r)
      shade.addColorStop(0,'#b7a9c883')
      shade.addColorStop(.55,'#81748e54')
      shade.addColorStop(1,'#675d7900')
      ctx.fillStyle=shade
      ctx.fillRect(x-r,y-r,r*2,r*2)
    }
    mist.hasAlpha=true
    mist.update()
    this.smokeMaterial=surface(scene,'violet dust',0xffffff)
    this.smokeMaterial.diffuseTexture=mist
    this.smokeMaterial.useAlphaFromDiffuseTexture=true
    this.smokeMaterial.emissiveColor=color3(0x84778c)
    this.smokeMaterial.disableLighting=true
    this.smokeMaterial.backFaceCulling=false
    for(let i=0;i<smokeLimit;i++){
      const puff=CreatePlane('drifting smoke',{size:1},scene)
      puff.material=this.smokeMaterial
      puff.billboardMode=Mesh.BILLBOARDMODE_ALL
      puff.isPickable=false
      puff.setEnabled(false)
      this.smokeVisuals.push(puff)
    }
    this.blastRing=CreateTorus('crystal shockwave',{diameter:2,thickness:.028,tessellation:32},scene)
    this.blastCore=CreatePolyhedron('crystal flash',{type:1,size:1},scene)
    for(const [mesh,color] of [[this.blastRing,0xca8bff],[this.blastCore,0xffeadc]]) {
      mesh.material=surface(scene,mesh.name,color,1)
      mesh.material.disableLighting=true
      mesh.isPickable=false
      mesh.setEnabled(false)
    }
  }

  makeBomb(name) {
    const root=new TransformNode(name,this.scene)
    const body=CreateIcoSphere('charge body',{subdivisions:2,radius:.11},this.scene)
    body.parent=root
    body.material=surface(this.scene,'obsidian charge',0x302633,.3)
    body.material.specularColor=color3(0xccc6ed)
    const fuse=CreatePolyhedron('glowing fuse',{type:1,size:.04},this.scene)
    fuse.parent=root
    fuse.position.y=.11
    fuse.material=surface(this.scene,'fuse',0xff944c,1)
    return root
  }

  updateTracks() {
    if (this.switchingEngine || !this.run) return
    const marks=this.run.marks
    this.trackGround.update(marks)
    for(const [mark,mesh] of this.trackVisuals) if(!marks.includes(mark)) {
      mesh.dispose()
      this.trackVisuals.delete(mark)
    }
    for(const mark of marks) {
      if(this.trackVisuals.has(mark)) continue
      const mesh=trackMesh('three-toed track',{outline:trackShapes[mark.shape]},this.scene)
      mesh.material=this.trackMaterial
      mesh.position.set(mark.x,this.layout.groundAt(mark.x,mark.z),mark.z)
      mesh.rotation.y=mark.yaw
      mesh.isPickable=false
      this.trackVisuals.set(mark,mesh)
    }
  }

  dinosaurColliders(player) {
    if (this.switchingEngine) return []
    const colliders = []
    for (const {model,x,z,yaw} of [
      ...this.trailheadModels.map(model => ({model, x:model.root.position.x, z:model.root.position.z, yaw:model.root.rotation.y})),
      ...this.hatchlings.map((model,index) => ({model, ...this.run.hatchlings[index]})),
    ]) {
      if (Math.hypot(x-player.x,z-player.z) > (model.adult ? 4.5 : 1.25)) continue
      const cos = Math.cos(yaw), sin = Math.sin(yaw)
      const padding = this.layout.playerRadius*.85
      for (const mesh of model.collisionMeshes) {
        const matrix = mesh.computeWorldMatrix().m
        const box = mesh.getBoundingInfo().boundingBox
        const center = box.centerWorld
        const {x:rx,y:ry,z:rz} = box.extendSize
        const width = Math.hypot(rx*(matrix[0]*cos-matrix[2]*sin),
          ry*(matrix[4]*cos-matrix[6]*sin), rz*(matrix[8]*cos-matrix[10]*sin))
        const depth = Math.hypot(rx*(matrix[0]*sin+matrix[2]*cos),
          ry*(matrix[4]*sin+matrix[6]*cos), rz*(matrix[8]*sin+matrix[10]*cos))
        const height = Math.hypot(rx*matrix[1],ry*matrix[5],rz*matrix[9])
        colliders.push({x:center.x,z:center.z,cos,sin,width:width+padding,depth:depth+padding,
          bottom:center.y-height,top:center.y+height})
      }
      for (const {center,radius,length} of model.tailCollisionSections()) {
        colliders.push({x:center.x,z:center.z,cos,sin,width:radius+padding,depth:length+padding,
          bottom:center.y-radius*.85,top:center.y+radius*.85})
      }
    }
    return colliders
  }

  animateExpedition(player) {
    const run=this.run
    if(!run) return
    const time=run.time
    if(Math.hypot(player.x-this.layout.spawn[0],player.z-this.layout.spawn[1])<18) {
      this.trailheadModels.forEach((model,index)=>{
        const actor=run.herd[index]
        const gesture=trailheadGesture(time,index,actor.adult)
        if(!actor.adult) { model.pose(time+index*.59,gesture); return }
        model.root.position.set(actor.x,this.layout.groundAt(actor.x,actor.z),actor.z)
        model.root.rotation.y=actor.yaw
        model.pose(actor.clock,{walk:actor.walk,gaitTime:actor.gait,interest:actor.gaze,pivot:actor.pivot,...gesture})
      })
    }
    run.hatchlings.forEach((actor,index)=>{
      const model=this.hatchlings[index]
      const ground=this.layout.groundAt(actor.x,actor.z)
      model.root.position.set(actor.x,ground,actor.z)
      model.root.rotation.y=actor.yaw
      const marker=this.rescueMarkers[index]
      marker.setEnabled(!actor.following)
      if(!actor.following) {
        marker.position.set(actor.x,ground+(actor.kind==='longneck'?.91:.69)+.045*Math.sin(time*3.2),actor.z)
        marker.rotation.y=time*1.6
      }
      model.pose(actor.clock,{
        walk:actor.walk, gaitTime:actor.gaitClock, bank:actor.bank, action:actor.action,progress:(time-actor.actionAt)/actor.actionLength || 0,
        gestureWeight:actor.gestureWeight,
        voice:voiceEnvelope(actor.call,time),interest:actor.interest,
      })
    })
    for (const item of run.loot) {
      const mesh=this.crystalVisuals[item.id]
      mesh.setEnabled(!item.collected)
      if (item.collected) continue
      mesh.position.set(item.x,.27+.055*Math.sin(time*3+item.id),item.z)
      mesh.rotation.set(.15,time*(.72+item.id%3*.11)+item.id,.12)
      const glint=mesh.getChildMeshes()[0]
      glint.scaling.setAll(.2+.8*Math.pow(Math.max(0,Math.sin(time*3+item.id)),5))
    }
    if (this.pathMesh) this.pathMaterial.emissiveColor=color3(0x294cff).scale(.69+.28*Math.sin(time*5))
    this.bombVisual.setEnabled(Boolean(run.charge))
    if(run.charge) {
      const {x,z,until}=run.charge
      this.bombVisual.position.set(x,.12,z)
      this.bombVisual.scaling.setAll(1+.10*Math.sin((until-time)*38))
    }
    this.heldBomb.setEnabled(run.bombs>0 && run.armed)
    if(run.bombs>0 && run.armed) {
      const forward=this.camera.getDirection(new Vector3(0,0,-1))
      const right=this.camera.getDirection(new Vector3(1,0,0))
      const up=this.camera.getDirection(Vector3.Up())
      this.heldBomb.position.copyFrom(this.camera.position.add(forward.scale(.40)).add(right.scale(.19)).subtract(up.scale(.17)))
      this.heldBomb.rotation.copyFrom(this.camera.rotation)
      this.heldBomb.scaling.setAll(.49)
    }
    this.particleVisuals.forEach((mesh,i)=>{
      const fx=run.effects[i]
      mesh.setEnabled(Boolean(fx))
      if (!fx) return
      const t=time-fx.start, fade=Math.max(0,1-t/fx.life)
      const rubble=fx.kind==='rubble', shard=fx.kind==='shard'
      const gravity=rubble?5.2:shard?3.7:2.1
      const y=Math.max(.03,fx.y+fx.dy*t-gravity*t*t)
      const drift=rubble && y===.03 ? Math.min(t,(fx.dy+Math.sqrt(fx.dy**2+4*gravity*(fx.y-.03)))/(2*gravity)) : t
      mesh.position.set(fx.x+fx.dx*drift,y,fx.z+fx.dz*drift)
      const size=fx.size*(rubble?Math.min(1,fade*3):fade)
      mesh.scaling.set(size*(shard?.44:1),size*(shard?2.6:rubble?.72:1),size*(shard?.58:1))
      mesh.rotation.set(t*7+i,t*5+i,t*4)
      mesh.material.diffuseColor=color3(fx.color)
      mesh.material.emissiveColor=mesh.material.diffuseColor.scale(rubble?.05:shard?1.15:.5+.5*fade)
    })
    this.smokeVisuals.forEach((mesh,i)=>{
      const puff=run.smoke[i]
      const t=puff ? time-puff.start : -1
      mesh.setEnabled(t>=0)
      if(t<0) return
      mesh.position.set(puff.x+puff.dx*t,puff.y+puff.dy*t,puff.z+puff.dz*t)
      mesh.scaling.setAll(puff.size+t*.73)
      mesh.rotation.z=t*puff.spin+i
      const phase=t/puff.life
      mesh.visibility=.9*Math.min(1,phase*10)*(1-phase)
    })
    const flash=run.blastFlash
    const age=flash ? time-flash.start : Infinity
    this.blastCore.setEnabled(age<.24)
    this.blastRing.setEnabled(age<.53)
    if(age<.24) {
      this.blastCore.position.set(flash.x,.53,flash.z)
      this.blastCore.rotation.set(age*8,age*14,age*6)
      this.blastCore.scaling.setAll(.34+age*4)
      this.blastCore.material.alpha=1-age/.24
    }
    if(age<.53) {
      this.blastRing.position.set(flash.x,.13+age*.11,flash.z)
      this.blastRing.scaling.setAll(.32+age*4.2)
      this.blastRing.material.alpha=(1-age/.53)**1.45
    }
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
    const height=eye+(player.y ?? 0)
    this.camera.position.set(x, height, z)
    const horizontal = Math.cos(pitch)
    this.camera.setTarget(this.target.set(x + Math.sin(yaw) * horizontal, height + Math.sin(pitch),
      z + Math.cos(yaw) * horizontal))
    this.animateExpedition(player)
    this.render(this.camera, .028)
  }
}
