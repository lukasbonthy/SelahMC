import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { transformBundle } from '../tools/build-lifecycle-repair.mjs';

const base = await readFile(new URL('../../recovered-live/selahmc-client-v8.3.3.js', import.meta.url), 'utf8');
const barrier = await readFile(new URL('../src/world-lifecycle-barrier.js', import.meta.url), 'utf8');
const source = transformBundle(base, barrier).code;

function runtime() {
  const marker = '}));\n\n//# sourceMappingURL';
  assert.equal(source.split(marker).length, 2);
  const context = vm.createContext({console, setTimeout, clearTimeout, TextEncoder, TextDecoder, performance});
  // Test-only export: no probe is emitted in a release bundle.
  vm.runInContext(source.replace(marker,
    '$rt_exports.contractTest=function(body){return eval(body);};' + marker), context);
  return body => context.contractTest(`(function(){
    // Bootstrap boundaries: startup logging and ResourceLocation's intern pool.
    // The constructors, strings, map operations and sprite code remain real.
    E7e=Fia=function(){return {}}; LvT=Cs();
    ${body}
  })()`);
}

for (const initiallyEnabled of [false, true]) {
  test(`atlas constructed with shaders ${initiallyEnabled} supports later PBR registration`, () => {
    const result = runtime()(`
      SD_getEnabled=function(){return ${initiallyEnabled}};
      var atlas=new AUM; B8p(atlas,C(490));
      SD_getEnabled=function(){return true}; atlas.CV=1;
      var location=new Z; Cjm(location,$rt_str('minecraft:stone'));
      var sprite=Et_(atlas,location);
      return {pbr:sprite instanceof SD_AEz, stored:CCl(atlas.Y3,location.bF())===sprite};
    `);
    assert.equal(result.pbr, true);
    assert.equal(result.stored, true);
  });
}

test('equivalent resource locations return the same cached sprite through both renderer paths', () => {
  const result = runtime()(`
    SD_getEnabled=function(){return true};
    var atlas=new AUM; B8p(atlas,C(490)); atlas.CV=1;
    var first=new Z,second=new Z;
    Cjm(first,$rt_str('minecraft:stone')); Cjm(second,$rt_str('minecraft:stone'));
    var sprite=Et_(atlas,first), repeated=Et_(atlas,second);
    SD_getEnabled=function(){return false}; var vanilla=Et_(atlas,second);
    return {same:sprite===repeated,vanilla:sprite===vanilla,count:atlas.Y3.c};
  `);
  assert.equal(result.same, true);
  assert.equal(result.vanilla, true);
});

test('missing PBR sprite provides all three image planes before stitching', () => {
  const result = runtime()(`
    SD_getEnabled=function(){return false};
    var atlas=new AUM; B8p(atlas,C(490));
    var pixels=Bi(256);pixels.data.fill(-65281);
    atlas.a7$.mK=16;atlas.a7$.nP=16;
    atlas.a7$.pf=Bx();W(atlas.a7$.pf,T($rt_arraycls($rt_intcls()),[pixels]));
    SD_prepareMissingPBR(atlas);
    var planes=SD_CDJ(atlas.byw,0).data;
    return {width:atlas.byw.mK,height:atlas.byw.nP,
      sizes:planes.map(function(p){return p.data[0].data.length}),
      color:planes[0].data[0].data[0],normal:planes[1].data[0].data[0],
      material:planes[2].data[0].data[0]};
  `);
  assert.equal(result.width,16);assert.equal(result.height,16);
  assert.deepEqual(Array.from(result.sizes),[256,256,256]);
  assert.equal(result.color,-65281);
  assert.equal(result.normal,0);
  assert.equal(result.material,2679);
});

