// Compatibility corrections for the hash-pinned Selah/Tuff generated bundle.
// Keep every replacement exact so another compiler layout fails the build.
export function patchDeferredContracts(source, { replaceExact, transformGeneratedFunction }) {
  let code = source;
  const patch = (name, before, after) => {
    code = transformGeneratedFunction(code, name, body =>
      replaceExact(body, before, after, 1, `${name} deferred runtime contract`));
  };

  // The atlas outlives renderer toggles. Its state cannot depend on the mode
  // at construction time. SD_BZY initializes both sets of shared field names.
  patch('B8p',
    'case 0:if(SD_getEnabled()){$p=1;continue _;}$p=2;continue _;',
    'case 0:$p=1;continue _;');

  // ResourceLocation is the API argument; the cache stores its string form.
  // The extra state preserves the existing saved locals and child resumption.
  patch('SD_Ed6',
    'c=a.KG;$p=1;case 1:$z=CCl(c,b);',
    'c=a.KG;$p=10;case 10:$z=b.bF();if(B()){break _;}d=$z;$p=1;case 1:$z=CCl(c,d);');

  // Convert a linear output index using row width, not total pixel count.
  patch('SD_ES7','m=(l%k|0)<<1;n=(l/k|0)<<1;',
    'm=(l%i|0)<<1;n=(l/i|0)<<1;');

  patch('SD_CtG','b=b.Ii;e=C(11577);','b=b.UZ;e=C(11577);');

  // EhP has just populated the 16x16 vanilla missing image. Give the PBR
  // fallback its three planes before the common atlas builder stitches it.
  patch('EhP','c.pf=f;$p=7;', 'c.pf=f;SD_prepareMissingPBR(a);$p=7;');
  const helper = `function SD_prepareMissingPBR(a){
    var b=a.byw,c=a.a7$,d=c.mK*c.nP,e=Bi(d),f=Bi(d),g=0,
      h=G($rt_arraycls($rt_intcls()),a.Qy+1|0),i=G($rt_arraycls($rt_intcls()),a.Qy+1|0);
    for(;g<d;g=g+1|0)f.data[g]=2679;
    b.mK=c.mK;b.nP=c.nP;b.ja.data[0]=c.pf;
    b.ja.data[1]=Bx();b.ja.data[2]=Bx();
    h.data[0]=e;i.data[0]=f;
    W(b.ja.data[1],h);W(b.ja.data[2],i);
    b.a9k=1;b.MI=1;
  }
`;
  // Zero normal data and material 2679 match SD_LPX and SD_HXH.cVz.
  code = replaceExact(code,'function SD_BZY(',helper+'function SD_BZY(',1,
    'PBR missing-image preparation');
  return code;
}
