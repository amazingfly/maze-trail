export class JungleAudio {
  start({ambience=true}={}) {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext
    if (!AudioContext) return
    if (!this.context) {
      const ctx = this.context = new AudioContext()
      this.music = ctx.createGain()
      this.effects = ctx.createGain()
      this.music.connect(ctx.destination)
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -5
      limiter.knee.value = 6
      limiter.ratio.value = 8
      limiter.attack.value = .003
      limiter.release.value = .16
      this.effects.connect(limiter).connect(ctx.destination)
      this.noise = ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate)
      const data=this.noise.getChannelData(0)
      for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1
      if (ambience) {
        this.loop('drums',this.music,.28,.91)
        this.loop('jungle',this.effects,.23,1)
      }
    }
    this.context.resume().catch(() => {})
  }

  async loop(name,channel,volume,rate) {
    const ctx=this.context
    try {
      const response=await fetch(new URL('./audio/'+name+'.ogg',import.meta.url))
      if (!response.ok) return
      const source=ctx.createBufferSource()
      source.buffer=await ctx.decodeAudioData(await response.arrayBuffer())
      source.loop=true
      source.playbackRate.value=rate
      const gain=ctx.createGain()
      gain.gain.value=volume
      source.connect(gain).connect(channel)
      source.start()
    } catch {
      // Synthesized gameplay cues remain available if a loop cannot decode.
    }
  }

  setLevels(music,effects,playing) {
    if (!this.context) return
    const time=this.context.currentTime
    this.music.gain.setTargetAtTime(playing ? music : 0,time,.07)
    this.effects.gain.setTargetAtTime(playing ? effects : 0,time,.045)
  }

  voice({ start, end, time, gain, delay=0, pan=0, type='sine', noise=false, attack=.012 }) {
    const ctx=this.context
    if (!ctx || ctx.state !== 'running') return
    const t=ctx.currentTime+delay
    const envelope=ctx.createGain()
    envelope.gain.setValueAtTime(.0001,t)
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+attack)
    envelope.gain.exponentialRampToValueAtTime(.0001,t+time)
    if (ctx.createStereoPanner) {
      const stereo=ctx.createStereoPanner()
      stereo.pan.value=pan
      envelope.connect(stereo).connect(this.effects)
    } else envelope.connect(this.effects)
    const voice=noise ? ctx.createBufferSource() : ctx.createOscillator()
    if (noise) {
      voice.buffer=this.noise
      const filter=ctx.createBiquadFilter()
      filter.type='lowpass'
      filter.frequency.setValueAtTime(start,t)
      filter.frequency.exponentialRampToValueAtTime(end,t+time)
      voice.connect(filter).connect(envelope)
    } else {
      voice.type=type
      voice.frequency.setValueAtTime(start,t)
      voice.frequency.exponentialRampToValueAtTime(end,t+time)
      voice.connect(envelope)
    }
    voice.start(t, ...(noise ? [Math.random()*.6] : []))
    voice.stop(t+time)
  }

  hatchlingSneeze(pitch,pan,volume) {
    this.voice({start:pitch*1.12,end:pitch*.62,time:.23,gain:.16*volume,type:'triangle',pan})
    this.voice({start:3200,end:540,time:.33,gain:.35*volume,noise:true,pan,attack:.015})
    this.voice({start:pitch*.8,end:pitch*.60,time:.16,gain:.08*volume,type:'sine',pan,delay:.22})
  }

  hatchlingCall(notes,pan,volume,kind) {
    for (const {at,duration,pitch} of notes) {
      const attack=kind==='longneck'?.042:.026
      this.voice({start:pitch*.76,end:pitch*1.25,time:duration,gain:volume*.23,
        delay:at,pan,type:'triangle',attack})
      this.voice({start:pitch*2.2,end:pitch*1.56,time:duration*.91,gain:volume*.083,
        delay:at+.008,pan,type:'sine',attack:.022})
      this.voice({start:pitch*7,end:pitch*2.7,time:duration*.77,gain:volume*.064,
        delay:at+.014,pan,noise:true,attack:.018})
    }
  }

  adultRoar(kind) {
    const voices = {
      rex: [[.02,1.82,66,43],[1.08,.66,44,30]],
      trike: [[.01,.81,119,73],[.79,.90,102,64]],
      stego: [[.02,.63,88,51],[.72,1.02,78,46]],
      anky: [[.02,.63,103,64],[.87,.74,86,53]],
      longneck: [[.02,1.53,126,92],[1.14,.64,98,71]],
    }
    const notes=voices[kind]
    for (const [at,duration,from,to] of notes) {
      const attack=kind==='rex'?.18:.095
      this.voice({start:from,end:to,time:duration,gain:.23,type:'triangle',delay:at,attack})
      this.voice({start:from*.55,end:to*.6,time:duration,gain:.19,delay:at,attack})
      this.voice({start:from*2.12,end:to*1.82,time:duration*.90,gain:.071,type:'sawtooth',delay:at+.035,attack})
      this.voice({start:kind==='rex'?895:1240,end:155,time:duration*.94,gain:.38,noise:true,delay:at+.04,attack})
    }
    return notes.map(([at,duration])=>({at,duration}))
  }

  play(kind,{pan=0,volume=1,distance=0,variant=0}={}) {
    const pitch=.88+Math.random()*.24
    const tone=(start,end,time,gain,more={})=>this.voice({
      start:start*pitch,end:end*pitch,time,gain:gain*volume,pan,...more,
    })
    if (kind==='step' || kind==='land' || kind==='jump') {
      const strong=kind==='land' ? 1.38 : 1
      tone(107,35,.21,.22*strong)
      tone(830,140,.18,.18*strong,{noise:true})
      if(kind==='jump') tone(104,65,.22,.13,{type:'triangle',attack:.035})
    }
    if(kind==='collect') {
      for(const [i,note] of [523,659,784,1047].entries()) tone(note,note*.996,.32,.14,{delay:i*.052,type:'triangle'})
    }
    if(kind==='fuse') tone(920,500,.78,.15,{noise:true})
    if(kind==='blast') {
      tone(123,39,.88,.71,{attack:.009})
      tone(83,46,.54,.32,{type:'triangle',attack:.012})
      tone(5100,230,.43,.69,{noise:true,attack:.006})
      tone(790,115,1.16,.49,{noise:true,delay:.065,attack:.047})
      for(const [i,note] of [1318,1975,2637,1568].entries()) {
        tone(note,note*.86,.39,.075,{delay:.09+i*.081,type:'triangle'})
        tone(1300-i*130,240,.24,.12,{noise:true,delay:.19+i*.11})
      }
    }
    if(kind==='bird') {
      for(let i=0;i<3+variant;i++) tone(1900+variant*450,3100-i*210,.125,.070,{delay:i*.13})
    }
    if(kind==='roar') {
      const f=[73,111,158][variant]
      tone(f*1.6,f,1.5,.22,{type:'sawtooth',attack:.22})
      tone(f*.8,f*.48,1.9,.23,{type:'triangle',attack:.16})
      tone((990+variant*340)/(1+distance*.04),105,1.7,.37,{noise:true,attack:.21})
      if(variant===1) tone(206,73,.59,.12,{type:'triangle',delay:.49})
    }
  }
}
