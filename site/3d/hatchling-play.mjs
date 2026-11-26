export const species = {
  trike: { name:'Triceratops', skin:0xbd634c, shadow:0x723645, cream:0xffbd82, accent:0xef945d, iris:0x6fbc97, gait:1.32, voice:248 },
  stego: { name:'Stegosaurus', skin:0x408e7a, shadow:0x24516a, cream:0xd9da8b, accent:0xf5ab47, iris:0xf2b553, gait:1.46, voice:310 },
  rex: { name:'T. rex', skin:0x78903f, shadow:0x3f5938, cream:0xeace8b, accent:0xcd8d49, iris:0xffab41, gait:1.75, voice:177 },
  longneck: { name:'Brachiosaurus', skin:0x499ba9, shadow:0x3e6295, cream:0xacf0d1, accent:0xbcc3ef, iris:0xeea774, gait:1.19, voice:385 },
}


const kinds = Object.keys(species)
const deltaAngle = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a))

export function findHatchlings(layout, level, loot) {
  const { centers, passages, openings }=layout.data
  const start=openings[0][0]
  const finish=openings[1][0]
  const neighbors=centers.map(()=>[])
  for(const [a,b,x,z] of passages) {
    neighbors[a].push([b,x,z])
    neighbors[b].push([a,x,z])
  }
  const depth=new Map([[start,0]])
  const queue=[start]
  for(let i=0;i<queue.length;i++) {
    for(const [cell] of neighbors[queue[i]]) {
      if(depth.has(cell)) continue
      depth.set(cell,depth.get(queue[i])+1)
      queue.push(cell)
    }
  }
  const occupied=new Set(loot.map(({x,z})=>centers.findIndex(([a,b])=>a===x && b===z)))
  const viable=queue.filter(cell=>cell!==start && cell!==finish && !occupied.has(cell))
  const near=viable.find(cell=>depth.get(cell)>=2) ?? viable[0]
  const far=viable.filter(cell=>cell!==near).sort((a,b)=>
    (depth.get(b)+(neighbors[b].length===1?5:0))-(depth.get(a)+(neighbors[a].length===1?5:0)))[0]
  return [near,far].filter(cell=>cell!==undefined).map((cell,index)=>{
    const [x,z]=centers[cell]
    const [other,crossX,crossZ]=neighbors[cell][0]
    const [tx,tz]=centers[other]
    const yaw=Math.atan2(crossX-x,crossZ-z)
    return {
      kind:kinds[(level+index+2)%kinds.length],x,z,yaw,walk:0,clock:0,interest:0,
      action:'',actionAt:0,actionLength:0,nextAction:2+index*2,nextCall:3+index*3,
      points:[[x,z],[(x+crossX)/2,(z+crossZ)/2],[crossX,crossZ],[(tx+crossX)/2,(tz+crossZ)/2],[crossX,crossZ],[(x+crossX)/2,(z+crossZ)/2]],
      nextPoint:1,
    }
  })
}

export function voiceEnvelope(call,time) {
  if (!call) return 0
  return Math.max(0,...call.notes.map(({at,duration})=>{
    const fraction=(time-call.start-at)/duration
    return fraction>0 && fraction<1 ? Math.sin(Math.PI*fraction)**.64 : 0
  }))
}

export function callHatchling(actor,player,time,audio,reply=false) {
  const age=time-(actor.call?.start ?? -10)
  if(age<.96) return false
  const pitch=species[actor.kind].voice*(.94+Math.random()*.13)
  const dx=actor.x-player.x, dz=actor.z-player.z
  const distance=Math.hypot(dx,dz)
  const pan=distance<.01 ? 0 : .78*(Math.sin(player.yaw)*dz-Math.cos(player.yaw)*dx)/distance
  const volume=(reply?.93:.53)/(1+distance*.23)
  const variations=actor.kind==='rex' ? [1,.89] : actor.kind==='longneck' ? [1,1.21,1.04] : [1,1.28]
  const notes=variations.map((value,i)=>({at:i*.175,duration:.14+Math.random()*.082,pitch:pitch*value}))
  const response=Math.atan2(-dx,-dz)
  if(reply) {
    actor.yaw+=deltaAngle(actor.yaw,response)*.42
    actor.action=actor.kind==='rex' ? 'scratch' : 'wag'
    actor.actionAt=time
    actor.actionLength=actor.kind==='rex'?1.65:1.36
  }
  actor.call={start:time,notes}
  audio.hatchlingCall(notes,pan,volume,actor.kind)
  return true
}

