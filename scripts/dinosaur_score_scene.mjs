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
import { species, gestureDuration, walkHatchlings, callHatchling, voiceEnvelope } from '../site/3d/hatchling-play.mjs'

import { advanceTrailhead, trailheadHerd } from '../site/3d/trailhead-motion.mjs'
import { JungleAudio } from '../site/3d/sound.mjs'

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
const views={side:-Math.PI/2,three:-.63,rear:Math.PI+.48}
const mat=new StandardMaterial('visible region IDs',scene)
mat.disableLighting=true
mat.backFaceCulling=false
function idMaterial(hex) {
  const m=mat.clone(hex)
  m.emissiveColor=Color3.FromHexString(hex)
  return m
}
const tags=['#363636','#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff'].map(idMaterial)
let rig,meshes,materials,legPads,kind,adult,control,coatSeed
function tag(mesh) {
  if(cues[kind][0].test(mesh.name)) return 1
  if(cues[kind][1].test(mesh.name) && (kind!=='rex'||rig.legs.some(l=>l.arm && mesh.isDescendantOf(l.shoulder)))) return 2
  if(['rounded ribcage','shoulder and breast','haunches'].includes(mesh.name)) return 3
  if(['pupil','iris','large eye glint','small eye glint'].includes(mesh.name)) return 4
  if(['inner mouth','soft tongue','flexible mouth lining'].includes(mesh.name)) return 5
  return 0
}
async function select(key,isAdult,fixtureControl="normal",seed=271) {
  if(!cues[key]) throw new Error("Register the two identification cues for "+key)
  control=fixtureControl
  coatSeed=seed
  rig?.root.dispose(false,true)
  kind=key;adult=isAdult
  rig=new Hatchling(scene,kind,seed,{adult})
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
function lighting(profile) {
  const dim=profile==='canopy'
  sky.intensity=dim?.42:.85
  sun.intensity=dim?.17:.81
  sky.diffuse=Color3.FromHexString(dim?'#ffedcf':'#ffffff')
  sky.groundColor=Color3.FromHexString(dim?'#699b89':'#859c8c')
  sun.diffuse=Color3.FromHexString(dim?'#ffdeaa':'#ffffff')
  sun.direction=(dim?new Vector3(9,-15,-8):new Vector3(-3,-4,-2)).normalize()
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

// Straight, obstacle-free segment using the production controller and gameplay scale.
function locomotion() {
  const hz=120,dt=1/hz,scale=adult?5:.9
  const layout={spawn:[0,0],canWalk:()=>true,cellAt:()=>undefined,openLine:()=>true}
  const player={x:10,z:0,yaw:0,travelSpeed:.3}
  const actor=adult?trailheadHerd([{kind,adult,x:0,z:0,yaw:0}])[0]:{
    kind,x:0,z:0,yaw:0,slot:1,following:true,route:[[0,100]],nextAction:Infinity,
    nextCall:Infinity,repathAt:Infinity,action:'',clock:0,walk:0,interest:0}
  actor.goal=[0,100]
  const samples=legPads.map(()=>({start:null,strides:0,drift:0,lift:0,lowest:Infinity,contact:0}))
  rig.root.scaling.setAll(scale)
  rig.root.rotation.y=0
  for(let frame=0;frame<hz*10;frame++) {
    player.z=actor.z+1.2
    if(adult) advanceTrailhead([actor],layout,player,dt)
    else {player.x=0;walkHatchlings([actor],player,frame*dt,dt,layout,{})}
    const clock=adult?actor.gait:actor.gaitClock
    const swingClock=clock*species[kind].gait*(adult?.58:1)+.19*Math.sin(clock*2.1)/(2*Math.PI)
    rig.root.position.x=actor.x
    rig.root.position.z=actor.z+(control==='sliding'?scale*.12*Math.sin(frame*dt*10):0)
    rig.root.position.y=control==='floating'?.04*scale:0
    rig.root.rotation.y=actor.yaw
    applyPose(actor.clock,{walk:actor.walk,gaitTime:clock,pivot:actor.pivot,bank:actor.bank,interest:actor.gaze??actor.interest})
    if(frame<hz)continue
    legPads.forEach(({leg,pad},i)=>{
      const sample=samples[i],cycle=swingClock+(leg.side===1?.5:0)+(leg.front&&kind!=='rex'?.42:0)
      const phase=cycle-Math.floor(cycle),stance=adult?.71:.62
      const m=pad.computeWorldMatrix(true).m
      // Center of the sole, with the pad's local .030 vertical radius accounted for.
      const x=(m[12]-.030*m[4])/scale,z=(m[14]-.030*m[6])/scale,y=padHeight(pad)/scale
      sample.lowest=Math.min(sample.lowest,y)
      if(phase>stance){
        sample.start=null
        sample.lift=Math.max(sample.lift,y)
      } else {
        if(!sample.start){sample.start=[x,z];sample.strides++}
        sample.drift=Math.max(sample.drift,Math.hypot(x-sample.start[0],z-sample.start[1]))
        sample.contact=Math.max(sample.contact,Math.abs(y))
      }
    })
  }
  rig.root.scaling.setAll(1)
  rig.root.position.set(0,control==='floating'?.04:0,0)
  rig.root.rotation.y=0
  return {travel:actor.z,feet:samples.map(({start,lowest,...metrics})=>({...metrics,swingRange:metrics.lift-lowest}))}
}

// Render the same oscillators, gain ramps and filtered noise used by the game.
// Capture the real note schedule separately from the PCM envelope being compared.
async function vocalTiming() {
  const hz=24000,dt=.01,lead=.25
  const ctx=new OfflineAudioContext(1,hz*3,hz)
  const audio=new JungleAudio()
  audio.context=ctx
  audio.effects=ctx.destination
  audio.voice=options=>audio.scheduleVoice({...options,delay:lead+(options.delay??0)})
  audio.noise=ctx.createBuffer(1,hz*3,hz)
  let state=coatSeed
  const rand=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32)
  const noise=audio.noise.getChannelData(0)
  for(let i=0;i<noise.length;i++)noise[i]=rand()*2-1
  const originalRandom=Math.random
  let notes
  try {
    Math.random=rand
    if(adult)notes=audio.adultRoar(kind)
    else {
      const actor={kind,x:0,z:0}
      callHatchling(actor,{x:0,z:0,yaw:0},lead,audio)
      notes=actor.call.notes
    }
  } finally {Math.random=originalRandom}
  const pcm=(await ctx.startRendering()).getChannelData(0)
  const mouth=[],rms=[]
  for(let i=0;i<pcm.length/(hz*dt);i++){
    const time=(i+.5)*dt
    const visualTime=time-(control==='late-jaw'?.18:0)
    const voice=voiceEnvelope({start:lead,notes},visualTime)
    const progress=Math.max(0,Math.min(1,(visualTime-lead)/2.2))
    applyPose(time,{voice,action:adult?'roar':'',progress})
    mouth.push(rig.jaw.rotation.x)
    let sum=0
    for(let k=i*240;k<(i+1)*240;k++)sum+=pcm[k]**2
    rms.push(Math.sqrt(sum/240))
  }
  return {dt,mouth,rms,notes}
}
window.audit={select,lighting,strip,mechanics,locomotion,vocalTiming,kinds:Object.keys(species),poses,phases}
