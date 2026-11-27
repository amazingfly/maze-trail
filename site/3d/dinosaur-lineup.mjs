import { Engine } from '@babylonjs/core/Engines/engine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js'
import { Hatchling } from './hatchling.mjs'
import { species, voiceEnvelope, gestureDuration, isQuietGesture } from './hatchling-play.mjs'
import { JungleAudio } from './sound.mjs'

const canvas=document.querySelector('canvas')
const input=id=>document.getElementById(id)
const age=input('age'), pose=input('pose'), angle=input('angle'), speciesChoice=input('species')
const status=input('status'), sound=input('sound')
const audio=new JungleAudio()
const kinds=Object.keys(species)
const headings={front:0,three:-.63,side:-Math.PI/2,rear:Math.PI-.54}
const gesture=['sneeze','wag','scratch','sit','scuff']
let audition, started=performance.now()

// A review link can hold both the gesture and the independent gait clock at the same time.
function reviewTime() {
  const value=new URLSearchParams(location.hash.slice(1)).get('time')
  if(value===null || value.trim()==='') return null
  const seconds=Number(value)
  return Number.isFinite(seconds) && seconds>=0 ? seconds : null
}
let sample=reviewTime()
window.addEventListener('hashchange',()=>{sample=reviewTime()})

function material(scene,name,hex){
  const surface=new StandardMaterial(name,scene)
  surface.diffuseColor=Color3.FromHexString(hex)
  surface.specularColor=Color3.Black()
  return surface
}

