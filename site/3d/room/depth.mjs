import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'

export const COLS=38
export const ROWS=32

// WebXR depth is perpendicular to the view plane. Unproject a ray, then
// scale its -Z to the measurement before applying the tracked view transform.
export function depthFrame(view, depth) {
  const projection=Matrix.FromArray(view.projectionMatrix)
  const inverse=Matrix.Invert(projection)
  const world=Matrix.FromArray(view.transform.matrix)
  const viewFromWorld=Matrix.FromArray(view.transform.inverse.matrix)
  const read=(u,v)=>{
    const value=depth.getDepthInMeters(u,v)
    return Number.isFinite(value) && value>.18 && value<8 ? value : 0
  }
  const points = new Array(COLS*ROWS)
  for (let y=0;y<ROWS;y++) {
    for (let x=0;x<COLS;x++) {
      const u=(x+.5)/COLS, v=(y+.5)/ROWS, d=read(u,v)
      if (!d) continue
      const ray=Vector3.TransformCoordinates(new Vector3(u*2-1,1-v*2,-1),inverse)
      ray.scaleInPlace(d/-ray.z)
      points[y*COLS+x]={d,point:Vector3.TransformCoordinates(ray,world)}
    }
  }
  const samples=[]
  for (let y=1;y<ROWS-1;y++) {
    for (let x=1;x<COLS-1;x++) {
      const i=y*COLS+x, center=points[i]
      if (!center) continue
      const sides=[points[i-1],points[i+1],points[i-COLS],points[i+COLS]]
      if (sides.some(point=>!point || Math.abs(point.d-center.d)>.18+center.d*.10)) continue
      const normal=Vector3.Cross(sides[1].point.subtract(sides[0].point),sides[3].point.subtract(sides[2].point))
      if (normal.lengthSquared()<1e-8) continue
      samples.push({pixel:i,point:center.point,normal:normal.normalize()})
    }
  }
  return {samples,measure(point) {
    const camera=new Vector3()
    Vector3.TransformCoordinatesFromFloatsToRef(point.x,point.y,point.z,viewFromWorld,camera)
    if (camera.z>-.21) return null
    const ndc=Vector3.TransformCoordinates(camera,projection)
    if (Math.abs(ndc.x)>.94 || Math.abs(ndc.y)>.94) return null
    const u=(ndc.x+1)*.5, v=(1-ndc.y)*.5
    const values=[read(u,v),read(u+.012,v),read(u-.012,v),read(u,v+.012),read(u,v-.012)].filter(Boolean)
    if (values.length<4) return null
    return {depth:Math.min(...values),expected:-camera.z}
  }}
}
