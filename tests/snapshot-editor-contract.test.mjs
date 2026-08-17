import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = {
  ViolationHelper: {
    modules: {},
    services: { ocr: { recognize: async () => {} } },
    utils: {
      getPlateFromInputs() { return ''; },
      toLocalTimestamp(date) {
        const d = date instanceof Date ? date : new Date(date);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      }
    }
  }
};
globalThis.document = {
  getElementById() {
    return {};
  },
  createElement() {
    return { getContext() { return {}; } };
  }
};

const source = await readFile(new URL('../modules/app/snapshot-editor.js', import.meta.url), 'utf8');
assert.match(source, /export function createSnapshotEditor\(\)/);
assert.match(source, /services\.ocr\?\.recognize/);
assert.match(source, /services\.ocr\.recognize\(c\)/);
assert.doesNotMatch(source, /PlateOCR\.runPipeline|window\.PlateOCR/);
// 車牌優先命名 + 本機時間戳（不可再用 UTC 的 toISOString）
assert.doesNotMatch(source, /toISOString/);
assert.match(source, /utils\.getPlateFromInputs\(\)/);
assert.match(source, /utils\.toLocalTimestamp\(/);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createSnapshotEditor } = await import(moduleUrl);
const editorLite = createSnapshotEditor();

assert.deepEqual(Object.keys(editorLite).sort(), ['init', 'isReady', 'loadSnapshot']);
assert.equal(editorLite.isReady(), false);

console.log('snapshot editor contract passed');