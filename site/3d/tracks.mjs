import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { Material } from '@babylonjs/core/Materials/material.js'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import earcut from 'earcut'

export const trackShapes = {
  rex: [[-.035,-.118],[-.060,-.074],[-.079,-.030],[-.142,.034],[-.136,.071],[-.107,.065],
    [-.047,.019],[-.030,.057],[-.018,.145],[.006,.181],[.025,.161],[.029,.061],
    [.048,.022],[.109,.067],[.139,.062],[.142,.035],[.085,-.022],[.061,-.068],[.032,-.120]],
}

export function trackMesh(name, { outline }, scene) {
  const positions=[], colors=[], indices=[]
  for (const [scale,y,shade] of [[1.10,0,1.06],[1,.007,.94],[.74,-.036,.70]]) {
    for (const [x,z] of outline) {
      positions.push(x*scale,y,z*scale)
      colors.push(shade,shade*.95,shade*.85,1)
    }
  }
  const length=outline.length
  for(let ring=0;ring<2;ring++) for(let i=0;i<length;i++){
    const a=ring*length+i, b=ring*length+(i+1)%length
    indices.push(a,b,a+length,b,b+length,a+length)
  }
  for(const i of earcut(outline.flat())) indices.push(2*length+i)
  const normals=[]
  VertexData.ComputeNormals(positions,indices,normals)
  const data=new VertexData()
  Object.assign(data,{positions,colors,indices,normals})
  const mesh=new Mesh(name,scene)
  data.applyToMesh(mesh)
  return mesh
}

export class TrackGround {
  constructor(scene,bounds,floors) {
    this.bounds=bounds
    this.size=Math.max(bounds[2]-bounds[0],bounds[3]-bounds[1])>18 ? 1536 : 1024
    this.texture=new DynamicTexture('track cutouts',this.size,scene,false)
    this.texture.hasAlpha=true
    this.texture.coordinatesIndex=1
    this.texture.wrapU=this.texture.wrapV=0
    this.context=this.texture.getContext()
    for (const floor of floors) {
      floor.computeWorldMatrix(true)
      const positions=floor.getVerticesData(VertexBuffer.PositionKind)
      const uv=[]
      for(let i=0;i<positions.length;i+=3) {
        uv.push(...this.project(positions[i]+floor.position.x,positions[i+2]+floor.position.z))
      }
      floor.setVerticesData(VertexBuffer.UV2Kind,uv)
      floor.material.opacityTexture=this.texture
      floor.material.transparencyMode=Material.MATERIAL_ALPHATEST
      floor.material.alphaCutOff=.5
    }
    this.update([])
  }

  project(x,z) {
    const [left,top,right,bottom]=this.bounds
    return [(x-left)/(right-left),(z-top)/(bottom-top)]
  }

  update(marks) {
    const ctx=this.context
    ctx.globalCompositeOperation='source-over'
    ctx.fillStyle='#fff'
    ctx.fillRect(0,0,this.size,this.size)
    ctx.globalCompositeOperation='destination-out'
    for (const {x,z,yaw,shape='rex'} of marks) {
      const sin=Math.sin(yaw), cos=Math.cos(yaw)
      ctx.beginPath()
      trackShapes[shape].forEach(([u,v],i)=>{
        const [xx,zz]=this.project(x+(u*cos+v*sin)*.96,z+(v*cos-u*sin)*.96)
        if(i) ctx.lineTo(xx*this.size,zz*this.size)
        else ctx.moveTo(xx*this.size,zz*this.size)
      })
      ctx.closePath()
      ctx.fill()
    }
    this.texture.update(false)
  }
}
