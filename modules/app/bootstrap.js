import { initializeConfig } from './constants.js';
import { initializeDisclaimer } from './disclaimer.js';
import { initializeFfmpegService } from './ffmpeg-service.js';
import { initializeLogger } from './logger.js';
import { initializeOcrIntegration } from './ocr-integration.js';
import { getViolationHelper } from './state.js';
import { initializeTheme } from './theme.js';
import { initializeTimeline } from './timeline.js';
import { createSnapshotEditor } from './snapshot-editor.js';
import { initializeVideoActions } from './video-actions.js';
import { registerUtils } from './utils.js';
import { initializeViolationEditor } from './violation-editor.js';

export async function bootstrap() {
  const helper = getViolationHelper();
  initializeConfig();
  registerUtils();
  initializeLogger();
  initializeDisclaimer();
  initializeTheme();
  initializeOcrIntegration();
  initializeViolationEditor(helper.dom.violationEditorRoot);
  initializeTimeline();

  const { dom, modules, services } = helper;
  if ('ResizeObserver' in window && dom.rail) {
    const resizeObserver = new ResizeObserver(() => {
      services.timeline.updateSelectionBar();
    });
    resizeObserver.observe(dom.rail);
  }

  await initializeFfmpegService();
  await services.ffmpeg.start();

  modules.editorLite = createSnapshotEditor();
  initializeVideoActions();

  requestAnimationFrame(() => {
    services.timeline.updateSelectionBar();
  });
  requestAnimationFrame(() => services.timeline.updateSelectionBar());
}