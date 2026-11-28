import { Engine } from '@babylonjs/core/Engines/engine.js'
import { WebXRExperienceHelper } from '@babylonjs/core/XR/webXRExperienceHelper.js'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { RoomMap, TILE, tileCenter, tileInAperture } from './room-map.mjs'
import { RoomWorld } from './room-world.mjs'
import { readRoom, writeRoom, cameraOrigin, roomOffset, matchesRoom } from './saved-room.mjs'
import { DiscoveryFog } from './discovery-fog.mjs'
import { depthFrame } from './depth.mjs'
import { Encounters, autoAim } from './encounters.mjs'
import { EncounterView } from './encounter-view.mjs'
import { encounterSound, soundPan } from './encounter-sound.mjs'
import { JungleAudio } from '../sound.mjs'

const id=name=>document.getElementById(name)
const resume=id('resume')
const begin=id('begin'), ar=id('ar-ui'), canvas=id('ar-canvas')
const setup=id('room-start'), message=id('room-message'), state=id('scan-state')
const action=id('charge'), exterior=id('exterior'), report=id('report')
const fog=new DiscoveryFog(id('discovery-fog'))
const audio=new JungleAudio()
const maximumOpenings=6
let engine, world, helper, output, manager, tracking=false, frameObserver, space, active=false
let map, tiles, room, eye, look, wall, ammo, surveyed, lastScan, lastSurvey, mappedVersion, heightBand
let lastDepth, trace, fire, previewMode, floorTiles, nextCrystal, domOverlay, verifiedWall

let saved=readRoom(), alignment=null, origin=null, saveVersion=0, saveAt=0, lastFusion=0
let allowSave=true

function saveMap() {
  if(!allowSave || !origin || map.changed===saveVersion) return
  const result=writeRoom(map,origin)
  if(result) {
    saved=result
    saveVersion=map.changed
  }
}

function startButtons() {
  resume.hidden=!saved
  resume.disabled=false
  begin.textContent=saved?'Start a new map':'Start exploring'
}

function checkAlignment(frame,pose,now) {
  if(!alignment) return false
  const current=cameraOrigin(pose.transform)
  if(!alignment.space && current && typeof XRRigidTransform==='function') {
    const offset=roomOffset(current,alignment.saved.origin)
    alignment.space=space.getOffsetReferenceSpace(new XRRigidTransform(offset.position,offset.orientation))
  }
  if(alignment.space && now-lastScan>.16) {
    lastScan=now
    const alignedPose=frame.getViewerPose(alignment.space)
    const view=alignedPose?.views[0]
    let depth
    try { if(view) depth=frame.getDepthInformation(view) } catch {}
    if(depth) {
      const scan=depthFrame(view,depth)
      if(matchesRoom(alignment.map,alignedPose.transform.position,scan.samples)) alignment.matches++
      else alignment.matches=0
    }
    if(alignment.matches>=3) {
      space.removeEventListener('reset',onReset)
      space=alignment.space
      manager.referenceSpace=space
      space.addEventListener('reset',onReset)
      map=alignment.map
      origin=alignment.saved.origin
      saveVersion=map.changed
      alignment=null
      allowSave=true
      announce('Saved room restored. Look around to explore.')
      return true
    }
  }
  if(now>alignment.started+16) {
    alignment=null
    announce('Saved room could not be lined up. This expedition is temporary.')
  }
  return true
}

