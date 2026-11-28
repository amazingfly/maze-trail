import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js'
import { pocketDino, skinMaterial } from './pocket-dino.mjs'

const v=(x,y,z)=>new Vector3(x,y,z)
const at=a=>v(a.x,a.y+.27,a.z)
const tau=Math.PI*2

export class EncounterView {
  constructor(scene) {
    this.scene=scene;this.models=new Map();this.fx=[];this.burrows=[]
    this.skin=skinMaterial(scene)
    this.mats={}
    for(const [name,c] of Object.entries({beam:'#42dfcd',core:'#edffff',mint:'#57e6d0',lilac:'#aa83ff',gold:'#ffc15d',rock:'#685c53',dark:'#302a3c',shadow:'#403e36'})) {
      const m=this.mats[name]=new StandardMaterial(name,scene)
      m.diffuseColor=Color3.FromHexString(c)
      if(!['rock','shadow','dark'].includes(name)) {
        m.disableLighting=true;m.emissiveColor=m.diffuseColor
      }
      if(name==='beam') m.alpha=.34
      m.specularColor=Color3.Black()
      if(name==='shadow') {m.alpha=.27;m.disableLighting=true;m.emissiveColor=m.diffuseColor}
    }
  }
  tube(a,b,radius,mat) {
    const diff=b.subtract(a), length=Math.max(.001,diff.length())
    const mesh=CreateCylinder('streak',{height:length,diameter:radius*2,tessellation:7},this.scene)
    mesh.rotationQuaternion=Quaternion.Identity()
    Quaternion.FromUnitVectorsToRef(Vector3.Up(),diff.scale(1/length),mesh.rotationQuaternion)
    mesh.position.copyFrom(a.add(b).scale(.5))
    mesh.material=this.mats[mat]
    return mesh
  }
  ring(position,size,mat) {
    const mesh=CreateTorus('pulse',{diameter:size,thickness:.012,tessellation:30},this.scene)
    mesh.material=this.mats[mat];mesh.position.copyFrom(position)
    return mesh
  }
  effect(mesh,life,velocity=null,gravity=0,expand=false) {
    this.fx.push({mesh,life,age:0,velocity,gravity,expand})
  }
  burst(pos,count,stone=false) {
    for(let i=0;i<count;i++) {
      const az=tau*i/count+Math.random()*.35,r=.28+Math.random()*.72
      const mesh=CreateIcoSphere('fragment',{radius:(stone?.044:.023)*(.65+Math.random()),subdivisions:1,flat:true},this.scene)
      mesh.material=this.mats[stone?(i%4?'rock':'gold'):['mint','lilac','core'][i%3]]
      mesh.position.copyFrom(pos)
      this.effect(mesh,.32+Math.random()*.35,v(Math.cos(az)*r,.26+Math.random()*.77,Math.sin(az)*r),stone?3.3:1.1)
    }
  }
  event(type,a,eye,dir) {
    if(type==='spawn') {
      const model=pocketDino(this.scene,a.kind,this.skin)
      model.shadow=CreateCylinder('ground contact',{diameter:1,height:.004,tessellation:18},this.scene)
      model.shadow.scaling.set(.31,1,.48)
      model.shadow.material=this.mats.shadow
      model.alert=this.ring(v(0,0,0),.48,'gold')
      this.models.set(a.id,model)
    } else if(type==='remove') {
      const m=this.models.get(a.id)
      m?.root.dispose();m?.shadow.dispose();m?.alert.dispose();this.models.delete(a.id)
    } else if(type==='crack') {
      const wall=a.entry
      const side=Math.sign((a.x-wall.x)*wall.nx+(a.z-wall.z)*wall.nz)||1
      const root=new TransformNode('burrow',this.scene)
      root.position.set(wall.x+side*wall.nx*.055,a.floor+.26,wall.z+side*wall.nz*.055)
      root.rotation.y=Math.atan2(side*wall.nx,side*wall.nz)
      const hole=CreateIcoSphere('burrow opening',{radius:1,subdivisions:1},this.scene)
      hole.parent=root;hole.scaling.set(.32,.25,.041);hole.material=this.mats.dark
      for(let i=0;i<9;i++) {
        const angle=tau*i/9, x=Math.cos(angle), y=Math.sin(angle)
        const rock=CreateIcoSphere('burrow rim',{radius:1,subdivisions:1,flat:true},this.scene)
        rock.material=this.mats.rock;rock.parent=root;rock.position.set(.32*x,.25*y,.024)
        rock.scaling.set(.077,.065,.061)
        const line=this.tube(v(.25*x,.19*y,.06),v(.42*x,.33*y,.052),.008,'gold')
        line.parent=root
      }
      this.burrows.push({root,id:a.id,age:0,key:wall.key})
    } else if(type==='break') {
      const origin=v(a.entry.x,a.floor+.29,a.entry.z)
      const inward=v(a.x-origin.x,0,a.z-origin.z).normalize()
      this.burst(origin.add(inward.scale(.13)),15,true)
    } else if(type==='shot') {
      const end=a?at(a):eye.add(dir.scale(2.7))
      const right=Vector3.Cross(dir,Vector3.Up()).normalize()
      const start=eye.add(dir.scale(.28)).add(right.scale(.13)).add(v(0,-.14,0))
      this.effect(this.tube(start,end,.017,'beam'),.15)
      this.effect(this.tube(start,end,.0065,'core'),.16)
    } else if(type==='vapor') {
      const m=this.models.get(a.id)
      if(m) {
        m.shadow.dispose();m.alert.dispose();this.models.delete(a.id)
        for(const piece of m.root.getChildMeshes()) {piece.useVertexColors=false;piece.material=this.mats.core}
        this.fx.push({mesh:m.root,age:0,life:.19,afterimage:true})
      }
      this.burst(at(a),18)
      this.effect(this.ring(at(a),.27,'mint'),.34,null,0,true)
    }
  }
  draw(actors,dt,time,enabled) {
    for(const a of actors) {
      const m=this.models.get(a.id)
      if(!m) continue
      const p=Math.min(1,a.age/a.duration)
      const emerge=a.state==='breach'?Math.max(0,(p-.35)/.65):1
      m.root.setEnabled(enabled && !a.blocked && !a.hidden && emerge>0)
      m.root.position.set(a.x,a.y,a.z)
      if(emerge<1) {
        m.root.position.x=a.entry.x+(a.x-a.entry.x)*emerge
        m.root.position.z=a.entry.z+(a.z-a.entry.z)*emerge
      }
      m.root.scaling.setAll(.48+.52*emerge)
      m.root.rotation.y=a.yaw
      m.pose(time+a.id*.7,a.state,p,a.travel)
      m.shadow.setEnabled(m.root.isEnabled())
      m.shadow.position.set(a.x,a.floor+.025,a.z);m.shadow.rotation.y=a.yaw
      m.alert.setEnabled(m.root.isEnabled() && a.state==='warn')
      m.alert.position.set(a.x,a.floor+.038,a.z);m.alert.scaling.setAll(1.5-p*.52)
    }
    this.fx=this.fx.filter(f=>{
      f.age+=dt
      if(f.age>=f.life) {f.mesh.dispose();return false}
      f.mesh.setEnabled(enabled)
      if(f.velocity) {
        f.velocity.y-=dt*f.gravity
        f.mesh.position.addInPlace(f.velocity.scale(dt))
        f.mesh.rotation.x+=dt*5
      }
      if(f.afterimage) {
        const s=Math.max(.015,1-f.age/f.life)
        f.mesh.scaling.set(s,s*(1+.6*f.age/f.life),s)
        f.mesh.position.y+=dt*.92
      } else if(f.expand) f.mesh.scaling.setAll(1+f.age*3)
      else if(f.velocity) f.mesh.scaling.setAll(1-f.age/f.life)
      return true
    })
    this.burrows=this.burrows.filter(b=>{
      b.age+=dt
      if(b.age>4) {b.root.dispose();return false}
      b.root.setEnabled(enabled)
      b.root.scaling.setAll(Math.max(.02,Math.min(1,.17+b.age*1.2,4-b.age)))
      return true
    })
  }
  clear() {
    for(const [id] of this.models) this.event('remove',{id})
    for(const f of this.fx) f.mesh.dispose()
    for(const b of this.burrows) b.root.dispose()
    this.fx=[];this.burrows=[]
  }
}
