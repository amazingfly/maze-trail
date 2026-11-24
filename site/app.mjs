import { setupBoardView } from './board-view.mjs?v=6'
import { solveMaze } from './solver.mjs'
import { createTrace } from './trace.mjs?v=6'

const example = 'mz1_jwgc6p4fhllup6bypbhlsuiqoa'
const idPattern = /^mz1_[a-z2-7]{26}$/
const root = new URL('./', import.meta.url)
const route = location.pathname.slice(root.pathname.length).replace(/(^|\/)index\.html$/, '').replace(/\/$/, '')
const suppliedId = route ? (route.startsWith('maze/') ? route.slice(5) : route) :
  new URLSearchParams(location.search).get('id')
const id = suppliedId ?? example
const get = (name) => document.getElementById(name)
const maze = get('maze')
const status = get('status')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const directionKeys = { ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0] }
const star = 'M0,-.53L.16,-.16L.56,-.13L.26,.12L.34,.52L0,.31L-.34,.52L-.26,.12L-.56,-.13L-.16,-.16Z'

get('home').href = root.href
get('demo-link').href = root.href

function draw(tag, attributes, parent = maze) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  parent.append(element)
  return element
}

function pathData(points) {
  return 'M' + points.map(point => point.join(',')).join('L')
}

function position(element, [x, y]) {
  element.setAttribute('cx', x)
  element.setAttribute('cy', y)
}

function artworkLayout({ artwork = [] }) {
  return artwork.map(item => {
    const angle = item.angle * Math.PI / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const extent = item.size * (Math.abs(cos) + Math.abs(sin)) / 2
    return { ...item, cos, sin, extent }
  })
}

function drawArtwork(artwork) {
  const group = draw('g', { class: 'maze-artwork', 'aria-hidden': 'true', 'pointer-events': 'none' })
  for (const { asset, center, angle, size } of artwork) {
    draw('image', {
      href: new URL(`data/art/${asset}.svg`, root).href,
      x: -size / 2, y: -size / 2, width: size, height: size,
      preserveAspectRatio: 'xMidYMid meet',
      transform: `translate(${center.join(' ')}) rotate(${angle})`,
    }, group)
  }
}

function pinPlacement([, [x, y], [dx, dy]], size, artwork) {
  // Keep the interactive markers clear of the original printed illustrations.
  for (const [scale, offset] of [[1, 1.75], [1, 1.05], [.86, 1.05], [.72, 1.05]]) {
    const radius = size * scale
    const cx = x + dx * radius * offset
    const cy = y + dy * radius * offset
    const clear = artwork.every(({ center: [ax, ay], cos, sin, size }) => {
      const along = (cx - ax) * cos + (cy - ay) * sin
      const across = (cy - ay) * cos - (cx - ax) * sin
      return Math.hypot(Math.max(0, Math.abs(along) - size / 2),
        Math.max(0, Math.abs(across) - size / 2)) > radius * 1.07
    })
    if (clear) return { center: [cx, cy], radius }
  }
  return { center: [x + dx * size * .71, y + dy * size * .71], radius: size * .67 }
}

function drawPin(opening, size, finish, artwork) {
  const [, [x, y]] = opening
  const { center: [cx, cy], radius } = pinPlacement(opening, size, artwork)
  const color = finish ? '#bc4a25' : '#087354'
  const pin = draw('g', { class: finish ? 'finish-pin' : 'start-pin' })
  draw('path', { d: `M${x},${y}L${cx},${cy}`, stroke: color, 'stroke-width': radius * .3 }, pin)
  const token = draw('g', { class: finish ? 'star-token' : 'flag-token',
    transform: `translate(${cx} ${cy})` }, pin)
  draw('circle', { r: radius, fill: color, stroke: '#fff', 'stroke-width': radius * .12 }, token)
  const icon = finish ? star : 'M-.35,.53V-.5H.46L.18,-.18L.46,.13H-.18V.53Z'
  draw('path', { d: icon, fill: '#fff', transform: `scale(${radius})` }, token)
  return { center: [cx, cy], radius, token }
}

