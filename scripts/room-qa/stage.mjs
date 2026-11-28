import { renderSounds } from './audio.mjs'
window.renderSounds=renderSounds
import { Engine } from '@babylonjs/core/Engines/engine.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { RoomWorld } from '../../site/3d/room/room-world.mjs'
import { EncounterView } from '../../site/3d/room/encounter-view.mjs'

const canvas=document.querySelector('canvas')
const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true})
const world=new RoomWorld(engine), scene=world.scene, camera=scene.activeCamera
scene.clearColor=new Color4(.29,.34,.31,1)
const view=new EncounterView(scene),tiles=[]
for(let u=-12;u<12;u++) for(let v=-12;v<12;v++) tiles.push({kind:'floor',u,v,plane:0})
for(let u=-12;u<12;u++) for(let v=0;v<12;v++) tiles.push({kind:'wall',u,v,nx:0,nz:1,plane:2.06})
world.rebuild(tiles,{floor:{count:1,y:0},roof:{count:1,y:2.7}})
const eye=new Vector3(0,1.35,-.85),look=new Vector3(0,-.54,.84)
const base=(id,kind,x,z)=>({id,kind,x,z,y:0,floor:0,age:.55,duration:1,state:'roam',travel:.195,yaw:2.55,
  entry:{x,z:2.06,nx:0,nz:1,key:'stage'}})
window.renderPose=async name=>{
  view.clear()
  let seed=39451
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const a=base(1,'raptor',.44,.86), b=base(2,'domer',-.42,1.42)
  const ground=name.startsWith('ground-')
  const actors=ground?[a]:[a,b]
  camera.fov=1.08
  camera.position.copyFrom(eye)
  camera.setTarget(new Vector3(0,.27,1))
  if(name==='side') {camera.position.set(1.23,.75,-.43);camera.setTarget(new Vector3(0,.30,1.1))}
  if(name==='warning') {a.x=.12;a.z=.29;a.state='warn';a.age=.84;b.state='breach'}
  if(name==='leap' || name==='vapor') {a.x=.12;a.z=.24;a.y=.74;a.state='lunge';a.age=.46}
  if(name==='ram') {b.x=-.18;b.y=.15;b.z=.36;b.age=.43;b.state='lunge';b.yaw=2.9;camera.setTarget(new Vector3(-.10,.35,.42))}
  if(name==='warning') camera.setTarget(new Vector3(.10,.22,.37))
  if(name==='leap' || name==='vapor') camera.setTarget(new Vector3(.11,.91,.30))
  if(name==='breach') {
    a.x=1.4;b.x=-.58;b.entry.x=-.83;b.z=1.62
    camera.position.set(-1.15,.61,.43);camera.setTarget(new Vector3(-.57,.26,1.87))
  }
  if(ground) {
    a.entry={x:a.x,z:a.z,surface:'floor'}
    a.age=name==='ground-crack'?.12:name==='ground-emerge'?.65:1
    a.state=name==='ground-debris'?'roam':'breach'
    camera.position.set(1.06,1.19,-.32)
    camera.setTarget(new Vector3(a.x,.13,a.z))
  }
  for(const d of actors) view.event('spawn',d)
  if(ground) view.event('crack',a)
  if(name==='ground-debris') view.event('break',a)
  if(name==='warning' || name==='breach') view.event('crack',b)
  if(name==='breach') {b.state='stalk';view.event('break',b)}
  if(name==='vapor') {
    view.draw(actors,0,1,true)
    view.event('shot',a,eye,look)
    view.event('vapor',a)
    view.event('remove',a)
  }
  for(let i=0;i<(name==='breach'||ground?15:5);i++) view.draw(actors,.013,1+i*.013,true)
  scene.render()
  await scene.whenReadyAsync()
  const before=engine._drawCalls.current
  scene.render()
  return {meshes:scene.getActiveMeshes().length,draws:engine._drawCalls.current-before}
}