export function walkHatchlings(actors,player,time,dt,layout,audio) {
  for(const actor of actors) {
    const dx=player.x-actor.x,dz=player.z-actor.z
    const distance=Math.hypot(dx,dz)
    const attention=distance<1.4
    if(time>=actor.nextCall && distance<3.4) {
      callHatchling(actor,player,time,audio)
      actor.nextCall=time+7+Math.random()*12
    }
    if(actor.action && time-actor.actionAt>=actor.actionLength) actor.action=''
    if(!actor.action && time>=actor.nextAction) {
      const actions=actor.kind==='rex' ? ['sit','wag','sneeze','scratch'] : ['sit','wag','sneeze']
      actor.action=actions[Math.floor(Math.random()*actions.length)]
      actor.actionAt=time
      actor.actionLength=actor.action==='sit'?3.5:actor.action==='scratch'?1.8:1.24
      actor.nextAction=time+5+Math.random()*7
      actor.sneezed=false
    }
    if(actor.action==='sneeze' && !actor.sneezed && time-actor.actionAt>=actor.actionLength*.43) {
      actor.sneezed=true
      if(distance<3) {
        const pan=(Math.sin(player.yaw)*dz-Math.cos(player.yaw)*dx)/Math.max(.1,distance)
        audio.hatchlingSneeze(species[actor.kind].voice,pan,.65/(1+distance*.25))
      }
    }
    let velocity=0
    if(!actor.action && !attention && distance<6) {
      const [x,z]=actor.points[actor.nextPoint]
      const tx=x-actor.x,tz=z-actor.z,remaining=Math.hypot(tx,tz)
      if(remaining<.022) actor.nextPoint=(actor.nextPoint+1)%actor.points.length
      else {
        const turn=deltaAngle(actor.yaw,Math.atan2(tx,tz))
        actor.yaw+=turn*Math.min(1,dt*5.6)
        const speed=.28*(1+.15*Math.sin(time*2.1))
        const step=Math.min(remaining,speed*dt)
        const xx=actor.x+tx/remaining*step,zz=actor.z+tz/remaining*step
        if(Math.abs(turn)<.83 && layout.canWalk(xx,zz)) {
          actor.x=xx
          actor.z=zz
          velocity=.92
        }
      }
    }
    actor.walk+=(velocity-actor.walk)*Math.min(1,dt*8)
    actor.clock+=dt*(.59+.41*actor.walk)
    actor.interest+=( (attention ? Math.max(-1,Math.min(1,deltaAngle(actor.yaw,Math.atan2(dx,dz)))) : 0) - actor.interest)*Math.min(1,dt*4)
  }
}

export function targetHatchling(actors,player,layout,yaw,pitch) {
  const x=Math.sin(yaw)*Math.cos(pitch),z=Math.cos(yaw)*Math.cos(pitch),y=Math.sin(pitch)
  const eye=.65+(player.y ?? 0)
  let best=null, bestDistance=2.5
  for(const actor of actors) {
    for(const [height,radius,forward] of [[.28,.215,0],[actor.kind==='longneck'?.64:.43,.155,.23]]) {
      const dx=actor.x+Math.sin(actor.yaw)*forward-player.x
      const dz=actor.z+Math.cos(actor.yaw)*forward-player.z
      const dy=height-eye
      const along=dx*x+dy*y+dz*z
      if(along<.08 || along>=bestDistance) continue
      if((dx-x*along)**2+(dy-y*along)**2+(dz-z*along)**2>radius**2) continue
      // The conversation ray must have a clear route to the hatchling.
      let clear=true
      for(let d=.12;d<along-.14;d+=.10) {
        if(!layout.canWalk(player.x+x*d,player.z+z*d,eye+y*d)) {
          clear=false
          break
        }
      }
      if(!clear) continue
      best=actor
      bestDistance=along
    }
  }
  return best
}