function showMaze(data) {
  const artwork = artworkLayout(data)
  const [left, top, right, bottom] = data.bounds
  const radius = Math.min((right - left) * .05, (bottom - top) * .063, data.corridor * .61)
  const pad = radius * 3.65 + data.wallWidth
  const artPad = data.corridor * .18
  const viewLeft = Math.min(left - pad, ...artwork.map(({ center: [x], extent }) => x - extent - artPad))
  const viewTop = Math.min(top - pad, ...artwork.map(({ center: [, y], extent }) => y - extent - artPad))
  const viewRight = Math.max(right + pad, ...artwork.map(({ center: [x], extent }) => x + extent + artPad))
  const viewBottom = Math.max(bottom + pad, ...artwork.map(({ center: [, y], extent }) => y + extent + artPad))
  const viewWidth = viewRight - viewLeft
  const viewHeight = viewBottom - viewTop
  const bounds = [viewLeft, viewTop, viewWidth, viewHeight]
  maze.setAttribute('viewBox', bounds.join(' '))
  maze.parentElement.style.setProperty('--maze-ratio', viewWidth / viewHeight)
  const joins = { round: ['round', 'round'], square: ['square', 'miter'], bevel: ['square', 'bevel'] }
  const [cap, join] = joins[data.wallStyle]
  if (data.roomFloor) {
    draw('path', { d: data.roomFloor, fill: '#f9f3d7', stroke: '#f9f3d7', 'stroke-width': '.006' })
  }
  const walls = draw('g', { class: 'maze-walls', 'stroke-linecap': cap, 'stroke-linejoin': join })
  draw('path', { d: data.walls, 'stroke-width': data.wallWidth }, walls)
  if (data.outline) {
    draw('path', { d: data.outline.path, 'stroke-width': data.outline.width }, walls)
  }
  drawArtwork(artwork)
  const width = data.corridor * .29
  const manualGroup = draw('g', {})
  const solutionGroup = draw('g', { visibility: 'hidden' })
  const startPin = drawPin(data.openings[0], radius, false, artwork)
  const finishPin = drawPin(data.openings[1], radius, true, artwork)
  const rays = draw('g', {})
  const sparkle = draw('path', { class: 'finish-rays', hidden: '',
    d: 'M0-1.32v-.42 M0 1.32v.42 M-1.32 0h-.42 M1.32 0h.42 M.92-.92l.31-.31 M-.92.92l-.31.31 M.92.92l.31.31 M-.92-.92l-.31-.31',
    'stroke-width': .14 }, rays)
  const manual = setupTracing(data, manualGroup, [startPin, finishPin], rays, sparkle, width)
  const playback = setupPlayback(data, solutionGroup, width)
  setupBoardView(maze, bounds, manual)

  get('watch').addEventListener('click', () => {
    manual.release()
    manualGroup.setAttribute('visibility', 'hidden')
    solutionGroup.setAttribute('visibility', 'visible')
    manual.showPins()
    maze.classList.add('is-solution')
    maze.tabIndex = -1
    maze.setAttribute('aria-label', 'Animated maze solution')
    get('manual-controls').hidden = true
    get('solution-controls').hidden = false
    playback.start(manual.reversed)
    get('play').focus({ preventScroll: true })
  })
  get('back').addEventListener('click', () => {
    playback.stop()
    solutionGroup.setAttribute('visibility', 'hidden')
    manualGroup.setAttribute('visibility', 'visible')
    maze.classList.remove('is-solution')
    maze.tabIndex = 0
    maze.setAttribute('aria-label', 'Interactive maze')
    get('solution-controls').hidden = true
    get('manual-controls').hidden = false
    manual.render()
    status.textContent = manual.finished ? manual.success : 'Keep tracing.'
    get('watch').focus({ preventScroll: true })
  })
}

