export function initializeVideoActions() {
  const { config, dom, modules, services, state, utils } = window.ViolationHelper;
  const {
    fileInput, fileInfo, preview, startRange, endRange, btnClip, btnDownloadFull, btnThumbnail,
    shotPreviewBox
  } = dom;
  const {
    errlog, fileToUint8Array, inferInputName, log, revokeURL, setActionsEnabled, toast,
    triggerDownloadFromBlob
  } = utils;
    async function detectTsVideoCodec(ffmpeg, inName) {
      return new Promise(async (resolve) => {
        let videoCodec = null;
        const handler = ({ message }) => {
          // 典型行例如： "Video: hevc (Main) ..." / "Video: h264 (High) ..."
          const m = typeof message === 'string' && message.match(/Video:\s*([a-zA-Z0-9_]+)/);
          if (m) videoCodec = m[1].toLowerCase();
        };
        ffmpeg.on && ffmpeg.on('log', handler);
        try {
          // 輕探測。-hide_banner 只為少點雜訊；失敗也沒關係（我們只要 log）
          await ffmpeg.exec(['-hide_banner', '-i', inName]).catch(() => {});
        } finally {
          // 簡單移除監聽（若你的 FFmpeg.on 無 off，可忽略）
          // ffmpeg.off && ffmpeg.off('log', handler);
          resolve(videoCodec); // 可能為 null（解析不到時）
        }
      });
    }

    // ✅ 快照 URL 追蹤與釋放
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      // 清理快照 URL
      if (state.video.lastSnapshotURL) { URL.revokeObjectURL(state.video.lastSnapshotURL); state.video.lastSnapshotURL = null; }

      revokeURL(state.video.currentObjectURL); state.video.currentObjectURL = '';
      if (!(modules.editorLite?.isReady && modules.editorLite.isReady())) {
        shotPreviewBox.innerHTML = '<span class="hint">尚未擷取縮圖</span>';
      }

      if (!file) {
        state.video.selectedFileRaw = null; state.video.playableBlob = null; state.video.playableName = '';
        state.video.autoMp4Blob = null; state.video.autoMp4Url = '';
        setActionsEnabled(false);
        preview.removeAttribute('src'); preview.load();
        fileInfo.textContent = '請選擇影片（支援 .mp4 / .ts / .mov 等）';
        services.timeline.resetClipUI(0);
        return;
      }

      state.video.selectedFileRaw = file;
      const lower = (file.name || '').toLowerCase();
      const isTS = lower.endsWith('.ts');

      try {
        if (isTS) {
          const inName = 'input.ts';
          const outName = 'automp4.mp4';
          await services.ffmpeg.instance.writeFile(inName, await utils.fileToUint8Array(file));
          // 先探測 TS 視訊編碼
          const vCodec = await detectTsVideoCodec(services.ffmpeg.instance, inName);
          const tagMap = {
            h264: 'avc1',
            avc:  'avc1',
            hevc: 'hvc1',
            h265: 'hvc1'
          };
          const tag = tagMap[vCodec];
          if (!tag) {
            fileInfo.textContent = `不支援的 TS 格式：${vCodec || '未知'}`;
            return;
          }
          config.ffmpeg.remuxArgs[1] = inName;
          config.ffmpeg.remuxArgs[5] = tag;  // 套用正確的 tag
          config.ffmpeg.remuxArgs[config.ffmpeg.remuxArgs.length - 1] = outName;
          log('偵測到 TS，執行快速轉換容器為 MP4…', config.ffmpeg.remuxArgs);
          await services.ffmpeg.instance.exec(config.ffmpeg.remuxArgs);
          const data = await services.ffmpeg.instance.readFile(outName);
          state.video.autoMp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
          state.video.playableBlob = state.video.autoMp4Blob;
          state.video.playableName = 'input.mp4';
          state.video.autoMp4Url = URL.createObjectURL(state.video.autoMp4Blob);
          state.video.currentObjectURL = state.video.autoMp4Url;
          fileInfo.textContent = `已選擇：${file.name}(${(file.size/1024/1024).toFixed(2)} MB) | 自動重封裝為 MP4`;
          // 清理 FFmpeg 虛擬檔案
          try { await services.ffmpeg.instance.deleteFile?.(inName); } catch {}
          try { await services.ffmpeg.instance.deleteFile?.(outName); } catch {}
        } else {
          // 原本邏輯：非 TS 直接預覽
          state.video.playableBlob = file;
          state.video.playableName = inferInputName(file.name);
          state.video.autoMp4Blob = null; state.video.autoMp4Url = '';
          state.video.currentObjectURL = URL.createObjectURL(file);
          fileInfo.textContent = `已選擇：${file.name}(${(file.size/1024/1024).toFixed(2)} MB)`;
        }
        preview.src = state.video.currentObjectURL;
        preview.load();
        setActionsEnabled(true);
      } catch (e) {
        errlog('載入/轉檔失敗：', e?.message || e);
        alert('載入或自動轉檔失敗：' + (e?.message || e));
        setActionsEnabled(false);
      }
    };

    /********** 功能 1：剪輯並輸出（不重編碼，-c copy）→ 直接下載 **********/
    btnClip.onclick = async () => {
      try {
        if (!state.video.playableBlob) { alert('請先選擇檔案'); return; }

        const s = parseFloat(startRange.value);
        const e = parseFloat(endRange.value);
        if (!isFinite(s) || !isFinite(e)) { alert('請設定開始與結束時間'); return; }
        if (e <= s) { alert('結束時間必須大於開始時間'); return; }

        const inName = state.video.playableName || 'input.mp4';
        const outName = 'clip.mp4';

        log('開始快速剪輯（無轉碼）…', { start: s, end: e, inName, outName });
        await services.ffmpeg.instance.writeFile(inName, await utils.fileToUint8Array(state.video.playableBlob));

        const ss = s.toFixed(2);
        const to = e.toFixed(2);
        // 精準（較慢）：-ss 在 -i 之後
        await services.ffmpeg.instance.exec(['-i', inName, '-ss', ss, '-to', to, '-c', 'copy', outName]);

        const data = await services.ffmpeg.instance.readFile(outName);
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        triggerDownloadFromBlob(blob, outName);
        toast(`已下載剪輯檔 (${ss}s → ${to}s)`);
        log('剪輯完成並已觸發下載 ✅');
      } catch (e) {
        errlog('快速剪輯失敗：', e?.message || e);
        alert('剪輯失敗：' + (e?.message || e));
      } finally {
        // 清理暫存檔案
        try { await services.ffmpeg.instance.deleteFile?.('clip.mp4'); } catch {}
        try {
          const inName = state.video.playableName || 'input.mp4';
          await services.ffmpeg.instance.deleteFile?.(inName);
        } catch {}
      }
    };


    /********** 功能 2：下載完整轉檔 **********/
    btnDownloadFull.onclick = async () => {
      try {
        if (!state.video.selectedFileRaw) { alert("請先選擇檔案"); return; }

        const lower = (state.video.selectedFileRaw.name || '').toLowerCase();
        const isTS = lower.endsWith('.ts');

        if (isTS) {
          if (state.video.autoMp4Blob) {
            triggerDownloadFromBlob(state.video.autoMp4Blob, 'converted.mp4');
            toast('已下載自動轉檔 MP4');
            log('TS 已自動轉檔完成，觸發下載 converted.mp4 ✅');
            return;
          }
          const inName = 'input.ts';
          const outName = 'automp4.mp4';
          await services.ffmpeg.instance.writeFile(inName, await utils.fileToUint8Array(state.video.selectedFileRaw));
          config.ffmpeg.remuxArgs[1] = inName;
          config.ffmpeg.remuxArgs[config.ffmpeg.remuxArgs.length - 1] = outName;
          await services.ffmpeg.instance.exec(config.ffmpeg.remuxArgs);
          const data = await services.ffmpeg.instance.readFile(outName);
          const blob = new Blob([data.buffer], { type: 'video/mp4' });
          triggerDownloadFromBlob(blob, 'converted.mp4');
          toast('已下載自動轉檔 MP4');
          log('TS 重新自動轉檔後觸發下載 ✅');
          try { await services.ffmpeg.instance.deleteFile?.(inName); } catch {}
          try { await services.ffmpeg.instance.deleteFile?.(outName); } catch {}
        } else {
          const inName = inferInputName(state.video.selectedFileRaw.name);
          await services.ffmpeg.instance.writeFile(inName, await utils.fileToUint8Array(state.video.selectedFileRaw));
          await services.ffmpeg.instance.exec(['-i', inName, '-movflags', 'faststart', 'output.mp4']);
          const data = await services.ffmpeg.instance.readFile('output.mp4');
          const blob = new Blob([data.buffer], { type: 'video/mp4' });
          triggerDownloadFromBlob(blob, 'output.mp4');
          toast('已下載自動轉檔 MP4');
          log('完整轉檔完成並已觸發下載 ✅');
          try { await services.ffmpeg.instance.deleteFile?.(inName); } catch {}
          try { await services.ffmpeg.instance.deleteFile?.('output.mp4'); } catch {}
        }
      } catch (e) {
        errlog('完整轉檔失敗：', e?.message || e);
        alert('完整轉檔失敗：' + (e?.message || e));
      }
    };

    /********** 功能 3：擷取縮圖 **********/
    btnThumbnail.onclick = async () => {
      try {
        if (!(modules.editorLite?.isReady && modules.editorLite.isReady())) {
          shotPreviewBox.innerHTML = '<span class="hint">擷取中…</span>';
        }
    
        if (!preview || !preview.videoWidth) {
          alert("影片尚未載入或沒有可用影格");
          shotPreviewBox.innerHTML = '<span class="hint">尚未擷取縮圖</span>';
          return;
        }
        await new Promise((resolve) => {
          if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            let done = false;
            preview.requestVideoFrameCallback(() => { if (!done) { done = true; resolve(); } });
            if (preview.paused) { done = true; resolve(); }
          } else {
            requestAnimationFrame(() => resolve());
          }
        });
        const w = preview.videoWidth;
        const h = preview.videoHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const t = preview.currentTime;
        const ss = isFinite(t) ? t.toFixed(2) : '0';
    
        if ('createImageBitmap' in window) {
          try {
            const bmp = await createImageBitmap(preview);
            ctx.drawImage(bmp, 0, 0, w, h);
            bmp.close?.();
          } catch {
            ctx.drawImage(preview, 0, 0, w, h);
          }
        } else {
          ctx.drawImage(preview, 0, 0, w, h);
        }
    
        const blob = await new Promise((resolve, reject) =>
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob 失敗')), 'image/png', 0.92)
        );
        const url = URL.createObjectURL(blob);

        // 釋放上一張快照 URL
        if (state.video.lastSnapshotURL && state.video.lastSnapshotURL !== url) {
          URL.revokeObjectURL(state.video.lastSnapshotURL);
        }
        state.video.lastSnapshotURL = url;

        // 顯示到你保留的 #shotPreview（不新增任何外部節點/屬性）
        if (!(modules.editorLite?.isReady && modules.editorLite.isReady())) {
          shotPreviewBox.innerHTML = '';
          const img = document.createElement('img');
          img.src = url;
          img.alt = `縮圖（${ss}s）`;
          img.loading = 'lazy';
          img.decoding = 'async';
          shotPreviewBox.appendChild(img);
        }
        toast(`已擷取縮圖（${ss}s）`);
        log('Canvas 擷取完成 ✅', { currentTime: ss, width: w, height: h });

        // 初始化或僅換底圖（避免重建 UI 造成狀態不同步）
        if (modules.editorLite?.isReady && modules.editorLite.isReady()) {
          // 已經初始化過僅換底圖
          modules.editorLite.loadSnapshot(url);
        } else {
          // 第一次初始化
          modules.editorLite.init(shotPreviewBox, { videoEl: preview, snapshotURL: url });
        }
      } catch (e) {
        shotPreviewBox.innerHTML = '<span class="hint">尚未擷取縮圖</span>';
        errlog('擷取縮圖失敗：', e?.message || e);
        alert('擷取縮圖失敗：' + (e?.message || e));
      }
    };


}
