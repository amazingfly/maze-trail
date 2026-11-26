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
    this.originalSegments = this.segments
    this.destroyed = new Set()
    this.boundary = data.bounds.map((v,i) => v + (i < 2 ? -3 : 3))
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
    for (const [segment, [[ax, az], [bx, bz]]] of this.segments.entries()) {
      const dx = bx - ax
      const dz = bz - az
      const c = Math.max(this.clearance,.105)
      const wall = { segment, ax, az, dx, dz, lengthSquared: dx * dx + dz * dz }
      addToBins(this.wallBins, wall, Math.min(ax, bx) - c, Math.min(az, bz) - c,
        Math.max(ax, bx) + c, Math.max(az, bz) + c)
    }

    const [[start, entrance, outward], [finish, point]] = data.openings
    this.start = data.centers[start]
    this.entrance = entrance
    // Some entrances sit inside a fold of the maze silhouette. Pick a clear
    // approach instead of running the trail through the next outside wall.
    const mazeBoundary=this.boundary
    this.boundary=[
      Math.min(mazeBoundary[0],entrance[0]-15), Math.min(mazeBoundary[1],entrance[1]-15),
      Math.max(mazeBoundary[2],entrance[0]+15), Math.max(mazeBoundary[3],entrance[1]+15),
    ]
    let approach=outward, distance=2
    search: for(const length of [10.15,9.25,8.15,7.3,6,4.5,3.3]) {
      for(const turn of [0,.13,-.13,.26,-.26,.39,-.39,.51,-.51,.64,-.64]) {
        const sin=Math.sin(turn),cos=Math.cos(turn)
        const direction=[outward[0]*cos-outward[1]*sin,outward[0]*sin+outward[1]*cos]
        const x=entrance[0]+direction[0]*length,z=entrance[1]+direction[1]*length
        if(this.cellAt(x,z)!==undefined || !this.openLine(x,z,...this.start)) continue
        approach=direction
        distance=length
        break search
      }
    }
    this.approach=approach
    this.spawn = this.trailheadPoint(distance,0)
    this.startYaw = Math.atan2(-approach[0],-approach[1])
    this.trail = [[0,-.28],[0,.28],[2,.53],[distance+.35,.77],[distance+1,0],[distance+.35,-.77],[2,-.53]]
      .map(([forward,side])=>this.trailheadPoint(forward,side))
    this.boundary=mazeBoundary
    for (const [forward,side] of [[1,-5.65],[1,5.65],[13.6,-5.65],[13.6,5.65]]) {
      const [x,z]=this.trailheadPoint(forward,side)
      this.boundary[0]=Math.min(this.boundary[0],x)
      this.boundary[1]=Math.min(this.boundary[1],z)
      this.boundary[2]=Math.max(this.boundary[2],x)
      this.boundary[3]=Math.max(this.boundary[3],z)
    }
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

  trailheadPoint(forward,side) {
    const [x,z]=this.entrance
    const [nx,nz]=this.approach
    return [x+nx*forward-nz*side,z+nz*forward+nx*side]
  }

  trailheadContains(x,z) {
    const dx=x-this.entrance[0],dz=z-this.entrance[1]
    const [nx,nz]=this.approach
    const forward=dx*nx+dz*nz
    const side=dz*nx-dx*nz
    return forward>-.3 && forward<13.4 && Math.abs(side)<5.5
  }

  groundAt(x,z) {
    return this.cellAt(x,z)!==undefined || contains(this.trail,x,z) ? 0 : -.045
  }

  entranceRoute() {
    const steps=[this.data.openings[0][0]]
    while(steps.length<20) {
      const next=this.towardExit.get(steps.at(-1))
      if(!next) break
      steps.push(next[0])
    }
    return steps
  }

  testCorner() {
    const route=this.entranceRoute()
    for(const cell of route.slice(1)) {
      if(cell===this.finish) break
      if(!this.openLine(...this.entrance,...this.data.centers[cell])) return cell
    }
    return route[Math.min(2,route.length-1)]
  }

  resetWalls() {
    this.segments = this.originalSegments
    this.destroyed.clear()
    this.navigation = null
  }

  inBounds(x,z) {
    const [left,top,right,bottom] = this.boundary
    return x > left+.19 && z > top+.19 && x < right-.19 && z < bottom-.19
  }

  canWalk(x, z, height = 0, phase = false) {
    if (!this.inBounds(x,z)) return false
    if (phase || height >= 1.26) return true
    const walls = this.wallBins.get(binKey(Math.floor(x), Math.floor(z))) ?? []
    return walls.every(wall => this.destroyed.has(wall.segment) || segmentDistanceSquared(x, z, wall) >= this.clearance ** 2)
  }

  clearSpot(x,z,fallback) {
    for (const radius of [.10,.17,.24,.35]) for(let i=0;i<12;i++) {
      const angle=(i/12)*Math.PI*2
      const dx=Math.cos(angle)*radius, dz=Math.sin(angle)*radius
      if (this.canWalk(x+dx,z+dz)) return [x+dx,z+dz]
    }
    return fallback
  }

  targetWall(x,z,yaw) {
    const dx=Math.sin(yaw), dz=Math.cos(yaw)
    let nearest=null
    for (let d=.07; d<=1.2; d+=.055) {
      const xx=x+dx*d, zz=z+dz*d
      const walls=this.wallBins.get(binKey(Math.floor(xx),Math.floor(zz))) ?? []
      nearest=walls.find(wall => !this.destroyed.has(wall.segment)
        && segmentDistanceSquared(xx,zz,wall) < .095**2)
      if (nearest) return [xx,zz]
    }
    return null
  }

  blast(x,z) {
    const radius=Math.max(.36,this.data.corridor*.52)
    let removed=0
    this.originalSegments.forEach(([[ax,az],[bx,bz]],segment) => {
      if (this.destroyed.has(segment)) return
      if (segmentDistanceSquared(x,z,{ax,az,dx:bx-ax,dz:bz-az,lengthSquared:(bx-ax)**2+(bz-az)**2}) > radius**2) return
      this.destroyed.add(segment)
      removed++
    })
    if (removed) {
      this.segments=this.originalSegments.filter((_,i) => !this.destroyed.has(i))
      this.navigation=null
    }
    return removed
  }

  openLine(x,z,tx,tz) {
    const steps=Math.ceil(Math.hypot(tx-x,tz-z)/.075)
    for(let i=1;i<=steps;i++) {
      const t=i/steps
      if(!this.canWalk(x+(tx-x)*t,z+(tz-z)*t)) return false
    }
    return true
  }

  companionRoute(x,z,tx,tz) {
    if(this.openLine(x,z,tx,tz)) return [[tx,tz]]
    const {route,point,source:first}=this.navigationGrid([tx,tz],[x,z])
    if(first<0 || route[first]<-1) return []
    const points=[]
    for(let at=first;at>=0;at=route[at]) points.push(point(at))
    if(points.length && this.openLine(...points.at(-1),tx,tz)) points.push([tx,tz])
    // Straighten the common stair-step grid route while retaining wall clearance.
    let i=0
    const smoothed=[]
    while(i<points.length) {
      let next=Math.min(i+12,points.length-1)
      const from=smoothed.at(-1) ?? [x,z]
      while(next>i && !this.openLine(...from,...points[next])) next--
      smoothed.push(points[next])
      i=next+1
    }
    return smoothed
  }

  navigationGrid(destination = this.data.centers[this.finish], origin = null) {
    const step=Math.min(.13,this.data.corridor*.22)
    const [left,top,right,bottom]=this.boundary
    const width=Math.floor((right-left)/step), rows=Math.floor((bottom-top)/step)
    const route=new Int32Array(width*rows).fill(-2)
    const point=i=>[left+(i%width)*step,top+Math.floor(i/width)*step]
    const nearest=(x,z)=> {
      const col=Math.round((x-left)/step), row=Math.round((z-top)/step)
      let best=-1, distance=Infinity
      for(let j=row-2;j<=row+2;j++) for(let i=col-2;i<=col+2;i++) {
        if (i<0 || i>=width || j<0 || j>=rows) continue
        const index=j*width+i
        const at=point(index), d=Math.hypot(x-at[0],z-at[1])
        if (d<distance && route[index]!==-3 && this.canWalk(...at) && this.canWalk((x+at[0])/2,(z+at[1])/2)) {
          best=index; distance=d
        }
      }
      return best
    }
    const target=nearest(...destination)
    const source=origin ? nearest(...origin) : -1
    if(target<0) return {route,point,nearest,source}
    route[target]=-1
    const queue=[target]
    for(let i=0;i<queue.length;i++) {
      const parent=queue[i], [x,z]=point(parent)
      if (parent===source) break
      for (const next of [parent-width,parent+width,parent-1,parent+1]) {
        if(route[next]!==-2) continue
        const [xx,zz]=point(next)
        if(Math.abs(xx-x)>step*1.1) continue
        if (!this.canWalk(xx,zz)) { route[next]=-3; continue }
        if (!this.canWalk((x+xx)/2,(z+zz)/2)) continue
        route[next]=parent
        queue.push(next)
      }
    }
    return {route,point,nearest,source}
  }

  pathFrom(x,z) {
    const {route,point,nearest}=this.navigation ??= this.navigationGrid()
    const first=nearest(x,z)
    if(first<0 || route[first]<-1) return []
    const points=[[x,z]]
    let previousDirection
    for(let at=first; at>=0; at=route[at]) {
      const next=route[at], direction=next-at
      if (direction!==previousDirection || next<0) points.push(point(at))
      else points[points.length-1]=point(at)
      previousDirection=direction
    }
    points.push(this.exit)
    return points
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
