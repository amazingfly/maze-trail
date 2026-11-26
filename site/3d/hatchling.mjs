import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'

import { species } from './hatchling-play.mjs'

const rgb = color => Color3.FromInts(color >> 16, (color >> 8) & 255, color & 255)
const TAU = 2*Math.PI
const clamp = value => Math.min(1,Math.max(0,value))
const mix = (a,b,t) => a+(b-a)*t

function shade(position, id, palette, underside) {
  const [x,y,z]=position
  // Layer large pigment patches, small scales and fine noise in model space.
  const ripple=Math.sin(31*x+id*2+2*Math.sin(16*z))*Math.sin(28*z+19*y)
  const scales=Math.abs(Math.sin(290*x+2*Math.cos(z*184))*Math.sin(238*z+193*y))
  const mottle=.25+.21*ripple+.13*Math.sin(x*71-z*57+y*45+id)
  const light=.86+.14*scales+.11*Math.sin(11*x-13*z)
  const band=Math.sin(z*(palette.kind==='rex'?34:23)+9*x+7*y+Math.sin(x*33))
  const markings=palette.kind==='rex' ? Math.max(0,band-.44)*.73
    : palette.kind==='stego' ? Math.max(0,band-.58)*.45 : 0
  const color=Color3.Lerp(palette.skin,palette.shadow,clamp(mottle+markings))
  const fleck=Math.sin(x*121-y*48)*Math.cos(z*99+y*71)
  if (palette.kind==='longneck' || palette.kind==='trike') {
    const amount=palette.kind==='longneck'?.40:.28
    Color3.LerpToRef(color,palette.accent,Math.max(0,fleck-.55)*amount,color)
  }
  const belly=Color3.Lerp(color,palette.cream,clamp(underside))
  return [belly.r*light,belly.g*light,belly.b*light,1]
}

function scaleTexture(scene,seed) {
  const map=new DynamicTexture('individual pebbled scales',128,scene,true)
  const ctx=map.getContext()
  let state=seed
  const next=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296)
  ctx.fillStyle='#d3cebf'
  ctx.fillRect(0,0,128,128)
  for(let y=0;y<16;y++)for(let x=0;x<16;x++) {
    const cx=x*8+(y%2)*4+next()*2,cy=y*8+next()*2
    const rx=2.9+next()*1.4,ry=2.6+next()*1.4
    const tone=Math.round(219+next()*34)
    const tilt=(next()-.5)*.8
    for(const ox of [-128,0,128])for(const oy of [-128,0,128]) {
      if(cx+ox < -6 || cx+ox > 134 || cy+oy < -6 || cy+oy > 134) continue
      ctx.fillStyle=`rgb(${tone},${tone},${tone-5})`
      ctx.beginPath()
      ctx.ellipse(cx+ox,cy+oy,rx,ry,tilt,0,TAU)
      ctx.fill()
      ctx.fillStyle='#fff8df'
      ctx.fillRect(cx+ox-1.2,cy+oy-1.8,1.5,.65)
    }
  }
  map.update()
  return map
}

function volume(name, scene, parent, at, size, palette, seed, profile = 1) {
  const mesh=CreateSphere(name,{segments:Math.max(...size)>.065?16:8,diameter:2},scene)
  const positions=mesh.getVerticesData('position')
  const colors=[]
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1],z=positions[i+2]
    const shoulder=1+(profile-1)*Math.cos(z*Math.PI/2)
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

