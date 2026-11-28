import { COLS, ROWS } from './depth.mjs'

// Each depth ray carries the key of the world tile it actually struck. A turn
// into a new room or a foreground surface therefore brings its own evidence.
export class DiscoveryFog {
  constructor(canvas) {
    canvas.width=COLS
    canvas.height=ROWS
    this.ctx=canvas.getContext('2d')
    this.image=this.ctx.createImageData(COLS,ROWS)
    this.confidence=new Float32Array(COLS*ROWS)
    this.reset()
  }

  reset() {
    this.pose=null
    this.confidence.fill(0)
    this.paint(0)
  }

  observe(map,samples,pose,time) {
    this.confidence.fill(0)
    for(const sample of samples) {
      const tile=map.tiles.get(sample.key)
      if(tile) this.confidence[sample.pixel]=tile.confirmed?1:Math.min(.74,tile.seen*.105)
    }
    this.pose=pose.transform
    this.time=time
    this.paint(time)
  }

  outdated(pose,time) {
    if(!this.pose) return false
    const old=this.pose, current=pose.transform
    const a=old.orientation,b=current.orientation
    const dot=Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)
    const p=old.position,q=current.position
    return time-this.time>.55 || dot<.998 || Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)>.12
  }

  paint(time) {
    const data=this.image.data,field=this.confidence
    // Depth normals require neighbours. Extend the nearest measured row over
    // the one-pixel border and feather transitions at unresolved edges.
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) {
      const i=Math.max(1,Math.min(ROWS-2,y))*COLS+Math.max(1,Math.min(COLS-2,x))
      const open=(field[i]*4+field[i-1]+field[i+1]+field[i-COLS]+field[i+COLS])/8
      const cloud=.5+.22*Math.sin(x*.23+y*.17+time*.17)+.17*Math.cos(y*.38-x*.12-time*.10)+.11*Math.sin(x*.42-time*.15)
      const offset=(y*COLS+x)*4
      data[offset]=102+cloud*52
      data[offset+1]=135+cloud*45
      data[offset+2]=127+cloud*42
      data[offset+3]=255*(.76+.14*cloud-.11*y/ROWS)*(1-open)**1.35
    }
    this.ctx.putImageData(this.image,0,0)
  }
}
