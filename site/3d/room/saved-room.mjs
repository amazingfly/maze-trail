const storageKey='room-expedition-map-v1'

export function readRoom() {
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey))
    if(saved?.tiles?.length>=24 && saved.tiles.length<=12500 &&
      ['x','y','z','yaw'].every(k=>Number.isFinite(saved.origin?.[k]))) return saved
  } catch {}
  return null
}

export function writeRoom(map,origin) {
  const tiles=map.snapshot()
  if(!origin || tiles.length<24) return null
  try {
    const saved={tiles,origin}
    localStorage.setItem(storageKey,JSON.stringify(saved))
    return saved
  } catch { return null }
}

export function cameraOrigin(transform) {
  const {x,y,z}=transform.position
  const m=transform.matrix
  if(Math.hypot(m[8],m[10])<.25) return null
  return {x,y,z,yaw:Math.atan2(m[8],m[10])}
}

// Offset reference spaces transform coordinates by the inverse of this pose.
export function roomOffset(current,saved) {
  const yaw=current.yaw-saved.yaw
  const c=Math.cos(yaw),s=Math.sin(yaw)
  return {
    position:{x:current.x-c*saved.x-s*saved.z,y:current.y-saved.y,z:current.z+s*saved.x-c*saved.z},
    orientation:{x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)}
  }
}

export function matchesRoom(map,eye,samples) {
  let hits=0
  const surfaces=new Set()
  for(const [i,sample] of samples.entries()) {
    if(i%5!==0) continue
    const tile=map.sampleTile(sample,eye)
    if(!tile?.confirmed) continue
    hits++
    surfaces.add(tile.kind==='wall' ? tile.key.split(':')[1]+':wall' : 'horizontal')
  }
  return hits>=18 && hits>=samples.length*.105 && surfaces.size>=2
}
