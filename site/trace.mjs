import { passageGraph } from './solver.mjs'

function contains(polygon, x, y) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j]
    const [bx, by] = polygon[i]
    if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside
  }
  return inside
}

export function createTrace(data) {
  const [[start, startPoint], [finish, finishPoint]] = data.openings
  const neighbors = passageGraph(data)
  const regions = data.polygons.flatMap((polygon, cell) => {
    if (!polygon) return []
    const xs = polygon.map(([x]) => x)
    const ys = polygon.map(([, y]) => y)
    return [{ cell, polygon, bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }]
  })
  const cells = [start]
  const points = [startPoint, data.centers[start]]
  const current = () => cells.at(-1)

  function cellAt([x, y]) {
    return regions.find(({ polygon, bounds: [left, top, right, bottom] }) =>
      x >= left && x <= right && y >= top && y <= bottom && contains(polygon, x, y))?.cell
  }

  function move(next) {
    if (current() === finish) return false
    const passage = neighbors[current()].find(([cell]) => cell === next)
    if (!passage) return false

    const previous = cells.lastIndexOf(next)
    if (previous !== -1) {
      cells.length = previous + 1
      points.length = cells.length * 2
    } else {
      cells.push(next)
      points.push(passage[1], data.centers[next])
      if (next === finish) points.push(finishPoint)
    }
    return true
  }

  function moveDirection([dx, dy]) {
    const [x, y] = data.centers[current()]
    let best = null
    let alignment = .4
    for (const [cell, [cx, cy]] of neighbors[current()]) {
      const score = ((cx - x) * dx + (cy - y) * dy) / Math.hypot(cx - x, cy - y)
      if (score > alignment) {
        alignment = score
        best = cell
      }
    }
    return best !== null && move(best)
  }

  return {
    cellAt,
    move,
    moveDirection,
    current,
    get started() { return cells.length > 1 },
    get finished() { return current() === finish },
    points,
    reset() {
      cells.length = 1
      points.length = 2
    },
  }
}
