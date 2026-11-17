import { MeshStandardMaterial,Vector3 } from 'three';

export function spotlightFloorMask(point,position,target,angle,penumbra) {
  const direction=target.clone().sub(position).normalize(),ray=point.clone().sub(position).normalize();
  const outer=Math.cos(angle),inner=Math.cos(angle*(1-penumbra));
  const t=Math.max(0,Math.min(1,(ray.dot(direction)-outer)/Math.max(1e-6,inner-outer)));
  return t*t*(3-2*t);
}
export function createSpotlightFloorMaterial() {
  const uniforms={floorSpotPosition:{value:new Vector3()},floorSpotDirection:{value:new Vector3(0,-1,0)},floorSpotOuter:{value:1},floorSpotInner:{value:1},floorSpotEnabled:{value:0}};
  const material=new MeshStandardMaterial({color:'#454545',roughness:.96,metalness:0,envMapIntensity:0});
  material.userData.spotlightUniforms=uniforms;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 vFloorWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFloorWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=`varying vec3 vFloorWorld;uniform vec3 floorSpotPosition;uniform vec3 floorSpotDirection;uniform float floorSpotOuter;uniform float floorSpotInner;uniform float floorSpotEnabled;\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float floorCone=dot(normalize(vFloorWorld-floorSpotPosition),floorSpotDirection);
      float floorMask=smoothstep(floorSpotOuter,max(floorSpotOuter+.000001,floorSpotInner),floorCone)*floorSpotEnabled;
      outgoingLight*=floorMask;
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> 'spotlight-floor-v1';return material;
}
export function updateSpotlightFloor(material,spotlight) {
  const u=material.userData.spotlightUniforms;
  u.floorSpotPosition.value.copy(spotlight.position);
  u.floorSpotDirection.value.copy(spotlight.target.position).sub(spotlight.position).normalize();
  u.floorSpotOuter.value=Math.cos(spotlight.angle);u.floorSpotInner.value=Math.cos(spotlight.angle*(1-spotlight.penumbra));
  u.floorSpotEnabled.value=spotlight.visible&&spotlight.intensity>0?1:0;
}