const encounter=new Encounters(onEncounter)
let muted=false
try {muted=localStorage.getItem('room-muted')==='true'} catch {}
function setSound() {
  id('sound').setAttribute('aria-pressed',String(muted))
  id('sound').setAttribute('aria-label',muted?'Unmute sounds':'Mute sounds')
  audio.setLevels(0,muted?0:.43,active)
}
id('sound').addEventListener('click',()=>{
  muted=!muted
  try {localStorage.setItem('room-muted',String(muted))} catch {}
  setSound()
})
let creatures, inverseProjection, cameraWorld, previousFrame, fresh=false
const field=id('phaser'), hits=id('shield-hit'), tally=id('tag-count')
function onEncounter(type,actor,direction) {
  creatures.event(type,actor,eye,direction)
  let pan=0,distance=1
  if(actor && eye && look) {
    const dx=actor.x-eye.x,dz=actor.z-eye.z
    distance=Math.hypot(dx,dz)
    pan=soundPan(look,dx,dz)
  }
  encounterSound(audio,type,actor?.kind,type==='shot'||type==='hit'?0:pan,type==='shot'?0:distance)
  if(type==='hit') {
    hits.getAnimations().forEach(a=>a.cancel())
    const peak=matchMedia('(prefers-reduced-motion: reduce)').matches?.22:.58
    hits.animate([{opacity:0},{opacity:peak,offset:.2},{opacity:0}],{duration:420})
    announce('Shield hit · keep zapping!')
  }
  if(type==='spawn' && actor.id===1) announce('Look near the floor. Tap a dinosaur to zap it.')
  if(type==='vapor') {
    tally.textContent=encounter.score
    announce('Dinosaur zapped!')
  }
}
function firePhaser(event) {
  if(!active || !tracking || !fresh || !eye) return
  let dir=look
  if(event?.detail && inverseProjection && cameraWorld) {
    const rect=field.getBoundingClientRect()
    const x=2*(event.clientX-rect.left)/rect.width-1,y=1-2*(event.clientY-rect.top)/rect.height
    const local=Vector3.TransformCoordinates(new Vector3(x,y,-1),inverseProjection)
    dir=Vector3.TransformNormal(local,cameraWorld).normalize()
  }
  encounter.shoot(eye,dir,performance.now()/1000)
}
function resetMap(reason='') {
  origin=null
  lastFusion=saveAt=saveVersion=0
  alignment=null
  encounter.reset()
  creatures?.clear()
  previousFrame=null
  fresh=false
  tracking=false
  field.disabled=true
  ar.dataset.armed='false'
  tally.textContent=0
  hits.getAnimations().forEach(a=>a.cancel())
  map=new RoomMap()
  tiles=[]
  floorTiles=[]
  room={floor:{count:0},roof:{count:0}}
  eye=look=wall=null
  trace=null
  fire=null
  surveyed=false
  previewMode=false
  verifiedWall=null
  ammo=0
  lastScan=lastSurvey=lastDepth=0
  heightBand=null
  nextCrystal=mappedVersion=-1
  fog.reset()
  state.textContent='Exploring the mist'
  ar.dataset.charges='false'
  ar.dataset.tracking='false'
  announce(reason)
}

function announce(text) {
  if (domOverlay || !active) report.textContent=text
}

function updateControls() {
  field.disabled=!tracking || !fresh
  ar.dataset.armed=String(encounter.enabled || surveyed)
  ar.dataset.charges=String(surveyed)
  ar.dataset.lock=String(!field.disabled && encounter.enabled && !!autoAim(encounter.actors,eye,look))
  const locked=!tracking || !fresh || !wall || !surveyed || fire || world.portals.length>=maximumOpenings
  const collectable=tracking && fresh && surveyed && !fire && world.crystalIndex(eye,look,true)>=0
  action.disabled=!(collectable || (ammo && !locked))
  const label=fire ? 'Fusing…' : collectable || !ammo ? 'Collect crystal' : 'Blast wall'
  if(action.textContent!==label) action.textContent=label
  exterior.disabled=!!locked || !ammo
  exterior.setAttribute('aria-pressed',String(previewMode))
  id('ammo-count').textContent=ammo
  ar.dataset.target=locked ? 'false' : 'true'
}

function capturePose(pose) {
  const p=pose.transform.position
  eye=new Vector3(p.x,p.y,p.z)
  cameraWorld=Matrix.FromArray(pose.transform.matrix)
  look=Vector3.TransformNormal(new Vector3(0,0,-1),cameraWorld).normalize()
}

