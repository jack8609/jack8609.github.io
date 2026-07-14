import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bootstrapPath = new URL('../modules/app/bootstrap.js', import.meta.url);
const bootstrapSource = await readFile(bootstrapPath, 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const imports = [
  "./constants.js",
  "./disclaimer.js",
  "./ffmpeg-service.js",
  "./logger.js",
  "./ocr-integration.js",
  "./state.js",
  "./theme.js",
  "./timeline.js",
  "./snapshot-editor.js",
  "./video-actions.js",
  "./utils.js",
  "./violation-editor.js"
];
const startupCalls = [
  'getViolationHelper()',
  'initializeConfig()',
  'registerUtils()',
  'initializeLogger()',
  'initializeDisclaimer()',
  'initializeTheme()',
  'initializeOcrIntegration()',
  'initializeViolationEditor(helper.dom.violationEditorRoot)',
  'initializeTimeline()',
  'await initializeFfmpegService()',
  'await services.ffmpeg.start()',
  'modules.editorLite = createSnapshotEditor()',
  'initializeVideoActions()'
];

assert.match(bootstrapSource, /export async function bootstrap\(\)/);
for (const path of imports) {
  assert.match(bootstrapSource, new RegExp(`from '${path.replace('.', '\\.')}'`));
}
let previousPosition = -1;
for (const call of startupCalls) {
  const position = bootstrapSource.indexOf(call);
  assert.ok(position > previousPosition, `Expected bootstrap call after previous call: ${call}`);
  previousPosition = position;
}
assert.doesNotMatch(bootstrapSource, /window\.App|window\.state/);
assert.match(indexSource, /<script type="module">\s*import \{ bootstrap \} from '\.\/modules\/app\/bootstrap\.js';\s*await bootstrap\(\);\s*<\/script>/);
assert.match(indexSource, /<script>\s*\(function\(\)/);
assert.match(indexSource, /<script src="\.\/violation_list\.js"><\/script>/);

console.log('bootstrap contract passed');