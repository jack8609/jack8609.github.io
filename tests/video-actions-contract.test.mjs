import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dom = {
  fileInput: {},
  fileInfo: {},
  preview: {},
  startRange: {},
  endRange: {},
  btnClip: {},
  btnDownloadFull: {},
  btnThumbnail: {},
  shotPreviewBox: {}
};

globalThis.window = {
  ViolationHelper: {
    config: { ffmpeg: { remuxArgs: [] } },
    dom,
    state: { video: {} },
    services: {
      ffmpeg: { instance: {} },
      timeline: { resetClipUI() {} }
    },
    modules: { editorLite: {} },
    utils: {
      errlog() {},
      fileToUint8Array() {},
      inferInputName() {},
      log() {},
      revokeURL() {},
      setActionsEnabled() {},
      toast() {},
      triggerDownloadFromBlob() {}
    }
  }
};

const source = await readFile(new URL('../modules/app/video-actions.js', import.meta.url), 'utf8');
assert.match(source, /export function initializeVideoActions\(\)/);
assert.match(source, /services\.ffmpeg\.instance/);
assert.match(source, /services\.timeline\.resetClipUI/);
assert.match(source, /modules\.editorLite/);
assert.doesNotMatch(source, /state\.ffmpeg\.instance/);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { initializeVideoActions } = await import(moduleUrl);
initializeVideoActions();

assert.equal(typeof dom.fileInput.onchange, 'function');
assert.equal(typeof dom.btnClip.onclick, 'function');
assert.equal(typeof dom.btnDownloadFull.onclick, 'function');
assert.equal(typeof dom.btnThumbnail.onclick, 'function');

console.log('video actions contract passed');