function chooseCrystal(now) {
  if (!room.durable || now<nextCrystal || ammo+world.crystals.length>=2 || fire ||
    world.portals.length>=maximumOpenings) return
  const choices=floorTiles.map(t=>tileCenter(t)).filter(p=>{
    const dx=p.x-eye.x,dz=p.z-eye.z,distance=Math.hypot(dx,dz)
    return room.cells.has(Math.floor(p.x/TILE)+':'+Math.floor(p.z/TILE)) && distance>.75 && distance<2.5 &&
      !world.crystals.some(c=>Vector3.DistanceSquared(c.position,new Vector3(p.x,p.y+.66,p.z))<1.1)
  })
  if (!choices.length) { nextCrystal=now+.65; return }
  choices.sort((a,b)=>scoreCrystal(b)-scoreCrystal(a))
  const choice=choices[Math.floor(Math.random()*Math.min(5,choices.length))]
  world.addCrystal(new Vector3(choice.x,choice.y+.79,choice.z))
  nextCrystal=now+1
}

function scoreCrystal(p) {
  const dx=p.x-eye.x,dz=p.z-eye.z,distance=Math.hypot(dx,dz)
  return (dx*look.x+dz*look.z)/distance-Math.abs(distance-1.75)*.25
}

function status(now) {
  ar.dataset.tracking=String(tracking)
  let text='Exploring the mist'
  if(!tracking) text='Finding your position…'
  else if(!lastDepth || now-lastDepth>1.6) text='Finding nearby surfaces…'
  else if(room.durable) text='Room mapped'
  else if(tiles.length) text='Exploring'
  if(state.textContent!==text) state.textContent=text
}

function onFrame(frame) {
  const now=performance.now()/1000
  const pose=frame.getViewerPose(space)
  const wasTracking=tracking
  tracking=!!pose && !pose.emulatedPosition && manager.session.visibilityState==='visible'
  if (!tracking) {
    if(wasTracking) {
      fog.reset()
      world.scene.meshes.forEach(mesh=>mesh.visibility=0)
    }
    previousFrame=null
    fresh=false
    field.disabled=true
    if (lastSurvey+.25<now) { lastSurvey=now; status(now); updateControls() }
    return
  }
  if(!wasTracking) world.scene.meshes.forEach(mesh=>{if (mesh.visibility===0) mesh.visibility=1})
  if(checkAlignment(frame,pose,now)) return
  capturePose(pose)
  const view=pose.views[0]
  const projection=Matrix.FromArray(view.projectionMatrix)
  inverseProjection=Matrix.Invert(projection)
  const clip=Matrix.FromArray(view.transform.inverse.matrix).multiply(projection)
  for(const a of encounter.actors) {
    const p=Vector3.TransformCoordinates(new Vector3(a.x,a.y+.27,a.z),clip)
    a.inFrame=p.z>0 && p.z<1 && Math.abs(p.x)<1 && Math.abs(p.y)<1
  }
  if (trace && Vector3.DistanceSquared(trace,eye)>2.25) {
    saveMap()
    allowSave=false
    restartSurvey('Position changed. Nearby surfaces will reappear as you explore.')
    return
  }
  trace=eye.clone()
  let currentDepth=null
  const moved=fog.outdated(pose,now)
  if (now-lastScan>.13 || (moved && now-lastScan>.065)) {
    lastScan=now
    // Chrome exposes CPU depth on the frame. Browsers may temporarily return
    // null while ARCore initializes or recovers from low light or fast motion.
    let depth
    try { depth=frame.getDepthInformation(view) } catch {}
    if (depth) {
      const scan=depthFrame(view,depth)
      if (scan.samples.length>20) {
        origin??=cameraOrigin(pose.transform)
        let known=0
        for(const sample of scan.samples) if(map.sampleTile(sample,eye)?.confirmed) known++
        const interval=known/scan.samples.length>.82?.55:.13
        if(now-lastFusion>=interval) {
          map.integrate(eye,scan.samples,scan.measure)
          lastFusion=now
        }
        fog.observe(map,scan.samples,pose,now)
        lastDepth=now
        currentDepth=scan
        for(const a of encounter.actors) {
          const seen=scan.measure({x:a.x,y:a.y+.27,z:a.z})
          if(seen) a.hidden=seen.depth<seen.expected-.20
        }
        for (const portal of world.portals) {
          const observed=scan.measure(portal.center)
          portal.obstructed=!!observed && observed.depth<observed.expected-.26
        }
      }
    }
  }
  if(moved && !currentDepth) fog.reset()
  if (now-lastSurvey>.44) {
    lastSurvey=now
    if (map.changed!==mappedVersion) tiles=map.confirmed()
    if (now-lastDepth<1.6) room=map.survey(eye,tiles)
    if (room.durable && !surveyed) {
      surveyed=true
      announce('Black crystals discovered. Aim at one and press Collect.')
    }
    if(now-lastDepth<1.6) encounter.survey(room,eye,tiles)
    floorTiles=room.floor.tiles ?? []
    let portalChanged=false
    for (const portal of world.portals.slice()) {
      if (!map.tiles.has(portal.key)) { world.removePortal(portal); portalChanged=true }
      else if (portal.kind==='unknown' && map.farSide(portal,portal.floorY,tiles)) { portal.kind='interior'; portalChanged=true }
    }
    const measuredBand=[room.floor.y,room.roof.y].map(y=>Math.round(y*10)).join(':')
    if (map.changed!==mappedVersion || measuredBand!==heightBand || portalChanged) {
      world.rebuild(tiles,room)
      mappedVersion=map.changed
      heightBand=measuredBand
    }
    if(now>=saveAt) {
      saveAt=now+3
      saveMap()
    }
    chooseCrystal(now)
    status(now)
  }
  fresh=lastDepth>0 && now-lastDepth<1.6
  const dt=previousFrame===null?0:Math.min(.10,now-previousFrame)
  previousFrame=now
  if(fresh) encounter.step(dt,eye,look)
  creatures.draw(encounter.actors,fresh?dt:0,encounter.time,fresh,fresh && encounter.enabled)
  wall=surveyed && fresh ? map.wallTarget(eye,look,tiles) : null
  if (wall && world.portals.some(p=>tileInAperture(wall.tile,p))) wall=null
  if (currentDepth) {
    const viewDepth=wall ? currentDepth.measure(wall) : null
    verifiedWall=viewDepth && Math.abs(viewDepth.depth-viewDepth.expected)<=.32 ? wall.tile.key : null
  }
  if (wall?.tile.key!==verifiedWall) wall=null
  if (fire && now>=fire.at) {
    const {aperture}=fire
    fire=null
    // The tracked wall may have moved while the charge was fusing (e.g. a door).
    if (map.tiles.get(aperture.key)?.confirmed) {
      world.addPortal(aperture)
      audio.play('blast',{volume:.52})
      world.rebuild(tiles,room)
      announce(aperture.kind==='exterior' ? 'Meadow revealed' : aperture.kind==='interior' ?
        'Mapped space revealed' : 'Far side unscanned. Scan it through a real doorway.')
    } else {
      ammo++
      announce('That surface moved. Charge returned.')
    }
  }
  if (surveyed && world.collect(eye,look)) pickup()
  updateControls()
}

