import { encounterSound } from '../../site/3d/room/encounter-sound.mjs'
import { JungleAudio } from '../../site/3d/sound.mjs'

export async function renderSounds() {
  const names=['shot','raptorWarn','raptorCry','crack','break','domerWarn','domerCry','hit','vapor']
  const rate=24000,spacing=.88
  const ctx=new OfflineAudioContext(2,Math.ceil(rate*(names.length*spacing+.9)),rate)
  const audio=new JungleAudio()
  audio.context=ctx
  audio.noise=ctx.createBuffer(1,rate*3,rate)
  let seed=123
  const noise=audio.noise.getChannelData(0)
  for(let i=0;i<noise.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise[i]=seed/2147483648-1}
  audio.effects=ctx.createGain();audio.effects.connect(ctx.destination)
  const metrics=[]
  for(const [i,name] of names.entries()) {
    const kind=name.startsWith('domer')?'domer':'raptor'
    const cue=name.endsWith('Warn')?'warn':name.endsWith('Cry')?'cry':name
    audio.voice=opts=>audio.scheduleVoice({...opts,delay:opts.delay+i*spacing+.03})
    encounterSound(audio,cue,kind,i%2?.56:-.56,1,.50)
  }
  const buffer=await ctx.startRendering()
  const l=buffer.getChannelData(0),r=buffer.getChannelData(1)
  for(const [i,name] of names.entries()) {
    let peak=0,sq=0,left=0,right=0,onsets=0
    for(let j=Math.ceil(i*spacing*rate);j<(i+1)*spacing*rate;j++) {
      peak=Math.max(peak,Math.abs(l[j]),Math.abs(r[j]))
      left+=l[j]**2;right+=r[j]**2;sq+=l[j]**2+r[j]**2
      if(Math.abs(l[j])+Math.abs(r[j])>.007) onsets++
    }
    metrics.push({name,peak,rms:Math.sqrt(sq/(spacing*rate*2)),balance:(right-left)/(right+left),audible:onsets/rate})
  }
  const bytes=new Uint8Array(l.length*4),int16=new DataView(bytes.buffer)
  for(let i=0;i<l.length;i++) {
    int16.setInt16(i*4,Math.round(Math.max(-1,Math.min(1,l[i]))*32767),true)
    int16.setInt16(i*4+2,Math.round(Math.max(-1,Math.min(1,r[i]))*32767),true)
  }
  let binary=''
  for(let i=0;i<bytes.length;i+=16384) binary+=String.fromCharCode(...bytes.subarray(i,i+16384))
  return {rate,metrics,pcm:btoa(binary)}
}
