import { Scene } from '@babylonjs/core/scene.js'
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Hatchling } from '../hatchling.mjs'
import { advanceGaitClock } from '../hatchling-play.mjs'
import { TILE, tileCenter, tileInAperture } from './room-map.mjs'

const TAU=Math.PI*2
const point=p=>new Vector3(p.x,p.y,p.z)
const color=Color3.FromHexString
const random=n=>((Math.sin(n*127.1+19.7)*43758.5453)%1+1)%1

function material(scene,name,tint,emissive=false) {
  const mat=new StandardMaterial(name,scene)
  mat.diffuseColor=color(tint)
  mat.specularColor=Color3.Black()
  mat.backFaceCulling=false
  if (emissive) {
    mat.disableLighting=true
    mat.emissiveColor=mat.diffuseColor
  }
  return mat
}

function makeTexture(scene,kind) {
  const texture=new DynamicTexture(kind,{width:256,height:256},scene,true)
  const ctx=texture.getContext()
  if (kind==='sky') {
    const sky=ctx.createLinearGradient(0,0,0,256)
    sky.addColorStop(0,'#55a9d1')
    sky.addColorStop(1,'#b3e7dd')
    ctx.fillStyle=sky
    ctx.fillRect(0,0,256,256)
    for (let i=0;i<29;i++) {
      const x=random(i+10)*256,y=random(i+400)*256
      const cloud=ctx.createRadialGradient(x,y,0,x,y,14+random(i+45)*34)
      cloud.addColorStop(0,'rgba(248,253,226,.42)')
      cloud.addColorStop(1,'rgba(248,253,226,0)')
      ctx.fillStyle=cloud
      ctx.fillRect(0,0,256,256)
    }
  } else {
    ctx.fillStyle=kind==='grass'?'#6c893f':'#595d49'
    ctx.fillRect(0,0,256,256)
    for (let i=0;i<1100;i++) {
      ctx.fillStyle=kind==='grass' ?
        ['#516d38','#8da746','#768d46','#9b9e4b'][i%4] : ['#42483c','#737559','#77795f','#686a52'][i%4]
      ctx.fillRect(random(i)*256,random(i+1174)*256,1+random(i+58)*(kind==='grass'?5:13),1+random(i+742)*4)
    }
    if (kind==='rock') {
      ctx.lineWidth=2
      ctx.strokeStyle='#363f36'
      for (let i=0;i<5;i++) {
        ctx.beginPath()
        ctx.moveTo(0,i*51)
        for (let j=1;j<=8;j++) ctx.lineTo(j*32,i*51+(j===8?0:random(i*8+j)*18-9))
        ctx.stroke()
      }
      for (let i=0;i<8;i++) {
        ctx.strokeStyle=['#405b38','#68864d','#526e3f'][i%3]
        ctx.beginPath()
        const x=random(i+88)*245
        ctx.moveTo(x,0)
        for (let j=1;j<=10;j++) ctx.lineTo(x+Math.sin(j*.53+i)*7,j*25.6)
        ctx.stroke()
      }
    }
  }
  texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE
  texture.update()
  texture.anisotropicFilteringLevel=4
  return texture
}

function textured(scene,kind,alpha=1) {
  const mat=material(scene,kind,'#ffffff')
  mat.alpha=alpha
  const texture=makeTexture(scene,kind)
  if (kind==='sky') {
    mat.disableLighting=true
    mat.emissiveColor=Color3.Black()
    mat.emissiveTexture=texture
  } else mat.diffuseTexture=texture
  return mat
}

function lighting(scene) {
  const sky=new HemisphericLight('canopy light',Vector3.Up(),scene)
  sky.intensity=.90
  sky.groundColor=color('#618650')
  const sun=new DirectionalLight('golden sun',new Vector3(-.5,-1,.35),scene)
  sun.intensity=.72
  sun.diffuse=color('#ffe2a8')
}

