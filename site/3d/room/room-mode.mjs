import { Engine } from '@babylonjs/core/Engines/engine.js'
import { WebXRExperienceHelper } from '@babylonjs/core/XR/webXRExperienceHelper.js'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { RoomMap, TILE, tileCenter, tileInAperture } from './room-map.mjs'
import { RoomWorld } from './room-world.mjs'
import { depthFrame } from './depth.mjs'
import { JungleAudio } from '../sound.mjs'

const id=name=>document.getElementById(name)
const begin=id('begin'), ar=id('ar-ui'), canvas=id('ar-canvas')
const setup=id('room-start'), message=id('room-message'), state=id('scan-state')
const action=id('charge'), exterior=id('exterior'), report=id('report')
const audio=new JungleAudio()
const maximumOpenings=6
let engine, world, helper, output, manager, tracking=false, frameObserver, space, active=false
let map, tiles, room, eye, look, wall, ammo, surveyed, armed, lastScan, lastSurvey, mappedVersion, heightBand
let lastDepth, trace, fire, previewMode, floorTiles, nextCrystal, domOverlay, verifiedWall

function resetMap(reason='') {
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
  ar.style.setProperty('--mist','.76')
  ar.dataset.tracking='false'
  announce(reason)
}

function announce(text) {
  if (domOverlay || !active) report.textContent=text
}

function runStatus(text, percent) {
  if (state.textContent!==text) state.textContent=text
  id('scan-progress').value=percent
  id('scan-percent').textContent=Math.round(percent*100)+'%'
}

function updateControls() {
  const locked=!tracking || !wall || !surveyed || fire || world.portals.length>=maximumOpenings
  const collectable=tracking && surveyed && world.crystals.length && !fire
  action.disabled=!(collectable || (ammo && !locked))
  action.textContent=fire ? 'Fusing…' : ammo ? 'Blast wall' : 'Collect crystal'
  exterior.disabled=!!locked || !ammo
  exterior.setAttribute('aria-pressed',String(previewMode))
  id('ammo-count').textContent=ammo
  ar.dataset.target=locked ? 'false' : 'true'
}

function capturePose(pose) {
  const p=pose.transform.position
  eye=new Vector3(p.x,p.y,p.z)
  const transform=Matrix.FromArray(pose.transform.matrix)
  look=Vector3.TransformNormal(new Vector3(0,0,-1),transform).normalize()
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
  ar.style.setProperty('--mist',String(tracking ? .76-.66*(room.fraction ?? 0) : .64))
  if (!tracking) runStatus('Tracking paused · look at a textured surface',room.fraction ?? 0)
  else if (now-lastDepth>1.6) runStatus('Move slowly side to side to acquire depth',room.fraction ?? 0)
  else if (room.durable) runStatus('Room mapped',1)
  else if (room.sealed) runStatus('Checking enclosure',room.fraction)
  else if (!room.floor.count || room.floor.count<12) runStatus('Scan the floor',room.fraction ?? 0)
  else if (!room.roof.count || room.roof.count<12) runStatus('Look up to scan the ceiling',room.fraction ?? 0)
  else runStatus('Sweep the walls and any open doorway',room.fraction)
}

function onFrame(frame) {
  const now=performance.now()/1000
  const pose=frame.getViewerPose(space)
  tracking=!!pose && !pose.emulatedPosition && manager.session.visibilityState==='visible'
  if (!tracking) {
    world.scene.meshes.forEach(mesh=>mesh.visibility=0)
    if (lastSurvey+.25<now) { lastSurvey=now; status(now); updateControls() }
    return
  }
  world.scene.meshes.forEach(mesh=>{if (mesh.visibility===0) mesh.visibility=1})
  capturePose(pose)
  if (trace && Vector3.DistanceSquared(trace,eye)>2.25) {
    restartSurvey('Tracking origin moved. Scan the room again.')
    return
  }
  trace=eye.clone()
  let currentDepth=null
  if (now-lastScan>.13) {
    lastScan=now
    const view=pose.views[0]
    // Chrome exposes CPU depth on the frame. Browsers may temporarily return
    // null while ARCore initializes or recovers from low light or fast motion.
    let depth
    try { depth=frame.getDepthInformation(view) } catch {}
    if (depth) {
      const scan=depthFrame(view,depth)
      if (scan.samples.length>20) {
        map.integrate(eye,scan.samples,scan.measure)
        lastDepth=now
        currentDepth=scan
        for (const portal of world.portals) {
          const observed=scan.measure(portal.center)
          portal.obstructed=!!observed && observed.depth<observed.expected-.26
        }
      }
    }
  }
  if (now-lastSurvey>.44) {
    lastSurvey=now
    tiles=map.confirmed()
    if (now-lastDepth<1.6) room=map.survey(eye,tiles)
    if (room.durable && !surveyed) {
      surveyed=true
      announce('Room ready. Aim at a black crystal and tap to collect it.')
    }
    floorTiles=room.floor.tiles ?? []
    for (const portal of world.portals.slice()) {
      if (!map.tiles.has(portal.key)) world.removePortal(portal)
      else if (portal.kind==='unknown' && map.farSide(portal,portal.floorY,tiles)) portal.kind='interior'
    }
    const measuredBand=[room.floor.y,room.roof.y].map(y=>Math.round(y*10)).join(':')
    if (map.changed!==mappedVersion || measuredBand!==heightBand) {
      world.rebuild(tiles,room)
      mappedVersion=map.changed
      heightBand=measuredBand
    }
    chooseCrystal(now)
    status(now)
  }
  wall=now-lastDepth<1.6 ? map.wallTarget(eye,look,tiles) : null
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
  if (!tracking || !surveyed || !eye || fire) return
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
  message.textContent='Scan a room to begin a new expedition.'
}

function onReset() {
  restartSurvey('Position tracking reset. Scan the room again.')
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
    helper=await WebXRExperienceHelper.CreateAsync(world.scene)
    if (!helper.camera || !helper.sessionManager) throw new Error('WebXR initialization failed')
    helper.camera.minZ=.03
    helper.camera.maxZ=120
    output=helper.sessionManager.getWebXRRenderTarget({canvasElement:canvas,
      canvasOptions:{alpha:true,depth:true,stencil:true,framebufferScaleFactor:.83}})
    begin.disabled=false
    message.textContent='Use a lit room. Move slowly and keep the phone in your hand.'
  } catch (error) {
    message.textContent='The AR renderer could not start on this device. You can play the 3D maze instead.'
    console.error(error)
  }
}

async function enter() {
  if (!helper || active) return
  begin.disabled=true
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
    manager.session.addEventListener('select',useCharge)
    ar.hidden=false
    setup.hidden=true
    canvas.hidden=false
    world.clearProgress()
    resetMap()
    announce('Scan the floor, ceiling and walls. Keep the center of the camera clear.')
    audio.setLevels(0,.35,true)
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
    console.info('Room Expedition session request:',error)
  }
}

begin.addEventListener('click',enter)
action.addEventListener('click',useCharge)
exterior.addEventListener('click',()=>{
  previewMode=!previewMode
  announce(previewMode ? 'Meadow view selected for the next wall blast.' : 'Use the scanned view behind the wall.')
  updateControls()
})
id('end-room').addEventListener('click',exit)
id('rescan').addEventListener('click',()=>restartSurvey('Room cleared. Scan the surfaces again.'))
ar.addEventListener('beforexrselect',event=>{ if (event.target.closest?.('button')) event.preventDefault() })
window.addEventListener('pagehide',exit)
prepare()
