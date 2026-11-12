// اسکن روی ویندوز با WIA (Windows Image Acquisition) از طریق PowerShell + COM.
// ⚠ WIA با اکثر اسکنرهای مدرن کار می‌کند؛ اسکنرهای فقط‌TWAIN دیده نمی‌شوند. اسکنر USB باید درایور WIA داشته باشد.
// شناسهٔ اسکنر و مسیر خروجی از طریق متغیر محیطی پاس داده می‌شود (نه داخل متن اسکریپت).
"use strict";
const path = require("path");

const PS_FLAGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];
const PS_LIST = "$dm = New-Object -ComObject WIA.DeviceManager; @($dm.DeviceInfos | Where-Object { $_.Type -eq 1 } | ForEach-Object { [pscustomobject]@{ id = $_.DeviceID; name = $_.Properties.Item('Name').Value } }) | ConvertTo-Json -Compress";
// خروجی: یک خط JSON {files:[...], error:''}. صفحه‌به‌صفحه تا خالی‌شدن فیدر (خطای 0x80210003) یا یک صفحه برای فلت‌بد.
const PS_SCAN = [
  "$ErrorActionPreference='Stop'",
  "$out=$env:CAFINO_OUT; $dpi=[int]$env:CAFINO_DPI; $intent=[int]$env:CAFINO_INTENT; $feeder=($env:CAFINO_SOURCE -eq 'feeder'); $max=[int]$env:CAFINO_MAX; $prefix=$env:CAFINO_PREFIX",
  "$dm=New-Object -ComObject WIA.DeviceManager",
  "$info=$dm.DeviceInfos | Where-Object { $_.DeviceID -eq $env:CAFINO_SCANNER } | Select-Object -First 1",
  "if(-not $info){ [pscustomobject]@{files=@();error='scanner-not-found'} | ConvertTo-Json -Compress; exit }",
  "$dev=$info.Connect()",
  "function SetProp($o,$id,$v){ try{ foreach($p in $o.Properties){ if($p.PropertyID -eq $id){ $p.Value=$v } } }catch{} }",
  "SetProp $dev 3088 ($(if($feeder){1}else{2}))",
  "$files=@(); $err=''",
  "for($i=1;$i -le $max;$i++){",
  "  try{",
  "    $item=$dev.Items.Item(1)",
  "    SetProp $item 6147 $dpi; SetProp $item 6148 $dpi; SetProp $item 6146 $intent",
  "    $img=$item.Transfer('{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}')",
  "    $f=Join-Path $out ($prefix + '-' + $i + '.png'); if(Test-Path $f){Remove-Item $f}; $img.SaveFile($f); $files+=$f",
  "  }catch{",
  "    $m=$_.Exception.Message; if($m -match '0x80210003|paper empty|feeder' -and $files.Count -gt 0){ break } else { $err=$m; break }",
  "  }",
  "  if(-not $feeder){ break }",
  "}",
  "[pscustomobject]@{files=$files;error=$err} | ConvertTo-Json -Compress",
].join("\n");
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const INTENT = { color: 1, gray: 2, bw: 4 };

function createScannerService({ exec, fs, scansDir, now = () => new Date(), randomId }) {
  const rid = randomId || (() => Math.random().toString(36).slice(2, 8));
  const ps = async (cmd, env, timeout) => { const r = await exec("powershell.exe", [...PS_FLAGS, cmd], { env: { ...process.env, ...(env || {}) }, timeout: timeout || 20000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }); return typeof r === "string" ? r : (r && r.stdout) || ""; };
  const day = () => { const d = now(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  async function list() {
    let raw = "";
    try { raw = await ps(PS_LIST); } catch { return []; }
    let rows = []; try { rows = asArray(JSON.parse(String(raw).trim() || "[]")); } catch { rows = []; }
    return rows.filter((r) => r && r.id).map((r) => ({ id: String(r.id), name: String(r.name || r.id), displayName: String(r.name || r.id) }));
  }
  // req: { scannerId, dpi (75..600), color: 'color'|'gray'|'bw', source: 'flatbed'|'feeder', maxPages }
  async function scan(req) {
    const scanners = await list();
    const sc = scanners.find((s) => s.id === req.scannerId);
    if (!sc) throw new Error("اسکنر پیدا نشد (روشن و وصل بودن آن را بررسی کنید)");
    const dpi = [75, 100, 150, 200, 300, 600].includes(Number(req.dpi)) ? Number(req.dpi) : 200;
    const intent = INTENT[req.color] || INTENT.color;
    const source = req.source === "feeder" ? "feeder" : "flatbed";
    const max = source === "feeder" ? Math.max(1, Math.min(200, Math.floor(Number(req.maxPages) || 50))) : 1;
    const out = path.join(scansDir, day());
    fs.mkdirSync(out, { recursive: true });
    const prefix = `scan-${now().getTime()}-${rid()}`;
    const raw = await ps(PS_SCAN, { CAFINO_SCANNER: sc.id, CAFINO_OUT: out, CAFINO_DPI: String(dpi), CAFINO_INTENT: String(intent), CAFINO_SOURCE: source, CAFINO_MAX: String(max), CAFINO_PREFIX: prefix }, source === "feeder" ? 10 * 60 * 1000 : 3 * 60 * 1000);
    let res; try { res = JSON.parse(String(raw).trim().split(/\r?\n/).pop()); } catch { throw new Error("پاسخ اسکنر قابل خواندن نبود"); }
    const files = asArray(res.files).map(String).filter((f) => f.startsWith(out));
    if (res.error && !files.length) throw new Error(/not-found/.test(res.error) ? "اسکنر پیدا نشد" : "اسکن انجام نشد: " + String(res.error).slice(0, 200));
    return { scanner: sc.name, files, count: files.length, dir: out, partialError: res.error && files.length ? String(res.error).slice(0, 200) : "" };
  }
  const insideScans = (p) => { const rel = path.relative(scansDir, path.resolve(String(p || ""))); return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel); };
  return { list, scan, insideScans, scansDir };
}
module.exports = { createScannerService, PS_SCAN, PS_LIST, INTENT };
