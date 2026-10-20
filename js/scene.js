import * as THREE from 'three';
const material = (color) => new THREE.MeshLambertMaterial({color,flatShading:true});
const mesh = (geometry,mat,x=0,y=0,z=0) => {const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);return m;};
export class TrailScene {
  constructor(canvas,onError) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true}); this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace; this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#a8c5c8');this.scene.fog=new THREE.Fog('#a8c5c8',95,340);
    this.ambient=new THREE.HemisphereLight(0xe5f2e5,0x334231,2.3);this.scene.add(this.ambient);
    this.sun=new THREE.DirectionalLight(0xffdfb3,2.5);this.sun.position.set(-40,80,30);this.scene.add(this.sun);
    this.camera=new THREE.PerspectiveCamera(43,1,.1,1000);this.mode='side';this.distance=0;this.grade=4;this.elevation=0;this.phase=0;
    this.world=new THREE.Group();this.scene.add(this.world);this.makeMountains();this.makeGround();this.makeScenery();this.makeRunner();
    new ResizeObserver(()=>this.resize(canvas)).observe(canvas);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onError('3D graphics were interrupted. Reload to restore the trail.');});
    this.resize(canvas);
  }
  makeMountains() {
    const rock=material('#6f8985'),snow=material('#d6e3df');this.mountains=new THREE.Group();this.scene.add(this.mountains);
    for(let i=0;i<22;i++) {
      const height=35+(Math.sin(i*17)+1)*24;
      const g=new THREE.Group();g.add(mesh(new THREE.ConeGeometry(height*.82,height,5),rock,0,height/2-25));
      g.add(mesh(new THREE.ConeGeometry(height*.23,height*.28,5),snow,0,height*.86-25));
      g.position.set((i-10)*37,-2,-100-(i%3)*25);g.rotation.y=i*2.3;this.mountains.add(g);
    }
  }
  makeGround() {
    const columns=151, rows=[-90,-45,-20,-5,-1.1,1.1,5,18,50];this.rows=rows;this.columns=columns;
    const positions=[],colors=[],indices=[];const c=new THREE.Color();
    for(let i=0;i<columns;i++)for(let j=0;j<rows.length;j++){
      positions.push(0,0,0);c.setHSL(.24+Math.sin(i*3+j)*.015,.22,.25+Math.sin(i+j)*.025);colors.push(c.r,c.g,c.b);
      if(i&&j){const a=(i-1)*rows.length+j-1,b=i*rows.length+j-1;indices.push(a,b,a+1,a+1,b,b+1);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
    this.ground=mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,flatShading:true}));this.world.add(this.ground);
    const trail=new THREE.BufferGeometry();trail.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(columns*6),3));const ti=[];
    for(let i=1;i<columns;i++){const a=(i-1)*2;ti.push(a,a+2,a+1,a+1,a+2,a+3);}trail.setIndex(ti);
    this.trail=mesh(trail,new THREE.MeshLambertMaterial({color:'#b8a27c',side:THREE.DoubleSide}));this.world.add(this.trail);
  }
  height(x,z){const base=x*this.grade/100;if(Math.abs(z)<1.2)return base;if(z>0)return base-(z-1.1)*.16;return base+(Math.sin((x+this.distance)/17+z/20)*2+Math.cos((x+this.distance)/29-z/12)*2-z*.08)*Math.min(1,(Math.abs(z)-1.1)/9);}
  makeScenery() {
    this.props=[];const bark=material('#67513c'),pine=material('#294d3d'),pine2=material('#3b6147'),rock=material('#78827b');
    const trunk=new THREE.CylinderGeometry(.15,.24,2,5),top=new THREE.ConeGeometry(1.8,5,6),stone=new THREE.DodecahedronGeometry(1);
    for(let i=0;i<150;i++){
      const group=new THREE.Group();const tree=i%5!==0&&i%3!==0;
      if(tree){group.add(mesh(trunk,bark,0,1),mesh(top,i%2?pine:pine2,0,4),mesh(top,pine,0,5.7));}
      else {const m=mesh(stone,rock,0,.3);m.scale.set(1.5,.8,1);group.add(m);}
      const z=i%3===0?5+(i%6)*1.8:-6-(i%16)*3.4;
      group.userData={base:i*2.21,z};group.scale.setScalar(.65+(Math.sin(i*42)+1)*.45);group.rotation.y=i*12;
      this.world.add(group);this.props.push(group);
    }
  }
  makeRunner() {
    const shirt=material('#e49b5a'),skin=material('#d9b18a'),shorts=material('#243c3e'),shoe=material('#eee7cf'),hair=material('#3b332b');
    this.runner=new THREE.Group();this.scene.add(this.runner);
    this.body=new THREE.Group();this.runner.add(this.body);
    const torso=mesh(new THREE.CylinderGeometry(.24,.19,.62,7),shirt,0,1.14);torso.rotation.z=-.12;this.body.add(torso);
    this.body.add(mesh(new THREE.SphereGeometry(.17,10,8),skin,.05,1.67),mesh(new THREE.SphereGeometry(.18,10,8,0,Math.PI*2,0,Math.PI*.48),hair,.04,1.73),mesh(new THREE.BoxGeometry(.36,.24,.29),shorts,0,.78));
    this.legs=[];this.arms=[];
    for(const side of [-1,1]){
      const leg=new THREE.Group();leg.position.set(0,.78,side*.13);
      leg.add(mesh(new THREE.CylinderGeometry(.085,.065,.4,7),skin,0,-.2));
      const knee=new THREE.Group();knee.position.y=-.4;knee.add(mesh(new THREE.CylinderGeometry(.065,.05,.4,7),skin,0,-.2),mesh(new THREE.BoxGeometry(.28,.11,.14),shoe,.07,-.43));leg.add(knee);this.runner.add(leg);this.legs.push({leg,knee});
      const arm=new THREE.Group();arm.position.set(0,1.37,side*.28);arm.add(mesh(new THREE.CylinderGeometry(.065,.055,.3,7),shirt,0,-.14));
      const fore=new THREE.Group();fore.position.y=-.3;fore.rotation.z=-1.3;fore.add(mesh(new THREE.CylinderGeometry(.05,.04,.28,7),skin,0,-.14));arm.add(fore);this.body.add(arm);this.arms.push(arm);
    }
    this.runner.scale.setScalar(1.5);this.runner.position.set(0,.08,0);
  }
  setSky(mode){const colors={day:['#a8c5c8',0xffdfb3,2.5],sunset:['#cba18c',0xffae67,2],night:['#344e69',0xa8c8ff,.9]};const [sky,light,power]=colors[mode];this.scene.background.set(sky);this.scene.fog.color.set(sky);this.sun.color.setHex(light);this.sun.intensity=power;this.ambient.intensity=mode==='night'?1.4:2.3;}
  render({distance=0,grade=4,speed=0,dt=0,running=false,preview=false}={}) {
    this.distance=distance;this.grade=Number.isFinite(grade)?grade:0;
    const pos=this.ground.geometry.attributes.position,trail=this.trail.geometry.attributes.position;
    const offset=distance%2;
    for(let i=0;i<this.columns;i++){
      const x=(i-50)*2-offset;
      this.rows.forEach((z,j)=>pos.setXYZ(i*this.rows.length+j,x,this.height(x,z),z));
      for(let j=0;j<2;j++)trail.setXYZ(i*2+j,x,x*this.grade/100+.035,j?1.1:-1.1);
    }
    pos.needsUpdate=true;trail.needsUpdate=true;this.ground.geometry.computeVertexNormals();this.trail.geometry.computeVertexNormals();
    for(const prop of this.props){const x=((prop.userData.base-distance+100)%330+330)%330-100,z=prop.userData.z;prop.position.set(x,this.height(x,z),z);}
    this.mountains.position.x=-(distance*.04)%37;
    if(running&&speed>0)this.phase+=dt*(speed<1.8?8:12+speed)*Math.min(1,speed);
    const moving=running&&speed>.05, p=this.phase;
    this.legs.forEach(({leg,knee},i)=>{const a=p+i*Math.PI;leg.rotation.z=moving?Math.sin(a)*.7:0;knee.rotation.z=moving?-.2-Math.max(0,Math.cos(a))*1.25:-.12;});
    this.arms.forEach((arm,i)=>arm.rotation.z=moving?Math.sin(p+i*Math.PI)*-.6:-.15);
    this.body.position.y=moving?Math.abs(Math.sin(p))*.055:0;this.runner.rotation.z=Math.atan(this.grade/100)*.5;
    const wide=this.camera.aspect>1.5;let x,y,z;
    if(this.mode==='trail'){x=-8;y=5;z=10;}else{x=preview?(wide?-8:-4):-3;y=preview?12:8;z=preview?(wide?33:42):(wide?23:34);}
    this.camera.position.set(x,y,z);this.camera.lookAt(preview?(wide?-8:-2):3,2,0);this.renderer.render(this.scene,this.camera);
  }
  resize(canvas){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.render({preview:true});}
}
