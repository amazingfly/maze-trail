import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'

import { species, isQuietGesture } from './hatchling-play.mjs'

const rgb = color => Color3.FromInts(color >> 16, (color >> 8) & 255, color & 255)
const TAU = 2*Math.PI
const clamp = value => Math.min(1,Math.max(0,value))
const smooth = value => { const t=clamp(value); return t*t*(3-2*t) }

const adultCoats = {
  trike:    { skin:0xb9684d, shadow:0x704638, cream:0xd9aa78, accent:0xd6855b },
  stego:    { skin:0x5b9078, shadow:0x3e5e50, cream:0xc3bd84, accent:0xe39a53 },
  rex:      { skin:0x949a52, shadow:0x505734, cream:0xceb778, accent:0xb68b4c },
  longneck: { skin:0x6597a9, shadow:0x416478, cream:0xb5d9ce, accent:0x90a6c9 },
}


function shade(position, id, palette, underside) {
  const [x,y,z]=position
  // Layer large pigment patches, small scales and fine noise in model space.
  const ripple=Math.sin(31*x+id*2+2*Math.sin(16*z))*Math.sin(28*z+19*y)
  const scales=Math.abs(Math.sin(290*x+2*Math.cos(z*184))*Math.sin(238*z+193*y))
  const mottle=.25+.21*ripple+.13*Math.sin(x*71-z*57+y*45+id)
  const light=.86+.14*scales+.11*Math.sin(11*x-13*z)
  const phase=palette.patternPhase
  const band=Math.sin(z*(palette.kind==='rex'?38:25)+9*x+7*y+Math.sin(x*33)+phase)
  const markings=palette.kind==='rex' ? Math.max(0,band-.44)*.73
    : palette.kind==='stego' ? Math.max(0,band-.58)*.45 : 0
  const color=Color3.Lerp(palette.skin,palette.shadow,clamp(mottle+markings))
  // Broad markings survive distance filtering; keep the fine scale relief in the texture.
  const dapple=Math.sin(58*z+phase+1.2*Math.sin(y*22))*Math.cos(59*y-12*x-phase)
  let pigment
  if(palette.kind==='rex') pigment=.27*smooth((band+.36)/.39)*smooth((.5-band)/.45)
  else if(palette.kind==='stego') pigment=.30*smooth((-band-.23)/.58)
  else pigment=(palette.kind==='longneck'?.55:.44)*smooth((dapple-.30)/.54)
  Color3.LerpToRef(color,palette.accent,pigment*(1-underside),color)
  const belly=Color3.Lerp(color,palette.cream,clamp(underside))
  return [belly.r*light,belly.g*light,belly.b*light,1]
}

function scaleTexture(scene,seed) {
  const map=new DynamicTexture('individual pebbled scales',128,scene,true)
  const ctx=map.getContext()
  let state=seed
  const next=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296)
  ctx.fillStyle='#dfdbd0'
  ctx.fillRect(0,0,128,128)
  for(let y=0;y<16;y++)for(let x=0;x<16;x++) {
    const cx=x*8+(y%2)*4+(next()-.5)*3.6,cy=y*8+(next()-.5)*3.6
    const cluster=Math.sin(x*TAU/8+y*TAU/16)*Math.cos(y*TAU/8+seed)
    const rx=2.9+next()*1.4+.48*cluster,ry=2.6+next()*1.4-.42*cluster
    const tone=Math.round(225+next()*25)
    const tilt=(next()-.5)*.8
    for(const ox of [-128,0,128])for(const oy of [-128,0,128]) {
      if(cx+ox < -6 || cx+ox > 134 || cy+oy < -6 || cy+oy > 134) continue
      ctx.fillStyle=`rgb(${tone},${tone},${tone-5})`
      ctx.beginPath()
      ctx.ellipse(cx+ox,cy+oy,rx,ry,tilt,0,TAU)
      ctx.fill()
      ctx.fillStyle='rgba(255,248,223,.48)'
      ctx.fillRect(cx+ox-1.2,cy+oy-1.8,1.5,.65)
    }
  }
  map.update()
  return map
}

function profiledWidth(profile,z) {
  return 1+(profile-1)*Math.cos(z*Math.PI/2)
}

function volume(name, scene, parent, at, size, palette, seed, profile = 1) {
  const mesh=CreateSphere(name,{segments:Math.max(...size)>.065?16:8,diameter:2},scene)
  const positions=mesh.getVerticesData('position')
  const colors=[]
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1],z=positions[i+2]
    const shoulder=profiledWidth(profile,z)
    positions[i]=x*size[0]*shoulder
    positions[i+1]=y*size[1]
    positions[i+2]=z*size[2]
    if (palette) colors.push(...shade(
      [at[0]+positions[i],at[1]+positions[i+1],at[2]+positions[i+2]],
      seed,palette,clamp((-y-.19)*1.3)*.79))
  }
  mesh.setVerticesData('position',positions)
  const normals=mesh.getVerticesData('normal')
  for(let i=0;i<normals.length;i+=3) {
    const normal=new Vector3(normals[i]/size[0],normals[i+1]/size[1],normals[i+2]/size[2]).normalize()
    normals[i]=normal.x
    normals[i+1]=normal.y
    normals[i+2]=normal.z
  }
  mesh.setVerticesData('normal',normals)
  if (palette) mesh.setVerticesData('color',colors)
  mesh.refreshBoundingInfo()
  mesh.position.set(...at)
  mesh.parent=parent
  mesh.isPickable=false
  return mesh
}

