export const species = {
  trike: { name:'Triceratops', skin:0xd6755d, shadow:0x903f4e, cream:0xffcb94, accent:0xff9e64, iris:0x6fbc97, gait:1.32, voice:248 },
  stego: { name:'Stegosaurus', skin:0x49ab8e, shadow:0x286778, cream:0xe1e89c, accent:0xffba4f, iris:0xf2b553, gait:1.46, voice:310 },
  rex: { name:'T. rex', skin:0x92aa4c, shadow:0x506d3c, cream:0xf1db94, accent:0xe2a052, iris:0xffab41, gait:1.75, voice:177 },
  longneck: { name:'Brachiosaurus', skin:0x59b3c2, shadow:0x4778a9, cream:0xbbf6d9, accent:0xcbd2fa, iris:0xeea774, gait:1.19, voice:385 },
  anky: { name:'Ankylosaurus', skin:0xe1a64f, shadow:0x936254, cream:0xffda98, accent:0x4bafa3, iris:0x75c6b6, gait:1.22, voice:216 },
}


const quietGestures=['sniff','listen','scuff','yawn']
const gestureSeconds={scuff:2.5,yawn:3.25,sniff:2.35,listen:2.8,sit:2.85,scratch:1.8}
export const isQuietGesture=action=>quietGestures.includes(action)

export function gestureDuration(action,adult=false) {
  const seconds=gestureSeconds[action] ?? 1.24
  return seconds*(adult?1.27:1)
}

export function trailheadGesture(time,index,adult) {
  const interval=8.6+index*.38
  const clock=time+index*2.31
  const action=quietGestures[(Math.floor(clock/interval)+index)%quietGestures.length]
  const progress=(clock%interval)/gestureDuration(action,adult)
  return progress<1 ? {action,progress} : {}
}

const kinds = Object.keys(species)
const deltaAngle = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a))

export function findHatchlings(layout,level) {
  const cell=layout.testCorner()
  const [x,z]=layout.data.centers[cell]
  const route=layout.entranceRoute()
  const previous=layout.data.centers[route[Math.max(0,route.indexOf(cell)-1)]]
  return [{
    kind:kinds[(level+2)%kinds.length],x,z,yaw:Math.atan2(previous[0]-x,previous[1]-z),
    walk:0,clock:0,interest:0,slot:-1,following:false,action:'',
    actionAt:0,actionLength:0,nextAction:Infinity,nextCall:4,points:[[x,z]],nextPoint:0,
  }]
}

export function trailheadDinosaurs(layout) {
  const actors=[]
  for(const adult of [true,false]) for(const [index,kind] of kinds.entries()) {
    const side=index%2?1:-1
    const forward=(index<2?4.15:index<4?6.7:8.9)-(adult?0:1.02)
    const flank=adult ? (index<2?2.53:3.2) : 1.30
    const [px,pz]=layout.spawn
    const clear=([x,z])=>{
      const radius=adult?1.10:.15
      if(Math.hypot(x-px,z-pz)<radius+.5) return false
      if(actors.some(actor=>Math.hypot(x-actor.x,z-actor.z)<radius+(actor.adult?1.08:.24)))return false
      for(let i=0;i<8;i++){
        const xx=x+radius*Math.cos(i*Math.PI/4),zz=z+radius*Math.sin(i*Math.PI/4)
        if(!layout.canWalk(xx,zz) || layout.cellAt(xx,zz)!==undefined) return false
      }
      return layout.canWalk(x,z) && layout.cellAt(x,z)===undefined
    }
    const candidates=[]
    for(const depth of [0,.64,1.26,1.9,2.55,3.24,3.9,4.6]) for(const shift of [0,.67,-.40,1.08]) {
      candidates.push(layout.trailheadPoint(forward+depth,side*(flank+shift)))
    }
    for(const depth of [5.4,7,8.8,10.3]) for(const width of [4.25,-4.25,2.25,-2.25]) {
      candidates.push(layout.trailheadPoint(depth,width))
    }
    const [x,z]=candidates.find(clear) ?? candidates.find(point=>layout.canWalk(...point) && layout.cellAt(...point)===undefined)
    actors.push({kind,adult,x,z,yaw:Math.atan2(px-x,pz-z)+side*(adult?.30:-.26)})
  }
  return actors
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
    actor.gestureWeight=1
    actor.action=actor.kind==='rex' ? 'scratch' : 'wag'
    actor.actionAt=time
    actor.actionLength=actor.kind==='rex'?1.65:1.36
  }
  actor.call={start:time,notes}
  audio.hatchlingCall(notes,pan,volume,actor.kind)
  return true
}