try {
  const engine=new Engine(canvas,true,{},true)
  engine.setHardwareScalingLevel(1/Math.min(devicePixelRatio,1.6))
  const scene=new Scene(engine)
  scene.useRightHandedSystem=true
  scene.clearColor=new Color4(.073,.155,.133,1)
  const sky=new HemisphericLight('soft sky',Vector3.Up(),scene)
  sky.diffuse=Color3.FromHexString('#fff3d7')
  sky.groundColor=Color3.FromHexString('#7c9e85')
  sky.intensity=.88
  const sun=new DirectionalLight('key light',new Vector3(-3,-4,-2).normalize(),scene)
  sun.intensity=.84
  sun.diffuse=Color3.FromHexString('#ffe1af')
  const rim=new DirectionalLight('rim light',new Vector3(2,-2,4).normalize(),scene)
  rim.diffuse=Color3.FromHexString('#a6d8d2')
  rim.intensity=.24
  const floor=CreateGround('review floor',{width:1,height:1},scene)
  floor.material=material(scene,'clay floor','#7e7156')
  const floorMap=new DynamicTexture('floor falloff',{width:8,height:128},scene,false)
  floorMap.hasAlpha=true
  const floorContext=floorMap.getContext()
  const falloff=floorContext.createLinearGradient(0,0,0,128)
  falloff.addColorStop(0,'#ffffff00')
  falloff.addColorStop(.24,'#ffffffff')
  falloff.addColorStop(.90,'#ffffffff')
  falloff.addColorStop(1,'#ffffff00')
  floorContext.fillStyle=falloff
  floorContext.fillRect(0,0,8,128)
  floorMap.update()
  floor.material.diffuseTexture=floorMap
  floor.material.useAlphaFromDiffuseTexture=true
  floor.alphaIndex=0
  scene.fogColor=new Color3(.073,.155,.133)
  scene.fogMode=Scene.FOGMODE_EXP2
  scene.fogDensity=.025

  const shade=material(scene,'contact shadow','#ffffff')
  const shadeMap=new DynamicTexture('soft contact shadow',64,scene,false)
  shadeMap.hasAlpha=true
  const ctx=shadeMap.getContext()
  const gradient=ctx.createRadialGradient(32,32,1,32,32,31)
  gradient.addColorStop(0,'#1c201ba1')
  gradient.addColorStop(.58,'#24271b54')
  gradient.addColorStop(1,'#25271b00')
  ctx.fillStyle=gradient
  ctx.fillRect(0,0,64,64)
  shadeMap.update()
  shade.diffuseTexture=shadeMap
  shade.useAlphaFromDiffuseTexture=true
  shade.disableLighting=true
  shade.emissiveColor=Color3.FromHexString('#23251d')

  const animals=[]
  for(const adult of [false,true]) for(const [index,kind] of kinds.entries()) {
    const model=new Hatchling(scene,kind,271+index*29,{adult})
    const shadow=CreateGround('contact shadow',{width:.78,height:1.36},scene)
    shadow.parent=model.root
    shadow.position.set(0,.001,-.07)
    shadow.material=shade
    shadow.alphaIndex=1
    animals.push({model,index,kind,adult})
  }

  const camera=new TargetCamera('lineup camera',new Vector3(0,3,9),scene)
  camera.mode=Camera.ORTHOGRAPHIC_CAMERA
  camera.minZ=.05
  camera.maxZ=180

  function arrange(){
    engine.resize()
    const narrow=canvas.clientWidth<640
    const columns=narrow?2:kinds.length
    const rows=Math.ceil(kinds.length/columns)
    const comparison=age.value==='comparison'
    const scale=age.value==='baby'?1:5
    for(const {model,index,adult} of animals) {
      const visible=comparison || adult===(scale===5)
      model.root.setEnabled(visible)
      if(!visible) continue
      const col=index%columns, row=Math.floor(index/columns)
      const x=(col-(columns-1)/2)*scale*1.19
      const z=((rows-1)/2-row)*1.32*scale
      model.root.position.set(x+(comparison&&!adult ? .32*scale : 0),0,z+(comparison&&!adult ? .45*scale : 0))
      model.root.rotation.y=headings[angle.value]
    }
    const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight)
    const halfWidth=scale*(narrow?1.38:columns*.595+.40)
    const halfHeight=Math.max(halfWidth/aspect,scale*(narrow?.58+rows*.33:.65))
    camera.orthoTop=halfHeight
    camera.orthoBottom=-halfHeight
    camera.orthoLeft=-halfHeight*aspect
    camera.orthoRight=halfHeight*aspect
    floor.scaling.set(scale*60,1,scale*13)
    floor.position.z=scale*3.10
    camera.position.set(0,scale*(narrow?4.1:1.64),scale*6.15)
    camera.setTarget(new Vector3(0,scale*(narrow?.40:.44),0))
    scene.fogDensity=.028/scale
    sound.textContent=age.value==='baby'?'Hear call':'Hear roar'
  }

  for(const control of [age,angle]) control.addEventListener('change',arrange)
  pose.addEventListener('change',()=>{ started=performance.now(); audition=null })
  window.addEventListener('resize',arrange)
  angle.value='three'
  arrange()

  sound.addEventListener('click',async()=>{
    audio.start({ambience:false})
    await audio.context?.resume().catch(()=>{})
    if (audio.context?.state!=='running') return
    audio.setLevels(0,.68,true)
    const kind=speciesChoice.value, adult=age.value!=='baby'
    const notes=adult ? audio.adultRoar(kind) : [0,.173,.351].map((at,index)=>({
      at,duration:.17,pitch:species[kind].voice*(1+index*.12),
    }))
    if(!adult) audio.hatchlingCall(notes,0,.75,kind)
    audition={kind,adult,start:performance.now()/1000,notes}
  })

  function frame(time, elapsed){
    for (const {model,index,kind,adult} of animals) {
      if(!model.root.isEnabled()) continue
      const local=time+index*.16
      const shared=isQuietGesture(pose.value)
      const duration=shared ? gestureDuration(pose.value,adult) : 3.8
      const cycle=((elapsed+index*.17)%duration)/duration
      const walking=pose.value==='walk' || pose.value==='turn'
      const selected=pose.value==='gesture'
        ? adult ? ['wag','wag','roar','roar','scuff'][index] : gesture[index]
        : shared || pose.value==='sit' ? pose.value : pose.value==='call' && adult ? 'roar' : ''
      let voice=pose.value==='call' ? Math.sin(Math.PI*cycle)**2*(adult?.86:.65):0
      let action=selected,progress=cycle
      if (audition?.kind===kind && audition.adult===adult && time-audition.start<2.2) {
        voice=voiceEnvelope(audition,time)
        action=adult?'roar':'wag'
        progress=(time-audition.start)/(adult?2.2:.74)
      }
      model.pose(local,{
        walk:walking?1:0, bank:pose.value==='turn'?Math.sin(elapsed*1.8+index*.4)*.84:0,
        interest:.34*Math.sin(local*1.2),action,progress,voice,
      })
    }
    scene.render()
  }

  scene.executeWhenReady(()=>{
    status.hidden=true
    sound.disabled=false
    engine.runRenderLoop(()=>{
      const now=performance.now()
      frame(sample ?? now/1000,sample ?? (now-started)/1000)
    })
  })
} catch(error) {
  console.error(error)
  status.textContent='The 3D lineup could not load in this browser.'
}