function quad(data, center, width, height, right, up, uv) {
  const start=data.positions.length/3
  for (const [x,y] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]) {
    const vertex=center.add(right.scale(x*width)).add(up.scale(y*height))
    data.positions.push(vertex.x,vertex.y,vertex.z)
    data.uvs.push(...uv(vertex,x,y))
  }
  data.indices.push(start,start+1,start+2,start,start+2,start+3)
}

function flush(mesh,data) {
  if (!data.indices.length) {
    mesh.setEnabled(false)
    return
  }
  const vertex=new VertexData()
  vertex.positions=data.positions
  vertex.indices=data.indices
  vertex.uvs=data.uvs
  vertex.normals=[]
  VertexData.ComputeNormals(data.positions,data.indices,vertex.normals,{useRightHandedSystem:true})
  vertex.applyToMesh(mesh)
  mesh.setEnabled(true)
}

const empty=()=>({positions:[],indices:[],uvs:[]})

function mappedMesh(scene,alpha) {
  const materials={wall:textured(scene,'rock',alpha),floor:textured(scene,'grass',alpha*.52),
    ceiling:textured(scene,'sky')}
  const meshes=Object.fromEntries(Object.entries(materials).map(([key,mat])=>{
    const mesh=new Mesh('mapped '+key,scene)
    mesh.material=mat
    mesh.isPickable=false
    mesh.setEnabled(false)
    return [key,mesh]
  }))
  return (tiles,room,apertures)=>{
    const geometry={wall:empty(),floor:empty(),ceiling:empty()}
    for (const tile of tiles) {
      if (tile.kind==='wall' && apertures.some(a=>tileInAperture(tile,a))) continue
      if (tile.kind==='floor' && (!room.floor.count || Math.abs(tile.plane-room.floor.y)>.24)) continue
      if (tile.kind==='ceiling' && (!room.roof.count || Math.abs(tile.plane-room.roof.y)>.26)) continue
      const center=point(tileCenter(tile))
      if (tile.kind==='wall') {
        quad(geometry.wall,center,TILE*1.008,TILE*1.008,new Vector3(tile.nz,0,-tile.nx),Vector3.Up(),
          (p)=>[(p.x*tile.nz-p.z*tile.nx)*.8,p.y*.8])
      } else {
        if (tile.kind==='floor') center.y+=.015
        quad(geometry[tile.kind],center,TILE,TILE,Vector3.Right(),new Vector3(0,0,-1),
          p=>tile.kind==='ceiling' ? [p.x*.12,p.z*.12] : [p.x*.72,p.z*.72])
      }
    }
    for (const kind of Object.keys(meshes)) flush(meshes[kind],geometry[kind])
  }
}

function offAxis(left,right,bottom,top,near,far) {
  return Matrix.FromValues(
    2*near/(right-left),0,0,0,
    0,2*near/(top-bottom),0,0,
    (right+left)/(right-left),(top+bottom)/(top-bottom),-(far+near)/(far-near),-1,
    0,0,-2*far*near/(far-near),0)
}

function terrain(seed,scene) {
  const dome=CreateSphere('meadow sky',{diameter:124,segments:18},scene)
  dome.position.set(seed.x,seed.floorY+2,seed.z)
  dome.material=textured(scene,'sky')
  dome.material.fogEnabled=false
  const pasture=textured(scene,'grass')
  const rock=material(scene,'weathered rock','#716b50')
  const leaf=material(scene,'fern leaves','#476f39')
  const earth=new Mesh('grass plain',scene)
  const data=empty()
  quad(data,Vector3.Zero(),160,160,Vector3.Right(),new Vector3(0,0,-1),p=>[p.x*.58,p.z*.58])
  flush(earth,data)
  earth.material=pasture
  earth.position.set(seed.x,seed.floorY-.025,seed.z)
  for (let i=0;i<20;i++) {
    const a=random(i+471)*TAU,r=13+random(i+727)*32
    const mound=CreateSphere('distant meadow outcrop',{segments:5,diameter:1},scene)
    mound.material=i%3===0?rock:leaf
    mound.position.set(seed.x+Math.cos(a)*r,seed.floorY-.65,seed.z+Math.sin(a)*r)
    mound.scaling.set(3+random(i+27)*9,2+random(i+39)*5,3+random(i+53)*10)
  }
}