export function recruitHatchling(actor,time) {
  if(actor.following) return false
  actor.following=true
  actor.route=[]
  actor.repathAt=time
  actor.nextAction=time+1.5
  return true
}

function visibleToPlayer(actor,player,layout) {
  const dx=actor.x-player.x,dz=actor.z-player.z
  const range=Math.hypot(dx,dz)
  const angle=Math.abs(deltaAngle(player.yaw,Math.atan2(dx,dz)))
  return range>.47 && range<2.35 && angle<.57 && layout.openLine(actor.x,actor.z,player.x,player.z)
}

function formationGoal(actor,others,player,time,layout,slow) {
  const heading=slow ? player.yaw : player.travelYaw ?? player.yaw
  const fx=Math.sin(heading),fz=Math.cos(heading)
  const index=actor.slot===1?1:0
  const sway=.12*Math.sin(time*1.1+index*2.4)
  const ahead=slow ? .95+index*.39 : -.63-index*.36
  const cross=actor.slot*(.53+sway)
  const candidates=slow
    ? [[ahead,cross],[ahead,.23*actor.slot],[ahead,0],[ahead+.43,0],[.61,0],[1.95,0],[.54,cross],[.44,0],[.44,-.23*actor.slot]]
    : [[ahead,cross],[-.29-index*.36,cross],[ahead,.19*actor.slot],[ahead,0],[ahead-.34,0],[-.47,0]]
  let best, bestScore=-Infinity
  for(const [forward,side] of candidates) {
    const x=player.x+fx*forward-fz*side,z=player.z+fz*forward+fx*side
    if(!layout.canWalk(x,z) || !layout.openLine(player.x,player.z,x,z)) continue
    const crowd=others.some(other=>other!==actor && other.following &&
      Math.hypot(x-(other.goal?.[0] ?? other.x),z-(other.goal?.[1] ?? other.z))<.41)
    const score=-(Math.abs(forward-ahead)*.7+Math.abs(side-cross))-(crowd?1.35:0)
    if(score>bestScore) { best=[x,z]; bestScore=score }
  }
  return best ?? player.safe ?? [player.x,player.z]
}

function advance(actor,x,z,dt,speed,layout,player,others) {
  const dx=x-actor.x,dz=z-actor.z,remaining=Math.hypot(dx,dz)
  if(remaining<.045) return 0
  const turn=deltaAngle(actor.yaw,Math.atan2(dx,dz))
  actor.steer=Math.max(-1,Math.min(1,turn*1.2))
  actor.yaw+=turn*Math.min(1,dt*8)
  if(Math.abs(turn)>1.04) return 0
  const step=Math.min(remaining,speed*dt)
  const ux=dx/remaining,uz=dz/remaining
  for(const angle of [0,actor.slot*.57,-actor.slot*.57,actor.slot*1.13,-actor.slot*1.13]) {
    const xx=actor.x+step*(ux*Math.cos(angle)-uz*Math.sin(angle))
    const zz=actor.z+step*(uz*Math.cos(angle)+ux*Math.sin(angle))
    if(!layout.canWalk(xx,zz)) continue
    if(actor.following) {
      const avoids=(px,pz,min)=> {
        const was=Math.hypot(actor.x-px,actor.z-pz)
        return Math.hypot(xx-px,zz-pz) >= Math.min(was+.0002,min)
      }
      if(!avoids(player.x,player.z,.28) || others.some(other=>other!==actor && !avoids(other.x,other.z,.25))) continue
    }
    actor.x=xx; actor.z=zz
    return step/dt
  }
  return 0
}

function chooseSides(actors,player,time,slow) {
  const [first,second]=actors.filter(actor=>actor.following)
  if(!first || !second) return
  const heading=slow ? player.yaw : player.travelYaw ?? player.yaw
  const alongSide=(first.z-second.z)*Math.sin(heading)-(first.x-second.x)*Math.cos(heading)
  if(Math.abs(alongSide)<.35 || Math.sign(alongSide)===first.slot) return
  first.slot=Math.sign(alongSide)
  second.slot=-first.slot
  for(const actor of [first,second]) {
    actor.goal=null
    actor.repathAt=time
  }
}

