export function getViolationHelper() {
  return window.ViolationHelper = {
    dom: {
      statusEl: document.getElementById('status'),
      logEl: document.getElementById('log'),
      btnCopyLog: document.getElementById('btnCopyLog'),
      logPanel: document.getElementById('logPanel'),
      toggleLog: document.getElementById('toggleLog'),
      fileInput: document.getElementById('file'),
      fileInfo: document.getElementById('fileInfo'),
      preview: document.getElementById('preview'),
      curEl: document.getElementById('cur'),
      durEl: document.getElementById('dur'),
      rail: document.getElementById('rail'),
      selectionEl: document.getElementById('selection'),
      startRange: document.getElementById('startRange'),
      endRange: document.getElementById('endRange'),
      startLabel: document.getElementById('startLabel'),
      endLabel: document.getElementById('endLabel'),
      btnClip: document.getElementById('btnClip'),
      btnDownloadFull: document.getElementById('btnDownloadFull'),
      btnThumbnail: document.getElementById('btnThumbnail'),
      shotPreviewBox: document.getElementById('shotPreview'),
      overlay: document.getElementById('warning-overlay'),
      scrollBox: document.getElementById('warning-scroll-box'),
      checkbox: document.getElementById('no-show-again'),
      btn: document.getElementById('btn-confirm-action'),
      themeSwitch: document.getElementById('themeSwitch'),
      themeLabel: document.getElementById('themeLabel'),
      violationEditorRoot: document.getElementById('violation-editor-root')
    },
    config: {},
    state: {
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
    },
    services: {},
    modules: {},
    utils: {}
  };
}