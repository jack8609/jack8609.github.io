import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const expectedDomIds = [
  'status', 'log', 'btnCopyLog', 'logPanel', 'toggleLog', 'file', 'fileInfo',
  'preview', 'cur', 'dur', 'rail', 'selection', 'startRange', 'endRange',
  'startLabel', 'endLabel', 'btnClip', 'btnDownloadFull', 'btnThumbnail',
  'shotPreview', 'warning-overlay', 'warning-scroll-box', 'no-show-again',
  'btn-confirm-action', 'themeSwitch', 'themeLabel', 'violation-editor-root'
];

const nodes = Object.fromEntries(expectedDomIds.map((id) => [id, { id }]));
globalThis.window = {};
globalThis.document = {
  getElementById(id) {
    return nodes[id] ?? null;
  }
};

const source = await readFile(new URL('../modules/app/state.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { getViolationHelper } = await import(moduleUrl);
const helper = getViolationHelper();

assert.strictEqual(window.ViolationHelper, helper);
assert.deepEqual(Object.keys(window), ['ViolationHelper']);
assert.deepEqual(Object.keys(helper).sort(), [
  'config', 'dom', 'modules', 'services', 'state', 'utils'
]);
assert.strictEqual(helper.dom.statusEl, nodes.status);
assert.strictEqual(helper.dom.violationEditorRoot, nodes['violation-editor-root']);
assert.deepEqual(helper.config, {});
assert.deepEqual(helper.state, {
  ui: { theme: null, isLogVisible: false, isDisclaimerDismissed: false },
  video: {
    selectedFileRaw: null,
    playableBlob: null,
    playableName: '',
    autoMp4Blob: null,
    autoMp4Url: '',
    currentObjectURL: '',
    lastSnapshotURL: null
  },
  ffmpeg: { ctor: null, instance: null, isReady: false, error: null },
  ocr: { libsPromise: null, isBusy: false, isAutoEnabled: false }
});
assert.deepEqual(helper.services, {});
assert.deepEqual(helper.modules, {});
assert.deepEqual(helper.utils, {});

console.log('state contract passed');