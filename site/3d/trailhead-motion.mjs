// Distances are maze units. Each adult keeps a small home range beside the entrance.
const profiles = {
  trike: {pace:.48, turn:.48, rest:3.8},
  anky: {pace:.40, turn:.38, rest:4.3},
  stego: {pace:.39, turn:.36, rest:4.6},
  rex: {pace:.67, turn:.64, rest:2.9},
  longneck: {pace:.45, turn:.39, rest:4.1},
}
const angleTo = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a))
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v))

export function trailheadHerd(placements) {
  return placements.map((p,index) => ({
    ...p, homeX:p.x, homeZ:p.z, homeYaw:p.yaw, goal:null, rest:.4+index*1.07,
    tour:index, gait:index*.32, walk:0, pivot:0, gaze:0, clock:index*.93,
  }))
}

function clearOfHerd(actor,x,z,herd) {
  return herd.every(other => other===actor || Math.hypot(x-other.x,z-other.z)>(other.adult?2.2:1.13))
}

function chooseGoal(actor,herd,layout) {
  const phase=actor.tour++*2.39996
  for (const length of [1.85,1.25,.8]) for(let i=0;i<12;i++) {
    const heading=actor.homeYaw+phase+i*Math.PI/6
    const x=actor.homeX+Math.sin(heading)*length, z=actor.homeZ+Math.cos(heading)*length
    if(Math.hypot(x-actor.x,z-actor.z)<.72) continue
    // Check the approach too, so the route cannot cut across a wall on concave mazes.
    let clear=true
    for(let step=1;step<=5 && clear;step++) {
      const xx=actor.x+(x-actor.x)*step/5, zz=actor.z+(z-actor.z)*step/5
      const side=(zz-layout.entrance[1])*layout.approach[0]-(xx-layout.entrance[0])*layout.approach[1]
      clear=Math.abs(side)>2 && clearOfHerd(actor,xx,zz,herd)
      for(let j=0;j<8 && clear;j++) {
        const px=xx+1.03*Math.cos(j*Math.PI/4), pz=zz+1.03*Math.sin(j*Math.PI/4)
        clear=layout.canWalk(px,pz) && layout.cellAt(px,pz)===undefined
      }
    }
    if(clear) return [x,z]
  }
  return null
}

export function advanceTrailhead(herd,layout,player,dt) {
  if(Math.hypot(player.x-layout.spawn[0],player.z-layout.spawn[1])>=18) return
  for(const actor of herd) {
    if(!actor.adult) continue
    const {pace,turn,rest}=profiles[actor.kind]
    actor.clock+=dt
    const dx=player.x-actor.x, dz=player.z-actor.z
    const ahead=dx*Math.sin(actor.yaw)+dz*Math.cos(actor.yaw)
    const across=dx*Math.cos(actor.yaw)-dz*Math.sin(actor.yaw)
    const near=Math.abs(across)<1.35 && ahead>-(actor.kind==='rex'?4.4:3.85) && ahead<2.55
    if(!near && !actor.goal) {
      actor.rest-=dt
      if(actor.rest<=0) {
        actor.goal=chooseGoal(actor,herd,layout)
        actor.rest=rest+.9*Math.sin(actor.tour)
      }
    }
    const scan=.78*Math.sin(actor.clock*.48)+.31*Math.sin(actor.clock*.23+.6)
    const goal=actor.goal
    const desired=goal ? Math.atan2(goal[0]-actor.x,goal[1]-actor.z) : actor.homeYaw+scan
    const error=angleTo(actor.yaw,desired)
    const rotate=near ? 0 : clamp(error*1.55,-turn,turn)
    actor.yaw+=rotate*dt
    let speed=0
    if(goal && !near) {
      const remaining=Math.hypot(goal[0]-actor.x,goal[1]-actor.z)
      speed=pace*clamp((Math.cos(error)-.68)/.32,0,1)*clamp(remaining/.44,0,1)
      const x=actor.x+Math.sin(actor.yaw)*speed*dt, z=actor.z+Math.cos(actor.yaw)*speed*dt
      if(remaining<.085 || !clearOfHerd(actor,x,z,herd) || !layout.canWalk(x,z) || layout.cellAt(x,z)!==undefined) {
        actor.goal=null
        speed=0
      } else {
        actor.x=x
        actor.z=z
      }
    }
    const gaze=near ? angleTo(actor.yaw,Math.atan2(player.x-actor.x,player.z-actor.z)) : error+scan*.42
    actor.gaze+=(clamp(gaze,-1,1)-actor.gaze)*Math.min(1,dt*1.6)
    const turnEffort=rotate/turn
    actor.pivot+=(turnEffort-actor.pivot)*Math.min(1,dt*3)
    const effort=Math.max(speed/pace,Math.abs(turnEffort)*.65)
    actor.walk+=(effort-actor.walk)*Math.min(1,dt*4)
    actor.gait+=dt*(.48+.16*effort)
  }
}