// A thin, tapered ridge hugs the profiled ribcage and inherits its body motion.
function addFlankScars(scene,ribcage,[rx,ry,rz],profile,material,palette,seed) {
  const positions=[],indices=[],colors=[],normals=[],uvs=[]
  const pale=Color3.Lerp(palette.skin,palette.cream,.72)
  const edge=Color3.Lerp(palette.skin,palette.shadow,.23)
  const count=1+seed%2
  const side=seed%3===0 ? -1 : 1
  for(let mark=0;mark<count;mark++){
    const first=positions.length/3
    const length=mark===0?.59:.37
    for(let row=0;row<=10;row++){
      const t=row/10
      const y=.44+(seed%5)*.017-length*t
      const z=-.19+mark*.14+length*.55*t+.023*Math.sin(t*TAU+.7*seed)
      const width=.026*Math.sin(Math.PI*t)**.72+.001
      for(let col=0;col<3;col++){
        const offset=col-1, v=z+offset*width
        const x=side*rx*Math.sqrt(1-y*y-v*v)*profiledWidth(profile,v)
        positions.push(x+side*(col===1?.0009:.0002),ry*y,rz*v)
        const n=new Vector3(x/(rx*rx),y/ry,v/rz).normalize()
        normals.push(n.x,n.y,n.z)
        const tint=col===1?pale:edge
        colors.push(tint.r,tint.g,tint.b,1)
        uvs.push(t*.25,(v+1)*.5)
        if(row && col){
          const i=first+row*3+col
          indices.push(i-4,i-3,i,i-4,i,i-1)
        }
      }
    }
  }
  const mesh=new Mesh('healed flank scars',scene)
  const data=new VertexData()
  Object.assign(data,{positions,indices,colors,normals,uvs})
  data.applyToMesh(mesh)
  mesh.parent=ribcage
  mesh.material=material
  mesh.isPickable=false
}

const sweepSides=16
const ringSize=sweepSides+1

function smoothSweepSeam(normals) {
  for(let start=0;start<normals.length;start+=ringSize*3) {
    const end=start+sweepSides*3
    const x=normals[start]+normals[end], y=normals[start+1]+normals[end+1], z=normals[start+2]+normals[end+2]
    const length=Math.hypot(x,y,z)||1
    normals[start]=normals[end]=x/length
    normals[start+1]=normals[end+1]=y/length
    normals[start+2]=normals[end+2]=z/length
  }
}

function sweep(name,scene,parent,sections,palette,seed,material) {
  const positions=[],indices=[],colors=[],uvs=[]
  const sides=sweepSides
  // Carry the width axis down the curve, including through vertical tangents.
  const dz=sections.at(-1)[2]-sections[0][2]
  let side=new Vector3(dz<-.06?-1:1,0,0)
  sections.forEach(([x,y,z,w,h],index)=>{
    const a=sections[Math.max(0,index-1)],b=sections[Math.min(sections.length-1,index+1)]
    const tangent=new Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize()
    side=side.subtract(tangent.scale(Vector3.Dot(side,tangent)))
    if(side.lengthSquared()<.001) side=Vector3.Cross(Vector3.Up(),tangent)
    side.normalize()
    const up=Vector3.Cross(tangent,side).normalize()
    for(let j=0;j<=sides;j++){
      const angle=j/sides*TAU, t=side.scale(Math.cos(angle)*w).add(up.scale(Math.sin(angle)*h))
      const point=[x+t.x,y+t.y,z+t.z]
      positions.push(...point)
      uvs.push(j/sides,index/(sections.length-1))
      if(palette)colors.push(...shade(point,seed,palette,Math.max(0,-Math.sin(angle))*.68))
      if(index && j<sides){
        const prev=(index-1)*ringSize
        const a=prev+j,b=a+1,c=a+ringSize,d=b+ringSize
        indices.push(a,b,c,b,d,c)
      }
    }
  })
  const data=new VertexData(), normals=[]
  for(let j=1;j<sides-1;j++){
    const end=(sections.length-1)*ringSize
    indices.push(0,j+1,j,end,end+j,end+j+1)
  }
  VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true})
  smoothSweepSeam(normals)
  Object.assign(data,{positions,indices,normals,uvs})
  if(palette)data.colors=colors
  const mesh=new Mesh(name,scene)
  data.applyToMesh(mesh)
  mesh.parent=parent
  mesh.material=material
  mesh.isPickable=false
  return mesh
}

function plate(name,scene,parent,at,width,height,depth,material) {
  // A rounded lozenge with an offset bevel and a softer silhouette than a flat triangle.
  const mesh=sweep(name,scene,parent,[
    [0,-.022,0,depth*.52,width*.55],
    [0,height*.27,0,depth,width*1.18],
    [0,height*.60,-.007,depth*.76,width*1.24],
    [0,height*.82,-.016,depth*.43,width*.76],
    [0,height,-.025,.003,.004],
  ],null,0,material)
  mesh.position.set(...at)
  return mesh
}