function sweep(name,scene,parent,sections,palette,seed,material) {
  const positions=[],indices=[],colors=[],uvs=[]
  const sides=12
  sections.forEach(([x,y,z,w,h],index)=>{
    const a=sections[Math.max(0,index-1)],b=sections[Math.min(sections.length-1,index+1)]
    const tangent=new Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize()
    const side=Vector3.Cross(Vector3.Up(),tangent)
    if(side.lengthSquared()<.001) side.set(1,0,0)
    side.normalize()
    const up=Vector3.Cross(tangent,side).normalize()
    for(let j=0;j<sides;j++){
      const angle=j/sides*TAU, t=side.scale(Math.cos(angle)*w).add(up.scale(Math.sin(angle)*h))
      const point=[x+t.x,y+t.y,z+t.z]
      positions.push(...point)
      uvs.push(j/sides,index/(sections.length-1))
      if(palette)colors.push(...shade(point,seed,palette,Math.max(0,-Math.sin(angle))*.68))
      if(index){
        const prev=(index-1)*sides
        const a=prev+j,b=prev+(j+1)%sides,c=a+sides,d=b+sides
        indices.push(a,b,c,b,d,c)
      }
    }
  })
  const data=new VertexData(), normals=[]
  for(let j=1;j<sides-1;j++){
    const end=(sections.length-1)*sides
    indices.push(0,j+1,j,end,end+j,end+j+1)
  }
  VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true})
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
    [-.012,height*.26,0,depth,width],
    [-.021,height*.68,-.013,depth*.65,width*.75],
    [-.017,height,-.027,.003,.004],
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
  constructor(scene, kind, seed=1) {
    this.kind=kind
    this.type=species[kind]
    const {skin,shadow,cream,accent,iris}=this.type
    const palette={kind,skin:rgb(skin),shadow:rgb(shadow),cream:rgb(cream),accent:rgb(accent)}
    this.root=node(this.type.name+' hatchling',scene,null)
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
    skinMat.diffuseTexture.uScale=1.44
    skinMat.diffuseTexture.vScale=1.19
    const lip=material('lip and nostrils',0x513333)
    const mouth=material('mouth lining',0x421c36)
    const tongue=material('tongue',0xe48491,1)
    const bone=material('horn, beak and claws',0xf9dbab)
    const almond=material('warm sclera',0xfff2d6,1)
    const eyeTint=material('iris',iris,1)
    const eyeRidge=kind==='rex' ? material('orbital rim',skin) : null
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
    hide('rounded ribcage',this.body,[0,torsoY,.002],[rex?.123:.138,.125,rex?.205:.216],1.06)
    hide('shoulder and breast',this.body,[0,torsoY-.004,.121],[.112,.111,.123])
    hide('haunches',this.body,[0,torsoY-.014,-.13],[.126,.119,.103])

    const neckBase=[0,torsoY+.045,.136]
    this.neck=node('neck joint',scene,this.body,neckBase)
    const neckTop=long?[0,.344,.124]:rex?[0,.091,.057]:[0,.032,.069]
    sweep('tapered neck',scene,this.neck,[
      [0,-.065,-.037,.104,.092],
      [0,neckTop[1]*.16,long?.008:.034,long?.084:.094,long?.084:.085],
      [0,neckTop[1]*.41,long?.012:.048,long?.064:.082,long?.068:.074],
      [0,neckTop[1]*.69,long?.047:neckTop[2]*.78,long?.053:.078,.061],
      [0,neckTop[1]*.87,long?.085:neckTop[2]*.92,long?.049:.072,.058],
      [0,neckTop[1]+.012,neckTop[2]+.006,long?.052:.070,.059],
    ],palette,seed,skinMat)
    this.head=node('skull pivot',scene,this.neck,neckTop)
    this.headRest=neckTop
    const headWidth=rex?.121:trike?.113:stego?.092:.087
    const snout=rex?.150:trike?.128:stego?.110:.119
    sweep('continuous skull and upper snout',scene,this.head,[
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
    ],palette,seed,skinMat)
    solid('upper mouth seam',this.head,[0,-.055,snout*.70],[headWidth*.80,.013,snout*.68],lip)
    this.jaw=node('hinged lower jaw',scene,this.head,[0,-.049,-.028])
    hide('lower jaw',this.jaw,[0,-.026,snout*.84],[headWidth*.80,.034,snout*.82],.90)
    solid('inner mouth',this.jaw,[0,-.008,snout*.88],[headWidth*.72,.014,snout*.74],mouth)
    solid('soft tongue',this.jaw,[0,.000,snout*1.04],[headWidth*.49,.008,snout*.46],tongue)
    if (!rex) solid('curved upper beak',this.head,[0,-.033,snout*1.28],[headWidth*.54,.028,.035],bone)

    this.eyes=[]
    for (const side of [-1,1]) {
      const eye=node('eye socket',scene,this.head,[side*headWidth*.74,.051,.067])
      eye.rotation.y=side*.77
      solid('soft orbital ridge',eye,[0,.004,.012],[.047,.051,.027],rex?eyeRidge:crest)
      const globe=node('blink pivot',scene,eye,[0,.001,.026])
      solid('eye white',globe,[0,0,0],[.034,.040,.019],almond)
      solid('iris',globe,[-side*.005,-.001,.014],[.026,.031,.011],eyeTint)
      solid('pupil',globe,[-side*.007,.001,.021],[.014,.022,.005],pupil)
      solid('large eye glint',globe,[-.010,.013,.025],[.008,.008,.003],shine)
      solid('small eye glint',globe,[.010,-.009,.024],[.0034,.0034,.002],shine)
      this.eyes.push(globe)
      const brow=hide('expressive brow',eye,[0,.034,.011],[.049,.016,.027])
      brow.rotation.z=side*.18
      solid('nostril',this.head,[side*headWidth*.53,.014,snout*1.29],[.012,.007,.006],lip)
      if(rex)for(let i=0;i<4;i++){
        const z=.071+i*.030
        const x=side*headWidth*(.74-.062*i)
        sweep('little tooth',scene,this.head,[[x,-.046,z,.008,.007],[x,-.063-(i%2)*.004,z+.003,.001,.001]],null,seed,bone)
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
        [side*.088,.158,.129,.012,.010],[side*.089,.188,.147,.002,.002],
      ],null,seed,bone)
      sweep('nose horn',scene,this.head,[[0,.025,.153,.022,.020],[0,.072,.161,.012,.011],[0,.098,.166,.002,.002]],null,seed,bone)
    }
    if(stego) {
      for(let i=0;i<7;i++){
        const z=.151-i*.049
        const y=torsoY+.099+.017*Math.sin(i*.6)
        const h=.050+.087*Math.sin((i+1)*Math.PI/8)
        const side=i%2?1:-1
        const sail=plate('alternating sail plate',scene,this.body,[side*.039,y,z],.035,h,.022,i%2?crest:deepCrest)
        sail.rotation.y=side*.15+.08*Math.sin(i*1.7)
        const ridge=solid('plate growth edge',this.body,[side*.054,y+h*.41,z+.009],[.012,h*.29,.014],i%2?deepCrest:crest)
        ridge.rotation.x=.29
      }
    }
    if(rex || long) for(let i=0;i<(rex?5:7);i++){
      const plateRoot=long?this.neck:this.body
      const at=long?[0,i*.044,.012+i*.009]:[0,torsoY+.119,-.014-i*.039]
      solid('dorsal scales',plateRoot,at,[.018,.015,.021],crest)
    }

    const tailLength=rex?.535:stego?.473:long?.401:.335
    this.tail=node('tail base',scene,this.body,[0,torsoY+.003,-.158])
    const sections=Array.from({length:14},(_,i)=>{
      const t=i/13, r=.084*(1-t)**.93+.001
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
      this.spikes.push(spike)
    }

    this.legs=[]
    for(const side of [-1,1])for(const front of [false,true]){
      const arm=rex&&front
      const jointHeight=arm?.397:rex?.287:long?.318:.237
      const femur=arm?.060:rex?.130:long?.147:.105
      const shin=arm?.050:rex?.123:long?.137:.101
      const shoulder=node(arm?'shoulder':'upper leg',scene,this.body,[side*(arm?.094:.097),jointHeight,front?.121:-.103])
      const knee=node(arm?'wrist':'knee',scene,shoulder,[side*(arm?.011:0),-femur,arm?.020:.007])
      const ankle=node(arm?'hand':'ankle',scene,knee,[0,-shin,arm?.021:.010])
      const width=arm?.027:front?.042:.057
      hide('upper limb',shoulder,[0,-femur*.40,0],[width,femur*.76,width*1.05])
      hide('lower limb',knee,[0,-shin*.45,.004],[width*.66,shin*.69,width*.72])
      hide(arm?'hand':'padded foot',ankle,[0,-.003,.022],[width*.93,arm?.020:.030,arm?.037:.055])
      for(let j=0;j<(arm?2:3);j++){
        const x=(j-(arm?.5:1))*width*.53
        solid('round toe',ankle,[x,-.009,arm?.050:.061],[width*.30,arm?.013:.017,.019],bone)
      }
      this.legs.push({shoulder,knee,ankle,side,front,arm,femur,shin})
    }
  }

  pose(time,{walk=0,gaitTime=time,action='',progress=0,voice=0,interest=0,bank=0}={}) {
    const t=time
    const gait=gaitTime*TAU*this.type.gait+.19*Math.sin(gaitTime*2.1)
    const act=Math.sin(Math.PI*clamp(progress))
    const sit=action==='sit'?Math.min(1,act*1.95):0
    const shake=action==='sneeze'?Math.sin(Math.PI*clamp((progress-.08)/.84)):0
    const scratch=action==='scratch'?act:0
    const wag=action==='wag'?act:0
    const rex=this.kind==='rex'
    this.body.position.y=.005*Math.sin(t*3.1)+walk*(.013+.018*Math.sin(gait*2+.5))-.072*sit+.027*shake
    this.body.rotation.z=-bank*.075*walk+walk*.047*Math.sin(gait)+.018*shake*Math.sin(progress*36)
      +wag*.043*Math.sin(progress*TAU*2.45+.5)
    this.body.rotation.x=sit*-.14+walk*.038*Math.sin(gait*2)-.07*shake
    this.body.rotation.y=wag*.065*Math.sin(progress*TAU*2.45+.8)
    this.neck.rotation.x=.035*Math.sin(t*2.3)+walk*.071*Math.sin(gait+.7)-.20*sit+.31*scratch
    this.head.position.set(0,this.headRest[1]-.028*scratch,this.headRest[2]-.035*scratch)
    const sneezeSnap=Math.exp(-((progress-.47)**2)/.003)
    const sneezeRecoil=Math.exp(-((progress-.58)**2)/.008)
    this.head.rotation.x=.030*Math.sin(t*2.2+.5)+walk*.105*Math.sin(gait+.33)
      +shake*(.47*sneezeSnap-.28*sneezeRecoil)+.23*scratch
    this.head.rotation.y=interest*.43+bank*.23*walk+.077*Math.sin(t*1.9)+walk*.041*Math.sin(gait)+shake*.26*Math.sin(progress*32)
    this.head.rotation.z=.060*Math.sin(t*1.1)+shake*.15*Math.sin(progress*32)
    this.jaw.rotation.x=.012+voice*.67+shake*.34*Math.exp(-((progress-.49)**2)/.013)
    const blinkTick=(t+.27)%(3.37+this.type.gait*.7)
    const blink=1-.91*Math.sin(Math.PI*clamp(blinkTick/.17))
    for(const eye of this.eyes) eye.scaling.y=blink*(1-.35*shake)
    const tailWave=(.054+.07*walk)*Math.sin(t*3.9)+wag*.13*Math.sin(progress*TAU*2.45)
      -bank*.11*walk
    const rearLift=.013*Math.sin(t*2.7)+.036*walk*Math.sin(gait+.4)-.046*sit
    for(let i=0;i<this.tailRest.length;i+=3) {
      const back=clamp(-this.tailRest[i+2]/this.tailLength)
      this.tailStream[i]=this.tailRest[i]+tailWave*back**1.5
      this.tailStream[i+1]=this.tailRest[i+1]+rearLift*back**1.3
      this.tailStream[i+2]=this.tailRest[i+2]+Math.abs(tailWave)*.34*back**2
    }
    VertexData.ComputeNormals(this.tailStream,this.tailIndices,this.tailNormals,{useRightHandedSystem:true})
    this.tailMesh.updateVerticesData('position',this.tailStream)
    this.tailMesh.updateVerticesData('normal',this.tailNormals)
    for (const spike of this.spikes) {
      const back=-spike.position.z/this.tailLength
      spike.position.x=tailWave*back**1.5
      spike.position.y=.031+rearLift*back**1.3
      spike.rotation.y=-tailWave*back*2.7
    }

    for(const {shoulder,knee,ankle,side,front,arm,femur,shin} of this.legs){
      const cycle=gait/TAU+(side===1?.5:0)+(front&&!rex?.42:0)
      const phase=cycle-Math.floor(cycle)
      const stride=this.kind==='longneck'?.153:rex?.204:.145
      const swing=phase>.61
      const swingProgress=(phase-.61)/.39
      const forward=walk*stride*(swing ? -.5+.5*(1-Math.cos(Math.PI*swingProgress)) : .5-phase/.61)
      const lift=swing ? walk*(rex?.066:.055)*Math.sin(Math.PI*swingProgress) : 0
      const reach=arm && side===1 ? scratch : 0
      if(arm) {
        shoulder.position.z=.121+.042*reach
        shoulder.rotation.x=-.41+walk*.22*Math.sin(cycle*TAU)-.17*Math.sin(t*3.2+side)-reach*(1.12+.19*Math.sin(progress*46))
        shoulder.rotation.z=side*.10-reach*.21
        knee.rotation.x=-.54-reach*.51
        ankle.rotation.x=.12*Math.sin(t*4.2+side)+reach*.71
        continue
      }
      const targetZ=forward+sit*(front?.039:.093)+wag*(front?.012:-.011)*Math.sin(progress*TAU*2.45)
      const hip=shoulder.position
      const drop=hip.y+this.body.position.y-Math.sin(this.body.rotation.x)*hip.z
        +Math.sin(this.body.rotation.z)*hip.x-.029-lift
      const reachLength=Math.min(femur+shin-.001,Math.max(.03,Math.hypot(drop,targetZ)))
      const bend=front&&!rex ? -1 : 1
      const cosA=(femur**2+reachLength**2-shin**2)/(2*femur*reachLength)
      const cosB=(reachLength**2-femur**2-shin**2)/(2*femur*shin)
      shoulder.rotation.x=Math.atan2(-targetZ,drop)-bend*Math.acos(Math.max(-1,Math.min(1,cosA)))
      shoulder.rotation.z=side*.025
      knee.rotation.x=bend*Math.acos(Math.max(-1,Math.min(1,cosB)))
      ankle.rotation.x=-shoulder.rotation.x-knee.rotation.x+walk*lift*3.2
    }
  }
}
