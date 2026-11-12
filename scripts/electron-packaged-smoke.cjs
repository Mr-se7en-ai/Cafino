// دودِ بستهٔ واقعیِ ساخته‌شده (با فیوزها): اجرای مستقیم باینری + اتصال CDP به رندرر
const { chromium } = require('playwright'); const { spawn, spawnSync } = require('child_process');
const EXE = process.argv[2]; let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const r = spawnSync(EXE, ['--no-sandbox', '-e', 'console.log("NODE_RAN")'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 15000, encoding: 'utf8' });
  ok(!/NODE_RAN/.test((r.stdout || '') + (r.stderr || '')), 'ELECTRON_RUN_AS_NODE=1 does NOT run as plain node (fuse)');
  const p = spawn(EXE, ['--no-sandbox', '--disable-gpu', '--remote-debugging-port=9333'], { stdio: 'ignore' });
  let b; for (let i = 0; i < 40 && !b; i++) { try { b = await chromium.connectOverCDP('http://127.0.0.1:9333'); } catch { await new Promise(r => setTimeout(r, 500)); } }
  if (!b) { ok(false, 'could not attach to packaged app'); p.kill(); process.exit(1); }
  let win; for (let i = 0; i < 40 && !win; i++) { win = b.contexts().flatMap(c => c.pages()).find(pg => /^file:|app/.test(pg.url())); if (!win) await new Promise(r => setTimeout(r, 500)); }
  await win.waitForTimeout(4000);
  const info = await win.evaluate(() => ({ req: typeof require, proc: typeof process, native: Object.keys(window.cafenetNative || {}).sort().join(), loaded: document.body.innerText.length > 50, url: location.href.slice(0, 40) }));
  ok(info.req === 'undefined' && info.proc === 'undefined', 'renderer has no Node: ' + info.req + '/' + info.proc);
  ok(info.native === 'capabilities,fetch,platform,printer,scanner,seal,secrets', 'cafenetNative surface: ' + info.native);
  ok(info.loaded, 'packaged app UI rendered (' + info.url + ')');
  const caps = await win.evaluate(() => window.cafenetNative.capabilities());
  ok(caps && caps.version === 3, 'IPC capabilities v' + (caps && caps.version) + ' ; secureStore=' + JSON.stringify(caps && caps.secureStoreStatus));
  const f = await win.evaluate(async () => { try { await window.cafenetNative.fetch('http://169.254.169.254/latest/meta-data/', {}); return 'ALLOWED'; } catch (e) { return 'ERR ' + String(e).slice(0, 60); } });
  ok(/^ERR/.test(f), 'metadata-IP fetch refused: ' + f);
  p.kill(); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