function node(name,scene,parent,at=[0,0,0]) {
  const result=new TransformNode(name,scene)
  result.parent=parent
  result.position.set(...at)
  return result
}

export class Hatchling {
  constructor(scene, kind, seed=1, { adult=false }={}) {
    this.collisionMeshes = []
    this.bodyMatrix=Matrix.Identity()
    this.bodyOrientation=new Quaternion()
    this.kind=kind
    this.listenSide=seed%2 ? 1 : -1
    this.type=species[kind]
    this.adult=adult
    const {skin,shadow,cream,accent,iris}={...this.type,...(adult ? adultCoats[kind] : {})}
    const palette={kind,patternPhase:(seed*.61803398875%1)*TAU,skin:rgb(skin),shadow:rgb(shadow),cream:rgb(cream),accent:rgb(accent)}
    this.root=node(this.type.name+(adult?' adult':' hatchling'),scene,null)
    this.root.scaling.setAll(adult?5:1)
    this.body=node('body and hips',scene,this.root)
    const material=(name,color,gloss=0)=>{
      const mat=new StandardMaterial(name,scene)
      mat.diffuseColor=rgb(color)
      mat.specularColor=rgb(gloss?0xa3aba5:0x190e0d)
      mat.specularPower=gloss?70:24
      mat.backFaceCulling=false
      return mat
    }
    const skinMat=material('mottled hide',0xffffff)
    skinMat.diffuseTexture=scaleTexture(scene,seed)
    skinMat.diffuseTexture.uScale=2
    skinMat.diffuseTexture.vScale=1.19
    const lip=material('lip and nostrils',adult?0x422e29:0x513333)
    const mouth=material('mouth lining',adult?0x301722:0x421c36)
    const tongue=material('tongue',adult?0x9a5963:0xcc7788)
    const bone=material('horn, beak and claws',0xf9dbab)
    const almond=material('warm sclera',0xfff2d6,1)
    const eyeTint=material('iris',adult?0xc39956:iris,1)
    const eyeRidge=kind==='rex' || adult ? material('orbital rim',skin) : null
    const pupil=material('pupil',0x171825,1)
    const shine=material('catchlight',0xfffcf1)
    shine.emissiveColor=rgb(0xfffcf1)
    const crest=material('warm display scales',accent)
    const deepCrest=kind==='trike' || kind==='stego' ? material('display ridge',accent) : null
    if (deepCrest) deepCrest.diffuseColor=Color3.Lerp(rgb(accent),rgb(shadow),.33)
    const solid=(name,parent,at,size,mat)=> {
      const mesh=volume(name,scene,parent,at,size,null,seed)
      mesh.material=mat
      return mesh
    }
    const hide=(name,parent,at,size,profile)=> {
      const mesh=volume(name,scene,parent,at,size,palette,seed,profile)
      mesh.material=skinMat
      return mesh
    }
    const rex=kind==='rex', long=kind==='longneck', trike=kind==='trike', stego=kind==='stego'
    const torsoY=rex?.355:long?.355:.288
    const mass=adult?1.17:1
    const ribSize=[(rex?.123:.138)*mass,.125*mass,(rex?.205:.216)*mass]
    const ribProfile=1.06
    const ribcage=hide('rounded ribcage',this.body,[0,torsoY,.002],ribSize,ribProfile)
    this.collisionMeshes.push(ribcage)
    if(adult) addFlankScars(scene,ribcage,ribSize,ribProfile,skinMat,palette,seed)
    this.collisionMeshes.push(hide('shoulder and breast',this.body,[0,torsoY+(adult&&long?.032:-.004),adult&&rex?.140:.121],
      [.112*mass,(adult&&long?.136:.111)*mass,.123*mass]))
    this.collisionMeshes.push(hide('haunches',this.body,[0,torsoY-.014,-.13],[.126*mass,.119*mass,.103*mass]))

    const neckBase=[0,torsoY+.045,.136]
    this.neck=node('neck joint',scene,this.body,neckBase)
    const neckTop=long?[0,adult?.454:.344,adult?.152:.124]:rex?[0,.091,.057]:[0,.032,.069]
    this.collisionMeshes.push(sweep('tapered neck',scene,this.neck,[
      [0,-.065,-.037,.104,.092],
      [0,neckTop[1]*.16,long?.008:.034,long?.084:.094,long?.084:.085],
      [0,neckTop[1]*.41,long?.012:.048,long?.064:.082,long?.068:.074],
      [0,neckTop[1]*.69,long?.047:neckTop[2]*.78,long?.053:.078,.061],
      [0,neckTop[1]*.87,long?.085:neckTop[2]*.92,long?.049:.072,.058],
      [0,neckTop[1]+.012,neckTop[2]+.006,long?.052:.070,.059],
    ],palette,seed,skinMat))
    this.head=node('skull pivot',scene,this.neck,neckTop)
    this.headRest=neckTop
    if (adult) {
      this.head.scaling.set(rex?1.09:.93,rex?.96:.84,rex?1.24:trike?1.09:.98)
    }
    const headWidth=rex?.121:trike?.113:stego?.092:.087
    const snout=rex?.150:trike?.128:stego?.110:.119
    this.collisionMeshes.push(sweep('continuous skull and upper snout',scene,this.head,[
      [0,.029,-.100,.005,.006],
      [0,.030,-.086,headWidth*.58,.070],
      [0,.031,-.055,headWidth*.87,.092],
      [0,.029,-.012,headWidth,.104],
      [0,.030,.034,headWidth*.98,.095],
      [0,.011,.078,headWidth*.88,.068],
      [0,-.003,snout*.80,headWidth*.80,.052],
      [0,-.007,snout*1.18,headWidth*.69,.044],
      [0,-.010,snout*1.37,headWidth*.50,.029],
      [0,-.016,snout*1.45,.006,.009],
    ],palette,seed,skinMat))
    solid('upper mouth seam',this.head,[0,-.055,snout*.70],[headWidth*.80,.013,snout*.68],lip)
    this.jaw=node('hinged lower jaw',scene,this.head,[0,-.049,-.028])
    hide('lower jaw',this.jaw,[0,-.026,snout*.84],[headWidth*.80,.034,snout*.82],.90)
    solid('inner mouth',this.jaw,[0,-.008,snout*.88],[headWidth*.72,.014,snout*.74],mouth)
    this.tongue=solid('soft tongue',this.jaw,[0,.000,snout*1.04],[headWidth*(adult?.42:.49),.008,snout*(adult?.36:.46)],tongue)
    // A U-shaped lining connects the jaws at the throat. Its front edge stays open.
    this.throat=new Mesh('flexible mouth lining',scene)
    this.throat.parent=this.head
    this.throat.position.copyFrom(this.jaw.position)
    this.throat.material=mouth
    this.throat.isPickable=false
    this.throatRim=[[-.65,1.06],[-.57,.97],[-.33,.88],[0,.86],[.33,.88],[.57,.97],[.65,1.06]]
      .map(([x,z])=>[x*headWidth,z*snout])
    const lining=new VertexData()
    lining.positions=this.throatRim.flatMap(([x,z])=>[x,.012,z,x,-.012,z])
    lining.indices=[]
    for(let i=0;i<this.throatRim.length-1;i++){
      const j=i*2
      lining.indices.push(j,j+1,j+2,j+2,j+1,j+3)
    }
    lining.normals=[]
    VertexData.ComputeNormals(lining.positions,lining.indices,lining.normals,{useRightHandedSystem:true})
    lining.applyToMesh(this.throat,true)
    this.lining=lining
    if(trike || stego) {
      const keratin=material('amber beak',adult?0x9e7852:0xd5aa72)
      sweep('hooked upper beak',scene,this.head,[
        [0,-.011,snout*.99,headWidth*.62,.030],
        [0,-.014,snout*1.23,headWidth*.57,.031],
        [0,-.024,snout*1.42,headWidth*.37,.024],
        [0,-.042,snout*1.47,.006,.010],
      ],null,seed,keratin)
    }

    this.eyes=[]
    for (const side of [-1,1]) {
      const eye=node('eye socket',scene,this.head,[side*headWidth*.74,.051,.067])
      eye.rotation.y=side*.77
      solid('soft orbital ridge',eye,[0,.004,.012],[.047,.051,.027],eyeRidge??crest)
      const globe=node('blink pivot',scene,eye,[0,.001,adult?.020:.026])
      solid('eye white',globe,[0,0,0],[.034,.040,.019],almond)
      const gaze=node('gaze pivot',scene,globe)
      solid('iris',gaze,[-side*.005,-.001,.014],[.026,.031,.011],eyeTint)
      solid('pupil',gaze,[-side*.007,.001,.021],[.014,.022,.005],pupil)
      solid('large eye glint',gaze,[-.010,.013,.025],[.008,.008,.003],shine)
      solid('small eye glint',gaze,[.010,-.009,.024],[.0034,.0034,.002],shine)
      if (adult) globe.scaling.set(.70,.74,.84)
      const brow=hide('expressive brow',eye,[0,.034,.011],[.049,adult?.024:.016,.027])
      brow.rotation.z=side*(adult?.34:.18)
      const nostril=solid('nostril',this.head,[side*headWidth*.53,.014,snout*1.29],[.012,.007,.006],lip)
      this.eyes.push({globe,gaze,nostril,side,brow})
      if(rex)for(let i=0;i<(adult?6:4);i++){
        const z=.071+i*(adult?.019:.030)
        const x=side*headWidth*(.74-.062*i)
        sweep('little tooth',scene,this.head,[[x,-.046,z,.008,.007],[x,-.061-(adult?.013:.002)-(i%2)*.004,z+.003,.001,.001]],null,seed,bone)
      }
      if(kind!=='trike') {
        for(let i=0;i<5;i++) {
          const dot=solid('cheek freckles',this.head,[side*(headWidth*.94-i*.004),.015+.011*Math.sin(i*2.4),.068+i*.015],
            [.006,.005,.006],crest)
          dot.rotation.y=side*.45
        }
      }
    }

    if(trike) {
      const frill=solid('heart-shaped frill',this.head,[0,.060,-.075],[.178,.154,.038],deepCrest)
      frill.rotation.x=-.15
      const shield=hide('frill inset',this.head,[0,.061,-.051],[.148,.128,.020])
      shield.rotation.x=-.15
      for(let i=0;i<5;i++) {
        const a=.42+i*.57
        const rib=solid('frill growth ridge',this.head,[Math.cos(a)*.100,.061+Math.sin(a)*.085,-.030],
          [.007,.029,.006],deepCrest)
        rib.rotation.z=a-Math.PI/2
      }
      for(let i=0;i<9;i++) {
        const a=-.17+i*(Math.PI+.34)/8
        const x=.132*Math.cos(a),y=.061+.111*Math.sin(a)
        const r=.009+.004*Math.sin(i*2.2)
        // The back of the frill carries a second row of darker growth marks.
        const rear=-.075-.038*Math.sqrt(Math.max(0,1-(x/.178)**2-((y-.060)/.154)**2))-(y-.060)*.15
        solid('rear frill speckles',this.head,[x,y,rear],[r,r*1.3,.008],crest)
      }
      for(let i=0;i<11;i++) {
        const a=-.30+i*(Math.PI+.6)/10
        const x=.166*Math.cos(a),y=.057+.137*Math.sin(a)
        solid('frill pearls',this.head,[x,y,-.049],[.018,.016,.017],crest)
        solid('frill spots',this.head,[x*.66,.053+(y-.053)*.65,-.027],[.012,.013,.009],bone)
      }
      for (const side of [-1,1]) sweep('brow horn',scene,this.head,[
        [side*.075,.087,.061,.028,.026],[side*.083,.130,.100,.020,.018],
        [side*.088,adult?.181:.158,adult?.152:.129,.012,.010],[side*.089,adult?.242:.188,adult?.205:.147,.002,.002],
      ],null,seed,bone)
      sweep('nose horn',scene,this.head,[[0,.025,.153,.022,.020],[0,.072,.161,.012,.011],[0,.098,.166,.002,.002]],null,seed,bone)
    }
    if(stego) {
      for(let i=0;i<7;i++){
        const z=.151-i*.049
        const y=torsoY+.099+.017*Math.sin(i*.6)
        const h=(.050+.087*Math.sin((i+1)*Math.PI/8))*(adult?1.25:1)
        const side=i%2?1:-1
        const sail=plate('alternating sail plate',scene,this.body,[side*.039,y,z],.035,h,.022,i%2?crest:deepCrest)
        sail.rotation.y=side*.15+.08*Math.sin(i*1.7)
        const ridge=solid('plate growth edge',this.body,[side*.054,y+h*.41,z+.009],[.012,h*.29,.014],i%2?deepCrest:crest)
        ridge.rotation.x=.29
      }
    }
    if(adult) for(const sign of [-1,1]) for(let i=0;i<6;i++){
      const z=.131-i*.046, y=torsoY+.071+.017*Math.sin(i*.9)
      const width=(rex?.104:.118)*mass
      const scute=hide('raised flank scales',this.body,[sign*width,y,z],[.020,.012,.018])
      scute.rotation.z=sign*.56
    }
    if(rex || long) for(let i=0;i<(rex?5:7);i++){
      const plateRoot=long?this.neck:this.body
      const at=long?[0,i*.044,.012+i*.009]:[0,torsoY+.119,-.014-i*.039]
      solid('dorsal scales',plateRoot,at,[.018,.015,.021],crest)
    }

    const tailLength=(rex?.535:stego?.473:long?.401:.335)*(adult?1.23:1)
    this.tail=node('tail base',scene,this.body,[0,torsoY+.003,-.158])
    const sections=Array.from({length:14},(_,i)=>{
      const t=i/13, r=.084*mass*(1-t)**.93+.001
      return [0,.045*Math.sin(t*Math.PI*.7),.018-tailLength*t,r,r*.87]
    })
    this.tailMesh=sweep('continuous tail',scene,this.tail,sections,palette,seed,skinMat)
    const stream=this.tailMesh.getVerticesData('position')
    this.tailMesh.setVerticesData('position',stream,true)
    const normals=this.tailMesh.getVerticesData('normal')
    this.tailMesh.setVerticesData('normal',normals,true)
    this.tailIndices=this.tailMesh.getIndices()
    this.tailRest=stream.slice()
    this.tailStream=stream
    this.tailNormals=normals
    this.tailLength=tailLength
    this.spikes=[]
    if(stego)for(let i=0;i<2;i++)for(const side of [-1,1]) {
      const z=-tailLength*(.75+i*.105)
      const spike=node('tail spike hinge',scene,this.tail,[0,.031,z])
      sweep('rounded tail spike',scene,spike,[
        [side*.023,.012,0,.013,.013],[side*.059,.039,-.014,.009,.009],
        [side*.086,.054,-.023,.001,.001]],null,seed,bone)
      this.spikes.push({joint:spike,restZ:z,back:-z/tailLength})
    }

    this.legs=[]
    for(const side of [-1,1])for(const front of [false,true]){
      const arm=rex&&front
      const jointHeight=arm?.397:rex?.287:long?.318:.237
      const femur=arm?.060:rex?.155:long?.168:.126
      const shin=arm?.050:rex?.149:long?.160:.123
      const shoulder=node(arm?'shoulder':'upper leg',scene,this.body,[side*(arm?.094:.097),jointHeight,front?.121:-.103])
      const knee=node(arm?'wrist':'knee',scene,shoulder,[side*(arm?.011:0),-femur,arm?.020:.007])
      const ankle=node(arm?'hand':'ankle',scene,knee,[0,-shin,arm?.021:.010])
      const width=(arm?.027:front?.042:.057)*(adult?1.15:1)
      this.collisionMeshes.push(
        hide('upper limb',shoulder,[0,-femur*.40,0],[width,femur*.76,width*1.05]),
        hide('lower limb',knee,[0,-shin*.45,.004],[width*.66,shin*.69,width*.72]),
        hide(arm?'hand':'padded foot',ankle,[0,-.003,.022],[width*.93,arm?.020:.030,arm?.037:.055]),
      )
      for(let j=0;j<(arm?2:3);j++){
        const x=(j-(arm?.5:1))*width*.53
        solid('round toe',ankle,[x,-.009,arm?.050:.061],[width*.30,arm?.013:.017,.019],bone)
      }
      this.legs.push({shoulder,knee,ankle,side,front,arm,
        upper:Math.hypot(femur,knee.position.z),lower:Math.hypot(shin,ankle.position.z),
        upperRest:Math.atan2(knee.position.z,femur),lowerRest:Math.atan2(ankle.position.z,shin),
      })
    }
  }

