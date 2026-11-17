import {
  AdditiveBlending, DoubleSide, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute,
  Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PointLight, Points, PointsMaterial, Quaternion, SkinnedMesh, Raycaster, TorusGeometry, Vector2, Vector3,
} from 'three';
import { createLaserStands } from './laser-stands.js';
import { RustMask } from './rust-mask.js';
import { applyMaterialSettings } from './material-settings.js';
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
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRustUv=uv; vRustPosition=position/10.0;');
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
  const cube = new SkinnedMesh(simulation.geometry, materials.panels);cube.name='Skinned rectangular tube';
  cube.position.copy(simulation.object.position);group.add(cube);simulation.bind(cube);cube.frustumCulled=false; cube.castShadow = cube.receiveShadow = true; cube.layers.enable(1);
  const pickGeometry=simulation.geometry.clone(),pickMaterial=new MeshBasicMaterial();
  const pickMesh=new Mesh(pickGeometry,pickMaterial);let bakedRevision=-1;
  function updateSkin() {
    cube.updateMatrixWorld(true);
    if(bakedRevision!==simulation.revision) {
      const p=pickGeometry.attributes.position,point=new Vector3();
      for(let i=0;i<p.count;i++){cube.getVertexPosition(i,point);p.setXYZ(i,point.x,point.y,point.z);}
      p.needsUpdate=true;pickGeometry.computeBoundingBox();pickGeometry.computeBoundingSphere();
      cube.boundingBox=pickGeometry.boundingBox.clone();cube.boundingSphere=pickGeometry.boundingSphere.clone();
      bakedRevision=simulation.revision;
    }
    pickMesh.position.copy(cube.position);pickMesh.quaternion.copy(cube.quaternion);pickMesh.updateMatrixWorld(true);
  }
  const laserMaterial = new MeshBasicMaterial({ color: new Color(7,1.25,.18), transparent:true, opacity:.8, blending:AdditiveBlending, depthWrite:false });
  const beam = new Mesh(new CylinderGeometry(.018,.026,1,8),laserMaterial); beam.name='Laser core'; group.add(beam);
  const FAN_RAYS=25;
  const fanPositions=new Float32Array(FAN_RAYS*6),fanGeometry=new BufferGeometry();
  fanGeometry.setAttribute('position',new BufferAttribute(fanPositions,3));
  const fanColors=new Float32Array(FAN_RAYS*6);fanGeometry.setAttribute('color',new BufferAttribute(fanColors,3));
  const fanMaterial=new LineBasicMaterial({vertexColors:true,color:new Color(4,.7,.12),transparent:true,opacity:.4,blending:AdditiveBlending,depthWrite:false});
  const sheetGeometry=new BufferGeometry(),sheetPositions=new Float32Array((FAN_RAYS-1)*9);
  sheetGeometry.setAttribute('position',new BufferAttribute(sheetPositions,3));
  const sheetMaterial=new MeshBasicMaterial({color:new Color(3,.45,.06),transparent:true,opacity:.075,side:DoubleSide,blending:AdditiveBlending,depthWrite:false});
  const sheet=new Mesh(sheetGeometry,sheetMaterial);sheet.name='Flat laser fan';sheet.frustumCulled=false;group.add(sheet);
  const fan=new LineSegments(fanGeometry,fanMaterial);fan.name='Laser scan lines';fan.frustumCulled=false;group.add(fan);
  const ring = new Mesh(new TorusGeometry(1,.014,6,48),laserMaterial); group.add(ring);
  const stands=createLaserStands(scene,simulation.length,simulation.scale,materials);
  const aiming=new Map(stands.stations.map(station=>[station,{initialized:false,fanTangent:null}]));
  const targetOrientation=new Quaternion();
  const particleCount=192, positions=new Float32Array(particleCount*3), velocities=new Float32Array(particleCount*3), lives=new Float32Array(particleCount),ages=new Float32Array(particleCount),sparkColors=new Float32Array(particleCount*3);
  const particleGeometry=new BufferGeometry(); particleGeometry.setAttribute('position',new BufferAttribute(positions,3));particleGeometry.setAttribute('color',new BufferAttribute(sparkColors,3));
  const particleMaterial=new PointsMaterial({ vertexColors:true,color:0xffffff, size:.035, transparent:true, opacity:.85, blending:AdditiveBlending, depthWrite:false });
  const streakPositions=new Float32Array(particleCount*6),streakGeometry=new BufferGeometry();
  streakGeometry.setAttribute('position',new BufferAttribute(streakPositions,3));
  const streaks=new LineSegments(streakGeometry,fanMaterial);streaks.frustumCulled=false;group.add(streaks);
  const sparks=new Points(particleGeometry,particleMaterial); sparks.frustumCulled=false; group.add(sparks); let particleCursor=0, emission=0;
  for(let i=0;i<particleCount;i++) positions[i*3+1]=-100;
  const dustCount=6000,dustPositions=new Float32Array(dustCount*3).fill(0),dustGeometry=new BufferGeometry();
  for(let i=0;i<dustCount;i++)dustPositions[i*3+1]=-100;
  dustGeometry.setAttribute('position',new BufferAttribute(dustPositions,3));
  const dustMaterial=new PointsMaterial({color:'#b39772',size:.032*simulation.scale,transparent:true,opacity:.72,depthWrite:false});
  const dust=new Points(dustGeometry,dustMaterial);dust.name='Settled rust dust';dust.frustumCulled=false;group.add(dust);
  let dustCursor=0;
  let settings=simulation.settings, hit=null, active=false, disposed=false, lastUv=null;
  const fanImpacts=[],lastContactPoint=new Vector3();
  const caster=new Raycaster(), ndc=new Vector2(), up=new Vector3(0,1,0), normal=new Vector3(), origin=new Vector3(), delta=new Vector3();
  function configure(next) {
    settings=next;
    for(const station of stands.stations)station.setFanRadius(settings.rust.radius*5*simulation.scale);
    for(const [key, material] of Object.entries(materials)) {
      applyMaterialSettings(material,settings.materials[key],key);
      material.envMap=scene.environment;
      material.envMapIntensity=settings.materials[key].envMapIntensity*(settings.lighting.environment.enabled?settings.lighting.environment.intensity:0);
      material.envMapRotation.y=settings.lighting.environment.rotation*Math.PI/180;
    }
    uniforms.rustColor.value.copy(materials.struts.color); uniforms.rustRough.value=materials.struts.roughness; uniforms.rustMetal.value=materials.struts.metalness;
  }
  function pick(clientX,clientY,rect,camera) {
    ndc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    updateSkin(); caster.setFromCamera(ndc,camera);
    return intersectionHit();
  }
  function intersectionHit() {
    const intersection=caster.intersectObject(pickMesh,false)[0];
    if(!intersection) return null;
    const localPoint=new Vector3(), restPosition=cube.geometry.attributes.position;
    if(intersection.barycoord) {
      for(const [vertex,weight] of [[intersection.face.a,intersection.barycoord.x],[intersection.face.b,intersection.barycoord.y],[intersection.face.c,intersection.barycoord.z]])
        localPoint.addScaledVector(new Vector3().fromBufferAttribute(restPosition,vertex),weight);
    }else localPoint.copy(cube.worldToLocal(intersection.point.clone()));
    const localNormal=intersection.face.normal.clone();
    // Smooth surface normal at the hit, including the chamfer.
    const a=new Vector3().fromBufferAttribute(cube.geometry.attributes.normal,intersection.face.a), b=new Vector3().fromBufferAttribute(cube.geometry.attributes.normal,intersection.face.b), c=new Vector3().fromBufferAttribute(cube.geometry.attributes.normal,intersection.face.c);
    if(intersection.barycoord) localNormal.copy(a.multiplyScalar(intersection.barycoord.x).addScaledVector(b,intersection.barycoord.y).addScaledVector(c,intersection.barycoord.z)).normalize();
    return { ...intersection,localPoint,localNormal,worldNormal:intersection.face.normal.clone().applyQuaternion(cube.quaternion).normalize() };
  }
  function automaticTarget(seconds) {
    // Sample the real surface trajectory on either side of the current time.
    // Its tangent controls the fan rotation even at the first frame or a turn.
    updateSkin();
    const size=settings.rust.size;
    function sample(t) {
      const aim=new Vector3(Math.sin(t*.65)*size*.34,Math.sin(t*.21)*simulation.radius*.28,0);
      const azimuth=.28+Math.sin(t*.065)*.65;
      const approach=new Vector3(Math.sin(azimuth),.22+.18*Math.sin(t*.11),Math.cos(azimuth)).normalize();
      const end=simulation.deformPoint(aim);
      const start=end.clone().addScaledVector(approach.applyQuaternion(simulation.rotationAt(aim.x)),size*2);
      caster.set(start,end.sub(start).normalize());
      return intersectionHit();
    }
    const next=sample(seconds),before=sample(seconds-.015),after=sample(seconds+.015);
    if(next && before && after)next.travelDirection=after.localPoint.clone().sub(before.localPoint);
    return next;
  }
  function setTarget(next,working) {
    if(next && hit && active && working && hit.localNormal.dot(next.localNormal)>.3 && hit.localPoint.distanceTo(next.localPoint)<settings.rust.size*.5)next.previousLocalPoint=hit.localPoint;
    hit=next; active=!!next&&working;
    if(next) {
      lastUv=next.uv.toArray();
      const travel=next.travelDirection?.clone() ?? (next.previousLocalPoint ? next.localPoint.clone().sub(next.previousLocalPoint) : up.clone());
      travel.addScaledVector(next.localNormal,-travel.dot(next.localNormal));
      if(travel.lengthSq()<1e-12)travel.copy(Math.abs(next.localNormal.y)>.9?new Vector3(0,0,1):up);
      next.fanTangent=new Vector3().crossVectors(next.localNormal,travel.normalize()).normalize();
      next.fanHalfWidth=settings.rust.radius*5*simulation.scale;
    }
  }
  let lastVisualRevision=-1,lastVisualHit=null,lastVisualRunning=false;
  function update(camera,dt=0,running=false) {
    if(dt===0&&lastVisualRevision===simulation.revision&&lastVisualHit===hit&&lastVisualRunning===running)return;
    lastVisualRevision=simulation.revision;lastVisualHit=hit;lastVisualRunning=running;
    cube.position.copy(simulation.object.position);cube.quaternion.copy(simulation.object.quaternion); updateSkin();
    beam.visible=ring.visible=false;fan.visible=sheet.visible=active&&running;
    fanImpacts.length=0;
    let rayCount=0,triangleCount=0;
    const workingHits=[];
    for(const [laserIndex,station] of stands.stations.entries()) {
      station.light.intensity=0;
      if(!hit)continue;
      const motion=aiming.get(station),blend=-Math.expm1(-10*Math.max(0,dt));
      targetOrientation.setFromUnitVectors(up,station.pivot.clone().sub(hit.point).normalize());
      // Initialize before the first emission, then ease every subsequent retarget.
      if(!motion.initialized){station.head.quaternion.copy(targetOrientation);motion.initialized=true;}
      else station.head.quaternion.slerp(targetOrientation,blend);
      const gunAxis=up.clone().applyQuaternion(station.head.quaternion);
      origin.copy(station.pivot).addScaledVector(gunAxis,-.8*simulation.scale);station.nozzle.copy(origin);
      caster.set(origin,gunAxis.clone().negate());
      const sourceHit=intersectionHit();
      if(!sourceHit)continue;
      const travel=hit.travelDirection?.clone()??up.clone();
      travel.addScaledVector(sourceHit.localNormal,-travel.dot(sourceHit.localNormal));
      if(travel.lengthSq()<1e-8)travel.copy(Math.abs(sourceHit.localNormal.y)>.9?new Vector3(0,0,1):up);
      sourceHit.fanTangent=new Vector3().crossVectors(sourceHit.localNormal,travel.normalize()).normalize();
      sourceHit.fanHalfWidth=settings.rust.radius*5*simulation.scale;
      const surfaceRotation=simulation.rotationAt(sourceHit.localPoint.x);
      const tangent=sourceHit.fanTangent.clone().applyQuaternion(surfaceRotation);
      if(motion.fanTangent) {
        // A fan axis is undirected: choose the nearest equivalent orientation at turns.
        if(tangent.dot(motion.fanTangent)<0)tangent.negate();
        tangent.lerpVectors(motion.fanTangent,tangent,blend);
      }
      tangent.addScaledVector(sourceHit.worldNormal,-tangent.dot(sourceHit.worldNormal)).normalize();
      motion.fanTangent=tangent.clone();
      sourceHit.fanTangent.copy(tangent).applyQuaternion(surfaceRotation.clone().invert());
      normal.copy(sourceHit.worldNormal);lastContactPoint.copy(sourceHit.point);workingHits.push(sourceHit);
      let previousImpact=null,sourceRays=0;
      for(let i=0;i<FAN_RAYS;i++) {
        const time=simulation.time+laserIndex*.17,jitter=(Math.sin(time*71+i*13)*.32+Math.sin(time*107+i*3.7)*.18)/FAN_RAYS;
        const across=new Vector3().crossVectors(normal,tangent).normalize();
        const aim=sourceHit.point.clone().addScaledVector(tangent,(i/(FAN_RAYS-1)-.5+jitter)*sourceHit.fanHalfWidth*2)
          .addScaledVector(across,Math.sin(time*89+i*9.3)*.022*simulation.scale);
        const brightness=.4+.9*(.5+.5*Math.sin(time*97+i*17));fanColors.fill(brightness,rayCount*6,rayCount*6+6);
        caster.set(origin,aim.clone().sub(origin).normalize());
        const impact=caster.intersectObject(pickMesh,false)[0];
        if(!impact){previousImpact=null;continue;}
        const impactNormal=impact.face.normal.clone().applyQuaternion(cube.quaternion).normalize(),end=impact.point.clone();
        origin.toArray(fanPositions,rayCount*6);end.toArray(fanPositions,rayCount*6+3);rayCount++;sourceRays++;
        fanImpacts.push({point:end,normal:impactNormal});
        if(previousImpact){const k=triangleCount++*9;origin.toArray(sheetPositions,k);previousImpact.toArray(sheetPositions,k+3);end.toArray(sheetPositions,k+6);}
        previousImpact=end;
      }
      station.light.position.copy(sourceHit.point).addScaledVector(normal,.12*simulation.scale);
      station.light.intensity=active&&running&&sourceRays?1.2*simulation.scale**2:0;
      if(running&&dt>0&&active&&sourceRays)simulation.laserStrike(sourceHit.point,normal,dt/stands.stations.length,settings.rust.power);
    }
    fanGeometry.setDrawRange(0,rayCount*2);sheetGeometry.setDrawRange(0,triangleCount*3);
    sheetGeometry.attributes.position.needsUpdate=true;fanGeometry.attributes.position.needsUpdate=true;fanGeometry.attributes.color.needsUpdate=true;
    if(running&&dt>0) {
      if(active&&workingHits.length)for(const sourceHit of workingHits)mask.step(dt/workingHits.length,settings.rust.growth,sourceHit,Math.max(.055,settings.rust.radius*.3)*simulation.scale,settings.rust.power*workingHits.length);
      else mask.step(dt,settings.rust.growth,null,0,0);
    }
    if(running&&dt>0) {
      emission+=active?dt*100:0;
      while(emission>=1&&hit) {
        const i=particleCursor++%particleCount,k=i*3; emission--;
        if(!fanImpacts.length)continue;
        const impact=fanImpacts[Math.floor(Math.random()*fanImpacts.length)];
        impact.point.clone().addScaledVector(impact.normal,.035*simulation.scale).toArray(positions,k);
        const v=new Vector3((Math.random()-.5)*2.5,Math.random()*1.4,(Math.random()-.5)*2.5).addScaledVector(impact.normal,.8+Math.random()*1.6).multiplyScalar(simulation.scale);
        simulation.spawnSpark(i,new Vector3().fromArray(positions,k),v);lives[i]=6;ages[i]=0;
      }
      for(let i=0;i<particleCount;i++) {
        const k=i*3;ages[i]+=dt;lives[i]-=dt;
        const entry=simulation.sparkEntries[i];
        if(entry) {
          const point=entry.body.getPosition();positions[k]=point.x;positions[k+1]=point.y;positions[k+2]=point.z;
          if((point.y<.038*simulation.scale&&ages[i]>.1)||lives[i]<=0) {
            if(point.y<.08*simulation.scale) {const d=(dustCursor++%dustCount)*3;dustPositions[d]=point.x;dustPositions[d+1]=simulation.floor+.016*simulation.scale;dustPositions[d+2]=point.z;}
            simulation.retireSpark(i);positions[k+1]=-100;lives[i]=0;
          }
        }
        const hot=Math.max(0,1-ages[i]/.4);
        sparkColors[k]=.25+hot*4;sparkColors[k+1]=.15+hot*1.2;sparkColors[k+2]=.07+hot*.2;
        const velocity=entry&&lives[i]>0?entry.body.getLinearVelocity():{x:0,y:0,z:0};
        for(let axis=0;axis<3;axis++) {
          streakPositions[i*6+axis]=hot>0&&lives[i]>0?positions[k+axis]:(axis===1?-100:0);
          streakPositions[i*6+3+axis]=hot>0&&lives[i]>0?positions[k+axis]-[velocity.x,velocity.y,velocity.z][axis]*.025:(axis===1?-100:0);
        }
      }
      dustGeometry.attributes.position.needsUpdate=true;particleGeometry.attributes.color.needsUpdate=true;
      particleGeometry.attributes.position.needsUpdate=true;streakGeometry.attributes.position.needsUpdate=true;
    }
  }
  return { group,cube,mask,materials,stands,configure,update,pick,automaticTarget,setTarget,
    get soundState(){return {removed:mask.cleaned,sparks:particleCursor,dust:dustCursor,contactPoint:lastContactPoint,lampPoint:stands.stations[0].pivot};},
    get working(){return active&&fanImpacts.length>0;}, get diagnostics(){return { coverage:mask.coverage, cleaned:mask.cleaned, lastUv, working:active, lasers:stands.stations.length, fanRays:fanGeometry.drawRange.count/2,dust:Math.min(dustCursor,dustCount), maskSize:[mask.texture.image.width,mask.texture.image.height] };},
    dispose(){if(disposed)return;disposed=true;scene.remove(group);stands.dispose();mask.dispose();pickGeometry.dispose();pickMaterial.dispose();particleGeometry.dispose();particleMaterial.dispose();fanGeometry.dispose();fanMaterial.dispose();sheetGeometry.dispose();sheetMaterial.dispose();streakGeometry.dispose();dustGeometry.dispose();dustMaterial.dispose();
      for(const mesh of [beam,ring])mesh.geometry.dispose();laserMaterial.dispose();Object.values(materials).forEach(m=>m.dispose());}
  };
}