function addMeadowHerd(seed,scene,start) {
  const kinds=['trike','stego','longneck','anky','rex']
  return Array.from({length:start===0?5:2},(_,i)=>{
    const index=start+i
    return {model:new Hatchling(scene,kinds[index%kinds.length],729+index*131,{adult:index%4!==3}),
      seed, i, gaitTime:0, previous:null}
  })
}

export class RoomWorld {
  constructor(engine) {
    this.engine=engine
    this.scene=new Scene(engine)
    this.scene.useRightHandedSystem=true
    this.scene.clearColor=new Color4(0,0,0,0)
    const camera=new FreeCamera('entry',Vector3.Zero(),this.scene)
    camera.minZ=.03
    camera.maxZ=120
    lighting(this.scene)
    this.mapped=mappedMesh(this.scene,.81)
    this.rubble=material(this.scene,'gem rubble','#39453e')
    this.spark=material(this.scene,'violet sparks','#deb8ff',true)
    this.gravel=material(this.scene,'loose rocks','#877d66')
    this.crystalMat=material(this.scene,'black charge','#21152d')
    this.crystalMat.emissiveColor=color('#551e6a')
    this.crystalMat.specularColor=color('#eee4ff')
    this.crystalMat.specularPower=86
    this.crystals=[]
    this.portals=[]
    this.particles=[]
    this.interior=new Scene(engine)
    this.interior.useRightHandedSystem=true
    this.interior.clearColor=new Color4(.083,.15,.16,1)
    this.interior.fogMode=Scene.FOGMODE_EXP2
    this.interior.fogDensity=.075
    this.interior.fogColor=new Color3(.12,.22,.23)
    lighting(this.interior)
    this.interiorMap=mappedMesh(this.interior,1)
    this.outside=new Scene(engine)
    this.outside.useRightHandedSystem=true
    this.outside.clearColor=new Color4(.35,.69,.82,1)
    this.outside.fogMode=Scene.FOGMODE_EXP2
    this.outside.fogDensity=.028
    this.outside.fogColor=new Color3(.61,.77,.73)
    lighting(this.outside)
    this.animals=[]
    this.lastPortal=0
    this.portalIndex=0
  }

  rebuild(tiles,room) {
    this.mapped(tiles,room,this.portals)
    if (this.portals.some(portal=>portal.kind==='interior')) this.interiorMap(tiles,room,this.portals)
  }

  addCrystal(position) {
    const mesh=CreateCylinder('black crystal',{diameterTop:0,diameterBottom:.28,height:.29,tessellation:5},this.scene)
    const base=CreateCylinder('crystal base',{diameterTop:.28,diameterBottom:0,height:.22,tessellation:5},this.scene)
    base.parent=mesh
    base.position.y=-.25
    mesh.material=base.material=this.crystalMat
    const glint=CreateSphere('crystal glint',{diameter:.045,segments:3},this.scene)
    glint.parent=mesh
    glint.position.set(.10,-.06,-.08)
    glint.material=this.spark
    mesh.position.copyFrom(position)
    this.crystals.push({mesh,position})
  }

  crystalIndex(eye,direction,aimed=false) {
    return this.crystals.findIndex(({mesh})=>{
      const delta=mesh.position.subtract(eye)
      const distance=delta.length()
      return aimed ? distance<3.9 && Vector3.Dot(delta.scale(1/distance),direction)>.976 :
        Math.hypot(delta.x,delta.z)<.36 && delta.y<.22 && delta.y>-2.10
    })
  }

  collect(eye,direction,aimed=false) {
    const index=this.crystalIndex(eye,direction,aimed)
    if (index<0) return false
    const [{mesh}]=this.crystals.splice(index,1)
    this.burst(mesh.position,10,1.1,performance.now()/1000)
    mesh.dispose()
    return true
  }

