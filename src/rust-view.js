import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, EdgesGeometry, Float32BufferAttribute,
  Group, LineBasicMaterial, LineDashedMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PointLight, Points, PointsMaterial, Raycaster, TorusGeometry, Vector2, Vector3,
} from 'three';
import { RustMask } from './rust-mask.js';
import { applyMaterialSettings } from './material-settings.js';
import { paletteSwatches } from './palette-library.js';
const noiseGLSL = `
float rhash(vec3 p) { p=fract(p*.3183099+vec3(.1,.2,.3)); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float rnoise(vec3 p) {
 vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(mix(rhash(i),rhash(i+vec3(1,0,0)),f.x),mix(rhash(i+vec3(0,1,0)),rhash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(rhash(i+vec3(0,0,1)),rhash(i+vec3(1,0,1)),f.x),mix(rhash(i+vec3(0,1,1)),rhash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float rfbm(vec3 p) { return .55*rnoise(p)+.28*rnoise(p*2.1)+.12*rnoise(p*4.3)+.05*rnoise(p*9.); }
`;
export function createRustView(scene, simulation) {
  const group = new Group(); group.name = 'Rust removal study'; scene.add(group);
  const mask = new RustMask(simulation.geometry, simulation.settings.rust.initial);
  const materials = {
    panels: new MeshStandardMaterial(), struts: new MeshStandardMaterial(),
    pistons: new MeshStandardMaterial(), joints: new MeshStandardMaterial(),
  };
  const uniforms = { rustMask: { value: mask.texture }, rustColor: { value: new Color('#93431f') },
    rustRough: { value: .95 }, rustMetal: { value: .06 } };
  materials.panels.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vRustUv; varying vec3 vRustPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRustUv=uv; vRustPosition=position;');
    shader.fragmentShader = `varying vec2 vRustUv; varying vec3 vRustPosition;
      uniform sampler2D rustMask; uniform vec3 rustColor; uniform float rustRough; uniform float rustMetal;\n${noiseGLSL}\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float amount=texture2D(rustMask,vRustUv).r;
      float islands=rfbm(vRustPosition*5.5);
      float rust=smoothstep(.12,.64,amount*1.3-(islands-.5)*.95);
      float grain=rnoise(vRustPosition*155.);
      float flakes=rfbm(vRustPosition*31.);
      float crust=smoothstep(.36,.64,rfbm(vRustPosition*3.2+rfbm(vRustPosition*12.)));
      float chips=smoothstep(.38,.6,flakes);
      vec3 oxide=mix(vec3(.022,.012,.007),rustColor*1.35,crust*.65+chips*.35);
      oxide*=mix(.45,1.5,smoothstep(.28,.74,grain));
      float brushed=rnoise(vRustPosition*vec3(1.8,240.,4.));
      diffuseColor.rgb=mix(diffuseColor.rgb*(.86+.2*brushed),oxide*(.82+.25*grain),rust);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,rustRough,rust);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,rustMetal,rust);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      float relief=(flakes*.025+grain*.004)*rust;
      vec3 sx=dFdx(vViewPosition), sy=dFdy(vViewPosition);
      vec3 r1=cross(sy,normal), r2=cross(normal,sx);
      float det=dot(sx,r1);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*r1+dFdy(relief)*r2));
    `);
  };
  materials.panels.customProgramCacheKey = () => 'rust-pbr-v1';
  const cube = new Mesh(simulation.geometry, materials.panels); cube.castShadow = cube.receiveShadow = true; cube.layers.enable(1); group.add(cube);
  const ink = new LineBasicMaterial({ color: '#514735', transparent: true, opacity: .33 });
  const outline = new LineSegments(new EdgesGeometry(simulation.geometry, 24), ink); cube.add(outline);
  const s = simulation.settings.rust.size / 2, y = .012;
  const projected = [];
  for (const x of [-s,s]) for (const z of [-s,s]) projected.push(x,y,z, x,s*2+.015,z);
  for (const z of [-s,s]) projected.push(-s,y,z,s,y,z);
  for (const x of [-s,s]) projected.push(x,y,-s,x,y,s);
  projected.push(-s-1,y,0,s+1,y,0,0,y,-s-1,0,y,s+1);
  const guideGeometry = new BufferGeometry(); guideGeometry.setAttribute('position',new Float32BufferAttribute(projected,3));
  const guideMaterial = new LineDashedMaterial({ color: '#716655', transparent:true, opacity:.28, dashSize:.12,gapSize:.09 });
  const guides = new LineSegments(guideGeometry,guideMaterial); guides.computeLineDistances(); group.add(guides);
  const laserMaterial = new MeshBasicMaterial({ color: new Color(7,1.25,.18), transparent:true, opacity:.8, blending:AdditiveBlending, depthWrite:false });
  const beam = new Mesh(new CylinderGeometry(.018,.026,1,8),laserMaterial); beam.name='Laser core'; group.add(beam);
  const fanPositions=new Float32Array(9*6),fanGeometry=new BufferGeometry();
  fanGeometry.setAttribute('position',new BufferAttribute(fanPositions,3));
  const fanMaterial=new LineBasicMaterial({color:new Color(4,.7,.12),transparent:true,opacity:.4,blending:AdditiveBlending,depthWrite:false});
  const fan=new LineSegments(fanGeometry,fanMaterial);fan.name='Laser scan lines';fan.frustumCulled=false;group.add(fan);
  const ring = new Mesh(new TorusGeometry(1,.014,6,48),laserMaterial); group.add(ring);
  const head = new Group(); group.add(head);
  const barrel = new Mesh(new CylinderGeometry(.12,.15,.65,16), materials.pistons); barrel.position.y=.325; head.add(barrel);
  const collar = new Mesh(new CylinderGeometry(.2,.18,.2,16),materials.joints); collar.position.y=.75; head.add(collar);
  const housing = new Mesh(new CylinderGeometry(.18,.22,.8,6),materials.struts); housing.position.y=1.2; head.add(housing);
  const impactLight = new PointLight('#ff9d37',0,2.5,2); group.add(impactLight);
  const particleCount=260, positions=new Float32Array(particleCount*3), velocities=new Float32Array(particleCount*3), lives=new Float32Array(particleCount);
  const particleGeometry=new BufferGeometry(); particleGeometry.setAttribute('position',new BufferAttribute(positions,3));
  const particleMaterial=new PointsMaterial({ color:new Color(5,1.5,.3), size:.045, transparent:true, opacity:.85, blending:AdditiveBlending, depthWrite:false });
  const streakPositions=new Float32Array(particleCount*6),streakGeometry=new BufferGeometry();
  streakGeometry.setAttribute('position',new BufferAttribute(streakPositions,3));
  const streaks=new LineSegments(streakGeometry,fanMaterial);streaks.frustumCulled=false;group.add(streaks);
  const sparks=new Points(particleGeometry,particleMaterial); sparks.frustumCulled=false; group.add(sparks); let particleCursor=0, emission=0;
  for(let i=0;i<particleCount;i++) positions[i*3+1]=-100;
  let settings=simulation.settings, hit=null, active=false, disposed=false, lastUv=null;
  const caster=new Raycaster(), ndc=new Vector2(), up=new Vector3(0,1,0), normal=new Vector3(), origin=new Vector3(), delta=new Vector3();
  function configure(next,palette) {
    settings=next;
    for(const [key, material] of Object.entries(materials)) {
      applyMaterialSettings(material,settings.materials[key],key);
      material.envMap=scene.environment;
      material.envMapIntensity=settings.materials[key].envMapIntensity*(settings.lighting.environment.enabled?settings.lighting.environment.intensity:0);
      material.envMapRotation.y=settings.lighting.environment.rotation*Math.PI/180;
    }
    uniforms.rustColor.value.copy(materials.struts.color); uniforms.rustRough.value=materials.struts.roughness; uniforms.rustMetal.value=materials.struts.metalness;
    const colors=palette?paletteSwatches(palette):['#514735']; ink.color.set(colors[0]);guideMaterial.color.set(colors[0]);
    outline.visible=settings.shape.construction&&settings.drafting.ink;
    guides.visible=settings.shape.construction&&settings.drafting.guides;
  }
  function pick(clientX,clientY,rect,camera) {
    ndc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    cube.updateWorldMatrix(true,false); caster.setFromCamera(ndc,camera);
    return intersectionHit();
  }
  function intersectionHit() {
    const intersection=caster.intersectObject(cube,false)[0];
    if(!intersection) return null;
    const localPoint=cube.worldToLocal(intersection.point.clone());
    const localNormal=intersection.face.normal.clone();
    // Smooth surface normal at the hit, including the chamfer.
    const a=new Vector3().fromBufferAttribute(cube.geometry.attributes.normal,intersection.face.a), b=new Vector3().fromBufferAttribute(cube.geometry.attributes.normal,intersection.face.b), c=new Vector3().fromBufferAttribute(cube.geometry.attributes.normal,intersection.face.c);
    if(intersection.barycoord) localNormal.copy(a.multiplyScalar(intersection.barycoord.x).addScaledVector(b,intersection.barycoord.y).addScaledVector(c,intersection.barycoord.z)).normalize();
    return { ...intersection,localPoint,localNormal };
  }
  function automaticTarget(seconds) {
    // Aim at the actual Box3D pose; a slow orbital approach scans adjacent faces.
    cube.updateWorldMatrix(true,false);
    const size=settings.rust.size, t=seconds;
    const aim=new Vector3(Math.sin(t*.85)*size*.35,Math.sin(t*.17)*size*.34,0);
    const azimuth=.28+Math.sin(t*.065)*.65;
    const approach=new Vector3(Math.sin(azimuth),.22+.18*Math.sin(t*.11),Math.cos(azimuth)).normalize();
    const start=cube.localToWorld(aim.clone().addScaledVector(approach,size*2));
    const end=cube.localToWorld(aim);
    caster.set(start,end.sub(start).normalize());
    return intersectionHit();
  }
  function setTarget(next,working) {
    if(next && hit && active && working && hit.localNormal.dot(next.localNormal)>.3 && hit.localPoint.distanceTo(next.localPoint)<settings.rust.size*.5)next.previousLocalPoint=hit.localPoint;
    hit=next; active=!!next&&working; if(next)lastUv=next.uv.toArray();
  }
  function update(camera,dt=0,running=false) {
    cube.position.copy(simulation.object.position);cube.quaternion.copy(simulation.object.quaternion); cube.updateMatrixWorld(true);
    if(running&&dt>0)mask.step(dt,settings.rust.growth,active?hit:null,settings.rust.radius,settings.rust.power);
    head.visible=!!hit; beam.visible=ring.visible=fan.visible=active&&running;
    if(hit) {
      normal.copy(hit.localNormal).applyQuaternion(cube.quaternion);
      const tangent=new Vector3().crossVectors(normal,Math.abs(normal.y)>.9?new Vector3(0,0,1):up).normalize();
      origin.copy(hit.point).addScaledVector(normal,1.9).addScaledVector(tangent,.85);
      head.position.copy(origin);head.quaternion.setFromUnitVectors(up,delta.copy(origin).sub(hit.point).normalize());
      for(let i=0;i<9;i++) {
        origin.toArray(fanPositions,i*6);
        hit.point.clone().addScaledVector(normal,.012).addScaledVector(tangent,(i/8-.5)*settings.rust.radius*1.7).toArray(fanPositions,i*6+3);
      }
      fanGeometry.attributes.position.needsUpdate=true;
      delta.copy(origin).sub(hit.point);beam.position.copy(origin).lerp(hit.point,.5);beam.scale.y=delta.length();beam.quaternion.setFromUnitVectors(up,delta.normalize());
      ring.position.copy(hit.point).addScaledVector(normal,.008);ring.quaternion.setFromUnitVectors(new Vector3(0,0,1),normal);ring.scale.setScalar(settings.rust.radius);
      impactLight.position.copy(hit.point).addScaledVector(normal,.12);
    }
    impactLight.intensity=active&&running?1.8:0;
    if(running&&dt>0) {
      emission+=active?dt*420:0;
      while(emission>=1&&hit) {
        const i=particleCursor++%particleCount,k=i*3; emission--;
        const p=hit.point.clone().addScaledVector(normal,.035);p.toArray(positions,k);
        const v=new Vector3((Math.random()-.5)*3.5,Math.random()*2.8,(Math.random()-.5)*3.5).addScaledVector(normal,1.4+Math.random()*2.4);v.toArray(velocities,k);lives[i]=.15+Math.random()*.35;
      }
      for(let i=0;i<particleCount;i++) {
        const k=i*3;lives[i]-=dt;
        if(lives[i]<=0){positions[k+1]=-100;for(let a=0;a<6;a++)streakPositions[i*6+a]=a%3===1?-100:0;continue;}
        velocities[k+1]-=5*dt;for(let axis=0;axis<3;axis++) {
          positions[k+axis]+=velocities[k+axis]*dt;
          streakPositions[i*6+axis]=positions[k+axis];
          streakPositions[i*6+3+axis]=positions[k+axis]-velocities[k+axis]*.035;
        }
      }
      particleGeometry.attributes.position.needsUpdate=true;streakGeometry.attributes.position.needsUpdate=true;
    }
  }
  return { group,cube,mask,materials,configure,update,pick,automaticTarget,setTarget,
    get working(){return active;}, get diagnostics(){return { coverage:mask.coverage, cleaned:mask.cleaned, lastUv, working:active, maskSize:[mask.texture.image.width,mask.texture.image.height] };},
    dispose(){if(disposed)return;disposed=true;scene.remove(group);mask.dispose();outline.geometry.dispose();ink.dispose();guideGeometry.dispose();guideMaterial.dispose();particleGeometry.dispose();particleMaterial.dispose();fanGeometry.dispose();fanMaterial.dispose();streakGeometry.dispose();
      for(const mesh of [beam,ring,barrel,collar,housing])mesh.geometry.dispose();laserMaterial.dispose();Object.values(materials).forEach(m=>m.dispose());}
  };
}