function pickup() {
  ammo++
  audio.play('collect',{volume:.64})
  announce('Charge collected. Aim at a mapped wall.')
}

function useCharge() {
  if (!tracking || !fresh || !surveyed || !eye || fire) return
  if (world.collect(eye,look,true)) { pickup();return }
  if (!ammo || !wall || world.portals.length>=maximumOpenings ||
    !room.floor.count || !room.roof.count) return
  const kind=previewMode ? 'exterior' : map.farSide(wall,room.floor.y,tiles) ? 'interior' : 'unknown'
  const bottom=room.floor.y+.72, top=Math.min(room.roof.y-.15,room.floor.y+2.32)
  if (top-bottom<.65) return
  const aperture={x:wall.x,z:wall.z,nx:wall.nx,nz:wall.nz,bottom,top,width:1.34,
    floorY:room.floor.y,key:wall.tile.key,kind}
  fire={at:performance.now()/1000+.60,aperture}
  ammo--
  previewMode=false
  audio.play('fuse',{volume:.5})
  announce('Virtual charge placed')
  updateControls()
}

function restartSurvey(reason) {
  world.clearProgress()
  resetMap(reason)
  updateControls()
}

async function exit() {
  if (active && manager) await manager.exitXRAsync().catch(()=>{})
}

function cleanup() {
  saveMap()
  active=false
  manager?.onXRFrameObservable.remove(frameObserver)
  space?.removeEventListener('reset',onReset)
  engine?.stopRenderLoop()
  world.clearProgress()
  resetMap()
  audio.setLevels(0,0,false)
  setup.hidden=false
  ar.hidden=true
  canvas.hidden=true
  begin.disabled=false
  startButtons()
  message.textContent=saved?'To resume, start from the same spot and face the same direction as last time.':'Start another expedition.'
}