  addPortal(aperture) {
    const outside=aperture.kind==='exterior'
    const scene=outside?this.outside:this.interior
    if (outside && this.animals.length===0) terrain(aperture,scene)
    if (outside && this.animals.length<9) this.animals.push(...addMeadowHerd(aperture,scene,this.animals.length))
    const portal={...aperture, scene, rubble:[]}
    const data=empty()
    const tangent=new Vector3(-aperture.nz,0,aperture.nx)
    const center=new Vector3(aperture.x-aperture.nx*.018,(aperture.bottom+aperture.top)/2,aperture.z-aperture.nz*.018)
    quad(data,center,aperture.width,aperture.top-aperture.bottom,tangent,Vector3.Up(),(_,x,y)=>[x+.5,y+.5])
    portal.mesh=new Mesh('view through wall',this.scene)
    flush(portal.mesh,data)
    const screen=portal.mesh.material=material(this.scene,'opening',outside?'#64ab91':'#234244',true)
    screen.backFaceCulling=false
    portal.camera=new FreeCamera('opening camera',Vector3.Zero(),scene)
    portal.camera.minZ=.08
    portal.camera.maxZ=88
    portal.camera.mode=Camera.PERSPECTIVE_CAMERA
    portal.texture=new RenderTargetTexture('through-wall view',{width:448,height:320},scene)
    portal.texture.activeCamera=portal.camera
    portal.texture.clearColor=scene.clearColor
    portal.texture.renderList=scene.meshes
    portal.tangent=tangent
    portal.center=center
    portal.screen=screen
    this.portals.push(portal)
    for (let i=0;i<22;i++) {
      const x=(random(i+87)-.5)*aperture.width
      const y=random(i+177)*.20
      const b=CreateIcoSphere('impassable rubble',{radius:.5,subdivisions:1,flat:true},this.scene)
      b.position=center.add(tangent.scale(x))
      b.position.y=aperture.bottom-.24+y
      b.position.x-=aperture.nx*(.08+random(i+244)*.17)
      b.position.z-=aperture.nz*(.08+random(i+244)*.17)
      b.scaling.set(.17+random(i+88)*.26,.16+random(i+63)*.31,.18+random(i+118)*.23)
      b.rotation.set(random(i+47),random(i+88)*TAU,random(i+19))
      b.material=i%6===0?this.gravel:this.rubble
      portal.rubble.push(b)
    }
    for (const edge of [-1,1]) for (let i=0;i<6;i++) {
      const cut=CreateIcoSphere('broken edge',{radius:.5,subdivisions:1,flat:true},this.scene)
      cut.position=center.add(tangent.scale(edge*(aperture.width/2+.012)))
      cut.position.y=aperture.bottom+.11+i*(aperture.top-aperture.bottom-.13)/6
      cut.scaling.set(.16+random(i+315)*.18,.26+random(i+380)*.19,.16+random(i+18)*.10)
      cut.rotation.set(random(i+301),random(i+78),random(i+201))
      cut.material=i%3===0?this.gravel:this.rubble
      portal.rubble.push(cut)
    }
    this.burst(center,30,2.35,performance.now()/1000)
  }

  burst(center,count,force,time) {
    for (let i=0;i<count;i++) {
      const isSpark=i%3!==0
      const mesh=CreateBox('gem fragments',{size:.05+random(i+153)*(isSpark?.04:.16)},this.scene)
      mesh.position.copyFrom(center)
      mesh.material=isSpark?this.spark:this.gravel
      this.particles.push({mesh,center:center.clone(),time,life:.48+random(i+4)*.55,
        velocity:new Vector3((random(i+77)-.5)*force*2,random(i+33)*force*1.4,(random(i+25)-.5)*force*2)})
    }
  }

