#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="${repo_root}/.devcontainer/selah-files.txt"
destination="${repo_root}/.selah-test"
source_url="${SELAH_SOURCE_URL:-https://selahmc.me/client}"
stage="$(mktemp -d "${repo_root}/.selah-stage-XXXXXX")"

cleanup() {
  if [[ -d "${stage}" ]]; then
    rm -rf -- "${stage}"
  fi
}
trap cleanup EXIT

echo "Preparing SelahMC v8.3.3 from ${source_url}"
while IFS='|' read -r source_path target_path; do
  [[ -n "${source_path}" ]] || continue
  if [[ -z "${target_path}" ]]; then
    target_path="${source_path}"
  fi
  mkdir -p "${stage}/$(dirname "${target_path}")"
  curl --fail --location --silent --show-error --retry 3 \
    --connect-timeout 20 \
    "${source_url%/}/${source_path}" \
    --output "${stage}/${target_path}"
done < "${manifest}"

perl -0pi -e '
  my $count = s/v8\.3\.2/v8.3.3/g;
  die "unexpected v8.3.2 index reference count\n" unless $count == 4;
  my $loader = qq{\t\t<script type="text/javascript" src="selah-loader-v8.3.3.js"></script>};
  my $diagnostics = qq{\t\t<script type="text/javascript" src="selah-diagnostics.js"></script>\n$loader};
  my $diagnostic_count = s/\Q$loader\E/$diagnostics/;
  die "expected exactly one Selah loader script tag\n" unless $diagnostic_count == 1;
  my $client = qq{\t\t<script type="text/javascript" src="selahmc-client-v8.3.3.js"></script>};
  my $versioned_client = qq{\t\t<script type="text/javascript" src="selahmc-client-v8.3.3.js?v=8834ff69"></script>};
  my $client_count = s/\Q$client\E/$versioned_client/;
  die "expected exactly one Selah client script tag\n" unless $client_count == 1;
' "${stage}/index.html"

cp "${repo_root}/.devcontainer/selah-diagnostics.js" "${stage}/selah-diagnostics.js"

perl -0pi -e '
  my $progress_anchor = q{currentProgress = Math.max(currentProgress, Math.min(100, nextProgress));};
  my $progress_replacement = qq{var previousProgress = currentProgress;\n\t\tcurrentProgress = Math.max(currentProgress, Math.min(100, nextProgress));\n\t\tif(currentProgress > previousProgress && typeof global.__selahReportLoadStage === "function") {\n\t\t\ttry {\n\t\t\t\tglobal.__selahReportLoadStage(currentProgress, nextLabel);\n\t\t\t}catch(ignore) {}\n\t\t}};
  my $progress_count = s/\Q$progress_anchor\E/$progress_replacement/;
  die "expected exactly one Selah loader progress anchor\n"
    unless $progress_count == 1;
' "${stage}/selah-loader-v8.3.3.js"

perl -0pi -e '
  my $count = s/8\.3\.2/8.3.3/g;
  die "unexpected OptiFine bridge version count\n" unless $count == 2;
' "${stage}/selah-optifine-bridge-v8.3.3.js"

