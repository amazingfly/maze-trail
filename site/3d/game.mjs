import { species, findHatchlings, walkHatchlings, targetHatchling, callHatchling, recruitHatchling } from './hatchling-play.mjs'
import { Layout } from './layout.mjs'
import { crystals, newExpedition } from './expedition.mjs'
import { JungleAudio } from './sound.mjs'

const byId = id => document.getElementById(id)
const game = byId('game')
const view = byId('view')
const panel = byId('panel')
const choice = byId('maze-choice')
const start = byId('start')
const notice = byId('notice')
const minimap = byId('map')
const mapContext = minimap.getContext('2d')
const mapBase = document.createElement('canvas')
mapBase.width = minimap.width
mapBase.height = minimap.height
const touch = matchMedia('(pointer: coarse)')
const difficulties = { preschool: 'First mazes', easy: 'Easy', challenge: 'Challenge' }
const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowRight', 'ArrowDown',
  'ArrowLeft', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE', 'PageUp', 'PageDown'])
const keys = new Set()
const touches = new Map()
const storageKey = 'maze-trail:dinosaur-3d:v2'
const settingsKey = 'maze-trail:dinosaur-3d:settings'
const launchDisplay = byId('launch-display')
const pauseDisplay = byId('pause-display')
const captureMouse = byId('capture-mouse')
const dataPath = '../data/'
const cache = new Map()
const audio = new JungleAudio()
const musicInput=byId('music-volume'), effectsInput=byId('effects-volume')
const abilities=byId('abilities')
const powerBadges=new Map()
for (const [kind,type] of Object.entries(crystals)) {
  if (!type.duration) continue
  const badge=document.createElement('span')
  badge.style.setProperty('--power', type.color)
  badge.title=type.label
  badge.hidden=true
  badge.innerHTML=`${type.icon} <b></b>`
  abilities.append(badge)
  powerBadges.set(kind,badge)
}

let world, layout, player, projectMap, run, lastRoute
let entries = [], selection = 0, loadId = 0
let mode = 'menu'
let footprints = false, showMap = true, hintCell
let drag, hadLock = false, lastFrame = 0, frame
let completed = new Set()
let display = 'fullscreen', autoCapture = true
let musicVolume=.28, effectsVolume=.65
let wasFullscreen = false
try {
  const saved = JSON.parse(localStorage.getItem(storageKey))
  if (Array.isArray(saved)) completed = new Set(saved)
  const settings = JSON.parse(localStorage.getItem(settingsKey))
  if (settings?.display === 'browser') display = 'browser'
  if (settings?.autoCapture === false) autoCapture = false
  if (typeof settings?.musicVolume === 'number') musicVolume=Math.min(1,Math.max(0,settings.musicVolume))
  if (typeof settings?.effectsVolume === 'number') effectsVolume=Math.min(1,Math.max(0,settings.effectsVolume))
} catch {
  // Play remains available when storage is restricted.
}

launchDisplay.value = pauseDisplay.value = display
captureMouse.checked = autoCapture
musicInput.value=musicVolume*100
effectsInput.value=effectsVolume*100

function saveSettings() {
  try { localStorage.setItem(settingsKey, JSON.stringify({ display, autoCapture, musicVolume, effectsVolume })) } catch {}
}

function leaveFullscreen() {
  if (document.fullscreenElement === game) document.exitFullscreen().catch(() => {})
}

function activateDisplay() {
  // Fullscreen consumes the click's transient activation, so ask for pointer lock first.
  if (autoCapture) lockPointer()
  if (display === 'fullscreen' && !document.fullscreenElement && document.fullscreenEnabled) {
    game.requestFullscreen().catch(() => {})
  }
}

