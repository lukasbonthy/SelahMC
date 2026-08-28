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
  my $version_count = () = /8\.3\.2/g;
  die "unexpected client version count\n" unless $version_count == 1;
  s/AJd\(c\);c\.cMt=b;/AJd(c);c.cpL=b;/;
  s/8\.3\.2/8.3.3/;
  $_ .= "\n" unless /\n\z/;
' "${stage}/selahmc-client-v8.3.3.js"

(
  cd "${stage}"
  sha256sum --check <<'SUMS'
47abab16f3695c36bba344c69522633630323bd148d7a0877511894055a09d1c  index.html
17e8ce86193cb229ffbe70f38c6c410f915c9393acc9c77360aa1960f1786e01  selah-diagnostics.js
766018891402456aee3c803014b6d1158ccbf0e9dfd7004975dd74cd884cb43b  selah-loader-v8.3.3.js
9ecb0a64045381ae539428178d6db324a68a48ff9bb54bb5fafc57a5921dbddd  selah-optifine-bridge-v8.3.3.js
9f6d71e0d56e0f8b1fbf3a650b1574ba45cc39ce835130b8c59e7e576764bf27  selahmc-client-v8.3.3.js
880c2d18e6f120ec735ab770b655160edc9d473b6a6326e75027723aedf459fd  selahmc-assets-v8.3.3.epk
SUMS
)
touch "${stage}/.ready-v8.3.3"
rm -rf -- "${destination}"
mv -- "${stage}" "${destination}"
stage=""
trap - EXIT
echo "SelahMC v8.3.3 is verified and ready."