function setupTracing(data, group, [flag, star], rays, sparkle, width) {
  const trace = createTrace(data)
  const success = () => trace.reversed ? 'You reached the flag!' : 'You reached the star!'
  const path = draw('path', { class: 'maze-trail manual-trail', 'stroke-width': width }, group)
  const ripple = draw('circle', { class: 'start-ripple', r: width, 'stroke-width': width * .18 }, group)
  const pawn = draw('circle', { class: 'traveller manual-pawn', r: width * .82, 'stroke-width': width * .24 }, group)
  let gesture = null
  const active = () => !maze.classList.contains('is-solution') && !maze.classList.contains('is-panning')
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const playerPoint = () => trace.reversed && !trace.started ? star.center : trace.points.at(-1)

  function positionStar(point, scale = 1) {
    star.token.setAttribute('transform', `translate(${point.join(' ')}) scale(${scale})`)
  }

  function showPins() {
    positionStar(star.center)
    sparkle.toggleAttribute('hidden', true)
  }

  function render() {
    path.setAttribute('d', trace.started ? pathData(trace.points) : '')
    position(pawn, trace.points.at(-1))
    position(ripple, trace.points.at(-1))
    pawn.toggleAttribute('hidden', trace.reversed)
    ripple.toggleAttribute('hidden', trace.started || trace.reversed)
    if (trace.reversed && (trace.started || gesture?.cell === trace.current())) {
      positionStar(trace.points.at(-1), width / star.radius)
    } else {
      positionStar(star.center)
    }
    const goal = trace.reversed ? flag : star
    rays.setAttribute('transform', `translate(${goal.center.join(' ')}) scale(${goal.radius})`)
    sparkle.toggleAttribute('hidden', !trace.finished)
  }

  function release() {
    if (!gesture) return
    const { id } = gesture
    gesture = null
    if (maze.hasPointerCapture(id)) maze.releasePointerCapture(id)
    maze.classList.remove('is-dragging')
    render()
  }

  function pointerPoint(event, transform) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
    return [point.x, point.y]
  }

  function changed() {
    render()
    if (trace.finished) status.textContent = success()
  }

  maze.addEventListener('pointerdown', (event) => {
    if (!active() || gesture || !event.isPrimary || event.button !== 0 || trace.finished) return
    const transform = maze.getScreenCTM()
    if (!transform) return
    const point = pointerPoint(event, transform)
    const cell = trace.cellAt(point)
    // Use both a minimum screen-size target and a fraction of the zoomed corridor.
    const pixels = event.pointerType === 'mouse' ? 22 : 30
    const slop = Math.max(data.corridor * .62, pixels / Math.hypot(transform.a, transform.b))
    const onPlayer = cell === trace.current() || distance(point, playerPoint()) <= slop
    const tappedCell = trace.canMove(cell) ? cell : undefined
    let pin
    if (!trace.started) {
      const nearest = distance(point, flag.center) <= distance(point, star.center) ? flag : star
      const gap = distance(point, nearest.center)
      if (gap <= nearest.radius * 1.25 || (!onPlayer && tappedCell === undefined && gap <= slop)) pin = nearest
    }
    if (!onPlayer && tappedCell === undefined && !pin) return
    if (pin) trace.reset(pin === star)

    // A grab just outside the corridor moves relative to the player instead of jumping across a wall.
    const anchor = pin?.center ?? (cell === trace.current() ? point : playerPoint())
    gesture = {
      id: event.pointerId,
      point: anchor,
      cell: trace.cellAt(anchor),
      offset: [anchor[0] - point[0], anchor[1] - point[1]],
      client: [event.clientX, event.clientY],
      tappedCell: pin ? undefined : tappedCell,
      dragged: false,
    }
    if (event.pointerType === 'mouse') {
      event.preventDefault()
      maze.focus({ preventScroll: true })
    }
    maze.setPointerCapture(event.pointerId)
    maze.classList.add('is-dragging')
    if (pin) changed()
  })

  function movePointer(event) {
    if (!gesture || event.pointerId !== gesture.id || trace.finished) return
    if (!gesture.dragged && distance([event.clientX, event.clientY], gesture.client) < 5) return
    const transform = maze.getScreenCTM()
    if (!transform) return
    gesture.dragged = true
    const point = pointerPoint(event, transform).map((value, i) => value + gesture.offset[i])
    const [x, y] = gesture.point
    const dx = point[0] - x
    const dy = point[1] - y
    // Sample between events so fast swipes still check the cells along the way.
    const steps = Math.ceil(Math.hypot(dx, dy) / (data.corridor * .12))
    if (steps > 256) {
      gesture.point = point
      gesture.cell = trace.cellAt(point)
      return
    }
    const initialCell = gesture.cell
    let moved = false
    for (let i = 1; i <= steps && !trace.finished; i++) {
      const next = trace.cellAt([x + dx * i / steps, y + dy * i / steps])
      if (gesture.cell === trace.current() && next !== gesture.cell && trace.move(next)) moved = true
      gesture.cell = next
    }
    gesture.point = point
    if (moved || (trace.reversed && !trace.started && initialCell !== gesture.cell)) changed()
  }

  const followTrace = () => maze.dispatchEvent(new Event('trace-release'))
  maze.addEventListener('pointermove', movePointer)
  maze.addEventListener('pointerup', event => {
    if (gesture?.id !== event.pointerId) return
    movePointer(event)
    if (!gesture.dragged && gesture.tappedCell !== undefined && trace.move(gesture.tappedCell)) changed()
    release()
    followTrace()
  })
  for (const name of ['pointercancel', 'lostpointercapture']) {
    maze.addEventListener(name, event => {
      if (gesture?.id === event.pointerId) release()
    })
  }
  maze.addEventListener('keydown', (event) => {
    if (!active() || event.shiftKey || !directionKeys[event.key]) return
    event.preventDefault()
    if (trace.moveDirection(directionKeys[event.key])) {
      changed()
      followTrace()
    }
  })
  get('reset').addEventListener('click', () => {
    release()
    trace.reset()
    render()
    status.textContent = 'Maze reset. Start at either end.'
  })
  render()
  return {
    render, release, showPins,
    ownsPointer: id => gesture?.id === id,
    get point() { return playerPoint() },
    get success() { return success() },
    get finished() { return trace.finished },
    get reversed() { return trace.reversed },
  }
}