async function readJSON(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to read ${url} (${response.status})`)
  return response.json()
}

function progress() {
  const total = entries.filter(entry => completed.has(entry.id)).length
  byId('progress').textContent = `${total} of ${entries.length} finished`
  for (const entry of entries) {
    entry.option.textContent = `Page ${entry.page} · ${entry.title}${completed.has(entry.id) ? ' ✓' : ''}`
  }
}

async function choose(index, updateAddress = true) {
  const request = ++loadId
  selection = index
  const entry = entries[index]
  choice.value = String(index)
  start.disabled = true
  byId('preview-tag').hidden = true
  notice.textContent = 'Loading maze…'
  if (updateAddress) {
    const url = new URL(location.href)
    url.searchParams.set('page', entry.page)
    history.replaceState(null, '', url)
  }
  try {
    if (!cache.has(entry.id)) {
      const record = await readJSON(`${dataPath}${entry.id}.json`)
      cache.set(entry.id, new Layout(record))
    }
    if (request !== loadId) return false
    const nextLayout = cache.get(entry.id)
    nextLayout.resetWalls()
    world.load(nextLayout)
    layout = nextLayout
    byId('preview-name').textContent = `Page ${entry.page} · ${entry.title}`
    byId('level-page').textContent = `Page ${entry.page} · ${difficulties[entry.difficulty]}`
    byId('level-title').textContent = entry.title
    prepareMap()
    start.disabled = false
    notice.textContent = ''
    byId('preview-tag').hidden = mode !== 'menu'
    if (mode === 'menu') world.showPreview()
    return true
  } catch (error) {
    if (request !== loadId) return false
    console.error(error)
    notice.textContent = 'This maze did not load. Try another maze or reload the page.'
    return false
  }
}

function setMode(next) {
  mode = next
  audio.setLevels(musicVolume,effectsVolume,mode==='play')
  game.dataset.mode = mode
  const home = mode === 'menu'
  byId('home').hidden = !home
  byId('book-link').hidden = !home
  byId('preview-tag').hidden = !home || start.disabled
  document.querySelector('.game-actions').hidden = home
  byId('hud').hidden = home
  byId('controls').hidden = mode !== 'play'
  document.querySelector('.reticle').hidden = mode !== 'play'
}

function clearInput() {
  keys.clear()
  touches.clear()
  drag = undefined
}

function lockPointer() {
  if (touch.matches || !view.requestPointerLock || document.pointerLockElement === view) return
  try {
    view.requestPointerLock()?.catch(() => {})
  } catch {
    // Dragging the view and keyboard turning are also available.
  }
}

function unlockPointer() {
  hadLock = false
  if (document.pointerLockElement === view) document.exitPointerLock()
}

function syncAssists() {
  byId('hint').setAttribute('aria-pressed', String(footprints))
  byId('map-toggle').setAttribute('aria-pressed', String(showMap))
  byId('map-panel').hidden = !showMap
  byId('pause-map').checked = showMap
  byId('pause-hint').checked = footprints
  hintCell = undefined
  lastRoute = null
  world.setHint([])
  if (mode === 'play') paint()
}

function resetPlayer() {
  const [x, z] = layout.start
  player = { x, z, yaw: layout.startYaw, pitch: 0, y:0, vy:0, safe:[x,z] }
  if (layout.destroyed.size) {
    layout.resetWalls()
    world.refreshWalls()
    prepareMap()
  }
  run=newExpedition(layout)
  run.hatchlings=findHatchlings(layout,selection,run.loot)
  byId('hatchling-count').textContent='0/'+run.hatchlings.length
  world.setExpedition(run)
  updatePowers()
  footprints = false
}

function enter(reset) {
  if (start.disabled) return
  if (panel.open) panel.close()
  clearInput()
  if (reset) resetPlayer()
  audio.start()
  setMode('play')
  syncAssists()
  view.focus({ preventScroll: true })
  activateDisplay()
  lastFrame = performance.now()
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(tick)
}

function openPanel(finished) {
  cancelAnimationFrame(frame)
  clearInput()
  unlockPointer()
  setMode(finished ? 'complete' : 'paused')
  const entry = entries[selection]
  if (finished) {
    completed.add(entry.id)
    try { localStorage.setItem(storageKey, JSON.stringify([...completed])) } catch {}
    progress()
  }
  byId('panel-label').textContent = finished ? `Page ${entry.page} complete` : `Page ${entry.page}`
  byId('panel-title').textContent = finished ? 'You found the gate!' : 'Paused'
  byId('panel-copy').textContent = finished ? `${entry.title} is complete. Explore another maze or walk this one again.` :
    'Your place is saved while you take a break.'
  byId('continue').textContent = finished ? 'Next maze' : 'Resume'
  byId('pause-settings').hidden = finished
  byId('menu').textContent = finished ? 'Choose a maze' : 'Quit to maze picker'
  byId('continue').hidden = finished && selection === entries.length - 1
  panel.showModal()
  const focus = byId('continue').hidden ? byId('menu') : byId('continue')
  focus.focus()
}

function goHome(exitFullscreen = true) {
  if (panel.open) panel.close()
  cancelAnimationFrame(frame)
  clearInput()
  unlockPointer()
  setMode('menu')
  if (exitFullscreen) leaveFullscreen()
  world?.resize()
  world?.showPreview()
  choice.focus()
}

function prepareMap() {
  const [left, top, right, bottom] = layout.boundary
  const size = mapBase.width
  const scale = (size - 30) / Math.max(right - left, bottom - top)
  const offsetX = (size - (right - left) * scale) / 2
  const offsetZ = (size - (bottom - top) * scale) / 2
  projectMap = (x, z) => [offsetX + (x - left) * scale, offsetZ + (z - top) * scale]
  const ctx = mapBase.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#315b4e'
  ctx.beginPath()
  for (const polygon of layout.data.polygons) {
    if (!polygon) continue
    ctx.moveTo(...projectMap(...polygon[0]))
    for (const point of polygon.slice(1)) ctx.lineTo(...projectMap(...point))
    ctx.closePath()
  }
  ctx.fill()
  ctx.beginPath()
  for (const [a, b] of layout.segments) {
    ctx.moveTo(...projectMap(...a))
    ctx.lineTo(...projectMap(...b))
  }
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#a6c9ae'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(...projectMap(...layout.exit), 6, 0, Math.PI * 2)
  ctx.fillStyle = '#ffd17a'
  ctx.fill()
}

function drawMap() {
  mapContext.clearRect(0, 0, minimap.width, minimap.height)
  mapContext.drawImage(mapBase, 0, 0)
  if (active('find')) for (const item of run.loot) {
    if (item.collected || Math.hypot(item.x-player.x,item.z-player.z)>5) continue
    mapContext.fillStyle=crystals[item.kind].color
    const [x,z]=projectMap(item.x,item.z)
    mapContext.fillRect(x-3,z-3,6,6)
    mapContext.strokeStyle='#fff'
    mapContext.strokeRect(x-3,z-3,6,6)
  }
  mapContext.save()
  mapContext.translate(...projectMap(player.x, player.z))
  mapContext.rotate(Math.PI - player.yaw)
  mapContext.beginPath()
  mapContext.moveTo(0, -10)
  mapContext.lineTo(7, 7)
  mapContext.lineTo(0, 4)
  mapContext.lineTo(-7, 7)
  mapContext.closePath()
  mapContext.fillStyle = '#d4ef9d'
  mapContext.fill()
  mapContext.lineWidth = 1.25
  mapContext.strokeStyle = '#152e28'
  mapContext.stroke()
  mapContext.restore()
}

function look(dx, dy) {
  player.yaw = (player.yaw - dx) % (Math.PI * 2)
  player.pitch = Math.max(-1.25, Math.min(1.25, player.pitch - dy))
}

function active(kind) {
  return (run?.powers[kind] ?? 0) > run?.time
}

function updatePowers() {
  byId('crystal-count').textContent=run.count
  byId('bomb-count').textContent=run.bombs
  byId('equip-bomb').hidden=run.bombs===0
  byId('equip-bomb').setAttribute('aria-pressed',String(run.armed))
  byId('drop-bomb').disabled=run.bombs===0 || !run.armed || Boolean(run.charge)
  byId('map-panel').hidden=!showMap && !active('find')
  for(const [kind,badge] of powerBadges) {
    badge.hidden=!active(kind)
    if (!badge.hidden) {
      const remaining=Math.ceil(run.powers[kind]-run.time)
      badge.querySelector('b').textContent=remaining
      badge.setAttribute('aria-label',`${crystals[kind].label}, ${remaining} seconds`)
    }
  }
}

function burst(x,y,z,color,count) {
  for(let i=0;i<count;i++) {
    const angle=Math.random()*Math.PI*2
    const force=.25+Math.random()*(count>20?4:1.9)
    run.effects.unshift({x,y,z,color,start:run.time,life:.32+Math.random()*.61,
      dx:Math.cos(angle)*force,dz:Math.sin(angle)*force,dy:.48+Math.random()*(count>20?3:2),
      size:(.02+Math.random()*.045)*(count>20?2.5:1)})
  }
  run.effects.length=Math.min(48,run.effects.length)
}

function jump() {
  if (mode!=='play') return
  // Buffer a quick press just before landing.
  run.jumpUntil=run.time+.13
}

function toggleBomb() {
  if(mode!=='play' || !run.bombs) return
  run.armed=!run.armed
  updatePowers()
}

function placeBomb() {
  if (mode!=='play' || !run?.armed || !run.bombs || run.charge || player.y>.7) return
  const target=layout.targetWall(player.x,player.z,player.yaw)
  if(!target) {
    run.message='Face a nearby wall'
    run.messageUntil=run.time+1.5
    return
  }
  const [x,z]=target
  run.bombs--
  run.charge={x,z,until:run.time+.82}
  audio.play('fuse')
  updatePowers()
}

function greet(event) {
  if(mode!=='play') return false
  let {yaw,pitch}=player
  if(event && document.pointerLockElement!==view) {
    const bounds=view.getBoundingClientRect()
    const fov=bounds.width<bounds.height?78:65
    const scale=Math.tan(fov*Math.PI/360)*2/bounds.height
    yaw-=Math.atan((event.clientX-bounds.left-bounds.width/2)*scale)
    pitch-=Math.atan((event.clientY-bounds.top-bounds.height/2)*scale)
  }
  const actor=targetHatchling(run.hatchlings,player,layout,yaw,pitch)
  if(!actor) return false
  const joined=recruitHatchling(actor,run.time)
  const replied=callHatchling(actor,player,run.time,audio,true)
  if(joined || replied) {
    const count=run.hatchlings.filter(item=>item.following).length
    byId('hatchling-count').textContent=count+'/'+run.hatchlings.length
    run.message=species[actor.kind].name+(joined?' joined you':' hatchling')
    run.messageUntil=run.time+1.5
  }
  return true
}

function tickExpedition(dt) {
  run.time+=dt
  const time=run.time
  if (run.jumpUntil>=time && player.y===0) {
    player.vy=active('jump') ? 6.55 : 2.92
    run.jumpUntil=0
    audio.play('jump')
  }
  if(player.y>0 || player.vy>0) {
    player.y+=player.vy*dt-5.1*dt*dt
    player.vy-=10.2*dt
    if(player.y<=0) {
      player.y=player.vy=0
      audio.play('land')
      burst(player.x,.025,player.z,0xc6a67a,6)
    }
  }
  if(run.charge && run.charge.until<=time) {
    const {x,z}=run.charge
    if(layout.blast(x,z)) {
      world.refreshWalls()
      prepareMap()
      lastRoute=null
    }
    burst(x,.55,z,0xffad54,27)
    burst(x,.31,z,0xa89772,16)
    audio.play('blast')
    run.charge=null
  }
  if (layout.canWalk(player.x,player.z)) player.safe=[player.x,player.z]
  else if (!active('phase') && player.y<1.26) {
    const [x,z]=layout.clearSpot(player.x,player.z,player.safe)
    player.x=x
    player.z=z
  }
  for(const item of run.loot) {
    if(item.collected) continue
    const dx=player.x-item.x, dz=player.z-item.z, distance=Math.hypot(dx,dz)
    if(distance<.27 && player.y<.68) {
      item.collected=true
      run.count++
      if(item.kind==='bomb') { run.bombs++; run.armed=true }
      const type=crystals[item.kind]
      if(type.duration) run.powers[item.kind]=time+type.duration
      run.message=`${type.icon} ${type.label}`
      run.messageUntil=time+1.6
      burst(item.x,.29,item.z,parseInt(type.color.slice(1),16),16)
      audio.play('collect')
    } else if(active('pull') && distance < 2.5) {
      const delta=Math.min(distance,dt*(1.15+(2.5-distance)*.68))
      item.x+=dx/distance*delta
      item.z+=dz/distance*delta
    }
  }
  run.effects=run.effects.filter(fx=>time-fx.start<fx.life)
  for(const [kind,key,min,span] of [['bird','birdAt',3.4,8],['roar','roarAt',13,26]]) {
    if(time<run[key]) continue
    const bearing=Math.random()*2*Math.PI-player.yaw
    const pan=-Math.sin(bearing)*.92
    const distance=kind==='roar' ? 7+Math.random()*26 : 2+Math.random()*12
    const volume=1/(1+distance*.12)
    audio.play(kind,{pan,volume,distance,variant:Math.floor(Math.random()*3)})
    run[key]=time+min+Math.random()*span
  }
  const second=Math.floor(time*5)
  if(run.hudTick!==second) {
    run.hudTick=second
    updatePowers()
    const hatchling=targetHatchling(run.hatchlings,player,layout,player.yaw,player.pitch)
    byId('pickup-message').textContent=time<run.messageUntil ? run.message : hatchling ? (hatchling.following
      ? (touch.matches ? 'Tap to greet' : 'Click or press C to greet')
      : (touch.matches ? 'Tap to invite' : 'Click or press C to invite')) : ''
  }
}

function recordStep(oldX,oldZ) {
  if(player.y>0) return
  const distance=Math.hypot(player.x-oldX,player.z-oldZ)
  run.step+=distance
  if(run.step < .43) return
  run.step%=.43
  run.foot*=-1
  const offset=run.foot*.105
  const x=player.x+Math.cos(player.yaw)*offset
  const z=player.z-Math.sin(player.yaw)*offset
  if(!layout.canWalk(x,z)) return
  run.marks.push({x,z,yaw:player.yaw+run.foot*.085,shape:'rex'})
  if(run.marks.length>96) run.marks.shift()
  world.updateTracks()
  audio.play('step',{pan:-run.foot*.15,volume:.78})
}

function paint() {
  if (!run) return
  if (active('path')) {
    if (!lastRoute || Math.hypot(player.x-lastRoute[0],player.z-lastRoute[1])>.15) {
      lastRoute=[player.x,player.z]
      world.setHint(layout.pathFrom(...lastRoute),true)
    }
  } else if (footprints) {
    const cell = layout.cellAt(player.x, player.z)
    if (cell !== hintCell || lastRoute) {
      world.setHint(layout.hintFrom(cell))
      hintCell = cell
    }
    lastRoute=null
  } else if(world.blueHint) {
    world.setHint([])
    lastRoute=null
  }
  world.draw(player)
  if (showMap || active('find')) drawMap()
}

function tick(time) {
  if (mode !== 'play') return
  const dt = Math.min(.05, (time - lastFrame) / 1000)
  lastFrame = time
  const oldX=player.x, oldZ=player.z
  tickExpedition(dt)
  const canWalk=(x,z)=>layout.canWalk(x,z,player.y,active('phase'))
  const down = (...codes) => codes.some(code => keys.has(code) || [...touches.values()].includes(code))
  const forward = Number(down('KeyW', 'ArrowUp')) - Number(down('KeyS', 'ArrowDown'))
  const strafe = Number(down('KeyD')) - Number(down('KeyA'))
  const turn = Number(down('ArrowRight', 'KeyE')) - Number(down('ArrowLeft', 'KeyQ'))
  const tilt = Number(down('PageDown')) - Number(down('PageUp'))
  look(turn * dt * 1.92, tilt * dt * 1.5)
  if (forward || strafe) {
    const speed = (down('ShiftLeft', 'ShiftRight') ? 2.8 : 1.68)*(active('speed')?1.8:1)
    const distance = speed * dt / Math.hypot(forward, strafe)
    const sin = Math.sin(player.yaw)
    const cos = Math.cos(player.yaw)
    const dx = (sin * forward - cos * strafe) * distance
    const dz = (cos * forward + sin * strafe) * distance
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .05))
    for (let i = 0; i < steps; i++) {
      const x = player.x + dx / steps
      const z = player.z + dz / steps
      if (canWalk(x, z)) {
        player.x = x
        player.z = z
      } else if (dx && canWalk(x, player.z)) player.x = x
      else if (dz && canWalk(player.x, z)) player.z = z
    }
    recordStep(oldX,oldZ)
    if (player.y<.42 && layout.reachedExit(player.x, player.z)) {
      paint()
      openPanel(true)
      return
    }
  }
  const movedX=player.x-oldX, movedZ=player.z-oldZ
  const speed=Math.hypot(movedX,movedZ)/Math.max(.001,dt)
  player.travelSpeed=(player.travelSpeed ?? 0)+(speed-(player.travelSpeed ?? 0))*Math.min(1,dt*7)
  if(speed>.12) player.travelYaw=Math.atan2(movedX,movedZ)
  walkHatchlings(run.hatchlings,player,run.time,dt,layout,audio)
  paint()
  frame = requestAnimationFrame(tick)
}

byId('picker').addEventListener('submit', event => {
  event.preventDefault()
  enter(true)
})
for (const input of [musicInput,effectsInput]) {
  input.addEventListener('input', () => {
    musicVolume=musicInput.valueAsNumber/100
    effectsVolume=effectsInput.valueAsNumber/100
    saveSettings()
  })
}
byId('jump-player').addEventListener('pointerdown', event => { event.preventDefault(); jump() })
byId('drop-bomb').addEventListener('click', placeBomb)
byId('equip-bomb').addEventListener('click', toggleBomb)
window.addEventListener('click', event => {
  if (mode==='play' && event.button===0 && document.pointerLockElement===view && !greet(event)) placeBomb()
})
choice.addEventListener('change', () => choose(Number(choice.value)))
for (const select of [launchDisplay, pauseDisplay]) {
  select.addEventListener('change', () => {
    display = select.value
    launchDisplay.value = pauseDisplay.value = display
    saveSettings()
    if (display === 'browser') leaveFullscreen()
  })
}
captureMouse.addEventListener('change', () => {
  autoCapture = captureMouse.checked
  saveSettings()
})
byId('pause-map').addEventListener('change', event => {
  showMap = event.target.checked
  syncAssists()
  if (showMap) drawMap()
})
byId('pause-hint').addEventListener('change', event => {
  footprints = event.target.checked
  syncAssists()
})
byId('mouse-look').addEventListener('click', lockPointer)
byId('pause').addEventListener('click', () => { if (mode === 'play') openPanel(false) })
byId('hint').addEventListener('click', () => {
  if (mode !== 'play') return
  footprints = !footprints
  syncAssists()
})
byId('map-toggle').addEventListener('click', () => {
  if (mode !== 'play') return
  showMap = !showMap
  syncAssists()
})
byId('continue').addEventListener('click', async () => {
  if (mode === 'paused') enter(false)
  else if (mode === 'complete' && selection + 1 < entries.length) {
    goHome(false)
    if (await choose(selection + 1)) enter(true)
    else if (mode === 'menu') leaveFullscreen()
  }
})
byId('restart').addEventListener('click', () => enter(true))
byId('menu').addEventListener('click', () => goHome())
panel.addEventListener('cancel', event => {
  event.preventDefault()
  if (mode === 'paused') enter(false)
  else if (mode === 'complete') goHome()
})
window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'Escape' && (mode === 'play' || mode === 'paused')) {
    event.preventDefault()
    if (!event.repeat) {
      if (mode === 'play') openPanel(false)
      else enter(false)
    }
    return
  }
  if (mode !== 'play') return
  if (moveKeys.has(event.code)) {
    event.preventDefault()
    keys.add(event.code)
  }
  if (event.repeat) return
  if (event.code === 'Space') { event.preventDefault(); jump() }
  if (event.code === 'KeyB') toggleBomb()
  if (event.code === 'KeyF') placeBomb()
  if (event.code === 'KeyC') greet()
  if (event.code === 'KeyH') byId('hint').click()
  if (event.code === 'KeyM') byId('map-toggle').click()
})
window.addEventListener('keyup', event => keys.delete(event.code))
window.addEventListener('blur', clearInput)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') openPanel(false)
})
document.addEventListener('fullscreenchange', () => {
  const fullscreen = document.fullscreenElement === game
  const exited = wasFullscreen && !fullscreen
  wasFullscreen = fullscreen
  if (fullscreen) {
    if (display === 'browser' || mode === 'menu') leaveFullscreen()
    else navigator.keyboard?.lock?.(['Escape']).catch(() => {})
  } else if (exited) {
    navigator.keyboard?.unlock?.()
    if (mode === 'play') openPanel(false)
  }
})
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === view
  if (hadLock && !locked && mode === 'play') openPanel(false)
  hadLock = locked
  byId('look-controls').textContent = locked ? 'Mouse to look' : 'Drag or ← → to look'
  if (locked && mode !== 'play') unlockPointer()
})
document.addEventListener('mousemove', event => {
  if (mode === 'play' && document.pointerLockElement === view) {
    look(event.movementX * .0026, event.movementY * .0026)
  }
})
view.addEventListener('pointerdown', event => {
  if (mode !== 'play' || document.pointerLockElement === view || drag || event.button !== 0) return
  dragMoved=false
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
  view.setPointerCapture(event.pointerId)
})
view.addEventListener('click', event => {
  if (document.pointerLockElement || !event.detail || dragMoved) return
  if (!greet(event) && !touch.matches) placeBomb()
})
let dragMoved=false
view.addEventListener('pointermove', event => {
  if (mode !== 'play' || drag?.id !== event.pointerId) return
  dragMoved=true
  const sensitivity = event.pointerType === 'touch' ? .008 : .004
  look((event.clientX - drag.x) * sensitivity, (event.clientY - drag.y) * sensitivity)
  drag.x = event.clientX
  drag.y = event.clientY
})
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  view.addEventListener(type, event => { if (drag?.id === event.pointerId) drag = undefined })
}
for (const button of document.querySelectorAll('.pad button')) {
  button.addEventListener('pointerdown', event => {
    if (mode !== 'play') return
    event.preventDefault()
    button.setPointerCapture(event.pointerId)
    touches.set(event.pointerId, button.dataset.key)
  })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => touches.delete(event.pointerId))
  }
}

new ResizeObserver(() => {
  if (!world) return
  world.resize()
  if (mode === 'menu') world.showPreview()
  else if (player) paint()
}).observe(view)

try {
  const [{ World }, records] = await Promise.all([import('./world.mjs?v=10'), readJSON('./levels.json?v=2')])
  const preferWebGPU = new URLSearchParams(location.search).get('renderer') !== 'webgl'
  world = await World.create(view.querySelector('canvas'), preferWebGPU)
  const groups = new Map()
  entries = records.map((entry, i) => ({ ...entry, option: new Option('', String(i)) }))
  choice.replaceChildren()
  for (const entry of entries) {
    if (!groups.has(entry.difficulty)) {
      const group = document.createElement('optgroup')
      group.label = difficulties[entry.difficulty]
      groups.set(entry.difficulty, group)
      choice.append(group)
    }
    groups.get(entry.difficulty).append(entry.option)
  }
  progress()
  choice.disabled = false
  const requested = new URLSearchParams(location.search).get('page')
  await choose(Math.max(0, entries.findIndex(entry => String(entry.page) === requested)), false)
} catch (error) {
  console.error(error)
  notice.textContent = '3D could not start. Try reloading, or use Book mazes to play in 2D.'
}