test('real loadSprites rebuilds a persistent atlas across repeated off/on transitions', () => {
  const results = runtime()(`
    var enabled=false;SD_getEnabled=function(){return enabled};
    var atlas=new AUM;B8p(atlas,C(490));atlas.Qy=2;
    var location=new Z;Cjm(location,$rt_str('minecraft:stone'));
    var locations=IF();GGA(locations,location);
    var bakery={c7O:locations,eyE:{a91:Cs()}},observations=[];
    // Graphics boundaries only: fixture pixels replace GPU-backed missing-image
    // creation, E0c would delete GL textures, and DJL starts image I/O/stitching.
    KP=function(){MyZ=Bi(256);MyZ.data.fill(-65281)};
    E0c=function(){};
    DJL=function(current){
      var planes=SD_CDJ(current.byw,0).data;
      observations.push({pbr:CCl(current.Y3,location.bF()) instanceof SD_AEz,
        shared:current.Y3===current.KG,
        levels:planes.map(function(p){return p.data.length}),
        unbuiltLevels:planes.every(function(p){return p.data[1]===null&&p.data[2]===null})});
    };
    for(var mode of [false,true,false,true]){
      enabled=mode;atlas.CV=mode?1:0;EhP(atlas,{},bakery);
    }
    return observations;
  `);
  assert.equal(results.length,4);
  for (let i=0;i<results.length;i++) {
    assert.equal(results[i].pbr,i%2===1);
    assert.equal(results[i].shared,true);
    assert.deepEqual(Array.from(results[i].levels),[3,3,3]);
    assert.equal(results[i].unbuiltLevels,true);
  }
});


test('real PBR mip generation averages each 2x2 block at every level', () => {
  const result = runtime()(`
    var input=G($rt_arraycls($rt_intcls()),5),pixels=Bi(256);
    for(var y=0;y<16;y++)for(var x=0;x<16;x++)pixels.data[y*16+x]=(y*16+x)*4;
    input.data[0]=pixels;
    return SD_ES7(4,16,input).data.map(function(level){return Array.from(level.data)});
  `);
  let expected=Array.from({length:256},(_,i)=>i*4);
  let width=16;
  for(let level=0;level<5;level++) {
    assert.deepEqual(Array.from(result[level]),expected,`mip level ${level}`);
    if(level===4)break;
    const next=[];
    for(let y=0;y<width;y+=2)for(let x=0;x<width;x+=2){
      const block=[expected[y*width+x],expected[y*width+x+1],expected[(y+1)*width+x],expected[(y+1)*width+x+1]];
      let pixel=0;
      for(const shift of [0,8,16,24])pixel|=(block.reduce((n,p)=>n+((p>>>shift)&255),0)>>2)<<shift;
      next.push(pixel);
    }
    expected=next;width/=2;
  }
});


test('missing sprite generates complete normal and material mip chains', () => {
  const result=runtime()(`
    SD_getEnabled=function(){return false};
    var atlas=new AUM;B8p(atlas,C(490));atlas.Qy=4;
    atlas.a7$.mK=16;atlas.a7$.nP=16;atlas.a7$.pf=Bx();
    var frames=G($rt_arraycls($rt_intcls()),5);frames.data[0]=Bi(256);
    frames.data[0].data.fill(-65281);W(atlas.a7$.pf,frames);
    SD_prepareMissingPBR(atlas);
    // Initialize the CPU gamma table without allocating a GL texture.
    KP=function(){};MI3=Ed(256);MI4=Bi(4);
    for(var i=0;i<256;i++)MI3.data[i]=G2(i/255,2.2);
    SD_EWx(atlas.byw,4);
    return SD_CDJ(atlas.byw,0).data.map(function(plane){
      return plane.data.map(function(level){return Array.from(level.data)});
    });
  `);
  assert.equal(result.length,3);
  for(const plane of result)assert.deepEqual(Array.from(plane,p=>p.length),[256,64,16,4,1]);
  for(const level of result[1])assert.ok(Array.from(level).every(p=>p===0));
  for(const level of result[2])assert.ok(Array.from(level).every(p=>p===2679));
});