function setupPlayback(data, group, width) {
  const { points, cells } = solveMaze(data)
  const progress = get('progress')
  const play = get('play')
  const trail = draw('path', { class: 'maze-trail solution-trail', d: pathData(points), 'stroke-width': width }, group)
  const pawn = draw('circle', { class: 'traveller solution-pawn', r: width * .82, 'stroke-width': width * .24 }, group)
  const length = trail.getTotalLength()
  const duration = Math.min(24000, Math.max(4200, cells.length * 165))
  trail.style.strokeDasharray = `${length} ${length}`

  let fraction = 0
  let frame = null
  let previousTime = null
  let speed = Number(document.querySelector('[name="speed"]:checked').value)
  let lastPercent = -1
  let reversed = false

  function render(value) {
    fraction = value
    const distance = value * length
    trail.style.strokeDashoffset = length - distance
    trail.style.visibility = value === 0 ? 'hidden' : 'inherit'
    pawn.style.visibility = value > 0 && value < 1 ? 'inherit' : 'hidden'
    const { x, y } = trail.getPointAtLength(distance)
    position(pawn, [x, y])
    progress.value = Math.round(value * 1000)
    const percent = Math.floor(value * 100)
    if (percent !== lastPercent) {
      progress.setAttribute('aria-valuetext', `${percent} percent`)
      lastPercent = percent
    }
  }

  function setAction(icon, label, announcement) {
    play.setAttribute('aria-label', label)
    play.title = label
    for (const shape of play.querySelectorAll('[data-play-icon]')) {
      shape.toggleAttribute('hidden', shape.dataset.playIcon !== icon)
    }
    if (status.textContent !== announcement) status.textContent = announcement
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    previousTime = null
  }

  function updatePaused() {
    const goal = reversed ? 'flag' : 'star'
    const announcement = fraction === 1 ? `The trail reached the ${goal}.` : 'Solution paused.'
    if (reducedMotion.matches) setAction('reveal', 'Show solution', announcement)
    else if (fraction === 1) setAction('replay', 'Play again', announcement)
    else setAction('play', fraction === 0 ? 'Play solution' : 'Keep going', announcement)
  }

  function finish() {
    stop()
    render(1)
    updatePaused()
  }

  function tick(time) {
    const elapsed = previousTime === null ? 0 : Math.min(time - previousTime, 50)
    previousTime = time
    const next = Math.min(1, fraction + elapsed * speed / duration)
    if (next === 1) return finish()
    render(next)
    frame = requestAnimationFrame(tick)
  }

  function start() {
    if (reducedMotion.matches) return finish()
    if (fraction === 1) render(0)
    setAction('pause', 'Pause', 'The trail is on its way.')
    frame = requestAnimationFrame(tick)
  }

  play.addEventListener('click', () => {
    if (frame === null) start()
    else {
      stop()
      updatePaused()
    }
  })
  progress.addEventListener('input', () => {
    stop()
    render(Number(progress.value) / 1000)
    updatePaused()
  })
  get('reveal').addEventListener('click', finish)
  reducedMotion.addEventListener('change', (event) => {
    if (group.getAttribute('visibility') === 'hidden') return
    if (event.matches && frame !== null) finish()
    else if (frame === null) updatePaused()
  })
  document.querySelectorAll('[name="speed"]').forEach((input) => {
    input.addEventListener('change', () => { speed = Number(input.value) })
  })

  render(0)
  return {
    stop,
    start(fromStar) {
      reversed = fromStar
      trail.setAttribute('d', pathData(reversed ? [...points].reverse() : points))
      render(0)
      start()
    },
  }
}

