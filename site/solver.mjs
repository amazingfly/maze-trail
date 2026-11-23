// Passage order mirrors MazeGen's tie-breaking for equal shortest paths.
export function passageGraph({ centers, passages }) {
  const neighbors = centers.map(() => [])
  for (const [a, b, x, y] of passages) {
    neighbors[a].push([b, [x, y]])
    neighbors[b].push([a, [x, y]])
  }
  return neighbors
}

export function solveMaze(data) {
  const { centers, openings } = data
  const neighbors = passageGraph(data)
  const [[start, startPoint], [finish, finishPoint]] = openings
  const parents = new Map([[start, null]])
  const queue = [start]
  for (let i = 0; i < queue.length && !parents.has(finish); i++) {
    const cell = queue[i]
    for (const [next, crossing] of neighbors[cell]) {
      if (parents.has(next)) continue
      parents.set(next, [cell, crossing])
      queue.push(next)
    }
  }
  if (!parents.has(finish)) throw new Error('The maze has no route to its finish.')

  const points = [finishPoint, centers[finish]]
  const cells = [finish]
  for (let step = parents.get(finish); step; step = parents.get(step[0])) {
    const [cell, crossing] = step
    points.push(crossing, centers[cell])
    cells.push(cell)
  }
  points.push(startPoint)
  return { cells: cells.reverse(), points: points.reverse() }
}
