export function createSnapshotEditor() {
  const { services } = window.ViolationHelper;

    (function ensureEditorLiteStyles() {
      const id = 'editorlite-styles';
      const el = document.getElementById(id);
      if (el) { return; }
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `
        #shotPreview .editor-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          grid-auto-rows: auto;
          gap: 14px;
          align-items: start;
        }
        #shotPreview .editor-left { display: flex; flex-direction: column; gap: 10px; }
        #shotPreview .editor-header { display: flex; align-items: center; gap: 12px; }
        #shotPreview .editor-header h3 { margin: 0; font-weight: 600; color: var(--fg); }
        #shotPreview .tool-row { display: flex; gap: 8px; flex-wrap: wrap; }
        #shotPreview .tool-row .btn {
          padding: 8px 12px; border: 1px solid var(--border);
          background: var(--panel); color: var(--fg);
          border-radius: 6px; cursor: pointer; font-weight: 600;
        }
        #shotPreview .tool-row .btn:hover { background: var(--panel); }
        #shotPreview .editor-stage {
          position: relative;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
          min-height: clamp(120px, 40vw, 360px);
        }
        @media (orientation: portrait) {
          #shotPreview .editor-stage {
            min-height: 0;
            padding-bottom: 8px;
          }
        }
        #shotPreview #staticImageContainer { position: relative; }
        #shotPreview #staticImage { max-width: 100%; height: auto; display: block; }
        #shotPreview #drawingOverlay {
          position: absolute; left: 0; top: 0;
          display: none; pointer-events: auto;
        }
        #shotPreview #selectionBox {
          position: absolute; border: 2px solid #e53935;
          background: rgba(229,57,53,.12); display: none;
          border-radius: 4px;
        }
        #shotPreview .plate-preview {
          display: none; gap: 10px; align-items: center; padding: 8px;
          border: 1px dashed var(--border); border-radius: 6px; background: var(--panel);
        }
        #shotPreview .plate-preview img { border: 2px solid #e53935; max-width: 150px; height: auto; }
        #shotPreview .plate-preview .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        #shotPreview .plate-preview label { color: var(--fg); }
        #shotPreview .editor-right {
          border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: var(--panel);
          display: flex; flex-direction: column; gap: 8px;
          max-height: 100%;
        }
        #shotPreview .editor-right h3 { margin: 0; font-weight: 600; color: var(--fg); }
        #shotPreview #generatedImagesArea {
          display: flex; flex-direction: column; gap: 12px;
          overflow: auto; flex: 1;
        }
        #shotPreview .generated-image-card {
          border: 1px solid var(--border); border-radius: 8px; padding: 8px;
          background: var(--panel);
        }
        #shotPreview .generated-image-card .inner {
          border: 1px solid var(--border); border-radius: 6px; padding: 6px; background: var(--panel);
        }
        #shotPreview .generated-image-card .header {
          display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 6px; color: var(--fg);
        }
        #shotPreview .generated-image-card .btn-row { display: flex; gap: 8px; }
        #shotPreview .generated-image-card img { max-width: 100%; height: auto; cursor: pointer; border-radius: 4px; }
        #shotPreview .generated-image-card .download-btn,
        #shotPreview .generated-image-card .remove-btn {
          padding: 6px 10px; border: 1px solid var(--border); background: var(--panel); color: var(--fg); border-radius: 6px;
          white-space: nowrap;
        }
        #shotPreview .generated-image-card .download-btn:hover,
        #shotPreview .generated-image-card .remove-btn:hover { background: var(--panel); }
  
        @media (max-width: 840px) {
          #shotPreview .editor-grid { grid-template-columns: 1fr; }
        }
      `;
      document.head.appendChild(style);
    })();

    function isIOSMobile() {
      const ua = navigator.userAgent || '';
      const iOSClassic = /iPhone|iPod/.test(ua);
      const iPadOS = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const iPadClassic = /iPad/.test(ua);
      return iOSClassic || iPadOS || iPadClassic;
    }

    // ================= EditorLite 主體 =================
    return (() => {
      /* ===== Module-scope Variables ===== */
      let initialized = false;
      let container = null;
      let videoEl = null;
      let snapshotURL = '';

      let staticImageContainer = null;
      let staticImage = null;
      let selectionBox = null;
      let drawingOverlay = null;

      let platePreviewArea = null;
      let plateImg = null;
      let platePositionSelect = null;
      let plateScaleInput = null;

      let generatedImagesArea = null;
      const generatedItems = []; // {id, url, ts}

      const finalCanvas = document.createElement('canvas');

      let startX = 0, startY = 0, currentX = 0, currentY = 0;
      let isDrawing = false;
      let finalCropCoords = {};
      const dragThreshold = 5;

      let drawnShapes = [];
      let currentShape = null;

      // Tools state
      let toolMode = 'shape';          // 'plate' | 'shape' | 'text' | 'mosaic'
      let lastNonPlateTool = 'shape';
      let overlayInteractive = true;

      // Text + Mosaic
      let textItems = [];              // { id, x, y, text, font, fill, stroke?, align?, baseline? }
      let mosaicItems = [];            // { id, rect:{x,y,w,h}, block }
      let isMosaicDrawing = false;
      let mosaicCurrent = null;        // {startX,startY,endX,endY, rect, block}
      let plateImageInMemory = null;
      // Text dragging state
      let isTextDragging = false;
      let dragText = null;               // 命中的文字項目（物件本身）
      let dragStartX = 0, dragStartY = 0;
      let dragOrigX = 0, dragOrigY = 0;
      const textDragThreshold = 5;       // 小於此像素視為「點一下」→ 進入編輯

      // Options UI elements
      let toolSelect = null;
      let textSize = null;
      let textColor = null;
      let mosaicRange = null;
      let drawingShapeSelect = null;
      let lineThicknessInput = null;
      let rotationCheckbox = null;
      let shapeGroup = null, thickGroup = null, rotGroup = null, textGroup = null, mosaicGroup = null;

      // Text editor
      let activeTextEditor = null;
      let editingTextId = null;

      // Misc
      let keybound = false;
      let previewLayer = null;
      let overlayEventsBound = false;

      /* ===== Utilities ===== */
      function isPrimaryPointer(e) { return e.isPrimary !== false; }
      function getTextSize() { return (textSize?.value | 0) || 18; }
      function getTextColor() { return textColor?.value || '#ff2d55'; }

      function setOverlayInteractive(enabled) {
        overlayInteractive = !!enabled;
        if (drawingOverlay) drawingOverlay.style.pointerEvents = overlayInteractive ? 'auto' : 'none';
      }

      function setTool(mode) {
        toolMode = mode;
        if (mode !== 'plate') lastNonPlateTool = mode;
        setOverlayInteractive(mode !== 'plate');
        if (toolSelect && toolSelect.value !== mode) toolSelect.value = mode;
        updateToolOptionsVisibility();
        drawingOverlay.style.cursor = (mode === 'text' && drawingOverlay)? 'text': 'crosshair';
      }

      function updateToolOptionsVisibility() {
        const show = (el, on) => { if (el) el.style.display = on ? 'flex' : 'none'; };
        show(shapeGroup,  toolMode === 'shape');
        show(thickGroup,  toolMode === 'shape');
        show(rotGroup,    toolMode === 'shape');
        show(textGroup,   toolMode === 'text');
        show(mosaicGroup, toolMode === 'mosaic');
        if (toolMode === 'plate') {
          show(shapeGroup, false);
          show(thickGroup, false);
          show(rotGroup, false);
          show(textGroup, false);
          show(mosaicGroup, false);
        }
      }

      /* ===== Public: init / loadSnapshot / isReady ===== */
      function init(host, { videoEl: v, snapshotURL: url } = {}) {
        container = host;
        videoEl = v;
        snapshotURL = url || '';
        container.innerHTML = '';

        // Grid + left pane
        const grid = document.createElement('div'); grid.className = 'editor-grid';
        const left = document.createElement('section'); left.className = 'editor-left';

        // Header buttons
        const header = document.createElement('div'); header.className = 'editor-header';
        const h3 = document.createElement('h3'); h3.textContent = '';
        const btnClearEdits = document.createElement('button');
        btnClearEdits.textContent = '清除所有編輯'; btnClearEdits.className = 'btn'; btnClearEdits.onclick = clearAllEdits;

        const btnUndo = document.createElement('button');
        btnUndo.textContent = '撤銷 (Ctrl+Z)'; btnUndo.className = 'btn'; btnUndo.onclick = undoLastShape;

        const btnGenerate = document.createElement('button');
        btnGenerate.textContent = '產生最終截圖'; btnGenerate.className = 'btn'; btnGenerate.onclick = generateReportImage;

        const toolRow = document.createElement('div'); toolRow.className = 'tool-row';
        toolRow.append(btnClearEdits, btnUndo, btnGenerate);
        header.append(h3, toolRow);
        left.appendChild(header);

        // Plate preview row
        platePreviewArea = document.createElement('div'); platePreviewArea.className = 'plate-preview';
        const plateLabel = document.createElement('span'); plateLabel.textContent = '車牌預覽：'; plateLabel.style.color = 'var(--fg)';
        plateImg = document.createElement('img'); plateImg.alt = '車牌預覽圖'; plateImg.style.display = 'none';

        const posGroup = document.createElement('div'); posGroup.className = 'row';
        const posLabel = document.createElement('label'); posLabel.textContent = '位置';
        platePositionSelect = document.createElement('select');
        ['bottomRight','topRight','bottomLeft','topLeft'].forEach(v => {
          const opt = document.createElement('option'); opt.value = v;
          opt.textContent = ({bottomRight:'右下角', topRight:'右上角', bottomLeft:'左下角', topLeft:'左上角'})[v];
          platePositionSelect.appendChild(opt);
        });

        const scaleGroup = document.createElement('div'); scaleGroup.className = 'row';
        const scaleLabel = document.createElement('label'); scaleLabel.textContent = '縮放(%)';
        plateScaleInput = document.createElement('input'); plateScaleInput.type = 'range'; plateScaleInput.min = '10'; plateScaleInput.max = '50'; plateScaleInput.value = '30';
        const scaleValue = document.createElement('span'); scaleValue.id = 'scaleValue'; scaleValue.textContent = '30%';

        plateScaleInput.addEventListener('input', () => { scaleValue.textContent = `${plateScaleInput.value}%`; drawOverlayContent(); });
        platePositionSelect.addEventListener('change', drawOverlayContent);

        posGroup.append(posLabel, platePositionSelect);
        scaleGroup.append(scaleLabel, plateScaleInput, scaleValue);
        platePreviewArea.append(plateLabel, plateImg, posGroup, scaleGroup);
        left.appendChild(platePreviewArea);

        // Stage
        const stage = document.createElement('div'); stage.className = 'editor-stage';
        staticImageContainer = document.createElement('div');
        staticImageContainer.id = 'staticImageContainer';
        staticImageContainer.style.cursor = 'crosshair';
        staticImageContainer.style.touchAction = 'none';

        staticImage = document.createElement('img');
        staticImage.id = 'staticImage';
        staticImage.alt = '靜態截圖預覽';
        staticImage.style.display = 'none';

        selectionBox = document.createElement('div'); selectionBox.id = 'selectionBox';
        drawingOverlay = document.createElement('canvas'); drawingOverlay.id = 'drawingOverlay';

        staticImageContainer.append(staticImage, selectionBox, drawingOverlay);
        stage.appendChild(staticImageContainer);
        left.appendChild(stage);

        // Right pane
        const right = document.createElement('aside'); right.className = 'editor-right';
        const headerBar = document.createElement('div');
        headerBar.style.display = 'flex';
        headerBar.style.alignItems = 'center';
        headerBar.style.justifyContent = 'space-between';
        headerBar.style.gap = '8px';

        const rh3 = document.createElement('h3'); rh3.textContent = '截圖列表';

        const clearShotsBtn = document.createElement('button');
        clearShotsBtn.textContent = '全部清除'; clearShotsBtn.className = 'remove-btn';
        clearShotsBtn.style.whiteSpace = 'nowrap'; clearShotsBtn.onclick = clearAllGenerated;

        const downloadAllBtn = document.createElement('button');
        downloadAllBtn.textContent = '全部下載'; downloadAllBtn.className = 'download-btn';
        downloadAllBtn.style.whiteSpace = 'nowrap'; downloadAllBtn.onclick = DownloadIndividually;
        if (isIOSMobile()) downloadAllBtn.style.display = 'none';

        const btnGroup = document.createElement('div'); btnGroup.style.display = 'flex'; btnGroup.style.gap = '8px';
        btnGroup.append(clearShotsBtn, downloadAllBtn);
        headerBar.append(rh3, btnGroup);

        generatedImagesArea = document.createElement('div'); generatedImagesArea.id = 'generatedImagesArea';
        right.append(headerBar, generatedImagesArea);

        // Assemble
        grid.append(left, right);
        container.appendChild(grid);

        // Build tool options (after DOM in place)
        buildDrawingOptionsIfNeeded();

        // Hotkeys: undo
        if (!keybound) {
          keybound = true;
          window.addEventListener('keydown', (e) => {
            const isZ = (e.key === 'z' || e.key === 'Z');
            const withCmd = e.metaKey || e.ctrlKey;
            if (withCmd && isZ) { e.preventDefault(); undoLastShape(); }
          });
        }

        // Preload snapshot
        if (snapshotURL) {
          staticImage.src = snapshotURL;
          staticImage.style.display = 'block';
          setupDrawingOverlay();
        }

        rebuildGeneratedList();
        restorePlatePreviewIfAny();
        syncRightHeightWithLeft();
        disableRightPaneHeightOnMobile();
        initialized = true;
      }

      function loadSnapshot(url) {
        if (!container) return;
        snapshotURL = url || '';
        if (!staticImage) return;
        staticImage.src = snapshotURL;
        staticImage.style.display = 'block';

        const onImgReady = () => {
          setupDrawingOverlay();
          clearAllDrawings();
          drawOverlayContent();
          restorePlatePreviewIfAny?.();
        };

        if (staticImage.complete) onImgReady();
        else {
          staticImage.onload = () => { staticImage.onload = null; onImgReady(); };
          staticImage.onerror = () => { staticImage.onerror = null; console.error('載入快照失敗：', snapshotURL); };
        }
      }

      function isReady() { return !!initialized; }

      /* ===== Toolbar: Build Options ===== */
      function buildDrawingOptionsIfNeeded() {
        if (container.querySelector('#drawingOptionsContainer')) return;
        // Groups
        shapeGroup = document.createElement('div'); shapeGroup.className = 'row'; shapeGroup.id = 'opt-shape';
        thickGroup = document.createElement('div'); thickGroup.className = 'row'; thickGroup.id = 'opt-thick';
        rotGroup   = document.createElement('div'); rotGroup.className   = 'row'; rotGroup.id   = 'opt-rot';
        textGroup  = document.createElement('div'); textGroup.className  = 'row'; textGroup.id  = 'opt-text';
        mosaicGroup= document.createElement('div'); mosaicGroup.className= 'row'; mosaicGroup.id= 'opt-mosaic';

        // Shape
        const shapeLabel = document.createElement('label'); shapeLabel.textContent = '形狀'; shapeLabel.style.color = 'var(--fg)';
        drawingShapeSelect = document.createElement('select'); drawingShapeSelect.id = 'drawingShape';
        drawingShapeSelect.innerHTML = `<option value="rectangle">方框</option><option value="circle">圓框</option>`;
        shapeGroup.append(shapeLabel, drawingShapeSelect);

        // Thickness
        const thickLabel = document.createElement('label'); thickLabel.textContent = '粗細(px)'; thickLabel.style.color = 'var(--fg)';
        lineThicknessInput = document.createElement('input');
        lineThicknessInput.type = 'range'; lineThicknessInput.min = '1'; lineThicknessInput.max = '20'; lineThicknessInput.value = '5';
        const thickValue = document.createElement('span'); thickValue.id = 'thicknessValue'; thickValue.textContent = '5px'; thickValue.style.color = 'var(--fg)';
        lineThicknessInput.addEventListener('input', () => { thickValue.textContent = `${lineThicknessInput.value}px`; });
        thickGroup.append(thickLabel, lineThicknessInput, thickValue);

        // Rotation
        const rotLabel = document.createElement('label'); rotLabel.textContent = '傾斜'; rotLabel.style.color = 'var(--fg)';
        rotationCheckbox = document.createElement('input'); rotationCheckbox.type = 'checkbox'; rotationCheckbox.id = 'enableRotation';
        rotGroup.append(rotLabel, rotationCheckbox);

        // Tool selector
        const toolGroup = document.createElement('div'); toolGroup.className = 'row';
        const toolLabel = document.createElement('label'); toolLabel.textContent = '工具'; toolLabel.style.color = 'var(--fg)';
        toolSelect = document.createElement('select'); toolSelect.id = 'toolMode';
        toolSelect.innerHTML = `
          <option value="plate">選取車牌</option>
          <option value="shape">紅框</option>
          <option value="text">文字</option>
          <option value="mosaic">馬賽克</option>
        `;
        toolSelect.addEventListener('change', () => { setTool(toolSelect.value); updateToolOptionsVisibility(); });
        toolGroup.append(toolLabel, toolSelect);

        // Text options
        const textLabel = document.createElement('label'); textLabel.textContent = '文字樣式'; textLabel.style.color = 'var(--fg)';
        textSize = document.createElement('input'); textSize.type = 'number'; textSize.min = '8'; textSize.max = '96'; textSize.value = '18'; textSize.style.width = '64px';
        textColor = document.createElement('input'); textColor.type = 'color'; textColor.value = '#ff2d55';
        textGroup.append(textLabel, textSize, textColor);

        // Mosaic options
        const mosaicLabel = document.createElement('label'); mosaicLabel.textContent = '馬賽克'; mosaicLabel.style.color = 'var(--fg)';
        mosaicRange = document.createElement('input'); mosaicRange.type = 'range'; mosaicRange.min = '4'; mosaicRange.max = '48'; mosaicRange.value = '12';
        const mosaicVal = document.createElement('span'); mosaicVal.textContent = '12px'; mosaicVal.style.color = 'var(--fg)';
        mosaicRange.addEventListener('input', () => (mosaicVal.textContent = `${mosaicRange.value}px`));
        mosaicGroup.append(mosaicLabel, mosaicRange, mosaicVal);

        // Bar
        const bar = document.createElement('div');
        bar.id = 'drawingOptionsContainer';
        Object.assign(bar.style, {
          display: 'flex', background: 'var(--panel)', padding: '8px', borderRadius: '6px',
          border: '1px solid var(--border)', marginTop: '6px', gap: '10px', alignItems: 'center', flexWrap: 'wrap'
        });
        bar.append(toolGroup, shapeGroup, thickGroup, rotGroup, textGroup, mosaicGroup);

        const left = container.querySelector('.editor-left');
        left.insertBefore(bar, left.querySelector('.editor-stage'));

        toolSelect.value = 'shape';
        setTool('shape');
        updateToolOptionsVisibility();
      }

      /* ===== Overlay: Size + Events ===== */
      function setupDrawingOverlay() {
        if (staticImage.style.display === 'none') return;

        const r = staticImage.getBoundingClientRect();
        const base = staticImageContainer.getBoundingClientRect();
        drawingOverlay.width = r.width;
        drawingOverlay.height = r.height;
        drawingOverlay.style.left = `${r.left - base.left}px`;
        drawingOverlay.style.top = `${r.top - base.top}px`;
        drawingOverlay.style.touchAction = 'none';
        drawingOverlay.style.display = 'block';
        drawingOverlay.style.pointerEvents = overlayInteractive ? 'auto' : 'none';

        if (!overlayEventsBound) {
          drawingOverlay.addEventListener('pointerdown', (e) => {
            if (!isPrimaryPointer(e) || toolMode === 'plate') return;
            e.preventDefault(); e.stopPropagation();
            if (toolMode === 'shape')  startUserDrawing(e);
            else if (toolMode === 'mosaic') startMosaic(e, mosaicRange ? Number(mosaicRange.value) : 12);
            else if (toolMode === 'text') onTextPointerDown(e);
          });

          drawingOverlay.addEventListener('pointermove', (e) => {
            if (!isPrimaryPointer(e) || toolMode === 'plate') return;
            if (toolMode === 'shape')  drawUserMoving(e);
            else if (toolMode === 'mosaic') drawMosaicMoving(e);
            else if (toolMode === 'text') onTextPointerMove(e);
          });

          drawingOverlay.addEventListener('pointerup', (e) => {
            if (!isPrimaryPointer(e) || toolMode === 'plate') return;
            if (toolMode === 'shape')  stopUserDrawing(e);
            else if (toolMode === 'mosaic') stopMosaic(e);
            else if (toolMode === 'text') onTextPointerUp(e);
          });

          drawingOverlay.addEventListener('pointercancel', (e) => {
            if (!isPrimaryPointer(e) || toolMode === 'plate') return;
            if (toolMode === 'shape')  stopUserDrawing(e);
            else if (toolMode === 'mosaic') stopMosaic(e);
            else if (toolMode === 'text') onTextPointerUp(e);
          });

          staticImageContainer.addEventListener('pointerdown', onSelectStart, { passive: false });
          staticImageContainer.addEventListener('pointermove', onSelectMove,   { passive: false });
          staticImageContainer.addEventListener('pointerup',   onSelectEnd,    { passive: false });
          staticImageContainer.addEventListener('pointercancel', onSelectEnd,  { passive: false });
          overlayEventsBound = true;
        }

        drawOverlayContent();

        if ('ResizeObserver' in window) {
          const ro = new ResizeObserver(() => {
            const rr = staticImage.getBoundingClientRect();
            const bb = staticImageContainer.getBoundingClientRect();
            drawingOverlay.width = rr.width;
            drawingOverlay.height = rr.height;
            drawingOverlay.style.left = `${rr.left - bb.left}px`;
            drawingOverlay.style.top  = `${rr.top  - bb.top}px`;
            drawOverlayContent();
          });
          ro.observe(staticImageContainer);
        }
      }

      /* ===== Tool: Undo / Clear Edits ===== */
      function undoLastShape() {
        if (textItems.length)     { textItems.pop(); drawOverlayContent(); return; }
        if (mosaicItems.length)   { mosaicItems.pop(); drawOverlayContent(); return; }
        if (drawnShapes.length)   { drawnShapes.pop(); drawOverlayContent(); return; }
      }

      function clearAllEdits() {
        if (activeTextEditor) {
          try { activeTextEditor.onblur = null; document.body.removeChild(activeTextEditor); } catch {}
          activeTextEditor = null;
          editingTextId = null;
        }
        drawnShapes = [];
        mosaicItems = [];
        textItems = [];
        isDrawing = false;
        currentShape = null;
        isMosaicDrawing = false;
        mosaicCurrent = null;
        try { clearPlateCrop(); } catch {}
        if (selectionBox) selectionBox.style.display = 'none';
        setOverlayInteractive(true);
        setTool('shape');
        drawOverlayContent();
      }

      /* ===== Right Pane: List Ops ===== */
      function clearAllGenerated() {
        if (!generatedItems.length) { alert('目前沒有可清除的截圖'); return; }
        const ok = confirm('確定要刪除所有截圖嗎？此動作無法復原。');
        if (!ok) return;
        generatedItems.length = 0;
        if (generatedImagesArea) generatedImagesArea.innerHTML = '';
      }

      function DownloadIndividually() {
        if (!generatedItems.length) { alert('目前沒有可下載的截圖'); return; }
        generatedItems.forEach((item, idx) => {
          const ts = new Date(item.ts || Date.now()).toISOString().slice(0,19).replace(/[-:T]/g,'');
          const fileName = `report_${ts}_${idx + 1}.jpg`;
          const a = document.createElement('a'); a.download = fileName; a.href = item.url;
          document.body.appendChild(a); a.click(); a.remove();
        });
      }

      function pushGeneratedItem(url) {
        const ts = Date.now();
        const id = `gen_${ts}_${Math.random().toString(36).slice(2,8)}`;
        const item = { id, url, ts };
        generatedItems.push(item);
        renderGeneratedCard(item);
      }

      function renderGeneratedCard(item) {
        const { id, url, ts } = item;
        const card = document.createElement('div'); card.className = 'generated-image-card';
        const inner = document.createElement('div'); inner.className = 'inner';
        const header = document.createElement('div'); header.className = 'header';
        const info = document.createElement('span'); info.textContent = `產生時間: ${new Date(ts).toLocaleString()}`;
        const btnRow = document.createElement('div'); btnRow.className = 'btn-row';
        const btnRemove = document.createElement('button'); btnRemove.textContent = '移除'; btnRemove.className = 'remove-btn';
        const btnDownload = document.createElement('button'); btnDownload.textContent = '下載'; btnDownload.className = 'download-btn';
        const img = document.createElement('img'); img.src = url; img.id = id;
        btnDownload.onclick = () => downloadImg(id, `report_${new Date(ts).toISOString().slice(0,19).replace(/[-:T]/g,'')}.jpg`);
        btnRemove.onclick = () => removeGeneratedItem(id);
        img.addEventListener('click', () => showPreview(url));
        header.append(info, btnRow);
        btnRow.append(btnRemove, btnDownload);
        inner.append(header, img);
        card.append(inner);
        generatedImagesArea.appendChild(card);
      }

      function rebuildGeneratedList() {
        generatedImagesArea.innerHTML = '';
        generatedItems.forEach(renderGeneratedCard);
      }

      function removeGeneratedItem(id) {
        const idx = generatedItems.findIndex(x => x.id === id);
        if (idx >= 0) generatedItems.splice(idx, 1);
        const el = document.getElementById(id);
        if (el) el.closest('.generated-image-card')?.remove();
      }

      function downloadImg(elementId, filename) {
        const el = document.getElementById(elementId);
        if (!el?.src) return;
        const a = document.createElement('a'); a.download = filename; a.href = el.src;
        document.body.appendChild(a); a.click(); a.remove();
      }

      /* ===== Left/Right Sync + Mobile ===== */
      function syncRightHeightWithLeft() {
        const leftStage = container.querySelector('.editor-left');
        const rightPane = container.querySelector('.editor-right');
        if (!leftStage || !rightPane) return;
        rightPane.style.height = `${leftStage.offsetHeight}px`;
        if ('ResizeObserver' in window) {
          const ro = new ResizeObserver(() => { rightPane.style.height = `${leftStage.offsetHeight}px`; });
          ro.observe(leftStage);
        } else {
          window.addEventListener('resize', () => { rightPane.style.height = `${leftStage.offsetHeight}px`; });
        }
      }

      function disableRightPaneHeightOnMobile() {
        const mq = window.matchMedia('(max-width: 840px)');
        const rightPane = container.querySelector('.editor-right');
        const apply = () => {
          if (!rightPane) return;
          rightPane.style.height = mq.matches ? 'auto' : rightPane.style.height;
        };
        apply();
        if (mq.addEventListener) mq.addEventListener('change', apply);
        else mq.addListener && mq.addListener(apply);
      }

      /* ===== Plate Selection (plate tool) ===== */
      function onSelectStart(e) {
        if (!isPrimaryPointer(e) || toolMode !== 'plate') return;
        e.preventDefault(); e.stopPropagation();
        isDrawing = true;
        const rect = staticImage.getBoundingClientRect();
        startX = Math.round(e.clientX - rect.left);
        startY = Math.round(e.clientY - rect.top);
        selectionBox.style.display = 'block';
        selectionBox.style.left = `${startX}px`;
        selectionBox.style.top = `${startY}px`;
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        staticImageContainer.setPointerCapture?.(e.pointerId);
      }

      function onSelectMove(e) {
        if (!isPrimaryPointer(e) || toolMode !== 'plate') return;
        e.preventDefault(); e.stopPropagation();
        const rect = staticImage.getBoundingClientRect();
        currentX = Math.round(e.clientX - rect.left);
        currentY = Math.round(e.clientY - rect.top);
        const width = currentX - startX;
        const height = currentY - startY;
        selectionBox.style.left = `${width > 0 ? startX : currentX}px`;
        selectionBox.style.top = `${height > 0 ? startY : currentY}px`;
        selectionBox.style.width = `${Math.abs(width)}px`;
        selectionBox.style.height = `${Math.abs(height)}px`;
      }

      function onSelectEnd(e) {
        if (!isPrimaryPointer(e) || toolMode !== 'plate') return;
        isDrawing = false;
        staticImageContainer.releasePointerCapture?.(e.pointerId);
        selectionBox.style.display = 'none';

        const dx = Math.abs(currentX - startX);
        const dy = Math.abs(currentY - startY);
        if (dx < dragThreshold && dy < dragThreshold) { setOverlayInteractive(true); return; }

        const displayW = staticImage.clientWidth;
        const displayH = staticImage.clientHeight;
        const actualW = videoEl.videoWidth;
        const actualH = videoEl.videoHeight;
        const scaleX = actualW / displayW;
        const scaleY = actualH / displayH;
        const x1 = Math.min(startX, currentX), y1 = Math.min(startY, currentY);
        const x2 = Math.max(startX, currentX), y2 = Math.max(startY, currentY);

        finalCropCoords = {
          x1: Math.round(x1 * scaleX),
          y1: Math.round(y1 * scaleY),
          x2: Math.round(x2 * scaleX),
          y2: Math.round(y2 * scaleY)
        };
        confirmCropArea();
      }

      function confirmCropArea() {
        const cropW = finalCropCoords.x2 - finalCropCoords.x1;
        const cropH = finalCropCoords.y2 - finalCropCoords.y1;
        if (cropW <= 0 || cropH <= 0) return;

        const c = document.createElement('canvas'); c.width = cropW; c.height = cropH;
        const ctx = c.getContext('2d');
        try {
          ctx.drawImage(videoEl, finalCropCoords.x1, finalCropCoords.y1, cropW, cropH, 0, 0, cropW, cropH);
          plateImageInMemory = new Image();
          plateImageInMemory.src = c.toDataURL('image/jpeg');

          plateImg.src = plateImageInMemory.src;
          plateImg.style.display = 'block';
          const plateBar = container.querySelector('.plate-preview');
          if (plateBar?.style) plateBar.style.display = 'flex';

          plateImageInMemory.onload = () => {
            drawOverlayContent();
            restorePlatePreviewIfAny();
            setOverlayInteractive(true);
            setTool(lastNonPlateTool || 'shape');
          };

          // 若使用者已勾選「自動辨識車牌」，裁切完成後立即觸發 PlateOCR 辨識並回填車牌欄位。
          const autoOcrEl = document.getElementById('ve-auto-ocr');
          if (autoOcrEl && autoOcrEl.checked && services.ocr?.recognize) {
            services.ocr.recognize(c);
          }
        } catch (e) {
          console.error('裁切失敗：', e);
        }
      }

      function restorePlatePreviewIfAny() {
        const plateBar = container.querySelector('.plate-preview');
        if (!plateBar) return;
        if (plateImageInMemory) {
          plateImg.src = plateImageInMemory.src;
          plateImg.style.display = 'block';
          plateBar.style.display = 'flex';
          drawOverlayContent?.();
        } else {
          plateImg.style.display = 'none';
          plateBar.style.display = 'none';
        }
      }

      function clearPlateCrop() {
        plateImageInMemory = null;
        finalCropCoords = {};
        if (plateImg) {
          plateImg.removeAttribute('src');
          plateImg.style.display = 'none';
        }
        const plateBar = container.querySelector('.plate-preview');
        if (plateBar) plateBar.style.display = 'none';
        drawOverlayContent?.();
        setOverlayInteractive(true);
      }

      /* ===== Overlay Repaint ===== */
      function drawOverlayContent() {
        const ctx = drawingOverlay.getContext('2d');
        ctx.clearRect(0, 0, drawingOverlay.width, drawingOverlay.height);
        if (mosaicItems.length) drawMosaicOverlay(ctx);
        if (drawnShapes.length > 0) {
          const displayW = staticImage.clientWidth;
          const displayH = staticImage.clientHeight;
          drawAllUserShapes(ctx, displayW, displayH, true);
        }
        if (textItems.length) {
          ctx.save();
          textItems.forEach(t => {
            ctx.font = t.font || `bold ${getTextSize()}px sans-serif`;
            ctx.textAlign = t.align || 'left';
            ctx.textBaseline = t.baseline || 'alphabetic';
            if (t.stroke) { ctx.strokeStyle = t.stroke; ctx.lineWidth = 2; ctx.strokeText(t.text, t.x, t.y); }
            ctx.fillStyle = t.fill || getTextColor();
            ctx.fillText(t.text, t.x, t.y);
          });
          ctx.restore();
        }
        if (plateImageInMemory) drawPlateOnCanvas(ctx, drawingOverlay.width, drawingOverlay.height, true);
      }

      /* ===== Plate Paste ===== */
      function drawPlateOnCanvas(ctx, targetW, targetH, isOverlay = false) {
        if (!plateImageInMemory) return;
        const position = platePositionSelect.value || 'bottomRight';
        const scalePercent = (Number(plateScaleInput.value) || 30) / 100;
        const margin = 16;
        const ow = plateImageInMemory.width, oh = plateImageInMemory.height;
        let w = targetW * scalePercent;
        let h = (w / ow) * oh;
        let x, y;
        switch (position) {
          case 'topRight':   x = targetW - w - margin; y = margin; break;
          case 'topLeft':    x = margin; y = margin; break;
          case 'bottomLeft': x = margin; y = targetH - h - margin; break;
          case 'bottomRight':
          default:           x = targetW - w - margin; y = targetH - h - margin; break;
        }

        // Draw image first, then stroke border
        ctx.drawImage(plateImageInMemory, x, y, w, h);
        ctx.save();
        ctx.strokeStyle = '#e53935';
        ctx.lineWidth = isOverlay ? 3 : 4;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }

      /* ===== Shape Drawing (Rect / Circle) ===== */
      function startUserDrawing(e) {
        if (!isPrimaryPointer(e)) return;
        e.preventDefault();
        isDrawing = true;
        const rect = drawingOverlay.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        currentShape = {
          type: drawingShapeSelect?.value || 'rectangle',
          thickness: Number(lineThicknessInput?.value || 5),
          startX, startY, endX: startX, endY: startY, angle: 0, width: 0, height: 0
        };
      }

      function drawUserMoving(e) {
        if (!isDrawing || !currentShape) return;
        e.preventDefault();
        const rect = drawingOverlay.getBoundingClientRect();
        currentX = e.clientX - rect.left;
        currentY = e.clientY - rect.top;
        const dx = currentX - startX;
        const dy = currentY - startY;

        if (rotationCheckbox?.checked) {
          currentShape.width  = Math.sqrt(dx*dx + dy*dy);
          currentShape.height = currentShape.width * 0.5;
          currentShape.angle  = Math.atan2(dy, dx);
        } else {
          currentShape.width  = Math.abs(dx);
          currentShape.height = Math.abs(dy);
          currentShape.angle  = 0;
        }
        currentShape.endX = currentX;
        currentShape.endY = currentY;
        drawOverlayContent();
        const ctx = drawingOverlay.getContext('2d');
        drawShape(ctx, currentShape, 1, 1);
      }

      function stopUserDrawing() {
        if (!isDrawing || !currentShape) return;
        isDrawing = false;
        if (currentShape.width > dragThreshold && currentShape.height > dragThreshold) drawnShapes.push(currentShape);
        currentShape = null;
        drawOverlayContent();
      }

      function clearAllDrawings() {
        drawnShapes = [];
        textItems = [];
        mosaicItems = [];
        drawOverlayContent();
      }

      function drawShape(ctx, shape, scaleX, scaleY) {
        ctx.strokeStyle = '#e53935';
        ctx.lineWidth = shape.thickness * scaleX;
        ctx.save();
        const cx = (shape.startX + (shape.endX - shape.startX) / 2) * scaleX;
        const cy = (shape.startY + (shape.endY - shape.startY) / 2) * scaleY;
        ctx.translate(cx, cy);
        ctx.rotate(shape.angle);
        if (shape.type === 'rectangle') {
          const w = shape.width * scaleX;
          const h = shape.height * scaleY;
          ctx.strokeRect(-w / 2, -h / 2, w, h);
        } else if (shape.type === 'circle') {
          const rx = (shape.width / 2) * scaleX;
          const ry = (shape.height / 2) * scaleY;
          ctx.scale(1, ry / rx);
          ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }

      function drawAllUserShapes(ctx, finalW, finalH, isOverlay = false) {
        if (!drawnShapes.length) return;
        let scaleX = 1, scaleY = 1;
        if (!isOverlay) {
          const displayW = staticImage.clientWidth || drawingOverlay.width || finalW;
          const displayH = staticImage.clientHeight || drawingOverlay.height || finalH;
          scaleX = finalW / displayW;
          scaleY = finalH / displayH;
        }
        drawnShapes.forEach(s => drawShape(ctx, s, scaleX, scaleY));
      }

      /* ===== Text Editing ===== */
      function toOverlayCoord(e) {
        const rect = drawingOverlay.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }

      function hitTextItem(x, y) {
        const ctx = drawingOverlay.getContext('2d');
        for (let i = textItems.length - 1; i >= 0; i--) {
          const t = textItems[i];
          ctx.save();
          ctx.font = t.font || `bold ${getTextSize()}px sans-serif`;
          const m = ctx.measureText(t.text || '');
          const w = m.width;
          const h = (m.actualBoundingBoxAscent || 12) + (m.actualBoundingBoxDescent || 4);
          const left = t.align === 'center' ? t.x - w / 2 : (t.align === 'right' ? t.x - w : t.x);
          const top  = t.y - h;
          ctx.restore();
          if (x >= left && x <= left + w && y >= top && y <= top + h) return t;
        }
        return null;
      }

      function onTextPointerDown(e) {
        if (activeTextEditor) return;
        if (e.detail > 1) return; // 避免連點干擾
        const pt = toOverlayCoord(e);              // ← 區域變數集中在前
        const x = pt.x, y = pt.y;
        const hit = hitTextItem(x, y);
        if (hit) {
          // ★ 命中文本 → 準備拖曳（是否進編輯由 pointerUp 判定）
          isTextDragging = true;
          dragText = hit;
          dragStartX = x;  dragStartY = y;
          dragOrigX  = hit.x; dragOrigY  = hit.y;
          drawingOverlay.setPointerCapture?.(e.pointerId);
          e.preventDefault(); e.stopPropagation();
          return;
        }
        // 未命中文本 → 直接建立新文字
        openTextEditor({
          mode: 'create',
          seed: {
            x, y,
            text: '',
            font: `bold ${getTextSize()}px sans-serif`,
            fill: getTextColor(),
            align: 'left',
            baseline: 'alphabetic'
          }
        });
      }

      function onTextPointerMove(e) {
        // 未在拖曳：可選擇顯示游標提示
        if (!isTextDragging || !dragText) {
          // 可選：命中即顯示移動游標，否則顯示文字游標
          const pt = toOverlayCoord(e);
          const x = pt.x, y = pt.y;
          drawingOverlay.style.cursor = hitTextItem(x, y) ? 'move' : 'text';
          return;
        }
        // 正在拖曳：更新目標文字位置
        const pt = toOverlayCoord(e);
        const x = pt.x, y = pt.y;
        const dx = x - dragStartX;
        const dy = y - dragStartY;
        dragText.x = dragOrigX + dx;
        dragText.y = dragOrigY + dy;
        drawOverlayContent();
      }

      function onTextPointerUp(e) {
        if (!isTextDragging) return;
        drawingOverlay.releasePointerCapture?.(e.pointerId);
        const pt = toOverlayCoord(e);
        const x = pt.x, y = pt.y;
        const moved = Math.hypot(x - dragStartX, y - dragStartY) > textDragThreshold;
        const item = dragText;
        // 重置拖曳狀態
        isTextDragging = false;
        dragText = null;
        if (!moved) {
          // 幾乎沒移動 → 視為點一下 → 進入編輯
          return openTextEditor({ mode: 'edit', item });
        }
        // 有移動 → 位置已經在 move 階段更新，這裡只需重繪
        drawOverlayContent();
      }

      function openTextEditor({ mode, seed, item }) {
        if (activeTextEditor) return;
        const rect = drawingOverlay.getBoundingClientRect();
        const isEdit = mode === 'edit';
        const x = isEdit ? item.x : seed.x;
        const y = isEdit ? item.y : seed.y;
        const font = isEdit ? item.font : (seed.font || `bold ${getTextSize()}px sans-serif`);
        const fill = isEdit ? item.fill : (seed.fill || getTextColor());
        const initialText = isEdit ? (item.text || '') : (seed.text || '');
        editingTextId = isEdit ? item.id : null;
        const vx = rect.left + x;
        const vy = rect.top + y;
        const sx = window.scrollX, sy = window.scrollY;
        const keepScroll = () => window.scrollTo(sx, sy);
        const onScrollLock = () => keepScroll();
        const input = document.createElement('input');
        const mctx = document.createElement('canvas').getContext('2d');
        mctx.font = font;
        const sampleText = (initialText && initialText.trim().length > 0) ? initialText : 'M';
        const metrics = mctx.measureText(sampleText);
        const ascent  = metrics.actualBoundingBoxAscent || (parseInt(font, 10) || getTextSize());
        const descent = metrics.actualBoundingBoxDescent || 0;
        const textW   = mctx.measureText(initialText || '').width;
        const align    = isEdit ? (item.align    || 'left')       : (seed.align    || 'left');
        const baseline = isEdit ? (item.baseline || 'alphabetic') : (seed.baseline || 'alphabetic');
        let topPx = vy - ascent - 5;
        let leftPx = vx;
        input.type = 'text';
        input.value = initialText;
        input.placeholder = isEdit ? '' : '輸入文字';
        if (align === 'center') leftPx = vx - textW / 2;
        if (align === 'right')  leftPx = vx - textW;
        input.style.position = 'fixed';
        input.style.left = `${leftPx}px`;
        input.style.top  = `${topPx}px`;
        input.style.font = font;
        input.style.color = fill;
        input.style.border = '0';
        input.style.padding = '0 2px';
        input.style.lineHeight = `${Math.ceil(ascent + descent)}px`;
        input.style.background = '#fff';
        input.style.zIndex = '9999';
        input.style.borderRadius = '4px';
        input.style.maxWidth = '60vw';
        input.style.textAlign = align;
        input.style.boxSizing = 'content-box';
        input.autocapitalize = 'off';
        input.autocomplete = 'off';
        input.autocorrect = 'off';
        input.spellcheck = false;
        input.setAttribute('inputmode', 'text');

        document.body.appendChild(input);
        window.addEventListener('scroll', onScrollLock, { passive: false });
        activeTextEditor = input;

        const onOutsideTap = (ev) => {
          if (ev.target !== input) { ev.preventDefault?.(); ev.stopPropagation?.(); cancelAndFinish(); }
        };
        drawingOverlay.addEventListener('pointerdown', onOutsideTap, true);
        staticImageContainer?.addEventListener('pointerdown', onOutsideTap, true);
        document.addEventListener('pointerdown', onOutsideTap, true);

        setTimeout(() => { input.focus(); input.select(); }, 0);

        const onBlur = () => finish(true);
        input.addEventListener('blur', onBlur);

        let finishing = false;
        let finished = false;
        function cleanupCommon() {
          if (finishing) return; finishing = true;
          window.removeEventListener('scroll', onScrollLock);
          drawingOverlay.removeEventListener('pointerdown', onOutsideTap, true);
          staticImageContainer?.removeEventListener('pointerdown', onOutsideTap, true);
          document.removeEventListener('pointerdown', onOutsideTap, true);
          try { document.body.removeChild(input); } catch {}
          activeTextEditor = null;
        }

        function cancelAndFinish() {
          // 若有輸入文字，視為送出；否則視為取消
          const hasText = ((input.value || '').trim().length > 0);
          // 先移除 blur 監聽，避免外點 → 移除 input → blur 再次觸發 finish 的重入
          input.removeEventListener('blur', onBlur);
          // 交給 finish 統一處理（finish 內會負責 cleanup / 狀態變更 / 重繪）
          finish(hasText);
        }

        function finish(commit) {
          if (finished) return; finished = true;
          cleanupCommon();
          window.scrollTo(sx, sy);
          const newText = (input.value || '').trim();
          if (!commit) { editingTextId = null; return; }
          if (isEdit) {
            const idx = textItems.findIndex(t => t.id === editingTextId);
            if (newText.length === 0) { if (idx >= 0) textItems.splice(idx, 1); }
            else if (idx >= 0) { textItems[idx].text = newText; textItems[idx].font = font; textItems[idx].fill = fill; }
            editingTextId = null;
            drawOverlayContent();
            return;
          }
          if (newText.length === 0) { editingTextId = null; return; }
          textItems.push({ id: crypto.randomUUID(), x, y, text: newText, font, fill, align: seed.align || 'left', baseline: seed.baseline || 'alphabetic' });
          editingTextId = null;
          drawOverlayContent();
        }
        input.addEventListener('keydown', (e) => {
          const isEnter = (e.key === 'Enter');
          const isEsc   = (e.key === 'Escape');
          if (!isEnter && !isEsc) return;
          input.removeEventListener('blur', onBlur);
          if (isEnter) { finish(true); return;}
          if (isEsc) { input.value = ''; finish(false); return; }
        });
      }

      /* ===== Mosaic ===== */
      function startMosaic(e, block) {
        e.preventDefault(); e.stopPropagation();
        isMosaicDrawing = true;
        const rect = drawingOverlay.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mosaicCurrent = { startX: x, startY: y, endX: x, endY: y, rect: { x, y, w: 0, h: 0 }, block: block || 12 };
        drawOverlayContent();
        const ctx = drawingOverlay.getContext('2d');
        ctx.save(); ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(x, y, 1, 1); ctx.restore();
      }

      function drawMosaicMoving(e) {
        e.preventDefault(); e.stopPropagation();
        if (!isMosaicDrawing || !mosaicCurrent) return;
        const rect = drawingOverlay.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mosaicCurrent.endX = x; mosaicCurrent.endY = y;
        const w = Math.abs(x - mosaicCurrent.startX);
        const h = Math.abs(y - mosaicCurrent.startY);
        const rx = Math.min(mosaicCurrent.startX, x);
        const ry = Math.min(mosaicCurrent.startY, y);
        mosaicCurrent.rect = { x: rx, y: ry, w, h };
        drawOverlayContent();
        const ctx = drawingOverlay.getContext('2d');
        ctx.save(); ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(rx, ry, w, h); ctx.restore();
      }

      function stopMosaic(e) {
        e?.preventDefault?.(); e?.stopPropagation?.();
        if (!isMosaicDrawing || !mosaicCurrent) return;
        isMosaicDrawing = false;
        const { rect, block } = mosaicCurrent;
        if (rect.w > 4 && rect.h > 4) mosaicItems.push({ id: crypto.randomUUID(), rect: { ...rect }, block });
        mosaicCurrent = null;
        drawOverlayContent();
      }

      function drawMosaicOverlay(ctx) {
        if (!staticImage || staticImage.naturalWidth === 0) return;
        const ow = drawingOverlay.width, oh = drawingOverlay.height;
        const scaleX = staticImage.naturalWidth / ow;
        const scaleY = staticImage.naturalHeight / oh;
        mosaicItems.forEach(mz => {
          const { x, y, w, h } = mz.rect;
          if (w <= 0 || h <= 0) return;
          const sx = Math.max(0, Math.round(x * scaleX));
          const sy = Math.max(0, Math.round(y * scaleY));
          const sw = Math.max(1, Math.round(w * scaleX));
          const sh = Math.max(1, Math.round(h * scaleY));
          const off = document.createElement('canvas');
          off.width = Math.max(1, Math.floor(sw / mz.block));
          off.height = Math.max(1, Math.floor(sh / mz.block));
          const octx = off.getContext('2d');
          octx.drawImage(staticImage, sx, sy, sw, sh, 0, 0, off.width, off.height);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(off, 0, 0, off.width, off.height, x, y, w, h);
          ctx.restore();
        });
      }

      function applyMosaicOnFinal(ctxFinal) {
        if (!mosaicItems.length) return;
        const c = ctxFinal.canvas;
        const finalW = c.width, finalH = c.height;
        const displayW = staticImage.clientWidth || drawingOverlay.width || finalW;
        const displayH = staticImage.clientHeight || drawingOverlay.height || finalH;
        const scaleX = finalW / displayW, scaleY = finalH / displayH;

        mosaicItems.forEach(mz => {
          const { x, y, w, h } = mz.rect;
          const fx = Math.round(x * scaleX);
          const fy = Math.round(y * scaleY);
          const fw = Math.max(1, Math.round(w * scaleX));
          const fh = Math.max(1, Math.round(h * scaleY));
          const tmp = document.createElement('canvas'); tmp.width = fw; tmp.height = fh;
          const tctx = tmp.getContext('2d'); tctx.drawImage(c, fx, fy, fw, fh, 0, 0, fw, fh);
          const small = document.createElement('canvas');
          small.width = Math.max(1, Math.floor(fw / mz.block));
          small.height = Math.max(1, Math.floor(fh / mz.block));
          const sctx = small.getContext('2d');
          sctx.drawImage(tmp, 0, 0, fw, fh, 0, 0, small.width, small.height);
          ctxFinal.save();
          ctxFinal.imageSmoothingEnabled = false;
          ctxFinal.drawImage(small, 0, 0, small.width, small.height, fx, fy, fw, fh);
          ctxFinal.restore();
        });
      }

      /* ===== Final Image Generation ===== */
      function generateReportImage() {
        if (!videoEl?.src) return;
        videoEl.pause();
        finalCanvas.width = videoEl.videoWidth;
        finalCanvas.height = videoEl.videoHeight;
        const ctx = finalCanvas.getContext('2d');
        // Base frame
        ctx.drawImage(videoEl, 0, 0, finalCanvas.width, finalCanvas.height);
        // Mosaic on final
        applyMosaicOnFinal(ctx);
        // Shapes
        drawAllUserShapes(ctx, finalCanvas.width, finalCanvas.height, false);
        // Plate
        drawPlateOnCanvas(ctx, finalCanvas.width, finalCanvas.height, false);
        // Text
        if (textItems.length) {
          const displayW = staticImage.clientWidth || drawingOverlay.width || finalCanvas.width;
          const displayH = staticImage.clientHeight || drawingOverlay.height || finalCanvas.height;
          const scaleX = finalCanvas.width / displayW, scaleY = finalCanvas.height / displayH;
          ctx.save();
          textItems.forEach(t => {
            const sizeMatch = (t.font || '').match(/(\d+)px/i);
            const baseSize = sizeMatch ? Number(sizeMatch[1]) : 18;
            const scaled = Math.max(8, Math.round(baseSize * ((scaleX + scaleY) / 2)));
            const fontFamily = (t.font || `bold ${baseSize}px sans-serif`).replace(/\d+px/i, `${scaled}px`);
            const fx = Math.round(t.x * scaleX);
            const fy = Math.round(t.y * scaleY);
            ctx.font = fontFamily;
            ctx.textAlign = t.align || 'left';
            ctx.textBaseline = t.baseline || 'alphabetic';
            if (t.stroke) { ctx.strokeStyle = t.stroke; ctx.lineWidth = 2; ctx.strokeText(t.text, fx, fy); }
            ctx.fillStyle = t.fill || '#ff2d55';
            ctx.fillText(t.text, fx, fy);
          });
          ctx.restore();
        }
        const url = finalCanvas.toDataURL('image/jpeg');
        pushGeneratedItem(url);
      }

      /* ===== Preview ===== */
      function showPreview(url) {
        if (!previewLayer) {
          previewLayer = document.createElement('div');
          Object.assign(previewLayer.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            maxWidth: '90vw', maxHeight: '90vh', boxShadow: '0 5px 15px rgba(0,0,0,.3)',
            border: '1px solid var(--border)', zIndex: '9999', display: 'none', background: '#0e0f12',
            padding: '8px', borderRadius: '8px'
          });
          const img = document.createElement('img'); img.style.maxWidth = '100%'; img.style.maxHeight = '80vh'; img.style.borderRadius = '4px';
          previewLayer.appendChild(img);
          document.body.appendChild(previewLayer);
          previewLayer.addEventListener('click', hidePreview);
        }
        const img = previewLayer.querySelector('img'); img.src = url;
        previewLayer.style.display = 'block';
      }

      function hidePreview() { if (previewLayer) previewLayer.style.display = 'none'; }

      /* ===== Exports ===== */
      return { init, loadSnapshot, isReady };
    })();
}
