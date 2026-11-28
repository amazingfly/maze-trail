import { TILE, tileCenter } from './room-map.mjs'

const key=(x,z)=>x+':'+z
const cell=p=>[Math.floor(p.x/TILE),Math.floor(p.z/TILE)]
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n))
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)

// Rebuild a small flow field toward the player each time the room is surveyed.
// A virtual window never connects floor cells across its underlying physical wall.
export function floorRoutes(room,eye) {
  const nodes=new Map(), queue=[]
  for(const t of room.floor.tiles??[]) {
    const k=key(t.u,t.v)
    if(!room.barrier?.has(k) && (!room.sealed || room.cells.has(k))) nodes.set(k,{...tileCenter(t),u:t.u,v:t.v,next:null,steps:Infinity})
  }
  const [u,v]=cell(eye)
  let start=nodes.get(key(u,v))
  if(!start) {
    let nearest=2.4
    for(const node of nodes.values()) {
      const range=dist(node,eye)
      if(range<nearest && clearLine(eye,node,k=>!room.barrier?.has(k))) {start=node;nearest=range}
    }
  }
  if(!start) return new Map()
  start.steps=0
  queue.push(start)
  for(let i=0;i<queue.length;i++) {
    const n=queue[i]
    for(const [du,dv] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const adj=nodes.get(key(n.u+du,n.v+dv))
      if(adj && adj.steps===Infinity) {
        adj.next=n;adj.steps=n.steps+1;queue.push(adj)
      }
    }
  }
  return new Map(queue.map(n=>[key(n.u,n.v),n]))
}

function clearLine(a,b,canPass) {
  const steps=Math.ceil(dist(a,b)/(.40*TILE))
  for(let i=0;i<=steps;i++) {
    const t=steps?i/steps:0
    const k=key(Math.floor((a.x+(b.x-a.x)*t)/TILE),Math.floor((a.z+(b.z-a.z)*t)/TILE))
    if(!canPass(k)) return false
  }
  return true
}

export function autoAim(actors,origin,direction) {
  let best=null, bestScore=-Infinity
  for(const a of actors) {
    if(a.hidden || !a.visible || a.state==='breach') continue
    const dx=a.x-origin.x,dy=a.y+.27-origin.y,dz=a.z-origin.z
    const distance=Math.hypot(dx,dy,dz)
    if(distance>5 || distance<.08) continue
    const dot=(direction.x*dx+direction.y*dy+direction.z*dz)/distance
    if(dot<.84) continue
    const score=dot-.016*distance+(a.state==='lunge'?.023:0)
    if(score>bestScore) {best=a;bestScore=score}
  }
  return best
}

