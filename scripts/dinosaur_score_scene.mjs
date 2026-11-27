// Offline review fixture. The Python runner bundles this module into a temporary page.
import { Engine } from '@babylonjs/core/Engines/engine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Hatchling } from '../site/3d/hatchling.mjs'
import { species, gestureDuration } from '../site/3d/hatchling-play.mjs'

const canvas=document.querySelector('canvas')
const engine=new Engine(canvas,false,{preserveDrawingBuffer:true,stencil:true})
const scene=new Scene(engine)
scene.useRightHandedSystem=true
scene.clearColor=new Color4(0,0,0,0)
const sky=new HemisphericLight('sky',Vector3.Up(),scene)
sky.intensity=.85
sky.groundColor=Color3.FromHexString('#859c8c')
const sun=new DirectionalLight('sun',new Vector3(-3,-4,-2).normalize(),scene)
sun.intensity=.81
const camera=new TargetCamera('camera',new Vector3(0,1.5,5),scene)
camera.setTarget(new Vector3(0,.45,0))
camera.mode=Camera.ORTHOGRAPHIC_CAMERA
camera.orthoLeft=camera.orthoBottom=-.99
camera.orthoRight=camera.orthoTop=.99

// Register two visible identification cues on each model before measuring it.
const cues={
  trike:[/frill/,/brow horn|nose horn/],
  stego:[/sail plate|plate growth/,/tail spike$/],
  rex:[/continuous skull/,/upper limb|lower limb|hand/],
  longneck:[/tapered neck/,/continuous skull/],
  anky:[/tail club|club crown/,/back armor|armor ridge|flank armor/],
}
const poses=['idle','walk','turn','sit','wag','sneeze','call','sniff','listen','scuff','yawn']
const phases=[0,.20,.40,.55,.75,.95,1]
const views={side:-Math.PI/2,three:-.63}
const mat=new StandardMaterial('visible region IDs',scene)
mat.disableLighting=true
mat.backFaceCulling=false
function idMaterial(hex) {
  const m=mat.clone(hex)
  m.emissiveColor=Color3.FromHexString(hex)
  return m
}
const tags=['#363636','#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff'].map(idMaterial)
let rig,meshes,materials,legPads,kind,adult,control
function tag(mesh) {
  if(cues[kind][0].test(mesh.name)) return 1
  if(cues[kind][1].test(mesh.name) && (kind!=='rex'||rig.legs.some(l=>l.arm && mesh.isDescendantOf(l.shoulder)))) return 2
  if(['rounded ribcage','shoulder and breast','haunches'].includes(mesh.name)) return 3
  if(['pupil','iris','large eye glint','small eye glint'].includes(mesh.name)) return 4
  if(['inner mouth','soft tongue','flexible mouth lining'].includes(mesh.name)) return 5
  return 0
}
async function select(key,isAdult,fixtureControl="normal") {
  if(!cues[key]) throw new Error("Register the two identification cues for "+key)
  control=fixtureControl
  rig?.root.dispose(false,true)
  kind=key;adult=isAdult
  rig=new Hatchling(scene,kind,271,{adult})
  rig.root.scaling.setAll(1) // Compare model-space size independent of the game world's 5× zoom.
  rig.root.position.y=control==='floating'?.04:0
  meshes=rig.root.getChildMeshes()
  materials=meshes.map(m=>({original:m.material,colored:m.useVertexColors,id:tags[tag(m)]}))
  legPads=rig.legs.filter(l=>!l.arm).map(leg=>({leg,pad:leg.ankle.getChildMeshes().find(m=>m.name==='padded foot')}))
  await scene.whenReadyAsync()
}
function applyPose(time,options) {
  if(control==='frozen') rig.pose(0)
  else rig.pose(time,options)
}
function pose(action,p) {
  const walking=action==='walk'||action==='turn'
  const t=p*(walking?1/(species[kind].gait*(adult?.58:1)):gestureDuration(action,adult))
  applyPose(t,{action:action==='call'?(adult?'roar':''):walking||action==='idle'?'':action,progress:p,gaitTime:t,
    walk:walking?1:0,pivot:action==='turn'?.65:0,bank:action==='turn'?.7:0,
    voice:action==='call'?Math.sin(Math.PI*p)**2:0})
}
function padHeight(pad) {
  const m=pad.computeWorldMatrix(true).m,v=pad.getVerticesData('position')
  let y=Infinity
  for(let i=0;i<v.length;i+=3)y=Math.min(y,v[i]*m[1]+v[i+1]*m[5]+v[i+2]*m[9]+m[13])
  return y
}
function strip(action,ids=false) {
  const sheet=document.createElement('canvas')
  const times=ids?[action==='call'?.55:0]:phases
  const angles=ids?{...views,front:0}:views
  sheet.width=canvas.width*times.length;sheet.height=canvas.height*Object.keys(angles).length
  const ctx=sheet.getContext('2d')
  if(ids)meshes.forEach((m,i)=>{m.material=materials[i].id;m.useVertexColors=false})
  try {
    let row=0
    for(const angle of Object.values(angles)){
      rig.root.rotation.y=angle
      times.forEach((p,i)=>{pose(action,p);scene.render();ctx.drawImage(canvas,i*canvas.width,row*canvas.height)})
      row++
    }
    return sheet.toDataURL('image/png').split(',')[1]
  } finally {
    if(ids)meshes.forEach((m,i)=>{m.material=materials[i].original;m.useVertexColors=materials[i].colored})
  }
}
function mechanics(actions) {
  let contact=0, penetration=0, endpoint=0, lift=0
  rig.root.rotation.y=0
  const nodes=rig.root.getDescendants()
  function snapshot(){return nodes.flatMap(n=>Array.from(n.computeWorldMatrix(true).m))}
  for(const action of actions)for(let i=0;i<=40;i++) {
    const p=i/40
    pose(action,p)
    for(const {leg,pad} of legPads){
      const y=padHeight(pad)
      penetration=Math.max(penetration,-y)
      const working=leg.side===rig.listenSide && leg.front!==(kind==='rex')
      if(action==='scuff' && working)lift=Math.max(lift,y)
      if(!['turn','walk'].includes(action) && !(action==='scuff' && working))contact=Math.max(contact,Math.abs(y))
    }
    if((i===0||i===40) && !['walk','turn'].includes(action)){
      const a=snapshot()
      applyPose(p*gestureDuration(action,adult))
      const b=snapshot()
      for(let j=0;j<a.length;j++)endpoint=Math.max(endpoint,Math.abs(a[j]-b[j]))
    }
  }
  return {contact,penetration,endpoint,lift}
}
window.audit={select,strip,mechanics,kinds:Object.keys(species),poses,phases}
