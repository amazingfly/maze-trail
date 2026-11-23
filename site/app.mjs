import { solveMaze } from './solver.mjs'
import { createTrace } from './trace.mjs'

const example = 'mz1_c6bo2ep5zxb2j5jttbufxrlgx4'
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

function drawPin([, [x, y], [dx, dy]], radius, finish) {
  const distance = radius * 1.75
  const cx = x + dx * distance
  const cy = y + dy * distance
  const color = finish ? '#bc4a25' : '#087354'
  const pin = draw('g', { class: finish ? 'finish-pin' : 'start-pin' })
  draw('path', { d: `M${x},${y}L${cx},${cy}`, stroke: color, 'stroke-width': radius * .3 }, pin)
  draw('circle', { cx, cy, r: radius, fill: color, stroke: '#fff', 'stroke-width': radius * .12 }, pin)
  const icon = finish ? star : 'M-.35,.53V-.5H.46L.18,-.18L.46,.13H-.18V.53Z'
  draw('path', { d: icon, fill: '#fff', transform: `translate(${cx} ${cy}) scale(${radius})` }, pin)
  return [cx, cy]
}

function showMaze(data) {
  const [left, top, right, bottom] = data.bounds
  const radius = Math.min((right - left) * .05, (bottom - top) * .063, data.corridor * .61)
  const pad = radius * 3.65 + data.wallWidth
  const viewWidth = right - left + 2 * pad
  const viewHeight = bottom - top + 2 * pad
  maze.setAttribute('viewBox', [left - pad, top - pad, viewWidth, viewHeight].join(' '))
  maze.parentElement.style.setProperty('--maze-ratio', viewWidth / viewHeight)
  const joins = { round: ['round', 'round'], square: ['square', 'miter'], bevel: ['square', 'bevel'] }
  const [cap, join] = joins[data.wallStyle]
  draw('path', { class: 'maze-walls', d: data.walls, 'stroke-width': data.wallWidth,
    'stroke-linecap': cap, 'stroke-linejoin': join })
  const width = data.corridor * .29
  const manualGroup = draw('g', {})
  const solutionGroup = draw('g', { visibility: 'hidden' })
  const startPin = drawPin(data.openings[0], radius, false)
  const finishPin = drawPin(data.openings[1], radius, true)
  const rays = draw('g', { transform: `translate(${finishPin.join(' ')}) scale(${radius})` })
  const sparkle = draw('path', { class: 'finish-rays', hidden: '',
    d: 'M0-1.32v-.42 M0 1.32v.42 M-1.32 0h-.42 M1.32 0h.42 M.92-.92l.31-.31 M-.92.92l-.31.31 M.92.92l.31.31 M-.92-.92l-.31-.31',
    'stroke-width': .14 }, rays)
  const manual = setupTracing(data, manualGroup, startPin, sparkle, width)
  const playback = setupPlayback(data, solutionGroup, width)

  get('watch').addEventListener('click', () => {
    manual.release()
    manualGroup.setAttribute('visibility', 'hidden')
    solutionGroup.setAttribute('visibility', 'visible')
    sparkle.toggleAttribute('hidden', true)
    maze.classList.add('is-solution')
    maze.tabIndex = -1
    maze.setAttribute('aria-label', 'Animated maze solution')
    get('manual-controls').hidden = true
    get('solution-controls').hidden = false
    playback.start()
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
    status.textContent = manual.finished ? 'You reached the star!' : 'Keep tracing.'
    get('watch').focus({ preventScroll: true })
  })
}

function setupTracing(data, group, startPin, sparkle, width) {
  const trace = createTrace(data)
  const path = draw('path', { class: 'maze-trail manual-trail', 'stroke-width': width }, group)
  const ripple = draw('circle', { class: 'start-ripple', r: width, 'stroke-width': width * .18 }, group)
  const pawn = draw('circle', { class: 'traveller manual-pawn', r: width * .82, 'stroke-width': width * .24 }, group)
  let gesture = null
  const active = () => !maze.classList.contains('is-solution')
  const near = (a, b, amount) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= amount

  function render() {
    path.setAttribute('d', trace.started ? pathData(trace.points) : '')
    position(pawn, trace.points.at(-1))
    position(ripple, trace.points.at(-1))
    ripple.toggleAttribute('hidden', trace.started)
    sparkle.toggleAttribute('hidden', !trace.finished)
  }

  function release() {
    if (!gesture) return
    const { id } = gesture
    gesture = null
    if (maze.hasPointerCapture(id)) maze.releasePointerCapture(id)
    maze.classList.remove('is-dragging')
  }

  function pointerPoint(event) {
    const transform = maze.getScreenCTM()
    if (!transform) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
    return [point.x, point.y]
  }

  function changed() {
    render()
    if (trace.finished) status.textContent = 'You reached the star!'
  }

  maze.addEventListener('pointerdown', (event) => {
    if (!active() || gesture || !event.isPrimary || event.button !== 0 || trace.finished) return
    const point = pointerPoint(event)
    if (!point) return
    const cell = trace.cellAt(point)
    const onStart = !trace.started && near(point, startPin, width * 2.25)
    const moved = cell !== trace.current() && !onStart && trace.move(cell)
    if (cell !== trace.current() && !onStart) return
    if (event.pointerType === 'mouse') {
      event.preventDefault()
      maze.focus({ preventScroll: true })
    }
    if (!trace.finished) {
      gesture = { id: event.pointerId, point, cell }
      maze.setPointerCapture(event.pointerId)
      maze.classList.add('is-dragging')
    }
    if (moved) changed()
  })
  maze.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.id || trace.finished) return
    const point = pointerPoint(event)
    if (!point) return
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
    let moved = false
    for (let i = 1; i <= steps && !trace.finished; i++) {
      const next = trace.cellAt([x + dx * i / steps, y + dy * i / steps])
      if (gesture.cell === trace.current() && next !== gesture.cell && trace.move(next)) moved = true
      gesture.cell = next
    }
    gesture.point = point
    if (moved) changed()
  })
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    maze.addEventListener(name, (event) => {
      if (gesture?.id === event.pointerId) release()
    })
  }
  maze.addEventListener('keydown', (event) => {
    if (!active() || !directionKeys[event.key]) return
    event.preventDefault()
    if (trace.moveDirection(directionKeys[event.key])) changed()
  })
  get('reset').addEventListener('click', () => {
    release()
    trace.reset()
    render()
    status.textContent = 'Maze reset. Start at the yellow dot.'
  })
  render()
  return { render, release, get finished() { return trace.finished } }
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
    const announcement = fraction === 1 ? 'The trail reached the star.' : 'Solution paused.'
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
    start() {
      render(0)
      start()
    },
  }
}

async function load() {
  const unavailable = 'We couldn’t find that maze. Try scanning the QR code again.'
  try {
    if (!idPattern.test(id)) throw new Error(unavailable)
    const response = await fetch(new URL(`data/${id}.json`, root))
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

load()