perl -0pi -e '
  my $anchor_count = () = /AJd\(c\);c\.cMt=b;/g;
  die "expected exactly one deferred first-use texture anchor\n"
    unless $anchor_count == 1;
  my $texture_map_anchor = q{c=null;AJd(a);a.CV=0;};
  my $texture_map_replacement = q{c=null;AJd(a);SD_LQF=MyW;a.ri=null;a.Cq=null;a.uF=Bx();a.Y3=Cs();a.bFf=Cs();a.a7$=HO_(C(2101));a.ccL=b;a.CV=0;};
  my $texture_map_count = s/\Q$texture_map_anchor\E/$texture_map_replacement/;
  die "expected exactly one deferred TextureMap constructor anchor\n"
    unless $texture_map_count == 1;
  my $atlas_state_anchor = q!a.E$=Bx();a.KG=Cs();a.cdi=Cs();!;
  my $atlas_state_replacement = q!a.E$=Bx();a.uF=a.E$;a.KG=Cs();a.Y3=a.KG;a.cdi=Cs();a.bFf=a.cdi;!;
  my $atlas_state_count = s/\Q$atlas_state_anchor\E/$atlas_state_replacement/;
  die "expected exactly one deferred atlas state anchor\n"
    unless $atlas_state_count == 1;
  my $missing_sprite_anchor = q!a.by_=SD_HNA(C(2101));!;
  my $missing_sprite_replacement = q!a.by_=a.a7$;!;
  my $missing_sprite_count = s/\Q$missing_sprite_anchor\E/$missing_sprite_replacement/;
  die "expected exactly one deferred standard missing-sprite anchor\n"
    unless $missing_sprite_count == 1;
  my $pipeline_cache_anchor = q!LS8=Lh(1024);!;
  my $pipeline_cache_replacement = q!LS8=Lh(1024);SD_HXj=LS8;!;
  my $pipeline_cache_count = s/\Q$pipeline_cache_anchor\E/$pipeline_cache_replacement/;
  die "expected exactly one fixed-function pipeline cache anchor\n"
    unless $pipeline_cache_count == 1;
  my $pipeline_adapter_anchor = q!function SD_F_j(b){!;
  my $pipeline_adapter_replacement = q!function SD_makeTuffExtensionAdapter(a){return {fK6:function(b,c,d){return SD_Ftq(a,b,c,d);},gi7:function(b,c,d,e){return SD_D05(a,b,c,d,e);},d9h:function(b){return SD_EMI(a,b);},glN:function(b){return b&8?80|(b&32?32:0):b&64?32:b&128?48:2943;},fPp:function(){return 9;},si:function(b,c,d,e){return SD_CBQ(a,b,c,d,e);},fF$:function(){}};}
function SD_F_j(b){!;
  my $pipeline_adapter_count = s/\Q$pipeline_adapter_anchor\E/$pipeline_adapter_replacement/;
  die "expected exactly one deferred pipeline-provider anchor\n"
    unless $pipeline_adapter_count == 1;
  my $pipeline_provider_anchor = q!SD_LTv=b;return;!;
  my $pipeline_provider_replacement = q!SD_LTv=b;LS5=b===null?null:SD_makeTuffExtensionAdapter(b);return;!;
  my $pipeline_provider_count = s/\Q$pipeline_provider_anchor\E/$pipeline_provider_replacement/;
  die "expected exactly one deferred pipeline-provider assignment\n"
    unless $pipeline_provider_count == 1;
  my @pipeline_routes = (
    [q{SD_EVW}, q{SD_TUFF_FcU}, 1],
    [q{SD_Dha}, q{SD_TUFF_DtO}, 1],
    [q{SD_DA8}, q{SD_TUFF_DOQ}, 2],
    [q{SD_ECZ}, q{SD_TUFF_EU2}, 1],
  );
  for my $route (@pipeline_routes) {
    my ($alpha, $host, $expected) = @$route;
    my $count = () = /(?<!function )\b\Q$alpha\E\(/g;
    die "unexpected fixed-function route count for $alpha: $count\n"
      unless $count == $expected;
    s/(?<!function )\b\Q$alpha\E\(/${host}(/g;
  }
  my $atlas_setup_replacement = q!case 0:$p=85;case 85:FyK(a);if(B()){break _;}$p=86;case 86:F6X(a);if(B()){break _;}$p=87;case 87:Gks(a);if(B()){break _;}$p=88;case 88:EBi(a);if(B()){break _;}$p=89;case 89:Ct7(a);if(B()){break _;}$p=2;case 2:$z=DcY();!;
  my $atlas_setup_count = s/case 0:\$p=1;case 1:Gks\(a\);if\s*\(B\(\)\)\{break _;\}\$p=2;case 2:\$z=DcY\(\);/$atlas_setup_replacement/;
  die "expected exactly one deferred atlas setup anchor\n"
    unless $atlas_setup_count == 1;
  my $sprite_load_anchor = q!n.exq(j,q);!;
  my $sprite_load_replacement = q!Edo(n,j,q);!;
  my $sprite_load_count = s/\Q$sprite_load_anchor\E/$sprite_load_replacement/;
  die "expected exactly one deferred base-sprite load anchor\n"
    unless $sprite_load_count == 1;
  my $frame_data_anchor = q!be.cPT(e)!;
  my $frame_data_replacement = q!typeof be.cPT==="function"?be.cPT(e):A4E(be,e)!;
  my $frame_data_count = s/\Q$frame_data_anchor\E/$frame_data_replacement/;
  die "expected exactly one deferred frame-data dispatch anchor\n"
    unless $frame_data_count == 1;
  my $mipmap_anchor = q!catch($$e){$$je=F($$e);if($$je instanceof K){x=$$je;break a;}else{throw $$e;}}$p=17;continue _;}b=C(7587);!;
  my $mipmap_replacement = q!catch($$e){try{$rt_globals.__selahMipmapCrash&&$rt_globals.__selahMipmapCrash(k,e,$$e);}catch($$diag){}$$je=F($$e);if($$je instanceof K){x=$$je;break a;}else{throw $$e;}}$p=17;continue _;}b=C(7587);!;
  my $mipmap_count = s/\Q$mipmap_anchor\E/$mipmap_replacement/;
  die "expected exactly one deferred mipmap diagnostic anchor\n"
    unless $mipmap_count == 1;
  my $mipmap_dispatch_anchor = q!try{k.eos(e);if(B()){break _;}}!;
  my $mipmap_dispatch_replacement = q!try{if(typeof k.eos==="function"){k.eos(e);}else{Fv2(k,e);}if(B()){break _;}}!;
  my $mipmap_dispatch_count = s/\Q$mipmap_dispatch_anchor\E/$mipmap_dispatch_replacement/;
  die "expected exactly one deferred mipmap dispatch anchor\n"
    unless $mipmap_dispatch_count == 1;
  my $animation_frame_anchor = q!case 10:Dma(h,l,m);!;
  my $animation_frame_replacement = q~case 10:try{$rt_globals.__selahAnimationFrameError&&$rt_globals.__selahAnimationFrameError(i&&i.eh?$rt_ustr(i.eh):null,{pendingTokenConflict:DM(IsX,P(-1)),runtimeReady:!!IoU,timeoutId:IsZ,vsyncEnabled:!!IoV,waiterPresent:IsY!==null});}catch($$diag){}Dma(h,l,m);~;
  my $animation_frame_count = s/\Q$animation_frame_anchor\E/$animation_frame_replacement/;
  die "expected exactly one animation-frame catch anchor\n"
    unless $animation_frame_count == 1;
  my $atlas_crash_anchor = q~}I(y);}$p=43;continue _;case 36:~;
  my $atlas_crash_replacement = q~}try{$rt_globals.__selahAtlasCrash&&$rt_globals.__selahAtlasCrash(y&&y.eh?$rt_ustr(y.eh):null,{atlasPath:a.b7L?$rt_ustr(a.b7L):null,mipmapLevels:a.Qy});}catch($$diag){}I(y);}$p=43;continue _;case 36:~;
  my $atlas_crash_count = s/\Q$atlas_crash_anchor\E/$atlas_crash_replacement/;
  die "expected exactly one deferred stitcher catch anchor\n"
    unless $atlas_crash_count == 1;
  my $version_count = () = /8\.3\.2/g;
  die "unexpected client version count\n" unless $version_count == 1;
  s/AJd\(c\);c\.cMt=b;/AJd(c);c.cpL=b;/;
  s/8\.3\.2/8.3.3/;
  $_ .= "\n" unless /\n\z/;
' "${stage}/selahmc-client-v8.3.3.js"

(
  cd "${stage}"
  sha256sum --check <<'SUMS'
447c094f7c5db094167e81be464351c9fc71c5f76a1bce7f87d62a121d65dcf6  index.html
ae643bbf264db47fafd118e7194730fa65949bf12475845001f282e28aa3c6d2  selah-diagnostics.js
766018891402456aee3c803014b6d1158ccbf0e9dfd7004975dd74cd884cb43b  selah-loader-v8.3.3.js
9ecb0a64045381ae539428178d6db324a68a48ff9bb54bb5fafc57a5921dbddd  selah-optifine-bridge-v8.3.3.js
8834ff698c40ae0a7a8699122242af0d75f1c34f8b9a892d6def7725ec1b62c9  selahmc-client-v8.3.3.js
880c2d18e6f120ec735ab770b655160edc9d473b6a6326e75027723aedf459fd  selahmc-assets-v8.3.3.epk
SUMS
)
touch "${stage}/.ready-v8.3.3"
rm -rf -- "${destination}"
mv -- "${stage}" "${destination}"
stage=""
trap - EXIT
echo "SelahMC v8.3.3 is verified and ready."
