import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = {
  ViolationHelper: {
    modules: {},
    services: { ocr: { recognize: async () => {} } }
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
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createSnapshotEditor } = await import(moduleUrl);
const editorLite = createSnapshotEditor();

assert.deepEqual(Object.keys(editorLite).sort(), ['init', 'isReady', 'loadSnapshot']);
assert.equal(editorLite.isReady(), false);

console.log('snapshot editor contract passed');