export class JungleAudio {
  start() {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext
    if (!AudioContext) return
    if (!this.context) {
      const ctx = this.context = new AudioContext()
      this.music = ctx.createGain()
      this.effects = ctx.createGain()
      this.music.connect(ctx.destination)
      this.effects.connect(ctx.destination)
      this.noise = ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate)
      const data=this.noise.getChannelData(0)
      for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1
      this.loop('drums',this.music,.28,.91)
      this.loop('jungle',this.effects,.23,1)
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
      tone(120,27,.72,.51)
      tone(2100,110,.77,.65,{noise:true})
      tone(600,100,.26,.17,{noise:true,delay:.12})
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