  tailCollisionSections() {
    const matrix = this.tail.computeWorldMatrix()
    return [2,5,8,11].map(ring => {
      const left = ring * ringSize * 3
      const right = left + sweepSides / 2 * 3
      const vertices = this.tailStream
      const center = new Vector3()
      Vector3.TransformCoordinatesFromFloatsToRef(
        (vertices[left]+vertices[right])*.5, (vertices[left+1]+vertices[right+1])*.5,
        (vertices[left+2]+vertices[right+2])*.5, matrix, center)
      const scale = this.root.scaling.x
      const radius = Math.abs(vertices[left]-vertices[right])*.5*scale
      return {center,radius,length:this.tailLength/13*1.8*scale}
    })
  }

  pose(time,{walk=0,gaitTime=time,action='',progress=0,gestureWeight=1,voice=0,interest=0,bank=0,pivot=0}={}) {
    const t=time
    const adult=this.adult
    const gait=gaitTime*TAU*this.type.gait*(adult?.58:1)+.19*Math.sin(gaitTime*2.1)
    const roar=action==='roar' ? smooth(progress/.22)*smooth((1-progress)/.28) : 0
    const breath=Math.sin(t*(adult?1.65:2.7))
    const investigating=isQuietGesture(action)
    const idleWeight=(1-clamp(walk))*smooth(gestureWeight)
    const act=action ? smooth(progress/.27)*smooth((1-progress)/.27)*(investigating?idleWeight:1) : 0
    const sniff=action==='sniff'?act:0
    // A sustained neck lift carries two shorter breaths of unequal length.
    const inhale=sniff ? sniff*(Math.exp(-((progress-.32)**2)/.004)+.76*Math.exp(-((progress-.64)**2)/.009)) : 0
    const lift=sniff*.78+inhale*.22
    const listening=action==='listen'?idleWeight*this.listenSide*(adult?.76:1):0
    const glance=listening*smooth(progress/.12)*smooth((1-progress)/.15)
    const tilt=listening*smooth((progress-.08)/.25)*smooth((1-progress)/.30)
    const settle=listening*smooth((progress-.18)/.31)*smooth((1-progress)/.22)
    const counterbalance=listening*smooth((progress-.24)/.32)*smooth((1-progress)/.16)
    const sit=action==='sit'?act:0
    const shake=action==='sneeze'?Math.sin(Math.PI*clamp((progress-.08)/.84)):0
    const scratch=action==='scratch'?act:0
    const wag=action==='wag'?act:0
    const yawn=action==='yawn'?act:0
    const gape=yawn*smooth((progress-.09)/.44)*smooth((.88-progress)/.26)
    const exhale=yawn*smooth((progress-.58)/.17)*smooth((1-progress)/.18)
    const scuff=action==='scuff'?act:0
    const watchingFoot=scuff*smooth(progress/.16)*smooth((.91-progress)/.29)
    // Reach above the floor, pull back in contact, then pick up the toes to reset.
    const pawWeight=action==='scuff'?idleWeight:0
    const rake=pawWeight ? pawWeight*(adult?.94:1)*(.115*smooth((progress-.12)/.26)
      -.178*smooth((progress-.42)/.27)+.063*smooth((progress-.72)/.23)) : 0
    const pawLift=pawWeight ? pawWeight*(adult?.84:1)*(.079*Math.sin(Math.PI*clamp((progress-.10)/.34))**2
      +.051*Math.sin(Math.PI*clamp((progress-.70)/.24))**2) : 0
    const drag=scuff*smooth((progress-.40)/.14)*smooth((.80-progress)/.19)
    const rex=this.kind==='rex'
    this.body.position.y=.005*breath+walk*(adult?.61:1)*(.004+.011*Math.sin(gait*2+.5))-.072*sit+.027*shake+.018*roar
    this.body.scaling.set(1+.010*breath+.016*inhale+.024*gape,1+.011*breath+.018*roar+.013*inhale+.028*gape,1)
    this.body.rotation.z=-bank*.075*walk+walk*(adult?.031:.047)*Math.sin(gait)+.018*shake*Math.sin(progress*36)
      +wag*.043*Math.sin(progress*TAU*2.45+.5)
    this.body.rotation.x=sit*-.14+walk*.038*Math.sin(gait*2)-.07*shake
    this.body.rotation.y=wag*.065*Math.sin(progress*TAU*2.45+.8)
    this.neck.rotation.x=.026*breath+walk*.071*Math.sin(gait+.7)-.20*sit+.31*scratch-.17*roar
    this.neck.rotation.y=0
    this.neck.rotation.z=0
    // Let the neck lead a scan, then let the chest and pelvis take up the turn.
    // During a stride the pelvis rolls toward the supporting leg.
    const survey=adult ? (1-act)*(.52*Math.sin(t*.56)+.48*interest) : 0
    if(adult) {
      const load=Math.sin(gait)*walk
      const shift=Math.sin(t*.74)*.006*(1-walk)
      this.body.position.x=shift+.010*load
      this.body.rotation.z+=shift*3.7+.028*load
      this.body.rotation.y+=.14*survey+.046*Math.sin(gait+.5)*walk
      this.body.rotation.x+=.028*Math.sin(t*.78)*(1-walk)
      this.neck.rotation.y=.23*survey+.074*pivot
      this.neck.rotation.x+=(this.kind==='longneck'?.12:.065)*Math.sin(t*.63+.6)*(1-walk)
      const pause=(1-walk)*(1-act)
      const dip=smooth((Math.sin(t*.70)-.16)/.84)*pause
      if(this.kind==='trike') {
        this.neck.rotation.x+=.32*dip
        this.body.rotation.x+=.062*dip
      } else if(this.kind==='stego') {
        this.body.rotation.z+=.058*survey
        this.neck.rotation.y+=.11*survey
      } else if(this.kind==='longneck') {
        this.neck.rotation.y+=.20*survey
        this.neck.rotation.z=.095*survey
      } else {
        this.body.rotation.y+=.085*survey
        this.neck.rotation.x-=.10*dip
      }
    }
    this.body.position.y-=.017*scuff+.012*drag+.013*exhale
    this.body.rotation.z+=this.listenSide*(rex?.14:.065)*scuff
    this.body.rotation.x+=.065*scuff-.048*gape+.055*exhale
    this.neck.rotation.x+=.23*scuff+.11*drag-.19*gape+.09*exhale
    this.body.rotation.x-=.046*lift
    this.body.rotation.z+=.043*settle
    this.neck.rotation.x-=(this.kind==='longneck'?.13:.21)*lift
    this.neck.rotation.y+=.18*tilt
    this.neck.rotation.z+=.11*tilt
    this.head.position.set(0,this.headRest[1]-.028*scratch,this.headRest[2]-.035*scratch+.022*voice+.015*roar)
    const sneezeSnap=Math.exp(-((progress-.47)**2)/.003)
    const sneezeRecoil=Math.exp(-((progress-.58)**2)/.008)
    this.head.rotation.x=.030*Math.sin(t*2.2+.5)+walk*.105*Math.sin(gait+.33)
      +shake*(.47*sneezeSnap-.28*sneezeRecoil)+.23*scratch-.19*roar-this.body.rotation.x*.32
    this.head.rotation.y=interest*.43+bank*.23*walk+.077*Math.sin(t*1.9)+walk*.041*Math.sin(gait)+shake*.26*Math.sin(progress*32)
    this.head.rotation.z=(adult?.027:.060)*Math.sin(t*1.1)+shake*.15*Math.sin(progress*32)
    this.head.rotation.x-=(this.kind==='longneck'?.16:.09)*lift+.13*inhale
    this.head.rotation.z+=.26*tilt-.037*settle
    this.jaw.rotation.x=.012+voice*(adult?.86:.67)+roar*.22+shake*.34*Math.exp(-((progress-.49)**2)/.013)
    this.head.rotation.x+=(this.kind==='longneck'?.28:.18)*watchingFoot-.16*gape+.07*exhale
    this.head.rotation.y+=this.listenSide*(.22*watchingFoot+.12*drag)
    this.jaw.rotation.x=Math.max(this.jaw.rotation.x,.012+(adult?.68:.75)*gape)
    this.tongue.rotation.x=-.12*gape
    this.tongue.scaling.y=1+.27*gape
    if(this.jaw.rotation.x!==this.liningAngle){
      this.liningAngle=this.jaw.rotation.x
      const jawSin=Math.sin(this.jaw.rotation.x),jawCos=Math.cos(this.jaw.rotation.x)
      for(const [i,[,z]] of this.throatRim.entries()){
        this.lining.positions[i*6+4]=-.012*jawCos-z*jawSin
        this.lining.positions[i*6+5]=-.012*jawSin+z*jawCos
      }
      VertexData.ComputeNormals(this.lining.positions,this.lining.indices,this.lining.normals,{useRightHandedSystem:true})
      this.throat.updateVerticesData('position',this.lining.positions,true)
      this.throat.updateVerticesData('normal',this.lining.normals)
    }
    const blinkTick=(t+.27)%(3.37+this.type.gait*.7)
    const blink=1-.91*Math.sin(Math.PI*clamp(blinkTick/.17))
    for(const {globe,gaze,nostril,side,brow} of this.eyes) {
      globe.scaling.y=blink*(adult?.74:1)*(1-.35*shake-.17*roar-.36*yawn-.44*gape-.19*exhale)
      gaze.rotation.y=.18*glance
      gaze.rotation.x=-.10*sniff+.24*watchingFoot
      brow.position.y=.034+.007*Math.max(0,glance*side)
      nostril.scaling.set(1+.24*inhale,1+.52*inhale,1)
    }
    const tailWave=(.054+.07*walk)*Math.sin(adult?t*1.8:t*3.9)-.050*survey-.072*pivot+wag*.13*Math.sin(progress*TAU*2.45)
      -bank*.11*walk-.092*counterbalance-this.listenSide*.072*scuff
    const rearLift=.050*drag-.034*exhale+.013*breath+.036*walk*Math.sin(gait+.4)-.046*sit+.046*roar
    for(let i=0;i<this.tailRest.length;i+=3) {
      const back=clamp(-this.tailRest[i+2]/this.tailLength)
      this.tailStream[i]=this.tailRest[i]+tailWave*back**1.5
      this.tailStream[i+1]=this.tailRest[i+1]+rearLift*back**1.3
      this.tailStream[i+2]=this.tailRest[i+2]+Math.abs(tailWave)*.34*back**2
    }
    VertexData.ComputeNormals(this.tailStream,this.tailIndices,this.tailNormals,{useRightHandedSystem:true})
    smoothSweepSeam(this.tailNormals)
    this.tailMesh.updateVerticesData('position',this.tailStream)
    this.tailMesh.updateVerticesData('normal',this.tailNormals)
    for (const {joint,restZ,back} of this.spikes) {
      // Match the displaced ring center and its local tangent, including tail shortening.
      const tangentZ=this.tailLength-.68*Math.abs(tailWave)*back
      joint.position.set(tailWave*back**1.5,.031+rearLift*back**1.3,
        restZ+Math.abs(tailWave)*.34*back**2)
      joint.rotation.y=-Math.atan2(1.5*tailWave*Math.sqrt(back),tangentZ)
      joint.rotation.x=Math.atan2(1.3*rearLift*back**.3,tangentZ)
    }

    const stance=adult?.71:.62
    Quaternion.FromEulerAnglesToRef(this.body.rotation.x,this.body.rotation.y,this.body.rotation.z,this.bodyOrientation)
    Matrix.ComposeToRef(this.body.scaling,this.bodyOrientation,this.body.position,this.bodyMatrix)
    const m=this.bodyMatrix.m
    for(const {shoulder,knee,ankle,side,front,arm,upper,lower,upperRest,lowerRest} of this.legs){
      const cycle=gait/TAU+(side===1?.5:0)+(front&&!rex?.42:0)
      const phase=cycle-Math.floor(cycle)
      const stride=this.kind==='longneck'?.153:rex?.204:.145
      const swing=phase>stance
      const swingProgress=(phase-stance)/(1-stance)
      const forward=walk*stride*(swing ? -.5+smooth(swingProgress) : .5-phase/stance)
      const lift=swing ? walk*(adult?.034:rex?.066:.055)*Math.sin(Math.PI*swingProgress)**1.35 : 0
      const reach=arm && side===1 ? scratch : 0
      if(arm) {
        shoulder.position.z=.121+.042*reach
        shoulder.rotation.x=-.41+walk*.22*Math.sin(cycle*TAU)-.17*Math.sin(t*3.2+side)-reach*(1.12+.19*Math.sin(progress*46))
        shoulder.rotation.x-=.40*scuff+.17*side*this.listenSide*drag
        shoulder.rotation.z=side*(.10+.23*scuff)-reach*.21
        knee.rotation.x=-.54-reach*.51
        ankle.rotation.x=.12*Math.sin(t*4.2+side)+reach*.71
        continue
      }
      const footTravel=forward*(1-Math.abs(pivot))-forward*side*pivot
      const pawing=side===this.listenSide && front!==rex
      const targetZ=footTravel+(pawing?rake:0)+roar*(front?.028:-.034)+sit*(front?.039:.093)+wag*(front?.012:-.011)*Math.sin(progress*TAU*2.45)
      const hip=shoulder.position
      // Solve in the limb plane for the requested sole height in root space.
      const ankleHeight=.033+lift+(pawing?pawLift:0)
      const drop=hip.y+(m[13]+m[1]*hip.x+m[9]*(hip.z+targetZ)-ankleHeight)/m[5]
      const reachLength=Math.min(upper+lower-.0001,Math.max(Math.abs(upper-lower)+.0001,Math.hypot(drop,targetZ)))
      const bend=front&&!rex ? -1 : 1
      const cosA=(upper**2+reachLength**2-lower**2)/(2*upper*reachLength)
      const cosB=(reachLength**2-upper**2-lower**2)/(2*upper*lower)
      shoulder.rotation.x=upperRest+Math.atan2(-targetZ,drop)-bend*Math.acos(Math.max(-1,Math.min(1,cosA)))
      knee.rotation.x=lowerRest-upperRest+bend*Math.acos(Math.max(-1,Math.min(1,cosB)))
      // Cancel torso pitch and bank at the ankle to keep planted feet flat.
      ankle.rotation.x=-this.body.rotation.x-shoulder.rotation.x-knee.rotation.x+walk*lift*3.2+(pawing?pawLift*.90:0)
      ankle.rotation.z=-this.body.rotation.z-shoulder.rotation.z
    }
  }
}
