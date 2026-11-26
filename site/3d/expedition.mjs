export const effectLimit = 80
export const smokeLimit = 14

export const crystals = {
  gem:   { color: '#a475ff', icon: '◆', label: 'Amethyst', sides: 6 },
  bomb:  { color: '#25203a', icon: '✹', label: 'Bomb', sides: 5 },
  jump:  { color: '#ff59a9', icon: '⇧', label: 'Super jump', sides: 3, duration: 60 },
  path:  { color: '#305aff', icon: '↝', label: 'Path reveal', sides: 4, duration: 60 },
  phase: { color: '#42f5e5', icon: '◫', label: 'Wall phasing', sides: 6, duration: 19 },
  speed: { color: '#ff982e', icon: 'ϟ', label: 'Super speed', sides: 3, duration: 25 },
  find:  { color: '#ffe34d', icon: '◎', label: 'Treasure discovery', sides: 5, duration: 35 },
  pull:  { color: '#f5ffff', icon: '∩', label: 'Crystal magnet', sides: 8, duration: 32 },
}

export function newExpedition(layout) {
  const { centers, openings, passages } = layout.data
  const degree = new Uint16Array(centers.length)
  passages.forEach(([a,b]) => { degree[a]++; degree[b]++ })
  const excluded = new Set(openings.map(([cell]) => cell))
  const start = layout.start
  const spots = centers.map(([x,z], cell) => ({x,z,cell,rank:
    Math.sin((x+centers.length)*93.17+z*176.2)*.8 + (degree[cell] === 1 ? 1.1 : 0)}))
    .filter(({x,z,cell}) => degree[cell] && !excluded.has(cell) && Math.hypot(x-start[0],z-start[1]) > .28)
  const count = Math.min(spots.length, Math.max(11, Math.ceil(spots.length*.16)))
  const first = spots.slice().sort((a,b) => Math.hypot(a.x-start[0],a.z-start[1])-Math.hypot(b.x-start[0],b.z-start[1]))[0]
  const chosen = [first, ...spots.filter(spot => spot !== first).sort((a,b) => b.rank-a.rank)].filter(Boolean).slice(0,count)
  const kinds = ['bomb','gem','jump','path','gem','phase','speed','gem','find','pull']
  const loot = chosen.map(({x,z},id) => ({id,x,z,kind:kinds[id%kinds.length], collected:false}))
  const corner=layout.testCorner()
  const occupied=new Set(chosen.map(({cell})=>cell))
  const route=layout.entranceRoute()
  const entranceExtras=[0,1,2,4,6,8,10,12]
  for (const [i,step] of entranceExtras.entries()) {
    const kind=i%2?'jump':'bomb'
    // Prioritize the entrance corridor, then fill nearby open cells off that route.
    const candidates=[route[step],...route,...spots.map(spot=>spot.cell)]
    const cell=candidates.find(cell=>cell!==undefined && cell!==corner && cell!==openings[1][0] && !occupied.has(cell))
    if(cell===undefined) continue
    occupied.add(cell)
    const [x,z]=centers[cell]
    loot.push({id:loot.length,x,z,kind,collected:false})
  }
  // A few crystals beckon beyond the maze walls, within the cliff enclosure.
  const [left,top,right,bottom] = layout.data.bounds
  for (const [x,z,kind] of [[left-1.4,top-1.2,'gem'],[right+1.5,(top+bottom)/2,'jump'],[left-1.5,bottom+1.2,'bomb']]) {
    loot.push({id:loot.length,x,z,kind,collected:false})
  }
  return { loot, time:0, powers:{}, bombs:0, count:0, marks:[], effects:[], smoke:[], step:0, foot:1, birdAt:2, roarAt:8, armed:true }
}

export function bombBurst(run,x,z) {
  const start=run.time
  function scatter(color,size,speed,life,lift,kind) {
    const angle=Math.random()*Math.PI*2
    const force=speed*(.45+Math.random()*.55)
    run.effects.unshift({x,y:.44+Math.random()*.45,z,start,color,kind,
      size:size*(.55+Math.random()*.6),life:life*(.60+Math.random()*.40),
      dx:Math.cos(angle)*force,dz:Math.sin(angle)*force,dy:lift*(.38+Math.random()*.62)})
  }
  for(let i=0;i<24;i++) scatter(i%2?0x806852:0xb79568,.15,4.45,1.25,4.1,'rubble')
  const colors=[0xffd184,0xffa5f0,0xbb81ff,0x70e7ff,0xfff9dd]
  for(let i=0;i<38;i++) scatter(colors[i%colors.length],.078,5.4,1.15,3.9,'shard')
  run.effects.length=Math.min(effectLimit,run.effects.length)
  for(let i=0;i<smokeLimit;i++){
    const angle=Math.random()*Math.PI*2
    const speed=.20+Math.random()*.52
    run.smoke.unshift({x,z,y:.20+Math.random()*.68,start:start+Math.random()*.30,
      dx:Math.cos(angle)*speed,dz:Math.sin(angle)*speed,dy:.32+Math.random()*.58,
      size:.43+Math.random()*.5,life:1.05+Math.random()*.85,spin:(Math.random()-.5)*1.6})
  }
  run.smoke.length=Math.min(smokeLimit,run.smoke.length)
  run.blastFlash={x,z,start}
}
