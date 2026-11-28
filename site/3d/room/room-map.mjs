// Distances are in meters in the XR reference space.
export const TILE = .26
const VOXEL = .05
const PLANE_STEP = .19
const RADIUS = 12
const MAX_TILES = 12500
const WALL_ANGLES = 8
const cell = (value, size = TILE) => Math.floor(value / size)
const key2 = (x, z) => x + ':' + z
const distance = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z)
const copy = ({x,y,z}) => ({x,y,z})
const quantize = value => Math.round(value / VOXEL) * VOXEL

export function surfaceSample(point, normal, eye) {
  const x = quantize(point.x), y = quantize(point.y), z = quantize(point.z)
  if (Math.abs(normal.y) >= .84 && Math.abs(y-eye.y) > .32) {
    const kind = y < eye.y ? 'floor' : 'ceiling'
    const u = cell(x), v = cell(z)
    return { kind, key: [kind,u,v,Math.round(y/PLANE_STEP)].join(':'), u, v, plane:y }
  }
  if (Math.abs(normal.y) > .30) return null
  const angle = Math.round(Math.atan2(normal.x, normal.z) * WALL_ANGLES / Math.PI)
  const axis = (angle % WALL_ANGLES + WALL_ANGLES) % WALL_ANGLES
  const yaw = axis * Math.PI / WALL_ANGLES
  const nx = Math.sin(yaw), nz = Math.cos(yaw)
  const u = cell(x*nz-z*nx), v = cell(y), plane = x*nx+z*nz
  return { kind:'wall', key: ['wall',axis,u,v,Math.round(plane/PLANE_STEP)].join(':'), u, v, nx, nz, plane }
}

export function tileCenter(tile) {
  const u = (tile.u+.5)*TILE, v = (tile.v+.5)*TILE
  if (tile.kind !== 'wall') return {x:u,y:tile.plane,z:v}
  return {x:u*tile.nz+tile.plane*tile.nx,y:v,z:-u*tile.nx+tile.plane*tile.nz}
}

export class RoomMap {
  tiles = new Map()
  firstEye = null
  changed = 0
  scan = 0
  room = null
  enclosedScans = 0

  integrate(eye, samples, measure) {
    this.firstEye ??= copy(eye)
    this.scan++
    const hits = new Map()
    for (const {point,normal} of samples) {
      if (distance(point,this.firstEye)>RADIUS) continue
      const surface = surfaceSample(point,normal,eye)
      if (!surface) continue
      const hit = hits.get(surface.key)
      if (hit) {
        hit.sum += surface.plane
        hit.count++
      } else hits.set(surface.key,{surface,sum:surface.plane,count:1})
    }
    for (const [key,{surface,sum,count}] of hits) {
      let tile = this.tiles.get(key)
      if (!tile) {
        if (this.tiles.size >= MAX_TILES) continue
        tile = {...surface,seen:0,misses:0,confirmed:false,from:copy(eye),last:this.scan}
        this.tiles.set(key,tile)
      }
      const previous = tile.plane
      tile.plane += (sum/count-tile.plane) * (tile.seen ? .26 : 1)
      tile.seen++
      tile.last=this.scan
      tile.misses=0
      const verified = tile.seen>=4 && (distance(tile.from,eye)>.075 || tile.seen>=9)
      if (verified && !tile.confirmed) {
        tile.confirmed=true
        this.changed++
      } else if (tile.confirmed && Math.abs(previous-tile.plane)>.008) this.changed++
    }
    for (const [key,tile] of this.tiles) {
      if (hits.has(key)) continue
      if (!tile.confirmed && this.scan-tile.last>55) {
        this.tiles.delete(key)
        continue
      }
      const point = tileCenter(tile)
      const range = distance(eye,point)
      if (range<.23 || range>6.5) continue
      const face = tile.kind==='wall' ? Math.abs((eye.x-point.x)*tile.nx+(eye.z-point.z)*tile.nz) :
        Math.abs(eye.y-point.y)
      if (face/range < .34) continue
      // Only depth clearly behind a surface contradicts it. Furniture or a
      // person in front of it supplies no evidence that it went away.
      const observed = measure(point)
      if (!observed) continue
      const {depth,expected} = observed
      if (depth > expected+Math.max(.26,expected*.065)) {
        tile.misses++
        if (tile.misses>=4) {
          this.tiles.delete(key)
          if (tile.confirmed) this.changed++
        }
      } else if (Math.abs(depth-expected)<.13) tile.misses=0
    }
  }

  confirmed() {
    return [...this.tiles.values()].filter(tile => tile.confirmed)
  }

