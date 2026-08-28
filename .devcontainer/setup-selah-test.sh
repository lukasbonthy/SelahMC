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
e382334a4ba9ca1f7c243d9050922c26188ca0724adfe0868d3c143b408d0cd4  selah-diagnostics.js
eb97d558f6a776f4125f98a77ecc31c15b3052d07ab22a4cb87ea7b0d817a4a8  selah-loader-v8.3.3.js
9ecb0a64045381ae539428178d6db324a68a48ff9bb54bb5fafc57a5921dbddd  selah-optifine-bridge-v8.3.3.js
aa57c021fbcf49e6b030b4a046d75353f392b821b2043966dc0ad4a2e3cdf149  selahmc-client-v8.3.3.js
880c2d18e6f120ec735ab770b655160edc9d473b6a6326e75027723aedf459fd  selahmc-assets-v8.3.3.epk
SUMS
)
touch "${stage}/.ready-v8.3.3"
rm -rf -- "${destination}"
mv -- "${stage}" "${destination}"
stage=""
trap - EXIT
echo "SelahMC v8.3.3 is verified and ready."
