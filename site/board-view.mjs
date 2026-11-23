const levels = [1, 1.5, 2.25, 3.25, 4.5]

export function setupBoardView(maze, bounds, currentPoint, releaseTrace) {
  const workspace = document.getElementById('workspace')
  const dialog = document.getElementById('expanded-maze')
  const expand = document.getElementById('expand-maze')
  const tools = document.getElementById('zoom-tools')
  const zoomOut = document.getElementById('zoom-out')
  const zoomIn = document.getElementById('zoom-in')
  const hand = document.getElementById('pan-maze')
  const [left, top, width, height] = bounds
  const middle = [left + width / 2, top + height / 2]
  const home = workspace.parentElement
  const next = workspace.nextElementSibling
  let center = [...middle]
  let level = 0
  let pan = false
  let drag = null

  function viewBox() {
    if (!dialog.open) {
      maze.setAttribute('viewBox', bounds.join(' '))
      return
    }
    const viewport = maze.getBoundingClientRect()
    const fit = Math.min(viewport.width / width, viewport.height / height)
    if (fit <= 0) return
    const viewWidth = viewport.width / fit / levels[level]
    const viewHeight = viewport.height / fit / levels[level]
    center = center.map((value, i) => {
      const size = i === 0 ? viewWidth : viewHeight
      const span = i === 0 ? width : height
      const start = i === 0 ? left : top
      return size >= span ? middle[i] : Math.max(start + size / 2, Math.min(start + span - size / 2, value))
    })
    maze.setAttribute('viewBox', [center[0] - viewWidth / 2, center[1] - viewHeight / 2, viewWidth, viewHeight].join(' '))
  }

  const resize = new ResizeObserver(viewBox)

  function releasePan() {
    if (!drag) return
    const id = drag.id
    drag = null
    maze.classList.remove('is-dragging')
    if (maze.hasPointerCapture(id)) maze.releasePointerCapture(id)
  }

  function setPan(enabled) {
    releasePan()
    if (enabled) releaseTrace()
    pan = enabled
    hand.setAttribute('aria-pressed', String(enabled))
    maze.classList.toggle('is-panning', enabled)
  }

  function updateTools(open) {
    tools.hidden = !open
    const label = open ? 'Exit full screen' : 'Full screen'
    expand.setAttribute('aria-label', label)
    expand.title = label
    expand.querySelector('span').textContent = label
    for (const icon of expand.querySelectorAll('[data-view-icon]')) {
      icon.toggleAttribute('hidden', icon.dataset.viewIcon !== (open ? 'collapse' : 'expand'))
    }
    zoomOut.disabled = level === 0
    zoomIn.disabled = level === levels.length - 1
    hand.disabled = level === 0
  }

  function changeZoom(delta) {
    const nextLevel = level + delta
    if (nextLevel < 0 || nextLevel >= levels.length) return
    if (level === 0 && !maze.classList.contains('is-solution')) center = [...currentPoint()]
    level = nextLevel
    if (level === 0) {
      center = [...middle]
      setPan(false)
    }
    updateTools(true)
    viewBox()
  }

  expand.addEventListener('click', () => {
    if (dialog.open) {
      dialog.close()
      return
    }
    releaseTrace()
    dialog.append(workspace)
    updateTools(true)
    dialog.showModal()
    viewBox()
    resize.observe(maze)
    expand.focus({ preventScroll: true })
  })
  dialog.addEventListener('close', () => {
    resize.disconnect()
    level = 0
    center = [...middle]
    setPan(false)
    home.insertBefore(workspace, next)
    updateTools(false)
    viewBox()
    expand.focus({ preventScroll: true })
  })
  zoomIn.addEventListener('click', () => changeZoom(1))
  zoomOut.addEventListener('click', () => changeZoom(-1))
  hand.addEventListener('click', event => {
    setPan(!pan)
    if (pan && event.detail === 0) maze.focus({ preventScroll: true })
  })
  document.getElementById('reset').addEventListener('click', () => {
    if (!dialog.open || level === 0) return
    setPan(false)
    center = [...currentPoint()]
    viewBox()
  })

  maze.addEventListener('pointerdown', event => {
    if (!pan || !event.isPrimary || event.button !== 0) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
    maze.setPointerCapture(event.pointerId)
    maze.classList.add('is-dragging')
  })
  maze.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return
    const transform = maze.getScreenCTM()
    if (!transform) return
    center[0] -= (event.clientX - drag.x) / transform.a
    center[1] -= (event.clientY - drag.y) / transform.d
    drag.x = event.clientX
    drag.y = event.clientY
    viewBox()
  })
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    maze.addEventListener(name, event => {
      if (drag?.id === event.pointerId) releasePan()
    })
  }
  maze.addEventListener('keydown', event => {
    if (!pan) return
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    center[0] += direction[0] * width / levels[level] * .18
    center[1] += direction[1] * height / levels[level] * .18
    viewBox()
  })
}