export function walkHatchlings(actors,player,time,dt,layout,audio) {
  const pace=player.travelSpeed ?? 0
  const slow=pace<1.78
  const stopped=pace<.24
  chooseSides(actors,player,time,slow)
  // Only one companion performs at a time, leaving the others free to catch up.
  let performing=actors.some(actor=>actor.following && actor.action && time-actor.actionAt<actor.actionLength)
  for(const actor of actors) {
    const dx=player.x-actor.x,dz=player.z-actor.z
    const distance=Math.hypot(dx,dz)
    const attention=distance<1.45 || actor.following && slow && distance<2.35
    const inView=actor.following && slow && visibleToPlayer(actor,player,layout)
    const leaving=actor.following && !slow
    if(actor.action && (leaving || actor.gestureWeight<1)) {
      actor.gestureWeight=isQuietGesture(actor.action) ? Math.max(0,(actor.gestureWeight ?? 1)-dt/.26) : 0
    }
    if(time-actor.actionAt>=actor.actionLength || actor.gestureWeight===0) actor.action=''
    if(actor.action!=='yawn' && time>=actor.nextCall && distance<3.4 && (!actor.following || inView)) {
      callHatchling(actor,player,time,audio)
      actor.nextCall=time+7+Math.random()*12
    }
    if(!actor.action && time>=actor.nextAction &&
        (!actor.following && distance<3 || inView && !performing && (stopped || pace<.67 && distance<1.35))) {
      const actions=actor.kind==='rex' ? ['wag','scuff','listen','scratch','yawn','sniff','sit','sneeze'] : ['wag','scuff','listen','yawn','sniff','sit','sneeze']
      const index=actor.following ? (actor.performance ?? 0) % actions.length : Math.floor(Math.random()*actions.length)
      actor.performance=(actor.performance ?? 0)+1
      actor.gestureWeight=1
      actor.action=actions[index]
      actor.actionAt=time
      actor.actionLength=gestureDuration(actor.action)
      actor.nextAction=time+2.9+Math.random()*2.4
      actor.sneezed=false
      if(actor.following) {
        performing=true
        if(actor.action!=='sneeze' && !isQuietGesture(actor.action)) callHatchling(actor,player,time,audio)
      }
    }
    if(actor.action==='sneeze' && !actor.sneezed && time-actor.actionAt>=actor.actionLength*.43) {
      actor.sneezed=true
      if(distance<3) {
        const pan=(Math.sin(player.yaw)*dz-Math.cos(player.yaw)*dx)/Math.max(.1,distance)
        audio.hatchlingSneeze(species[actor.kind].voice,pan,.65/(1+distance*.25))
      }
    }

    let velocity=0
    actor.steer=0
    if(actor.following && (!actor.action || actor.gestureWeight<1)) {
      if(time>=actor.repathAt) {
        const target=formationGoal(actor,actors,player,time,layout,slow)
        if(!actor.goal || Math.hypot(target[0]-actor.goal[0],target[1]-actor.goal[1])>.15 || !actor.route.length) {
          actor.goal=target
          actor.route=layout.companionRoute(actor.x,actor.z,...target)
        }
        actor.repathAt=time+(actor.slot<0?.34:.43)
      }
      while(actor.route.length && Math.hypot(actor.route[0][0]-actor.x,actor.route[0][1]-actor.z)<.075) actor.route.shift()
      if(actor.route.length && (slow || distance>.56)) {
        const speed=Math.min(5.5,.67+pace*.88+Math.max(0,distance-1.0)*.55)
        velocity=advance(actor,...actor.route[0],dt,speed,layout,player,actors)
      }
    } else if(!actor.following && !actor.action && !attention && distance<6) {
      const [x,z]=actor.points[actor.nextPoint]
      if(Math.hypot(x-actor.x,z-actor.z)<.045) actor.nextPoint=(actor.nextPoint+1)%actor.points.length
      else velocity=advance(actor,x,z,dt,.28*(1+.15*Math.sin(time*2.1)),layout,player,actors)
    }
    if(attention && velocity<.04 && distance>.25 && (!actor.following || actor.action || !actor.route.length)) {
      actor.yaw+=deltaAngle(actor.yaw,Math.atan2(dx,dz))*Math.min(1,dt*2.8)
    }
    const stride=Math.min(1.24,velocity/.72)
    actor.walk+=(stride-actor.walk)*Math.min(1,dt*8)
    actor.clock+=dt
    actor.gaitClock=(actor.gaitClock ?? 0)+dt*(.39+Math.min(velocity,2.8)*.74)
    actor.bank=(actor.bank ?? 0)+((actor.steer ?? 0)-(actor.bank ?? 0))*Math.min(1,dt*6)
    const look=attention ? Math.max(-1,Math.min(1,deltaAngle(actor.yaw,Math.atan2(dx,dz)))) : 0
    actor.interest+=(look-actor.interest)*Math.min(1,dt*4)
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
