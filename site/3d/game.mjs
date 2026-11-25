import { Layout } from './layout.mjs'

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
const dataPath = '../data/'
const cache = new Map()

let world, layout, player, projectMap
let entries = [], selection = 0, loadId = 0
let mode = 'menu'
let footprints = false, showMap = true, hintCell
let drag, hadLock = false, lastFrame = 0, frame
let completed = new Set()
try {
  const saved = JSON.parse(localStorage.getItem(storageKey))
  if (Array.isArray(saved)) completed = new Set(saved)
} catch {
  // Play remains available when storage is restricted.
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
  hintCell = undefined
  world.setHint([])
  if (mode === 'play') paint()
}

function resetPlayer() {
  const [x, z] = layout.start
  player = { x, z, yaw: layout.startYaw, pitch: 0 }
  footprints = false
}

function enter(reset) {
  if (start.disabled) return
  if (panel.open) panel.close()
  clearInput()
  if (reset) resetPlayer()
  setMode('play')
  syncAssists()
  view.focus({ preventScroll: true })
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
  byId('panel-title').textContent = finished ? 'You found the gate!' : 'Taking a break?'
  byId('panel-copy').textContent = finished ? `${entry.title} is complete. Explore another maze or walk this one again.` :
    'Your place is saved while you take a break.'
  byId('continue').textContent = finished ? 'Next maze' : 'Keep exploring'
  byId('continue').hidden = finished && selection === entries.length - 1
  panel.showModal()
  const focus = byId('continue').hidden ? byId('menu') : byId('continue')
  focus.focus()
}

function goHome() {
  if (panel.open) panel.close()
  cancelAnimationFrame(frame)
  clearInput()
  unlockPointer()
  setMode('menu')
  world?.resize()
  world?.showPreview()
  choice.focus()
}

function prepareMap() {
  const [left, top, right, bottom] = layout.data.bounds
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

function paint() {
  if (footprints) {
    const cell = layout.cellAt(player.x, player.z)
    if (cell !== hintCell) {
      world.setHint(layout.hintFrom(cell))
      hintCell = cell
    }
  }
  world.draw(player)
  if (showMap) drawMap()
}

function tick(time) {
  if (mode !== 'play') return
  const dt = Math.min(.05, (time - lastFrame) / 1000)
  lastFrame = time
  const down = (...codes) => codes.some(code => keys.has(code) || [...touches.values()].includes(code))
  const forward = Number(down('KeyW', 'ArrowUp')) - Number(down('KeyS', 'ArrowDown'))
  const strafe = Number(down('KeyD')) - Number(down('KeyA'))
  const turn = Number(down('ArrowRight', 'KeyE')) - Number(down('ArrowLeft', 'KeyQ'))
  const tilt = Number(down('PageDown')) - Number(down('PageUp'))
  look(turn * dt * 1.92, tilt * dt * 1.5)
  if (forward || strafe) {
    const speed = down('ShiftLeft', 'ShiftRight') ? 2.8 : 1.68
    const distance = speed * dt / Math.hypot(forward, strafe)
    const sin = Math.sin(player.yaw)
    const cos = Math.cos(player.yaw)
    const dx = (sin * forward - cos * strafe) * distance
    const dz = (cos * forward + sin * strafe) * distance
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .05))
    for (let i = 0; i < steps; i++) {
      const x = player.x + dx / steps
      const z = player.z + dz / steps
      if (layout.canWalk(x, z)) {
        player.x = x
        player.z = z
      } else if (dx && layout.canWalk(x, player.z)) player.x = x
      else if (dz && layout.canWalk(player.x, z)) player.z = z
    }
    if (layout.reachedExit(player.x, player.z)) {
      paint()
      openPanel(true)
      return
    }
  }
  paint()
  frame = requestAnimationFrame(tick)
}

byId('picker').addEventListener('submit', event => {
  event.preventDefault()
  enter(true)
})
choice.addEventListener('change', () => choose(Number(choice.value)))
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
    goHome()
    if (await choose(selection + 1)) enter(true)
  }
})
byId('restart').addEventListener('click', () => enter(true))
byId('menu').addEventListener('click', goHome)
panel.addEventListener('cancel', event => {
  event.preventDefault()
  if (mode === 'paused') enter(false)
  else goHome()
})
window.addEventListener('keydown', event => {
  if (mode !== 'play' || event.ctrlKey || event.metaKey || event.altKey) return
  if (moveKeys.has(event.code)) {
    event.preventDefault()
    keys.add(event.code)
  }
  if (event.repeat) return
  if (event.code === 'Escape') {
    event.preventDefault()
    openPanel(false)
  }
  if (event.code === 'KeyH') byId('hint').click()
  if (event.code === 'KeyM') byId('map-toggle').click()
})
window.addEventListener('keyup', event => keys.delete(event.code))
window.addEventListener('blur', clearInput)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') openPanel(false)
})
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === view
  if (hadLock && !locked && mode === 'play') openPanel(false)
  hadLock = locked
})
document.addEventListener('mousemove', event => {
  if (mode === 'play' && document.pointerLockElement === view) {
    look(event.movementX * .0026, event.movementY * .0026)
  }
})
view.addEventListener('pointerdown', event => {
  if (mode !== 'play' || document.pointerLockElement === view || drag || event.button !== 0) return
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
  view.setPointerCapture(event.pointerId)
})
view.addEventListener('pointermove', event => {
  if (mode !== 'play' || drag?.id !== event.pointerId) return
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
  const [{ World }, records] = await Promise.all([import('./world.mjs'), readJSON('./levels.json')])
  world = new World(view)
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
