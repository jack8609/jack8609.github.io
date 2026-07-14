import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = {
  ViolationHelper: {
    config: {}
  }
};

const moduleFileUrl = new URL('../modules/app/constants.js', import.meta.url);
const source = await readFile(moduleFileUrl, 'utf8');
const executableSource = source.replaceAll('import.meta.url', JSON.stringify(moduleFileUrl.href));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(executableSource).toString('base64')}`;
const { initializeConfig } = await import(moduleUrl);
initializeConfig();

const { config } = window.ViolationHelper;
assert.deepEqual(config.storageKeys, {
  disclaimerAcceptedAt: 'user_agreed_timestamp',
  theme: 'app-theme',
  autoPlateOcrEnabled: 've_auto_ocr_enabled'
});
assert.deepEqual(config.ocrScripts, [
  { url: './tesseract/tesseract.min.js', label: 'OCR 文字辨識引擎' },
  { url: './opencv/opencv.min.js', label: '影像校正引擎（檔案較大，請耐心等候）' },
  { url: './plate-ocr/plate-ocr.js', label: '車牌辨識模組' }
]);
assert.deepEqual(config.ffmpeg.remuxArgs, [
  '-i', 'inputfile', '-c', 'copy', '-tag:v', 'hvc1', '-bsf:a', 'aac_adtstoasc',
  '-movflags', '+faststart', 'automp4.mp4'
]);
assert.match(source, /new URL\('\.\.\/\.\.\/core\/ffmpeg-core\.js', import\.meta\.url\)\.href/);
assert.match(source, /new URL\('\.\.\/\.\.\/core\/ffmpeg-core\.wasm', import\.meta\.url\)\.href/);
assert.match(source, /new URL\('\.\.\/\.\.\/ffmpeg\/worker\.js', import\.meta\.url\)\.href/);

console.log('constants contract passed');