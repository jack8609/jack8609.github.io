// ffmpeg/worker.js — FFmpeg.wasm 核心 Worker（PThreads/單執行緒皆可）
//
// 功能總覽：
//  1) 舊協定：cmd:init|writeFile|readFile|exec；event:log；resp:{result|error}
//  2) 相容 n4.3.1：優先 cwrap(main/proxy_main)；run() 僅一次性備援
//  3) 多執行緒：locateFile + mainScriptUrlOrBlob 鎖定 .wasm 與 .worker.js
//  4) ★ 完成柵欄：exec 只在偵測到「本輪」結束後才回覆（避免過早 readFile）
//  5) ★ 永遠覆蓋：自動注入 -y、-nostdin（若未指定）
//  6) ★ DEBUG 防回送＆去重：end marker 僅印一次，且不再通知訂閱者
//  7) ★ 防跨輪干擾：加入「武裝（arm）」機制與極短後備武裝，避免上一輪的殘留 FFMPEG_END 誤觸本輪完成

const DEBUG = false;                // 需要大量除錯時設為 true
const EXEC_MAX_WAIT_MS = 5 * 60 * 1000; // 單次 exec 最長等待（5 分鐘）
const ARM_FALLBACK_MS  = 300;       // 未見到首條正常行時，300ms 後自動武裝

let core = null;                    // Module
let FS   = null;

// ---- 日誌派送：把 FFmpeg 的 print/printErr 轉出去，並提供「訂閱機制」給完成柵欄使用
const logSubscribers = new Set();

/**
 * 對外 log（傳給主執行緒）＋（可選）通知訂閱者
 * @param {string} message
 * @param {any} extra
 * @param {{muteSubs?: boolean}} [opts]  muteSubs=true 時不通知訂閱者（避免自回送）
 */
function logMsg(message, extra, opts = {}) {
  try { postMessage({ type: 'event', data: { evt: 'log', payload: { message, extra } } }); } catch(_) {}
  if (opts.muteSubs) return;        // ★ 不通知訂閱者：避免自回送
  for (const cb of logSubscribers) {
    try { cb(String(message)); } catch (_) {}
  }
}
function reply(id, result, error) {
  try { postMessage({ type:'resp', id, data: error ? { error: String(error) } : { result } }); } catch(_) {}
}
function hex(b){ return b.toString(16).padStart(2,'0'); }

// ---- exec 參數正規化：一律覆蓋（-y），一律無互動（-nostdin）
function normalizeArgsForExec(argv) {
  const a = Array.isArray(argv) ? [...argv] : [];
  const hasFlag = (flag) => a.some(x => String(x).toLowerCase() === flag);

  if (!hasFlag('-nostdin')) a.unshift('-nostdin');
  if (!hasFlag('-y'))       a.unshift('-y');

  return a;
}

// ---- 以 cwrap(main/proxy_main) 建 exec；無法 cwrap 時用 run()/callMain（run 僅一次性）
let runUsedOnce = false;
function makeExec(mod){
  if (typeof mod.callMain === 'function') {
    if (DEBUG) logMsg('[worker] exec path = callMain(...)');
    return (argv) => mod.callMain(argv);
  }
  if (typeof mod.cwrap === 'function' &&
      mod.HEAPU8 && mod.HEAP32 &&
      typeof mod.stackSave === 'function' &&
      typeof mod.stackAlloc === 'function' &&
      typeof mod.stackRestore === 'function') {

    const tryWrap = (sym)=>{ try{ return mod.cwrap(sym,'number',['number','number']); }catch(_){ return null; } };
    const callWrapped = tryWrap('proxy_main') || tryWrap('main');

    if (callWrapped) {
      if (DEBUG) logMsg('[worker] exec path = cwrap(main/proxy_main)');
      const enc = (s)=>{
        const text = (s==null?'':String(s));
        const len  = mod.lengthBytesUTF8 ? mod.lengthBytesUTF8(text)+1 : (text.length+1)*4;
        const ptr  = mod.stackAlloc(len);
        if (mod.stringToUTF8) mod.stringToUTF8(text, ptr, len);
        else {
          const view = mod.HEAPU8.subarray(ptr, ptr+len);
          for (let i=0; i<text.length; i++) view[i] = text.charCodeAt(i) & 0xFF;
          view[text.length] = 0;
        }
        return ptr;
      };
      const withProgName = (argv)=> (Array.isArray(argv) && argv[0]==='ffmpeg') ? argv : ['ffmpeg', ...(argv||[])];

      return (argv)=>{
        const args = withProgName(argv);
        const stack = mod.stackSave();
        try {
          const argc = args.length;
          const argvPtrs = new Array(argc);
          for (let i=0; i<argc; i++) argvPtrs[i] = enc(args[i]);
          const table = mod.stackAlloc((argc+1)*4);
          for (let i=0; i<argc; i++) mod.HEAP32[(table>>2)+i] = argvPtrs[i];
          mod.HEAP32[(table>>2)+argc] = 0;
          return callWrapped(argc, table);
        } finally { mod.stackRestore(stack); }
      };
    }
  }
  if (typeof mod.run === 'function') {
    if (DEBUG) logMsg('[worker] exec path = run() + mod.arguments (one-shot)');
    return (argv)=>{
      if (mod.calledRun || runUsedOnce) {
        throw new Error('run() already used once; cwrap/callMain required for repeated exec');
      }
      runUsedOnce = true;
      try { mod.arguments = Array.isArray(argv) ? argv : []; } catch(_) {}
      return mod.run();
    };
  }
  if (DEBUG) logMsg('[worker] exec path resolve FAILED');
  return null;
}

