import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dom = {
  fileInput: {},
  fileInfo: {},
  preview: {},
  startRange: { value: '0' },
  endRange: { value: '0' },
  btnClip: {},
  btnDownloadFull: {},
  btnThumbnail: {},
  shotPreviewBox: {}
};

const ffmpegCalls = { written: [], executed: [], read: [], deleted: [] };
const ffmpegInstance = {
  async writeFile(name) { ffmpegCalls.written.push(name); },
  async exec(args) { ffmpegCalls.executed.push(args); },
  async readFile(name) { ffmpegCalls.read.push(name); return { buffer: new Uint8Array([1, 2, 3]).buffer }; },
  async deleteFile(name) { ffmpegCalls.deleted.push(name); }
};

const downloads = [];
let plateInputs = { 've-plate1': '', 've-plate2': '' };
globalThis.document = {
  getElementById(id) {
    return Object.prototype.hasOwnProperty.call(plateInputs, id) ? { value: plateInputs[id] } : null;
  }
};

globalThis.window = {
  ViolationHelper: {
    config: { ffmpeg: { remuxArgs: [] } },
    dom,
    state: { video: {} },
    services: {
      ffmpeg: { instance: ffmpegInstance },
      timeline: { resetClipUI() {} }
    },
    modules: { editorLite: {} },
    utils: {
      errlog() {},
      fileToUint8Array: async () => new Uint8Array([0]),
      inferInputName: () => 'input.mp4',
      log() {},
      revokeURL() {},
      setActionsEnabled() {},
      toast() {},
      triggerDownloadFromBlob(_blob, filename) { downloads.push(filename); },
      getPlateFromInputs() {
        const p1 = (plateInputs['ve-plate1'] || '').trim();
        const p2 = (plateInputs['ve-plate2'] || '').trim();
        if (p1 && p2) return `${p1}-${p2}`;
        return p1 || p2 || '';
      },
      getBaseNameWithoutExt(name) {
        return (name || '').replace(/\.[^./\\]+$/, '');
      }
    }
  }
};

const source = await readFile(new URL('../modules/app/video-actions.js', import.meta.url), 'utf8');
assert.match(source, /export function initializeVideoActions\(\)/);
assert.match(source, /services\.ffmpeg\.instance/);
assert.match(source, /services\.timeline\.resetClipUI/);
assert.match(source, /modules\.editorLite/);
assert.match(source, /getPlateFromInputs/);
assert.match(source, /getBaseNameWithoutExt/);
assert.doesNotMatch(source, /state\.ffmpeg\.instance/);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { initializeVideoActions } = await import(moduleUrl);
initializeVideoActions();

assert.equal(typeof dom.fileInput.onchange, 'function');
assert.equal(typeof dom.btnClip.onclick, 'function');
assert.equal(typeof dom.btnDownloadFull.onclick, 'function');
assert.equal(typeof dom.btnThumbnail.onclick, 'function');

const { state } = window.ViolationHelper;

// 剪輯：有車牌 → 車牌_開始_結束.mp4，內部暫存檔仍為 clip.mp4
plateInputs = { 've-plate1': 'ABC', 've-plate2': '1234' };
state.video.playableBlob = {};
state.video.playableName = 'input.mp4';
state.video.selectedFileRaw = { name: 'DVR_原始檔.mp4' };
dom.startRange.value = '0';
dom.endRange.value = '125.3';
downloads.length = 0;
await dom.btnClip.onclick();
assert.deepEqual(downloads, ['ABC-1234_0000_0205.mp4']);
assert.ok(ffmpegCalls.executed.at(-1).includes('clip.mp4'));

// 剪輯：無車牌 → 原始檔名（去副檔名）_開始_結束.mp4
plateInputs = { 've-plate1': '', 've-plate2': '' };
downloads.length = 0;
await dom.btnClip.onclick();
assert.deepEqual(downloads, ['DVR_原始檔_0000_0205.mp4']);

// 完整轉檔（非 TS）：有車牌 → 車牌.mp4
plateInputs = { 've-plate1': 'XYZ', 've-plate2': '' };
state.video.selectedFileRaw = { name: 'MyVideo.mp4' };
state.video.autoMp4Blob = null;
downloads.length = 0;
await dom.btnDownloadFull.onclick();
assert.deepEqual(downloads, ['XYZ.mp4']);

// 完整轉檔（非 TS）：無車牌 → 原始檔名_converted.mp4
plateInputs = { 've-plate1': '', 've-plate2': '' };
downloads.length = 0;
await dom.btnDownloadFull.onclick();
assert.deepEqual(downloads, ['MyVideo_converted.mp4']);

// 完整轉檔（TS，已快取自動轉檔）：有/無車牌 都套用同一規則
plateInputs = { 've-plate1': 'TS9', 've-plate2': '' };
state.video.selectedFileRaw = { name: 'clip.ts' };
state.video.autoMp4Blob = {};
downloads.length = 0;
await dom.btnDownloadFull.onclick();
assert.deepEqual(downloads, ['TS9.mp4']);

plateInputs = { 've-plate1': '', 've-plate2': '' };
downloads.length = 0;
await dom.btnDownloadFull.onclick();
assert.deepEqual(downloads, ['clip_converted.mp4']);

console.log('video actions contract passed');