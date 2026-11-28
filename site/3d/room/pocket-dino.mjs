import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'

const ink='#233246', ivory='#fff5cc', gold='#ffc550'

// Geometry is modeled in meters, facing +Z. Bake the colored details on each
// moving joint into one vertex-colored mesh so patterns cost no extra draws.
export function pocketDino(scene,kind,skin) {
  const dome=kind==='domer', bins=new Map()
  const root=new TransformNode(kind,scene)
  function joint(name,parent,x,y,z) {
    const n=new TransformNode(name,scene)
    n.parent=parent
    n.position.set(x,y,z)
    return n
  }
  function taperedTail(j) {
    const positions=[],indices=[],colors=[],normals=[]
    const rings=[[.038,.004,.084],[-.07,.005,.079],[-.18,.017,.060],[-.30,.036,.038],[-.40,.057,.020],[-.478,.077,.002]]
    for(const [i,[z,y,r]] of rings.entries()) for(let k=0;k<12;k++) {
      const t=k*Math.PI/6
      positions.push(r*Math.cos(t),y+r*.87*Math.sin(t),z)
      const c=Color3.FromHexString(i===4&&!dome?'#e99058':Math.sin(t)<-.4?light:i===3?stripe:hide)
      colors.push(c.r,c.g,c.b,1)
      if(i<rings.length-1) {
        const a=i*12+k,b=i*12+(k+1)%12
        indices.push(a,a+12,b,b,a+12,b+12)
      }
    }
    const mesh=new Mesh('tapered tail',scene)
    const data=new VertexData()
    VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true})
    Object.assign(data,{positions,indices,normals,colors})
    data.applyToMesh(mesh)
    mesh.parent=j;mesh.material=skin;mesh.isPickable=false
  }
  function part(j,x,y,z,w,h,d,tint,angle=0,cone=false) {
    const m=cone ? CreateCylinder('quill',{height:1,diameterTop:0,diameterBottom:1,tessellation:7},scene) :
      CreateSphere('scale',{diameter:1,segments:6},scene)
    m.position.set(x,y,z)
    m.scaling.set(w,h,d)
    m.rotation.x=angle
    const c=Color3.FromHexString(tint)
    const colors=[]
    for(let i=0;i<m.getTotalVertices();i++) colors.push(c.r,c.g,c.b,1)
    m.setVerticesData('color',colors)
    if(!bins.has(j)) bins.set(j,[])
    bins.get(j).push(m)
  }
  const hide=dome?'#eb8954':'#299d99', light=dome?'#ffe099':'#aff0c4', stripe=dome?'#80404c':'#186470'
  const body=joint('hips',root,0,dome?.22:.25,0)
  part(body,0,0,0,dome?.36:.25,dome?.30:.22,.48,hide)
  part(body,0,-.046,.05,dome?.29:.20,.17,.35,light)
  part(body,0,.063,.15,.19,.22,.21,hide,-.35)
  for(const side of [-1,1]) for(let i=0;i<3;i++)
    part(body,side*(dome?.153:.103),.022,-.11+i*.088,.034,.104,.041,stripe,-.40)
  for(const side of [-1,1]) for(let i=0;i<6;i++)
    part(body,side*(dome?.155:.108),.048+Math.sin(i*2.3)*.010,-.12+i*.042,.022,.018,.022,light)
  const head=joint('skull',body,0,.13,.22)
  part(head,0,0,.035,dome?.265:.207,dome?.209:.168,dome?.228:.27,hide)
  part(head,0,-.022,.16,dome?.174:.155,.091,dome?.13:.204,hide)
  const jaw=joint('jaw',head,0,-.055,.045)
  part(jaw,0,-.010,.09,.15,.050,dome?.16:.205,light)
  part(jaw,0,.009,.098,.133,.027,dome?.15:.19,'#8f4056')
  for(const side of [-1,1]) {
    part(head,side*(dome?.102:.080),.025,.088,.062,.070,.068,ivory)
    part(head,side*(dome?.122:.097),.022,.108,.028,.047,.036,ink)
    part(head,side*(dome?.130:.103),.035,.117,.012,.013,.014,'#ffffff')
    part(head,side*(dome?.094:.082),.050,.076,.058,.020,.086,stripe,.24)
    for(let i=0;i<3;i++) part(head,side*(dome?.114:.087),-.019,-.006+i*.027,.018,.020,.022,light)
    part(head,side*.059,-.012,dome?.202:.237,.022,.017,.026,stripe)
    for(let i=0;i<2;i++) part(head,side*.058,-.062,.137+.052*i,.019,.025,.019,ivory,Math.PI,true)
    if(!dome) {
      for(let i=0;i<3;i++) part(head,side*(.06+i*.019),.086-i*.017,-.040-i*.031,.051,.14-i*.018,.048,
        [gold,'#ee7954','#bd505e'][i],-.73,true)
    } else for(let i=0;i<3;i++) part(head,side*.11,.054-i*.014,-.009-i*.038,.052,.061,.052,ivory)
  }
  if(dome) {
    part(head,0,.062,.018,.252,.132,.219,'#d88448')
    part(head,0,.079,.025,.248,.169,.224,gold)
    part(head,-.050,.142,.052,.069,.025,.061,'#ffdf80')
  }
  const tail=joint('tail',body,0,.030,-.15)
  taperedTail(tail)
  const legs=[],arms=[]
  for(const side of [-1,1]) {
    const hip=joint('thigh',body,side*(dome?.113:.079),-.014,-.018)
    part(hip,0,-.055,0,.107,.168,.13,hide,.25)
    part(hip,0,-.143,-.022,.055,.107,.060,stripe,-.42)
    part(hip,0,-(dome?.177:.202),.012,.091,.041,.152,light)
    for(const toe of [-1,0,1]) part(hip,toe*.026,-(dome?.177:.202),.072,.020,.024,.055,ink,.2)
    if(!dome) part(hip,-side*.032,-.178,.076,.029,.055,.028,ivory,.42,true)
    legs.push(hip)
    const arm=joint('forearm',body,side*(dome?.132:.098),.025,.126)
    part(arm,0,-.044,.022,.055,.113,.059,hide,-.48)
    part(arm,0,-.071,.065,.053,.044,.091,light)
    arms.push(arm)
  }
  for(const [j,pieces] of bins) {
    const mesh=Mesh.MergeMeshes(pieces,true,true)
    mesh.parent=j
    mesh.material=skin
    mesh.isPickable=false
  }
  return {root,pose(time,state,progress,travel) {
    const stride=Math.sin(travel*19), step=state==='stalk' || state==='roam'
    const coil=state==='warn'?Math.sin(progress*Math.PI/2):0
    const leap=state==='lunge'?Math.sin(progress*Math.PI):0
    body.position.y=(dome?.22:.25)-coil*.060+(step?Math.abs(stride)*.016:0)
    body.rotation.x=coil*.19+leap*(dome?.21:-.21)
    head.rotation.x=-.20+.055*Math.sin(time*3.3)-coil*(dome?-.30:.29)+leap*(dome?.48:-.28)
    head.rotation.y=.18*Math.sin(time*2.4)
    jaw.rotation.x=.055+(coil*.63+leap*.42)*(dome?.7:1)
    tail.rotation.y=.23*Math.sin(time*3.1)+.15*stride
    legs.forEach((leg,i)=>leg.rotation.x=(i?1:-1)*(step?stride*.48:leap*.62)-coil*.21)
    arms.forEach((arm,i)=>arm.rotation.x=(i?-1:1)*stride*.19-leap*.68)
  }}
}

export function skinMaterial(scene) {
  const mat=new StandardMaterial('pocket dinosaur colors',scene)
  mat.specularColor=new Color3(.09,.11,.10)
  return mat
}