  survey(eye, tiles = this.confirmed()) {
    const band = (kind,min,max) => {
      const bands = new Map()
      for (const tile of tiles) {
        if (tile.kind!==kind || tile.plane<eye.y+min || tile.plane>eye.y+max) continue
        const center = tileCenter(tile)
        if (Math.hypot(center.x-eye.x,center.z-eye.z)>4.6) continue
        const band = Math.round(tile.plane/.22)
        const pile = bands.get(band) ?? []
        pile.push(tile)
        bands.set(band,pile)
      }
      const largest = [...bands.values()].sort((a,b)=>b.length-a.length)[0] ?? []
      return {count:largest.length,y:largest.reduce((sum,t)=>sum+t.plane,0)/largest.length,tiles:largest}
    }
    const floor=band('floor',-2.35,-.56), roof=band('ceiling',.26,3.1)
    const result = {floor,roof,sealed:false,durable:false,cells:new Set(),fraction:0}
    this.room = result
    if (floor.count<12 || roof.count<12 || roof.y-floor.y<1.7) {
      this.enclosedScans=0
      result.fraction=Math.min(1,floor.count/12)*.24+Math.min(1,roof.count/12)*.24
      return result
    }
    const occupied = new Map()
    for (const wall of tiles) {
      if (wall.kind!=='wall') continue
      const center=tileCenter(wall)
      if (center.y<floor.y+.42 || center.y>Math.min(roof.y-.20,floor.y+1.94)) continue
      for (const offset of [-.145,0,.145]) {
        for (const depth of [-.045,.045]) {
          const key=key2(cell(center.x+wall.nz*offset+wall.nx*depth),cell(center.z-wall.nx*offset+wall.nz*depth))
          if (!occupied.has(key)) occupied.set(key,new Set())
          occupied.get(key).add(wall.v)
        }
      }
    }
    const barrier = new Set([...occupied].filter(([,heights])=>heights.size>=2).map(([key])=>key))
    const sx=cell(eye.x), sz=cell(eye.z), pending=[[sx,sz]]
    result.cells.add(key2(sx,sz))
    let escaped=false
    for (let i=0;i<pending.length;i++) {
      const [x,z]=pending[i]
      if (Math.abs(x-sx)>29 || Math.abs(z-sz)>29) { escaped=true; break }
      for (const [nx,nz] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]) {
        const key=key2(nx,nz)
        if (!barrier.has(key) && !result.cells.has(key)) {
          result.cells.add(key)
          pending.push([nx,nz])
        }
      }
    }
    const floorCells = new Set(floor.tiles.map(t=>key2(t.u,t.v)))
    const roofCells = new Set(roof.tiles.map(t=>key2(t.u,t.v)))
    const footprint = pending.length
    const floorCoverage = pending.filter(([x,z])=>floorCells.has(key2(x,z))).length/footprint
    const roofCoverage = pending.filter(([x,z])=>roofCells.has(key2(x,z))).length/footprint
    result.sealed = !escaped && !barrier.has(key2(sx,sz)) && footprint>=18 &&
      floorCoverage>=.18 && roofCoverage>=.12
    this.enclosedScans=result.sealed ? this.enclosedScans+1 : 0
    result.durable=this.enclosedScans>=3
    result.fraction=result.durable ? 1 : result.sealed ? .86 : Math.min(.79,.48+barrier.size/310)
    if (escaped) result.cells.clear()
    return result
  }

  wallTarget(eye,direction,tiles=this.confirmed()) {
    let nearest=null
    for (const tile of tiles) {
      if (tile.kind!=='wall') continue
      const incidence=direction.x*tile.nx+direction.z*tile.nz
      if (Math.abs(incidence)<.20) continue
      const distance=(tile.plane-eye.x*tile.nx-eye.z*tile.nz)/incidence
      if (distance<.68 || distance>4.8 || (nearest && distance>=nearest.distance)) continue
      const x=eye.x+direction.x*distance, y=eye.y+direction.y*distance, z=eye.z+direction.z*distance
      const u=x*tile.nz-z*tile.nx
      if (Math.abs(u-(tile.u+.5)*TILE)<TILE*.53 && Math.abs(y-(tile.v+.5)*TILE)<TILE*.53) {
        const sign=Math.sign(incidence)
        nearest={tile,u,x,y,z,distance,nx:sign*tile.nx,nz:sign*tile.nz}
      }
    }
    return nearest
  }

  farSide(target,floorY,tiles=this.confirmed()) {
    return tiles.some(t=>{
      if (t.kind!=='floor' || Math.abs(t.plane-floorY)>.48) return false
      const p=tileCenter(t), x=p.x-target.x, z=p.z-target.z
      const behind=x*target.nx+z*target.nz
      return behind>.48 && behind<3.6 && Math.abs(x*target.nz-z*target.nx)<.83
    })
  }
}

export function tileInAperture(tile, aperture) {
  if (tile.kind!=='wall') return false
  const point=tileCenter(tile), x=point.x-aperture.x, z=point.z-aperture.z
  return Math.abs(x*aperture.nx+z*aperture.nz)<.28 &&
    Math.abs(x*aperture.nz-z*aperture.nx)<aperture.width/2 &&
    point.y>=aperture.bottom && point.y<=aperture.top
}
