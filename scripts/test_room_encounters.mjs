import assert from 'node:assert/strict'
import { Encounters, autoAim, spawnChance } from '../site/3d/room/encounters.mjs'

const eye={x:0,y:1.52,z:0}, look={x:0,y:-.45,z:.89}
const tiles=[],cells=new Set(),walls=[]
for(let u=-7;u<=7;u++) for(let v=-7;v<=7;v++) {
  tiles.push({kind:'floor',u,v,plane:0})
  cells.add(u+':'+v)
}
for(let u=-7;u<=7;u++) walls.push({kind:'wall',u,v:1,nx:0,nz:1,plane:2.07,key:'wall:'+u})
const room={durable:true,sealed:true,cells,floor:{tiles,y:0}}
const events=[]
const game=new Encounters((type,a)=>events.push([type,a?.kind,game.time,a?.entry?.surface]),()=>.37)
const run=n=>{for(let i=0;i<n;i++) game.step(1/60,eye,look)}
run(300)
assert.equal(game.actors.length,0)
game.survey(room,eye,walls)
run(750)
for(const cue of ['spawn','crack','break','warn','cry','hit']) assert.ok(events.some(([type])=>type===cue),cue)
const a=game.actors[0]
const dir={x:a.x-eye.x,y:a.y+.27-eye.y,z:a.z-eye.z}
const len=Math.hypot(dir.x,dir.y,dir.z)
for(const k of ['x','y','z']) dir[k]/=len
assert.equal(autoAim([a],eye,dir),a)
game.shoot(eye,dir)
assert.equal(game.score,1)
assert.deepEqual(events.filter(([type])=>type==='spawn').slice(0,2).map(event=>event[3]),['floor','wall'])
assert.equal(game.shoot(eye,dir),false)
assert.ok(game.actors.length<3)
game.reset()
assert.equal(game.actors.length,0)
console.log('Local floor discovery, indoor roam, breach, warning, leap, shield hit and tap-to-vaporize passed.')

const blockedRoom={...room,cells:new Set([...cells].filter(k=>!k.startsWith('2:')))}
game.survey(blockedRoom,eye,walls)
assert.ok(![...game.routes.values()].some(n=>n.u>2),'disconnected floor cannot spawn enemies')
const sample={x:0,y:0,z:1.1,state:'stalk',visible:true}
for(const flags of [{hidden:true},{visible:false},{state:'breach'}])
  assert.equal(autoAim([{...sample,...flags}],eye,look),null)
const times=events.filter(([type])=>type==='hit').map(([, ,t])=>t)
assert.ok(times.every((t,i)=>i===0 || t-times[i-1]>=2.4))
console.log('Separated floors, occluded targets and repeated shield hits checked.')

const {soundPan}=await import('../site/3d/room/encounter-sound.mjs')
assert.ok(soundPan({x:0,z:-1},1,0)>0,'east is right when facing north (-Z)')
assert.ok(soundPan({x:0,z:1},1,0)<0,'east is left after turning around')
assert.equal(soundPan({x:0,z:0},1,0),0)
console.log('Verified stereo placement against two opposite XR camera headings.')

// A room may be enclosed but lack a clear, low wall beside a walkable tile.
game.reset()
game.survey(room,eye,[])
run(1800)
assert.equal(game.actors.length,3,'floor spawns continue when a burrow is unavailable')
assert.ok(game.actors.every(a=>a.entry.surface==='floor'))
assert.ok(game.actors.some(a=>a.kind==='domer'),'both species can use floor burrows')
const fullAge=game.spawnAge
run(120)
assert.equal(game.spawnAge,fullAge,'spawn clock pauses at capacity')
for(const a of game.actors) a.inFrame=false
const before=events.length
run(450)
assert.ok(events.slice(before).every(([type])=>type!=='hit' && type!=='warn'),'offscreen attacks are withheld')
game.survey({...room,durable:false,sealed:false,cells:new Set()},eye,[])
assert.ok(game.enabled,'opening a door preserves play on observed local floor')
game.survey({...room,durable:false,sealed:false,floor:{tiles:[],y:0}},eye,[])
const paused=game.time
run(120)
assert.equal(game.time,paused)
assert.equal(game.shoot(eye,look,99),true,'can fire into the mist without local floor')
assert.equal(events.at(-1)[0],'shot')
assert.equal(events.at(-1)[1],undefined)
console.log('Checked the spawn cap, missing breach sites, offscreen attacks and loss of local floor.')

const distantFloor={tiles:tiles.filter(t=>t.v>=4),y:0}
const divider=new Set(tiles.filter(t=>t.v===2).map(t=>t.u+':'+t.v))
game.survey({sealed:false,floor:distantFloor,barrier:divider},eye,[])
assert.equal(game.enabled,false,'known wall separates the viewer from the only observed floor')
game.survey({sealed:false,floor:distantFloor,barrier:new Set()},eye,[])
assert.equal(game.enabled,true,'a visible floor patch can host dinosaurs before mapping the floor underfoot')

assert.equal(spawnChance(0),0)
assert.ok(spawnChance(4)>.59,'typical gaps are shorter than the previous 5.5 seconds')
assert.ok(spawnChance(20)>spawnChance(5))
assert.equal(spawnChance(60),.99)
assert.equal(spawnChance(65),1)
console.log('Passed spawn probability curve, both burrow surfaces, and capacity timer pause.')
