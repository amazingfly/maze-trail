// Calibrated synthetic depth frames exercise the same unprojection and fusion
// used in the browser. Run with node scripts/test_room_map.mjs.
import assert from 'node:assert/strict'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { depthFrame } from '../site/3d/room/depth.mjs'
import { RoomMap, tileCenter } from '../site/3d/room/room-map.mjs'

const projection=Matrix.PerspectiveFovRH(1.12,1.20,.03,24)
const inverseProjection=Matrix.Invert(projection)
const roomMap=new RoomMap()
const eye=new Vector3(.5,1.58,.3)
const ceiling=2.55
let doorOpen=false
let backWall=2
const bounds=(v,min,max)=>v>=min-.00001 && v<=max+.00001

function roomDepth(eye,direction) {
  const inverse=Matrix.LookAtRH(eye,eye.add(direction),Vector3.Up())
  const world=Matrix.Invert(inverse)
  const view={projectionMatrix:projection.asArray(),transform:{matrix:world.asArray(),
    inverse:{matrix:inverse.asArray()}}}
  return depthFrame(view,{getDepthInMeters(u,v) {
    const ray=Vector3.TransformCoordinates(new Vector3(u*2-1,1-v*2,-1),inverseProjection)
    ray.scaleInPlace(1/-ray.z)
    const d=Vector3.TransformNormal(ray,world)
    const planes=[
      ['y',0,p=>bounds(p.x,-2,2) && bounds(p.z,-2,doorOpen ? 5 : backWall)],
      ['y',ceiling,p=>bounds(p.x,-2,2) && bounds(p.z,-2,doorOpen ? 5 : backWall)],
      ['x',-2,p=>bounds(p.y,0,ceiling) && bounds(p.z,-2,doorOpen ? 5 : backWall)],
      ['x',2,p=>bounds(p.y,0,ceiling) && bounds(p.z,-2,doorOpen ? 5 : backWall)],
      ['z',-2,p=>bounds(p.x,-2,2) && bounds(p.y,0,ceiling)],
      ['z',backWall,p=>bounds(p.x,-2,2) && bounds(p.y,0,ceiling) &&
        !(doorOpen && Math.abs(p.x)<.55 && p.y<2.1)],
      ['z',5,p=>bounds(p.x,-2,2) && bounds(p.y,0,ceiling)]
    ]
    let depth=20
    for (const [axis,at,valid] of planes) {
      if (Math.abs(d[axis])<1e-6) continue
      const rayDepth=(at-eye[axis])/d[axis]
      if (rayDepth>.18 && rayDepth<depth && valid(eye.add(d.scale(rayDepth)))) depth=rayDepth
    }
    return depth<8?depth:0
  }})
}

function sweep(origin,repeats=4,count=16,map=roomMap) {
  for (let repeat=0;repeat<repeats;repeat++) {
    const from=origin.add(new Vector3((repeat%2)*.10,0,(repeat%3)*.055))
    for (let i=0;i<count;i++) {
      const yaw=i*Math.PI*2/count
      for (const y of [-.85,-.3,.13,.66]) {
        const direction=new Vector3(Math.sin(yaw),y,Math.cos(yaw)).normalize()
        const frame=roomDepth(from,direction)
        map.integrate(from,frame.samples,frame.measure)
      }
    }
  }
}

function countDoor(map,z) {
  return map.confirmed().filter(tile=>{
    const p=tileCenter(tile)
    return tile.kind==='wall' && Math.abs(p.z-z)<.12 && Math.abs(p.x)<.36 && p.y>.45 && p.y<1.8
  }).length
}

const rangeMap=new RoomMap()
rangeMap.integrate(eye,[{point:new Vector3(0,1,19),normal:new Vector3(0,0,1)}],()=>null)
assert.equal(rangeMap.tiles.size,0,'ignore points outside the physical scan radius')

backWall=1.66 // Early frames have the back wall misregistered by 34cm.
sweep(eye)
assert.ok(countDoor(roomMap,1.66)>0,'early estimate should be visible')
backWall=2
sweep(eye,5)
assert.equal(countDoor(roomMap,1.66),0,'deeper evidence should remove the misregistered wall')
assert.ok(countDoor(roomMap,2)>0,'the corrected wall should take its place')
for (let i=0;i<3;i++) roomMap.survey(eye)
console.log('Closed room',roomMap.room.fraction,roomMap.room.floor.count,roomMap.room.roof.count,roomMap.room.cells.size)
assert.ok(roomMap.room.durable,'a repeatedly scanned room should qualify as enclosed')
const closedTarget=roomMap.wallTarget(new Vector3(0,1.45,0),new Vector3(0,0,1))
assert.ok(closedTarget && Math.abs(closedTarget.z-2)<.15,'closed door is targetable')
assert.equal(roomMap.farSide(closedTarget,0),false,'an unseen far side stays unclassified')

const closedSnapshot=roomMap.snapshot()
doorOpen=true
sweep(new Vector3(0,1.55,1.04),6)
assert.equal(countDoor(roomMap,2),0,'open doorway should remove stale closed-door evidence')
assert.ok(roomMap.confirmed().some(tile=>tile.kind==='wall' && Math.abs(tileCenter(tile).z-2)<.12 &&
  Math.abs(tileCenter(tile).x)>.8),'real wall should remain beside the open doorway')
sweep(new Vector3(.2,1.53,3.4),5)
assert.equal(roomMap.farSide(closedTarget,0),true,'walked into adjacent room and identified its floor')
for (let i=0;i<3;i++) roomMap.survey(eye)
assert.ok(roomMap.room.durable,'connected rooms can once again form an enclosure')
console.log('Passed surface correction, enclosure, wall aiming, opening-door clearing, and adjacent-room scan.')

const restored = new RoomMap()
restored.restore(JSON.parse(JSON.stringify(closedSnapshot)),eye)
assert.equal(JSON.stringify(restored.snapshot()),JSON.stringify(closedSnapshot))
const version=restored.changed
const stable=restored.confirmed().find(t=>t.kind==='floor')
const p=tileCenter(stable)
restored.integrate(eye,[{point:{...p,y:p.y+.04},normal:{x:0,y:1,z:0}}],()=>null)
assert.equal(restored.changed,version,'small depth jitter does not invalidate geometry')
assert.equal(stable.plane,p.y)
const doorwayEye=new Vector3(0,1.55,1.04)
sweep(doorwayEye,4,12,restored)
assert.equal(countDoor(restored,2),0,'a restored door updates when it opens')
assert.ok(restored.tiles.has(stable.key),'unaffected geometry was retained')
const {roomOffset}=await import('../site/3d/room/saved-room.mjs')
const offset=roomOffset({x:8,y:2,z:7,yaw:Math.PI/2},{x:2,y:1,z:3,yaw:0})
assert.ok(Vector3.Distance(new Vector3(5,1,9),new Vector3(offset.position.x,offset.position.y,offset.position.z))<1e-6)
console.log('Passed snapshot restore, stable geometry and rotated session alignment.')
