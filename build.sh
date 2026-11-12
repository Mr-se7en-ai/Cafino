#!/bin/bash
# Builds: chunks/vendor-*.js (lazy libraries) → bundle.js (app) → copies into pwa/ and the Electron app.
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"   # independent of the install location
# Electron app folder: auto-detected (override with ELECTRON_APP_DIR=path/to/electron-app). Layouts seen: el/electron-app, electron-app/electron-app, electron-app
if [ -n "$ELECTRON_APP_DIR" ]; then EL="$ELECTRON_APP_DIR"
else EL=""; for c in el/electron-app electron-app/electron-app electron-app; do [ -f "$c/main.js" ] && [ -f "$c/package.json" ] && { EL="$c"; break; }; done; fi
[ -n "$EL" ] && [ -f "$EL/main.js" ] || { echo "Electron app folder not found (looked for */main.js). Set ELECTRON_APP_DIR." >&2; exit 1; }
EA="$EL/app"; echo "Electron app: $EL → $EA"
[ -d node_modules/esbuild ] || { echo "node_modules missing — run: npm ci" >&2; exit 1; }
for f in pwa/sw.js pwa/index.html index.html index.jsx config.js; do [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }; done
mkdir -p "$EA"
COMMON=(--bundle --minify --format=iife --jsx=automatic --loader:.js=jsx --define:process.env.NODE_ENV='"production"' --define:import.meta.env='{}' --log-level=warning)
rm -rf chunks && mkdir chunks
MAP="{"
for n in xlsx xlsxworker pdf pdfinfo; do
  npx esbuild src/vendor/$n.entry.js "${COMMON[@]}" --outfile=chunks/tmp-$n.js
  h=$(node -e 'process.stdout.write(require("crypto").createHash("sha1").update(require("fs").readFileSync(process.argv[1])).digest("hex").slice(0,8))' chunks/tmp-$n.js)
  mv chunks/tmp-$n.js chunks/vendor-$n.$h.js
  MAP="$MAP\"$n\":\"chunks/vendor-$n.$h.js\","
done
MAP="${MAP%,}}"
echo "$MAP" > chunks/manifest.json
npx esbuild index.jsx "${COMMON[@]}" --define:__CF_CHUNKS__="$MAP" --outfile=bundle.js
# service worker pre-cache list + copies for the PWA and Electron targets
node -e '
const fs=require("fs");const m=JSON.parse(fs.readFileSync("chunks/manifest.json","utf8"));
const list=Object.values(m).map(f=>JSON.stringify("./"+f)).join(", ");
let sw=fs.readFileSync("pwa/sw.js","utf8");
const ver=(fs.readFileSync("src/app/core/version.js","utf8").match(/APP_VERSION\s*=\s*"([^"]+)"/)||[])[1];
if(!ver){console.error("APP_VERSION not found");process.exit(1);}
sw=sw.replace(/const VERSION = "[^"]*";/,"const VERSION = \""+ver+"\";");
sw=sw.replace(/\/\*CHUNKS\*\/[^\n]*\n/,"/*CHUNKS*/ const CHUNKS = ["+list+"];\n");
fs.writeFileSync("pwa/sw.js",sw);'
for d in pwa "$EA"; do cp src/skins/liquid/LICENSE-glasswork.txt $d/LICENSE-glasswork.txt; rm -rf $d/chunks; mkdir -p $d/chunks; cp chunks/*.js $d/chunks/; cp bundle.js $d/bundle.js; done
ls -la bundle.js chunks/
# default font (Vazirmatn) + its OFL license, and the brand folder — same loop for both; fails loudly if a source is missing
cp index.html "$EA/index.html"   # Electron uses the same page (fonts are relative: ./fonts/)
for d in pwa "$EA"; do
  [ -f fonts/OFL.txt ] && ls fonts/*.woff2 >/dev/null || { echo "fonts/ is incomplete" >&2; exit 1; }
  [ -f brand/logo.svg ] && [ -f brand/README-fa.txt ] || { echo "brand/ is incomplete" >&2; exit 1; }
  rm -rf "$d/fonts" "$d/brand"; mkdir -p "$d/fonts" "$d/brand"
  cp fonts/*.woff2 fonts/OFL.txt "$d/fonts/"
  cp brand/* "$d/brand/"
done

# ── verification: refuse to leave an incomplete build behind ─────────────────────────────────────
EL="$EL" node -e '
const fs=require("fs"),path=require("path");const EL=process.env.EL;const bad=[];
const need=(f)=>{try{if(!fs.statSync(f).size)bad.push(f+" (empty)");}catch{bad.push(f+" (missing)");}};
const ver=(fs.readFileSync("src/app/core/version.js","utf8").match(/APP_VERSION\s*=\s*"([^"]+)"/)||[])[1];
const sw=fs.readFileSync("pwa/sw.js","utf8");
if(!sw.includes("const VERSION = \""+ver+"\""))bad.push("pwa/sw.js VERSION != "+ver);
for(const [f,k] of [[EL+"/package.json","version"],["server/package.json","version"]]){const v=JSON.parse(fs.readFileSync(f,"utf8")).version;if(v!==ver)bad.push(f+" version "+v+" != "+ver);}
const core=(sw.match(/const CORE = \[([\s\S]*?)\];/)||[])[1]||"";
const chunks=(sw.match(/const CHUNKS = \[([^\]]*)\]/)||[])[1]||"";
const files=[...(core+","+chunks).matchAll(/"\.\/([^"]+)"/g)].map(m=>m[1]).filter(f=>f&&!/^\.\.\./.test(f));
for(const d of ["pwa",EL+"/app"]){for(const f of files){ if(f==="")continue; if(d!=="pwa"&&/^(icons\/|manifest)/.test(f))continue; need(path.join(d,f)); } need(path.join(d,"bundle.js")); need(path.join(d,"fonts/OFL.txt")); need(path.join(d,"brand/logo.svg")); need(path.join(d,"LICENSE-glasswork.txt"));}
need(EL+"/app/index.html");
if(bad.length){console.error("BUILD INCOMPLETE:\n  "+bad.join("\n  "));process.exit(1);}
console.log("build verified: v"+ver+", "+files.length+" precached files present in pwa/ and "+EL+"/app");'