  tick(time,eye,look) {
    for (const [i,{mesh,position}] of this.crystals.entries()) {
      mesh.rotation.y=time*.8+i
      mesh.position.y=position.y+Math.sin(time*2.8+i)*.055
    }
    this.particles=this.particles.filter(({mesh,center,velocity,time:start,life})=>{
      const age=time-start
      if (age>life) {mesh.dispose();return false}
      mesh.position.copyFrom(center).addInPlace(velocity.scale(age))
      mesh.position.y-=age*age*2.4
      mesh.rotation.set(age*2,age*3,age*4)
      mesh.scaling.setAll(Math.max(.14,1-age/life))
      return true
    })
    if (!eye || time-this.lastPortal<.075) return
    const candidates=this.portals.filter(p=>{
      const side=(p.center.x-eye.x)*p.nx+(p.center.z-eye.z)*p.nz
      const visible=side>.20 && !p.obstructed
      p.mesh.setEnabled(visible)
      return visible && Vector3.DistanceSquared(eye,p.center)<85 &&
        (!look || Vector3.Dot(look,p.center.subtract(eye).normalize())>.22)
    }).sort((a,b)=>Vector3.DistanceSquared(a.center,eye)-Vector3.DistanceSquared(b.center,eye)).slice(0,2)
    if (!candidates.length) return
    this.lastPortal=time
    const portal=candidates[this.portalIndex++%candidates.length]
    if (portal.kind==='exterior') {
      for (const animal of this.animals) {
        const {model,seed,i}=animal
        const wander=time+Math.sin(time*.27+i)*3.60
        const a=wander*(.071+i*.009)+i*1.21
        const spread=(i-2)*3.6
        const depth=12+Math.sin(a)*3.7+i*.8
        const sideways=spread+Math.cos(a)*2.8
        const x=seed.x+seed.nx*depth+seed.nz*sideways, z=seed.z+seed.nz*depth-seed.nx*sideways
        let walk=0
        if (animal.previous) {
          const dx=x-animal.previous.x,dz=z-animal.previous.z
          const distance=Math.hypot(dx,dz)
          const dt=Math.max(.001,Math.min(.5,time-animal.previous.time))
          const speed=distance/dt
          if (distance>.001) model.root.rotation.y=Math.atan2(dx,dz)
          walk=Math.min(.65,speed*.80)
          animal.gaitTime=advanceGaitClock(model.kind,model.adult,animal.gaitTime,speed,walk,0,dt)
        }
        animal.previous={x,z,time}
        model.root.position.set(x,seed.floorY,z)
        const gesture=(time+i*1.89)%11
        model.pose(time+i*.62,{walk,gaitTime:animal.gaitTime,interest:Math.sin(time*.31+i)*.32,
          action:gesture<1.8 && walk<.36 ? 'sniff' : '',progress:gesture/1.8})
      }
    }
    const {camera,center,texture,tangent}=portal
    const toward=new Vector3(portal.nx,0,portal.nz)
    const offset=center.subtract(eye)
    const near=Vector3.Dot(offset,toward)
    const lateral=Vector3.Dot(offset,tangent)
    const halfHeight=(portal.top-portal.bottom)/2, halfWidth=portal.width/2
    const far=camera.maxZ
    camera.position.copyFrom(eye)
    camera.setTarget(eye.add(toward))
    camera.freezeProjectionMatrix(offAxis(lateral-halfWidth,lateral+halfWidth,
      offset.y-halfHeight,offset.y+halfHeight,near,far))
    portal.scene.activeCamera=camera
    texture.render(false)
    portal.screen.emissiveTexture=texture
    portal.screen.emissiveColor=Color3.Black()
  }

  removePortal(portal) {
    portal.mesh.dispose(false,true)
    portal.texture.dispose()
    portal.camera.dispose()
    portal.rubble.forEach(mesh=>mesh.dispose())
    this.portals=this.portals.filter(item=>item!==portal)
  }

  clearProgress() {
    this.crystals.forEach(({mesh})=>mesh.dispose())
    this.particles.forEach(({mesh})=>mesh.dispose())
    this.portals.slice().forEach(portal=>this.removePortal(portal))
    this.outside.meshes.slice().forEach(mesh=>mesh.dispose(false,true))
    this.crystals=[]
    this.particles=[]
    this.animals=[]
    this.rebuild([],{floor:{count:0},roof:{count:0}})
  }

  dispose() {
    for (const scene of [this.scene,this.interior,this.outside]) scene.dispose()
  }
}