export class Encounters {
  constructor(emit,random=Math.random) { this.emit=emit;this.random=random;this.reset() }
  reset() {
    this.actors=[];this.routes=new Map();this.barrier=new Set();this.edges=[]
    this.time=0;this.nextSpawn=1;this.shotAt=-1;this.hitAt=-10
    this.score=0;this.serial=0;this.enabled=false
  }
  survey(room,eye,walls) {
    this.barrier=room.barrier
    this.routes=floorRoutes(room,eye)
    this.enabled=this.routes.size>=6
    this.edges=walls.filter(t=>t.kind==='wall' && Math.abs(tileCenter(t).y-room.floor.y-.45)<.14)
  }
  node(p) {return this.routes.get(key(...cell(p)))}
  spawn(eye,look) {
    let kind=this.serial%2?'domer':'raptor'
    const choices=[...this.routes.values()].filter(n=>dist(n,eye)>.95 && dist(n,eye)<3.9 &&
      !this.actors.some(a=>dist(a,n)<.72))
    const score=n=>((n.x-eye.x)*look.x+(n.z-eye.z)*look.z)/dist(n,eye)-.34*Math.abs(dist(n,eye)-1.85)
    choices.sort((a,b)=>score(b)-score(a))
    let origin=null, entry=null
    if(kind==='domer') {
      for(const n of choices) {
        const t=this.edges.find(t=>{
          const w=tileCenter(t), d=dist(n,w)
          return d>.15 && d<.51 && Math.abs((n.x-w.x)*t.nz-(n.z-w.z)*t.nx)<.17
        })
        if(t) {origin=n;entry={...tileCenter(t),nx:t.nx,nz:t.nz,key:t.key};break}
      }
      if(!origin) kind='raptor'
    }
    if(!origin) origin=choices[Math.floor(this.random()*Math.min(5,choices.length))]
    if(!origin) return false
    const a={id:++this.serial,kind,x:origin.x,z:origin.z,y:origin.y,floor:origin.y,entry,
      state:entry?'breach':'roam',age:0,duration:entry?1.05:2.1,travel:0,yaw:Math.atan2(eye.x-origin.x,eye.z-origin.z),
      hidden:false,visible:false}
    this.actors.push(a)
    this.emit('spawn',a)
    if(entry) this.emit('crack',a)
    return true
  }
  step(dt,eye,look) {
    if(!this.enabled) return
    dt=clamp(dt,0,.10)
    this.time+=dt
    if(this.time>=this.nextSpawn && this.actors.length<3) this.nextSpawn=this.time+(this.spawn(eye,look)?5.5:.8)
    for(const a of this.actors.slice()) {
      const n=this.node(a)
      if(!n) {this.remove(a);continue}
      const dx=eye.x-a.x,dz=eye.z-a.z,d=Math.hypot(dx,dz)
      const facing=dx*look.x+dz*look.z
      const los=clearLine(a,eye,k=>!this.barrier?.has(k))
      a.blocked=!los
      a.visible=los && facing<.10 && a.inFrame!==false
      a.age+=dt
      const p=Math.min(1,a.age/a.duration)
      const change=(state,duration)=>{a.state=state;a.duration=duration;a.age=0}
      if(a.state==='breach') {
        if(p>=1) {change('stalk',9);this.emit('break',a)}
      } else if(a.state==='roam' || a.state==='stalk') {
        if(a.state==='roam' && p>=1) change('stalk',9)
        const takingTurn=this.actors.some(b=>b!==a && (b.state==='warn' || b.state==='lunge'))
        if(d<1.10 && !takingTurn && a.state==='stalk' && a.visible && !a.hidden && this.time-this.hitAt>2.4) {
          change('warn',.90);this.emit('warn',a)
        } else {
          const neighbors=a.state==='roam'?[[1,0],[-1,0],[0,1],[0,-1]].map(([u,v])=>this.routes.get(key(n.u+u,n.v+v))).filter(Boolean):[]
          if(a.state==='roam' && (!a.wander || dist(a,a.wander)<.07))
            a.wander=neighbors[Math.floor(this.random()*neighbors.length)]
          const to=a.state==='roam'?a.wander:(los && clearLine(a,eye,k=>this.routes.has(k))?eye:n.next)
          if(to && (d>.80 || a.state==='roam')) {
            const x=to.x-a.x,z=to.z-a.z,r=Math.hypot(x,z)
            const travel=Math.min(r,dt*(a.kind==='domer'?.40:.52))
            if(r>.01) {
              const next={x:a.x+x/r*travel,z:a.z+z/r*travel}
              if(this.node(next)) {a.x=next.x;a.z=next.z;a.travel+=travel}
              else if(n.next) {a.wander=n.next}
              a.yaw=Math.atan2(x,z)
            }
          }
        }
      } else if(a.state==='warn') {
        a.yaw=Math.atan2(dx,dz)
        if(p>=1) {
          if(a.visible && !a.hidden && d<1.35) {
            a.takeoff={x:a.x,z:a.z}
            const reach=a.kind==='domer'?.70:.58
            a.land={x:a.x+dx*reach,z:a.z+dz*reach}
            change('lunge',a.kind==='domer'?.65:.53);this.emit('cry',a)
          } else change('rest',1.1)
        }
      } else if(a.state==='lunge') {
        const t=Math.sin(Math.PI*p)
        a.x=a.takeoff.x+(a.land.x-a.takeoff.x)*t
        a.z=a.takeoff.z+(a.land.z-a.takeoff.z)*t
        a.y=a.floor+t*(a.kind==='domer'?.16:clamp(eye.y-a.floor-.49,.28,1.06))
        if(p>=.40 && p<.8 && d<.88 && los && !a.hidden && a.visible && this.time-this.hitAt>2.4) {
          this.hitAt=this.time;this.emit('hit',a)
        }
        if(p>=1) {a.y=a.floor;change('rest',2.6)}
      } else if(p>=1) change('stalk',9)
    }
  }
  remove(a) {this.actors=this.actors.filter(b=>a!==b);this.emit('remove',a)}
  shoot(eye,dir,time=this.time) {
    if(time-this.shotAt<.25) return false
    this.shotAt=time
    const target=this.enabled?autoAim(this.actors,eye,dir):null
    this.emit('shot',target,dir)
    if(target) {this.score++;this.emit('vapor',target);this.remove(target)}
    return true
  }
}
