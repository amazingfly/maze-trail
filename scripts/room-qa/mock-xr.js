(() => {
 const nativeNow=performance.now.bind(performance)
 const start=nativeNow()
 Object.defineProperty(performance,'now',{value:()=>start+(nativeNow()-start)*6})
 const aspect=390/844, f=1/Math.tan(.69), projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,-1.0025,-1,0,0,-.06,0])
 let forced=null, openDoor=false, session, tracking=true, haveDepth=true, depthWidth=1,wallOnly=false
 const reference=new EventTarget()
 reference.getOffsetReferenceSpace=()=>reference
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
 const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l)}
 function fakeFrame() {
   const simulated=performance.now()/(1000)
   const step=Math.floor(simulated/.21)
   const yaw=forced?.yaw ?? (step%48/48)*Math.PI*2
   const pitch=forced?.pitch ?? [-.63,-.20,.11,.57][Math.floor(step/48)%4]
   const pos=forced?.pos ?? [.12*Math.sin(simulated*.22),1.55,.12*Math.cos(simulated*.23)]
   const forward=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)]
   const z=forward.map(v=>-v), x=unit(cross([0,1,0],z)), y=cross(z,x)
   const qYaw=Math.PI+yaw, cp=Math.cos(pitch/2), sp=Math.sin(pitch/2)
   const transform={matrix:Float32Array.of(...x,0,...y,0,...z,0,...pos,1),
    inverse:{matrix:Float32Array.of(x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,pos),-dot(y,pos),-dot(z,pos),1)},
    position:{x:pos[0],y:pos[1],z:pos[2],w:1},
    orientation:{x:Math.cos(qYaw/2)*sp,y:Math.sin(qYaw/2)*cp,z:-Math.sin(qYaw/2)*sp,w:Math.cos(qYaw/2)*cp}}
   const view={eye:'none',projectionMatrix:projection,transform}
   return {session,getViewerPose:()=>({transform,views:[view],emulatedPosition:!tracking}),
    getDepthInformation:()=>!haveDepth?null:({getDepthInMeters(u,v) {
      if(u>depthWidth || (wallOnly && Math.abs(v-.5)>.19)) return 0
      const rx=(u*2-1)*aspect/f, ry=(1-v*2)/f
      const d=forward.map((val,k)=>val+x[k]*rx+y[k]*ry)
      const sides=[[-2,2],[0,2.55],[-2,openDoor?4.7:2]]
      let dist=9
      for (const [axis,values] of sides.entries()) for (const val of values) {
        const hit=(val-pos[axis])/d[axis]
        if (hit>.19&&hit<dist) {
          const point=pos.map((p,i)=>p+hit*d[i])
          if (sides.every(([min,max],i)=>i===axis || point[i]>=min-.00001&&point[i]<=max+.00001)) dist=hit
        }
      }
      if (openDoor && d[2]>0) {
        const hit=(2-pos[2])/d[2], localX=pos[0]+hit*d[0], localY=pos[1]+hit*d[1]
        if (hit>.19&&hit<dist&&(Math.abs(localX)>.55||localY>2.1)) dist=hit
      }
      return dist<8?dist:0
    }})}
 }
 class FakeSession extends EventTarget {
   constructor() { super(); this.visibilityState='visible';this.renderState={};this.domOverlayState={type:'screen'};this.alive=true;this.inputSources=[] }
   requestReferenceSpace=async()=>reference
   updateRenderState=(data)=>Object.assign(this.renderState,data)
   requestAnimationFrame=(callback)=>window.requestAnimationFrame(t=>{if(this.alive) callback(t,fakeFrame())})
   cancelAnimationFrame=(handle)=>window.cancelAnimationFrame(handle)
   async end() {this.alive=false;this.dispatchEvent(new Event('end'))}
 }
 Object.defineProperty(navigator,'xr',{value:{
   isSessionSupported:async mode=>mode==='immersive-ar',
   requestSession:async (mode,options)=>{
     window.requestedFeatures=options.requiredFeatures
     return session=new FakeSession()
   }
 }})
 window.mockRoom={aim:(yaw,pitch=0,pos=[0,1.55,0])=>{forced={yaw,pitch,pos}}, open:()=>{openDoor=true}, scan:()=>{forced=null},
   pause:v=>{tracking=!v}, depth:v=>{haveDepth=v}, width:v=>{depthWidth=v}, wallOnly:v=>{wallOnly=v}, reset:()=>reference.dispatchEvent(new Event('reset'))}
 window.XRWebGLLayer=class {
   constructor(_session,gl) {
     this.framebufferWidth=390;this.framebufferHeight=844
     this.framebuffer=gl.createFramebuffer()
     gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer)
     const texture=gl.createTexture()
     gl.bindTexture(gl.TEXTURE_2D,texture)
     gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,390,844,0,gl.RGBA,gl.UNSIGNED_BYTE,null)
     gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0)
     const depth=gl.createRenderbuffer()
     gl.bindRenderbuffer(gl.RENDERBUFFER,depth)
     gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH24_STENCIL8,390,844)
     gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.RENDERBUFFER,depth)
     window.mockRoom.snapshot=()=>{
       const w=this.framebufferWidth,h=this.framebufferHeight
       const old=gl.getParameter(gl.FRAMEBUFFER_BINDING)
       gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer)
       const pixels=new Uint8Array(w*h*4)
       gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels)
       gl.bindFramebuffer(gl.FRAMEBUFFER,old)
       let mirror=document.getElementById('xr-mirror')
       if(!mirror) {
         mirror=document.createElement('canvas');mirror.id='xr-mirror'
         mirror.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;background:#545b51'
         document.getElementById('ar-ui').before(mirror)
       }
       mirror.width=w;mirror.height=h
       const ctx=mirror.getContext('2d'), img=ctx.createImageData(w,h)
       let colored=0
       for(let y=0;y<h;y++) {
         const row=pixels.subarray((h-y-1)*w*4,(h-y)*w*4)
         img.data.set(row,y*w*4)
         for(let x=3;x<w*4;x+=4) if(row[x]>10) colored++
       }
       ctx.putImageData(img,0,0)
       return colored
     }
     gl.bindFramebuffer(gl.FRAMEBUFFER,null)
   }
   getViewport() {return {x:0,y:0,width:390,height:844}}
 }
})()