function onReset() {
  saveMap()
  allowSave=false
  restartSurvey('Position tracking reset. Look around to rediscover your surroundings.')
}

async function prepare() {
  let supported=false
  try { supported=await navigator.xr?.isSessionSupported('immersive-ar') } catch {}
  if (!supported) {
    message.textContent='Room Expedition needs an Android browser with WebXR AR and depth sensing. The 3D maze is available on this device.'
    begin.hidden=true
    return
  }
  try {
    engine=new Engine(canvas,true,{alpha:true,stencil:true,premultipliedAlpha:true})
    world=new RoomWorld(engine)
    creatures=new EncounterView(world.scene)
    helper=await WebXRExperienceHelper.CreateAsync(world.scene)
    if (!helper.camera || !helper.sessionManager) throw new Error('WebXR initialization failed')
    helper.camera.minZ=.03
    helper.camera.maxZ=120
    output=helper.sessionManager.getWebXRRenderTarget({canvasElement:canvas,
      canvasOptions:{alpha:true,depth:true,stencil:true,framebufferScaleFactor:.83}})
    begin.disabled=false
    startButtons()
    message.textContent=saved?'To resume, start from the same spot and face the same direction as last time.':'Use a lit room. Move slowly and keep the phone in your hand.'
  } catch (error) {
    message.textContent='The AR renderer could not start on this device. You can play the 3D maze instead.'
    console.error(error)
  }
}

async function enter(restore=false) {
  if (!helper || active) return
  begin.disabled=true
  resume.disabled=true
  message.textContent='Opening camera and depth tracking…'
  audio.start({ambience:false})
  try {
    manager=await helper.enterXRAsync('immersive-ar','local',output,{
      requiredFeatures:['depth-sensing','dom-overlay'],
      domOverlay:{root:ar},
      depthSensing:{usagePreference:['cpu-optimized'],dataFormatPreference:['float32','luminance-alpha','unsigned-short']}
    })
    active=true
    space=manager.referenceSpace
    space.addEventListener('reset',onReset)
    manager.onXRSessionEnded.addOnce(cleanup)
    domOverlay=!!manager.session.domOverlayState
    manager.session.addEventListener('select',()=>firePhaser())
    ar.hidden=false
    setup.hidden=true
    canvas.hidden=false
    world.clearProgress()
    resetMap()
    allowSave=!restore
    if(restore && saved) {
      const previous=new RoomMap()
      previous.restore(saved.tiles,saved.origin)
      alignment={saved,map:previous,space:null,matches:0,started:performance.now()/1000}
      state.textContent='Finding your saved room'
      announce('Start from the same spot and face the same way. Hold the phone steady, then look around slowly.')
    } else announce('Look around. The world appears through the mist as you explore.')
    setSound()
    world.scene.autoClear=true
    frameObserver=manager.onXRFrameObservable.add(onFrame)
    engine.runRenderLoop(()=>{
      if (!active) return
      world.tick(performance.now()/1000,tracking?eye:null,look)
      world.scene.render()
    })
  } catch (error) {
    message.textContent='Could not start AR with camera depth. Check camera permission, Google Play Services for AR, and your device’s Depth support.'
    begin.disabled=false
    resume.disabled=false
    console.info('Room Expedition session request:',error)
  }
}

begin.addEventListener('click',()=>enter())
resume.addEventListener('click',()=>enter(true))
field.addEventListener('click',firePhaser)
action.addEventListener('click',useCharge)
exterior.addEventListener('click',()=>{
  previewMode=!previewMode
  announce(previewMode ? 'Meadow view selected for the next wall blast.' : 'Use the scanned view behind the wall.')
  updateControls()
})
id('end-room').addEventListener('click',exit)
id('rescan').addEventListener('click',()=>{allowSave=true;restartSurvey('Starting fresh in the mist.')})
ar.addEventListener('beforexrselect',event=>{ if (event.target.closest?.('button')) event.preventDefault() })
window.addEventListener('pagehide',()=>{if(active) saveMap();exit()})
prepare()
