import { BufferGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three';

export const TUBE_PROFILE=Object.freeze({width:13,height:10,thickness:1.2,cornerRadius:2.2});
function profileLoop(width,height,radius,segments=8) {
  const result=[];
  for(let corner=0;corner<4;corner++) {
    const signZ=[1,-1,-1,1][corner],signY=[1,1,-1,-1][corner];
    for(let i=0;i<=segments;i++) {
      const angle=corner*Math.PI/2+i/segments*Math.PI/2;
      result.push({y:signY*(height/2-radius)+radius*Math.sin(angle),z:signZ*(width/2-radius)+radius*Math.cos(angle),ny:Math.sin(angle),nz:Math.cos(angle)});
    }
  }
  return result;
}

// Separate UV bands for outside, inside and the two annular end rims.
// No end cap spans the bore: both openings stay physically and visually hollow.
export function createRustTubeGeometry(length,profile=TUBE_PROFILE) {
  const {width,height,thickness,cornerRadius}=profile;
  const outer=profileLoop(width,height,cornerRadius),inner=profileLoop(width-2*thickness,height-2*thickness,cornerRadius-thickness);
  const points=[],normals=[],uvs=[],n=outer.length,rows=42;
  const distances=[0];for(let i=1;i<=n;i++)distances.push(distances[i-1]+Math.hypot(outer[i%n].y-outer[i-1].y,outer[i%n].z-outer[i-1].z));
  const perimeter=distances[n];
  function vertex(x,p,normal,u,v) {return {position:[x,p.y,p.z],normal,uv:[u,v]};}
  function triangle(a,b,c) {for(const p of [a,b,c]){points.push(...p.position);normals.push(...p.normal);uvs.push(...p.uv);}}
  function wall(loop,inside) {
    for(let row=0;row<rows;row++)for(let i=0;i<n;i++) {
      const j=(i+1)%n,x0=(row/rows-.5)*length,x1=((row+1)/rows-.5)*length;
      const u0=.01+.98*distances[i]/perimeter,u1=.01+.98*distances[i+1]/perimeter;
      const v0=(inside ? .5 : .01)+.42*row/rows,v1=(inside ? .5 : .01)+.42*(row+1)/rows;
      const sign=inside?-1:1,normal=p=>[0,p.ny*sign,p.nz*sign];
      const a=vertex(x0,loop[i],normal(loop[i]),u0,v0),b=vertex(x1,loop[i],normal(loop[i]),u0,v1);
      const c=vertex(x1,loop[j],normal(loop[j]),u1,v1),d=vertex(x0,loop[j],normal(loop[j]),u1,v0);
      if(inside){triangle(c,b,a);triangle(d,c,a);}else{triangle(a,b,c);triangle(a,c,d);}
    }
  }
  wall(outer,false);wall(inner,true);
  for(const side of [-1,1])for(let i=0;i<n;i++) {
    const j=(i+1)%n,x=side*length/2,normal=[side,0,0],base=side<0?.01:.51;
    const u0=base+.48*distances[i]/perimeter,u1=base+.48*distances[i+1]/perimeter;
    const a=vertex(x,outer[i],normal,u0,.95),b=vertex(x,outer[j],normal,u1,.95);
    const c=vertex(x,inner[j],normal,u1,.99),d=vertex(x,inner[i],normal,u0,.99);
    if(side<0){triangle(a,b,c);triangle(a,c,d);}else{triangle(c,b,a);triangle(d,c,a);}
  }
  const geometry=new BufferGeometry();geometry.type='RoundedRectangularTubeGeometry';geometry.userData.profile={...profile};
  geometry.setAttribute('position',new Float32BufferAttribute(points,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

// Native Box3D createBox supports offset and rotation. Keep the bore empty;
// small rotated boxes follow the rounded wall rather than filling the profile.
export function createTubeWallBoxes(segmentLength,profile=TUBE_PROFILE) {
  const {width,height,thickness:t,cornerRadius:r}=profile,hx=segmentLength/2;
  const box=(y,z,hy,hz,angle=0)=>({type:'box',halfExtents:{x:hx,y:hy,z:hz},offset:{x:0,y,z},rotation:new Quaternion().setFromAxisAngle(new Vector3(1,0,0),angle),density:1,restitution:.04,filter:{groupIndex:0}});
  const shapes=[];
  for(const sign of [-1,1]) {
    shapes.push(box(sign*(height/2-t/2),0,t/2,width/2-r));
    shapes.push(box(0,sign*(width/2-t/2),height/2-r,t/2));
  }
  const segments=6,midRadius=r-t/2,halfArc=midRadius*Math.tan(Math.PI/(4*segments));
  for(let corner=0;corner<4;corner++)for(let i=0;i<segments;i++) {
    const angle=corner*Math.PI/2+(i+.5)/segments*Math.PI/2;
    const cy=[1,1,-1,-1][corner]*(height/2-r),cz=[1,-1,-1,1][corner]*(width/2-r);
    shapes.push(box(cy+midRadius*Math.sin(angle),cz+midRadius*Math.cos(angle),halfArc,t/2,-angle));
  }
  return shapes;
}