// ---- 全域錯誤攔截（除錯時）
self.addEventListener('error', (e)=>{ if (DEBUG) logMsg(`[worker] GlobalError: ${e?.message||e}`, { stack:e?.error?.stack||null }); });
self.addEventListener('unhandledrejection', (e)=>{ if (DEBUG) logMsg(`[worker] UnhandledRejection: ${e?.reason?.message||e?.reason||e}`, { stack:e?.reason?.stack||null }); });

// ---- 主訊息入口
self.onmessage = async (ev)=>{
  const m = ev && ev.data || {};
  if (m.type !== 'cmd') return;

  const { id, cmd, payload } = m;

  try{
    // ============ init ============
    if (cmd === 'init') {
      const { coreURL, wasmURL } = payload || {};
      if (!coreURL || !wasmURL) return reply(id,null,'init() 需要 coreURL 與 wasmURL');

      if (DEBUG) logMsg(`[worker] init: coreURL=${coreURL}, wasmURL=${wasmURL}`);
      const coreBase = coreURL.replace(/[^/]+$/,''); // /core/

      // 1) 載入核心 JS
      try { importScripts(coreURL); if (DEBUG) logMsg('[worker] importScripts(coreURL) OK'); }
      catch(e){ return reply(id,null,`importScripts(coreURL) failed: ${e?.message || e}`); }

      // 2) 抓 wasm + 驗證 magic
      let wasmBinary;
      try {
        const res = await fetch(wasmURL, { cache:'no-store' });
        const buf = await res.arrayBuffer();
        const u8  = new Uint8Array(buf);
        const magicOK = u8.length >= 4 && u8[0]===0x00 && u8[1]===0x61 && u8[2]===0x73 && u8[3]===0x6d;
        if (DEBUG) logMsg(`[worker] wasm len=${u8.length}, magicOK=${magicOK}, head16=${Array.from(u8.slice(0,16)).map(hex).join(' ')}`);
        if (!magicOK) return reply(id,null,'wasmBinary invalid (magic mismatch)');
        wasmBinary = buf;
      } catch(e){ return reply(id,null,`fetch(wasmURL) failed: ${e?.message || e}`); }

      // 3) 建立 Module（鎖定 .wasm 與子 worker 的尋路）
      const factory = self.createFFmpegCore;
      if (typeof factory !== 'function') return reply(id,null,'createFFmpegCore not found (check coreURL)');

      try {
        core = await factory({
          wasmBinary,
          print:    (txt)=> logMsg(String(txt)),
          printErr: (txt)=> logMsg(String(txt)),
          locateFile: (p)=> `${coreBase}${p}`,
          mainScriptUrlOrBlob: coreURL,
        });
        if (DEBUG) logMsg('[worker] createFFmpegCore resolved');
      } catch(e){ return reply(id,null,`createFFmpegCore failed: ${e?.message || e}`); }

      // 4) exec 建立
      core.exec = makeExec(core);
      if (!core.exec) return reply(id,null,'cannot build exec shim');

      // 5) 取得 FS
      FS = core && core.FS;
      if (!FS) return reply(id,null,'FFmpeg Core did not expose FS');

      // 6) （可選）探測子 worker 是否可取
      if (DEBUG) {
        try {
          const probe = `${coreBase}ffmpeg-core.worker.js`;
          const r = await fetch(probe, { cache:'no-store' });
          logMsg(`[worker] probe worker.js: ${probe} → ${r.status}`);
        } catch(e) { logMsg(`[worker] probe worker.js failed: ${e?.message||e}`); }
      }

      try { postMessage({ type:'ready' }); } catch(_){}
      return reply(id, true);
    }

    // ============ writeFile ============
    if (cmd === 'writeFile') {
      const { path, data } = payload || {};
      if (!FS) return reply(id,null,'FS not ready');
      if (!path || !data) return reply(id,null,'writeFile() 需要 path 與 data');
      try { FS.writeFile(path, data); if (DEBUG) logMsg(`[worker] writeFile OK: path=${path}, len=${data.byteLength||data.length||0}`); }
      catch(e){ return reply(id,null,`writeFile failed: ${e?.message || e}`); }
      return reply(id,true);
    }

    // ============ readFile ============
    if (cmd === 'readFile') {
      const { path } = payload || {};
      if (!FS) return reply(id,null,'FS not ready');
      if (!path) return reply(id,null,'readFile() 需要 path');
      try { const out = FS.readFile(path); return reply(id, out && out.buffer ? out.buffer : out); }
      catch(e){ return reply(id,null,`readFile failed: ${e?.message || e}`); }
    }

    // ============ exec（★完成柵欄 + 武裝） ============
    if (cmd === 'exec') {
      const { args } = payload || {};
      if (!Array.isArray(args)) return reply(id,null,'exec() 需要 args:Array<string>');
      if (!core || typeof core.exec !== 'function') core.exec = makeExec(core || {});
      if (!core || typeof core.exec !== 'function') return reply(id,null,'Module.exec not available (unexpected)');

      // 1) 正規化參數：永遠覆蓋 + 禁止互動
      const norm = normalizeArgsForExec(args);
      if (DEBUG) logMsg(`[worker] exec begin: ${norm.join(' ')}`);

      // 2) 結束條件（僅認 FFMPEG_END 成功；常見失敗列在 FAIL）
      const END_OK   = new Set(['FFMPEG_END']);
      const END_FAIL = new Set(['Conversion failed!']);

      let done = false;
      let timer = null;
      let armed = false;           // ★ 未武裝前忽略任何 end marker（防吃到上一輪的殘留）
      let endPrinted = false;      // DEBUG 去重

      const finish = (ok) => {
        if (done) return;
        done = true;
        if (timer) { try { clearTimeout(timer); } catch(_){} timer = null; }
        logSubscribers.delete(onLine);
        if (DEBUG) logMsg(`[worker] exec done (ok=${ok})`, null, { muteSubs:true });
        reply(id, !!ok);
      };

      const onLine = (line) => {
        // 忽略我們自己的 debug
        if (line.startsWith('[worker]')) return;

        // 還沒武裝：第一條不是 end marker 的 FFmpeg 行 → 武裝
        if (!armed) {
          const isOk   = [...END_OK].some(m => line.includes(m));
          const isFail = [...END_FAIL].some(m => line.includes(m));
          if (!isOk && !isFail && line.trim() !== '') {
            armed = true;
            if (DEBUG) logMsg('[worker] exec armed', null, { muteSubs:true });
          }
          return; // 未武裝狀態，不處理 end marker
        }

        // 已武裝：判斷成功/失敗
        if ([...END_FAIL].some(m => line.includes(m))) {
          if (DEBUG && !endPrinted) { endPrinted = true; logMsg(`[worker] exec end marker: FAIL`, null, { muteSubs:true }); }
          finish(false); return;
        }
        if ([...END_OK].some(m => line.includes(m))) {
          if (DEBUG && !endPrinted) { endPrinted = true; logMsg(`[worker] exec end marker: FFMPEG_END`, null, { muteSubs:true }); }
          finish(true); return;
        }
      };

      logSubscribers.add(onLine);

      // 3) 極短後備武裝：若 300ms 內未見到首條正常行，也自動武裝（避免極端無輸出情況）
      const armTimer = setTimeout(() => { if (!armed) armed = true; }, ARM_FALLBACK_MS);

      // 4) 超時保護，防止永遠不結束
      timer = setTimeout(() => {
        if (DEBUG) logMsg('[worker] exec timeout', null, { muteSubs:true });
        finish(false);
      }, EXEC_MAX_WAIT_MS);

      // 5) 觸發執行
      try {
        core.exec(norm);
      } catch (e) {
        logSubscribers.delete(onLine);
        try { clearTimeout(timer); clearTimeout(armTimer); } catch(_) {}
        return reply(id,null,`exec failed: ${e?.message || e}`);
      }

      // 注意：這裡**不**回覆，等待 onLine 或 timeout 觸發 finish()
      return;
    }

    return reply(id,null,`Unknown cmd: ${cmd}`);
  } catch(err){
    return reply(id,null, err?.message || err);
  }
};