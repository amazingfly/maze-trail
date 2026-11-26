import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'

// Fold each leaf along its midrib so sunlight picks out the two faces.
function plant(name, scene) {
  const positions = [], colors = [], indices = []
  function vertex(point, rgb, brightness) {
    positions.push(...point)
    colors.push(...rgb.map(channel => channel * brightness), 1)
    return positions.length / 3 - 1
  }
  function leaf(base, tip, width, ridge, rgb) {
    const middle = base.map((v, k) => v * .55 + tip[k] * .45)
    const a = vertex(base, rgb, .68)
    const b = vertex(middle.map((v,k) => v + width[k]), rgb, .82)
    const c = vertex(middle.map((v,k) => v + ridge[k]), rgb, 1.16)
    const d = vertex(middle.map((v,k) => v - width[k]), rgb, .94)
    const e = vertex(tip, rgb, 1)
    indices.push(a,b,c, a,c,d, b,e,c, c,e,d)
  }
  function hangingLeaf(a, size, side, rgb) {
    // Rounded shoulders and a pointed drip tip frame the brighter central vein.
    const at = (along, across, lift) => [
      a[0]+size*(side*.75*along+.69*across),
      a[1]+size*(-.69*along+side*.75*across),
      a[2]+size*lift,
    ]
    const outline=[[0,0],[-.12,.23],[.05,.41],[.42,.43],[.78,.23],[1.24,0],
      [.79,-.22],[.43,-.40],[.04,-.39],[-.12,-.22]]
    const center=vertex(at(.43,0,.43),rgb,1.06)
    const edge=outline.map(([u,v])=>vertex(at(u,v,.13+.21*u),rgb,v>0?.91:.77))
    for(let i=0;i<edge.length;i++) indices.push(center,edge[i],edge[(i+1)%edge.length])
    const mid=at(.43,0,.45)
    leaf(at(0,0,.15),mid,[size*.025,size*.022,0],[0,0,.001],[.44,.53,.22])
    leaf(mid,at(1.16,0,.37),[size*.018,size*.017,0],[0,0,.001],[.38,.49,.20])
  }
  function finish() {
    const mesh = new Mesh(name, scene)
    const data = new VertexData()
    const normals = []
    VertexData.ComputeNormals(positions, indices, normals)
    Object.assign(data, {positions, colors, indices, normals})
    data.applyToMesh(mesh)
    return mesh
  }
  return {leaf, hangingLeaf, finish}
}

export function fern(name, options, scene) {
  const {leaf, finish} = plant(name, scene)
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.40
    const x = Math.cos(angle), z = Math.sin(angle)
    const length = .64 + .29 * Math.sin(i * 1.73)
    const stem = t => [x*t*length, .85*t - .62*t*t + .11*(i%3)*t, z*t*length]
    const tint = [.19 + .04*(i%4), .48 + .035*(i%4), .16]
    for (let j = 0; j < 7; j++) {
      const t = j / 7
      const a = stem(t), b = stem((j+1)/7)
      leaf(a,b,[-z*.012,0,x*.012],[0,.008,0],[.48,.57,.22])
      const size = (.08 + .17*Math.sin(Math.PI*t)) * (1-.6*t)
      for (const side of [-1,1]) {
        const tip = [b[0]-side*z*size+x*.05, b[1]+.04, b[2]+side*x*size+z*.05]
        leaf(a,tip,[x*size*.25,0,z*size*.25],[0,.018,0],tint)
      }
    }
  }
  return finish()
}

export function creeper(name, options, scene) {
  const {leaf, hangingLeaf, finish} = plant(name, scene)
  for (let stem=0; stem<3; stem++) {
    const len = [.42,.76,.55][stem]
    const point = t => [(stem-1)*.14 + .055*Math.sin(t*6+stem), -len*t, .012+.018*Math.sin(t*3)]
    for (let j=0; j<8; j++) {
      const a=point(j/8), b=point((j+1)/8), side=j%2?1:-1
      leaf(a,b,[.009,0,0],[0,0,.004],[.36,.40,.14])
      const size=.084*(1-j*.07)
      hangingLeaf(a,size,side,[.19+.045*(j%3),.40+.04*(j%3),.13])
    }
  }
  return finish()
}

export function broadleaf(name, options, scene) {
  const {leaf, finish} = plant(name, scene)
  for (let i=0; i<15; i++) {
    const angle=i*2.40, x=Math.cos(angle), z=Math.sin(angle)
    const reach=.38+.21*Math.sin(i*2.2), height=.24+.29*(i%4)/3
    const mid=[x*reach*.48,height,z*reach*.48]
    const tip=[x*reach,height*.61,z*reach]
    const width=[-z*.12,.012,x*.12], ridge=[0,.048,0]
    const tint=[.20+(i%3)*.045,.45+(i%4)*.045,.21]
    leaf([0,0,0],mid,width,ridge,tint)
    leaf(mid,tip,width,ridge,tint)
  }
  return finish()
}