function setupMazePicker() {
  const open = get('open-picker')
  const dialog = get('maze-picker')
  const message = get('picker-status')
  const buttons = [...dialog.querySelectorAll('[data-difficulty]')]
  let catalog
  let loading = false

  async function loadCatalog() {
    loading = true
    message.textContent = 'Finding mazes…'
    message.hidden = false
    try {
      const response = await fetch(new URL('maze-index.json?v=7', root))
      if (!response.ok) throw new Error('Maze catalog unavailable')
      const entries = await response.json()
      catalog = Object.fromEntries(buttons.map(({ dataset: { difficulty } }) => [
        difficulty, (entries[difficulty] ?? []).filter(pageId => idPattern.test(pageId)),
      ]))
      for (const button of buttons) {
        button.disabled = catalog[button.dataset.difficulty].length === 0
      }
      const available = buttons.find(button => !button.disabled)
      if (!available) throw new Error('Maze catalog is empty')
      message.hidden = true
      if (!dialog.open) return
      const close = dialog.querySelector('.picker-close')
      if (document.activeElement === close) available.focus()
    } catch {
      catalog = undefined
      message.textContent = 'Mazes couldn’t load. Close this window and try again.'
    } finally {
      loading = false
    }
  }

  open.addEventListener('click', () => {
    dialog.showModal()
    if (!catalog && !loading) loadCatalog()
    else buttons.find(button => !button.disabled)?.focus()
  })
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const matches = catalog?.[button.dataset.difficulty]
      if (!matches?.length) return
      const choices = matches.length > 1 ? matches.filter(pageId => pageId !== id) : matches
      const randomId = choices[Math.floor(Math.random() * choices.length)]
      dialog.close()
      location.assign(new URL(`maze/${randomId}/`, root))
    })
  }
  open.hidden = false
}

async function load() {
  const unavailable = 'We couldn’t find that maze. Try scanning the QR code again.'
  try {
    if (!idPattern.test(id)) throw new Error(unavailable)
    const response = await fetch(new URL(`data/${id}.json?v=3`, root))
    if (response.status === 404) throw new Error(unavailable)
    if (!response.ok) throw new Error('Maze request failed')
    const data = await response.json()
    if (data.version !== 2 || data.id !== id) throw new Error(unavailable)
    const title = data.title.split(' · ')[0]
    get('maze-title').textContent = title
    document.title = `${title} | Maze Trail`
    // Reveal the SVG before measuring its path.
    get('workspace').hidden = false
    showMaze(data)
    get('message').hidden = true
  } catch (error) {
    get('workspace').hidden = true
    get('maze-title').textContent = 'Maze unavailable'
    document.title = 'Maze unavailable | Maze Trail'
    get('message').textContent = error.message === unavailable ? unavailable :
      'The maze couldn’t load. Refresh the page to try again.'
    get('demo-link').hidden = false
  }
}

setupMazePicker()
load()
