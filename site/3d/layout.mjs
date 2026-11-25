import { passageGraph } from '../solver.mjs'

const pointToken = /([ML])(-?[\d.]+),(-?[\d.]+)|(Z)/g
const binKey = (x, z) => `${x},${z}`

export function wallSegments(path) {
  const segments = []
  let first, previous
  for (const [, command, x, z, close] of path.matchAll(pointToken)) {
    const point = close ? first : [Number(x), Number(z)]
    if (command === 'M') first = point
    else if (previous && (previous[0] !== point[0] || previous[1] !== point[1])) {
      segments.push([previous, point])
    }
    previous = point
  }
  return segments
}

function contains(polygon, x, z) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[j]
    const [bx, bz] = polygon[i]
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside
  }
  return inside
}

function segmentDistanceSquared(x, z, { ax, az, dx, dz, lengthSquared }) {
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared))
  return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2
}

function addToBins(bins, item, minX, minZ, maxX, maxZ) {
  for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
    for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
      const key = binKey(x, z)
      if (!bins.has(key)) bins.set(key, [])
      bins.get(key).push(item)
    }
  }
}

export class Layout {
  constructor(data) {
    this.data = data
    this.segments = wallSegments(data.walls)
    this.wallWidth = data.wallWidth
    this.playerRadius = data.corridor * .16
    this.cellBins = new Map()
    this.wallBins = new Map()
    data.polygons.forEach((polygon, i) => {
      if (!polygon) return
      const xs = polygon.map(point => point[0])
      const zs = polygon.map(point => point[1])
      addToBins(this.cellBins, i, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs))
    })

    this.clearance = this.playerRadius + this.wallWidth / 2
    for (const [[ax, az], [bx, bz]] of this.segments) {
      const dx = bx - ax
      const dz = bz - az
      const c = this.clearance
      const wall = { ax, az, dx, dz, lengthSquared: dx * dx + dz * dz }
      addToBins(this.wallBins, wall, Math.min(ax, bx) - c, Math.min(az, bz) - c,
        Math.max(ax, bx) + c, Math.max(az, bz) + c)
    }

    const [[start, , outward], [finish, point]] = data.openings
    this.start = data.centers[start]
    this.startYaw = Math.atan2(-outward[0], -outward[1])
    this.finish = finish
    this.exit = point
    // A single reverse walk supplies short hints from any cell, including dead ends.
    const neighbors = passageGraph(data)
    this.towardExit = new Map([[finish, null]])
    const queue = [finish]
    for (let i = 0; i < queue.length; i++) {
      for (const [next, crossing] of neighbors[queue[i]]) {
        if (this.towardExit.has(next)) continue
        this.towardExit.set(next, [queue[i], crossing])
        queue.push(next)
      }
    }
  }

  cellAt(x, z) {
    const cells = this.cellBins.get(binKey(Math.floor(x), Math.floor(z))) ?? []
    return cells.find(cell => contains(this.data.polygons[cell], x, z))
  }

  canWalk(x, z) {
    const walls = this.wallBins.get(binKey(Math.floor(x), Math.floor(z))) ?? []
    return this.cellAt(x, z) !== undefined &&
      walls.every(wall => segmentDistanceSquared(x, z, wall) >= this.clearance ** 2)
  }

  reachedExit(x, z) {
    return this.cellAt(x, z) === this.finish &&
      Math.hypot(x - this.exit[0], z - this.exit[1]) < this.data.corridor * .27
  }

  hintFrom(cell) {
    if (cell === undefined) return []
    const points = [this.data.centers[cell]]
    for (let step = 0; step < 4 && cell !== this.finish; step++) {
      const next = this.towardExit.get(cell)
      if (!next) return points
      points.push(next[1], this.data.centers[next[0]])
      cell = next[0]
    }
    if (cell === this.finish) points.push(this.exit)
    return points
  }
}
