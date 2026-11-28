// Original synthesized cues. Each row is waveform, Hz start/end, duration,
// peak gain, onset and attack time in seconds. Layers share one pitch variation.
const cues={
  shot:[
    ['triangle',1430,260,.18,.27,0,.006],['sine',2390,540,.10,.13,.012,.005],
    ['noise',4900,880,.075,.13,0,.004],['triangle',770,255,.16,.086,.095,.012],['sine',1120,410,.16,.064,.145,.009]],
  vapor:[
    ['noise',3100,630,.32,.22,0,.012],['sine',610,1240,.21,.14,.01,.022],
    ['triangle',980,1690,.26,.09,.082,.024],['sine',1480,2190,.30,.065,.16,.019]],
  crack:[
    ['triangle',175,68,.18,.23,0,.009],['noise',2400,310,.15,.35,0,.007],
    ['noise',1670,450,.17,.25,.24,.009],['triangle',190,82,.14,.16,.48,.008]],
  break:[
    ['noise',2700,190,.40,.43,0,.006],['triangle',155,55,.37,.34,0,.008],
    ['noise',1950,510,.13,.19,.17,.006],['noise',840,230,.16,.16,.29,.008]],
  raptorWarn:[
    ['noise',2130,790,.31,.22,0,.043],['triangle',410,730,.21,.19,.045,.038],
    ['triangle',620,460,.16,.14,.23,.018]],
  raptorCry:[
    ['sawtooth',430,970,.13,.16,0,.033],['triangle',930,335,.33,.24,.108,.021],
    ['sine',1720,720,.25,.095,.13,.032],['triangle',650,365,.18,.12,.27,.019],['noise',3200,940,.31,.15,.09,.031]],
  domerWarn:[
    ['triangle',167,101,.24,.31,0,.033],['noise',1210,410,.21,.28,.05,.026],
    ['triangle',207,123,.19,.21,.33,.019]],
  domerCry:[
    ['triangle',248,426,.17,.28,0,.028],['sawtooth',384,120,.32,.14,.14,.028],
    ['sine',553,230,.31,.14,.12,.024],['triangle',193,120,.18,.13,.30,.025],['noise',1910,410,.36,.23,.08,.036]],
  hit:[
    ['sine',310,140,.23,.27,0,.012],['triangle',620,275,.22,.13,.018,.013],
    ['noise',1600,350,.15,.16,0,.010]]
}
export function encounterSound(audio,type,kind,pan=0,distance=1,variation=Math.random()) {
  const name=type==='warn'||type==='cry'?kind+(type==='warn'?'Warn':'Cry'):type
  const layers=cues[name]
  if(!layers) return
  const pitch=.93+variation*.14, gain=1/(1+.21*Math.max(0,distance-.6))
  for(const [wave,from,to,time,level,delay,attack] of layers)
    audio.voice({start:from*pitch,end:to*pitch,time,gain:level*gain,delay,attack,pan,
      type:wave==='noise'?'sine':wave,noise:wave==='noise'})
}

export function soundPan(look,dx,dz) {
  const scale=Math.hypot(look.x,look.z)*Math.hypot(dx,dz)
  return scale<.001?0:Math.max(-.88,Math.min(.88,(dz*look.x-dx*look.z)/scale))
}
