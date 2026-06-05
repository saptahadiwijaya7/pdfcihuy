const { PDFDocument, degrees } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const pageGrid = document.getElementById('pageGrid');
const statusEl = document.getElementById('status');
const toast = document.getElementById('toast');
const exportBtn = document.getElementById('exportBtn');
const fileNameInput = document.getElementById('fileNameInput');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const rotateSelectedBtn = document.getElementById('rotateSelectedBtn');
const previewModal = document.getElementById('previewModal');
const previewCanvas = document.getElementById('previewCanvas');
const previewTitle = document.getElementById('previewTitle');
const previewInfo = document.getElementById('previewInfo');
const closePreviewBtn = document.getElementById('closePreviewBtn');

let pages = [];
let sortable;
let insertMarker = null;

const supportedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const supportedImageExt = ['.jpg', '.jpeg', '.png', '.webp'];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

function updateStatus() {
  const selected = pages.filter(p => p.selected).length;
  statusEl.textContent = pages.length ? `${pages.length} halaman/item siap disusun${selected ? ` - ${selected} dipilih` : ''}.` : 'Belum ada file.';
  const hasExportName = getSafeExportFileName().length > 0;
  exportBtn.disabled = pages.length === 0 || !hasExportName;
  deleteSelectedBtn.disabled = selected === 0;
  rotateSelectedBtn.disabled = selected === 0;
  selectAllCheckbox.disabled = pages.length === 0;
  selectAllCheckbox.checked = pages.length > 0 && selected === pages.length;
  selectAllCheckbox.indeterminate = selected > 0 && selected < pages.length;
}

function syncOrderFromDOM() {
  const ids = [...pageGrid.querySelectorAll('.page-card')].map(el => el.dataset.id);
  pages = ids.map(id => pages.find(p => p.id === id)).filter(Boolean);
  refreshNumbers();
}

function getSafeExportFileName() {
  return fileNameInput.value.trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function refreshNumbers() {
  [...pageGrid.querySelectorAll('.page-card')].forEach((card, index) => {
    const badge = card.querySelector('.badge');
    if (badge) badge.textContent = index + 1;
  });
  updateStatus();
}

function initSortable() {
  if (sortable) return;
  sortable = Sortable.create(pageGrid, {
    animation: 160,
    ghostClass: 'sortable-ghost',
    draggable: '.page-card',
    filter: '.insert-marker',
    onEnd: syncOrderFromDOM
  });
}

function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isSupportedImage(file) {
  const lower = file.name.toLowerCase();
  return supportedImageTypes.includes(file.type) || supportedImageExt.some(ext => lower.endsWith(ext));
}


async function renderPdfPreview(arrayBuffer, pageNumber, canvas, rotation = 0) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1, rotation });
  const maxW = Math.min(window.innerWidth * 0.86, 900);
  const maxH = Math.min(window.innerHeight * 0.74, 1100);
  const scale = Math.min(maxW / baseViewport.width, maxH / baseViewport.height, 2.2);
  const viewport = page.getViewport({ scale, rotation });
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
}

async function renderImagePreview(page, canvas) {
  const img = await loadImageFromDataUrl(page.imageDataUrl);
  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  const rotated = page.rotation % 180 !== 0;
  const rotatedW = rotated ? sourceH : sourceW;
  const rotatedH = rotated ? sourceW : sourceH;
  const maxW = Math.min(window.innerWidth * 0.86, 900);
  const maxH = Math.min(window.innerHeight * 0.74, 1100);
  const scale = Math.min(maxW / rotatedW, maxH / rotatedH, 1.8);
  const drawW = rotatedW * scale;
  const drawH = rotatedH * scale;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.ceil(drawW * ratio);
  canvas.height = Math.ceil(drawH * ratio);
  canvas.style.width = `${Math.ceil(drawW)}px`;
  canvas.style.height = `${Math.ceil(drawH)}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, drawW, drawH);
  ctx.save();
  ctx.translate(drawW / 2, drawH / 2);
  ctx.rotate((page.rotation * Math.PI) / 180);
  ctx.drawImage(img, -sourceW * scale / 2, -sourceH * scale / 2, sourceW * scale, sourceH * scale);
  ctx.restore();
}

async function openPreview(page) {
  previewTitle.textContent = page.fileName;
  previewInfo.textContent = page.kind === 'pdf' ? `Halaman ${page.pageNumber}` : 'Gambar';
  previewCanvas.getContext('2d').clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewModal.classList.add('open');
  previewModal.setAttribute('aria-hidden', 'false');
  try {
    if (page.kind === 'pdf') {
      await renderPdfPreview(page.arrayBuffer, page.pageNumber, previewCanvas, page.rotation);
    } else {
      await renderImagePreview(page, previewCanvas);
    }
  } catch (err) {
    console.error(err);
    showToast('Gagal menampilkan preview halaman.');
  }
}

function closePreview() {
  previewModal.classList.remove('open');
  previewModal.setAttribute('aria-hidden', 'true');
}

async function renderPdfThumbnail(arrayBuffer, pageNumber, canvas, rotation = 0) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 0.28, rotation });
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.height = '205px';
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function imageFileToPage(file) {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImageFromDataUrl(dataUrl);
  return {
    id: crypto.randomUUID(),
    kind: 'image',
    fileName: file.name,
    pageNumber: 1,
    imageDataUrl: dataUrl,
    imageWidth: img.naturalWidth || img.width,
    imageHeight: img.naturalHeight || img.height,
    mimeType: file.type || inferMimeFromName(file.name),
    rotation: 0,
    selected: false
  };
}

function inferMimeFromName(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

async function renderImageThumbnail(page, canvas) {
  const img = await loadImageFromDataUrl(page.imageDataUrl);
  const maxH = 205;
  const maxW = 160;
  const angle = page.rotation % 180 === 0 ? 0 : 90;
  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  const rotatedW = angle ? sourceH : sourceW;
  const rotatedH = angle ? sourceW : sourceH;
  const scale = Math.min(maxW / rotatedW, maxH / rotatedH, 1);
  const drawW = rotatedW * scale;
  const drawH = rotatedH * scale;
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.ceil(drawW * ratio);
  canvas.height = Math.ceil(drawH * ratio);
  canvas.style.height = '205px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, drawW, drawH);
  ctx.save();
  ctx.translate(drawW / 2, drawH / 2);
  ctx.rotate((page.rotation * Math.PI) / 180);
  ctx.drawImage(img, -sourceW * scale / 2, -sourceH * scale / 2, sourceW * scale, sourceH * scale);
  ctx.restore();
}

async function renderThumbnail(page) {
  if (page.kind === 'pdf') {
    await renderPdfThumbnail(page.arrayBuffer, page.pageNumber, page.canvas, page.rotation);
  } else {
    await renderImageThumbnail(page, page.canvas);
  }
}

function makePageCard(page) {
  const card = document.createElement('article');
  card.className = 'page-card';
  card.dataset.id = page.id;

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.textContent = pageGrid.children.length + 1;

  const selectLabel = document.createElement('label');
  selectLabel.className = 'select-box';
  selectLabel.title = 'Pilih halaman';
  selectLabel.addEventListener('click', (ev) => ev.stopPropagation());
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = page.selected;
  checkbox.addEventListener('click', (ev) => ev.stopPropagation());
  checkbox.addEventListener('change', () => {
    page.selected = checkbox.checked;
    card.classList.toggle('selected', page.selected);
    updateStatus();
  });
  selectLabel.append(checkbox, document.createTextNode('Pilih'));

  const canvas = document.createElement('canvas');
  page.canvas = canvas;
  canvas.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openPreview(page);
  });

  const meta = document.createElement('div');
  meta.className = 'page-meta';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'page-title';
  titleSpan.title = page.fileName;
  titleSpan.textContent = page.fileName;
  const pageLabel = document.createElement('span');
  pageLabel.textContent = page.kind === 'pdf' ? `Hal. ${page.pageNumber}` : 'Gambar';
  meta.append(titleSpan, pageLabel);

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'secondary';
  rotateBtn.textContent = 'Rotasi';
  rotateBtn.onclick = async (ev) => {
    ev.stopPropagation();
    page.rotation = (page.rotation + 90) % 360;
    await renderThumbnail(page);
  };
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'danger';
  deleteBtn.textContent = 'Hapus';
  deleteBtn.onclick = (ev) => {
    ev.stopPropagation();
    pages = pages.filter(p => p.id !== page.id);
    card.remove();
    refreshNumbers();
  };
  actions.append(rotateBtn, deleteBtn);

  card.onclick = () => {
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change'));
  };

  card.append(badge, selectLabel, canvas, meta, actions);
  return card;
}

function insertPageAt(page, insertIndex = pages.length) {
  const boundedIndex = Math.max(0, Math.min(insertIndex, pages.length));
  pages.splice(boundedIndex, 0, page);
  const card = makePageCard(page);
  const beforeNode = pageGrid.children[boundedIndex] || null;
  pageGrid.insertBefore(card, beforeNode);
  return card;
}

function getCardRows() {
  const cards = [...pageGrid.querySelectorAll('.page-card')];
  const rows = [];
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const row = rows.find(r => Math.abs(r.top - rect.top) < 12);
    const item = { card, rect, index: cards.indexOf(card) };
    if (row) {
      row.items.push(item);
      row.top = Math.min(row.top, rect.top);
      row.bottom = Math.max(row.bottom, rect.bottom);
    } else {
      rows.push({ top: rect.top, bottom: rect.bottom, items: [item] });
    }
  }
  rows.sort((a, b) => a.top - b.top);
  rows.forEach(row => row.items.sort((a, b) => a.rect.left - b.rect.left));
  return rows;
}

function getFileDropIndex(e) {
  const cards = [...pageGrid.querySelectorAll('.page-card')];
  if (!cards.length) return 0;

  const rows = getCardRows();
  for (const row of rows) {
    const rowMid = row.top + (row.bottom - row.top) / 2;
    if (e.clientY <= rowMid || e.clientY <= row.bottom) {
      for (const item of row.items) {
        const midX = item.rect.left + item.rect.width / 2;
        if (e.clientX < midX) return item.index;
      }
      return row.items[row.items.length - 1].index + 1;
    }
  }
  return cards.length;
}

function ensureInsertMarker() {
  if (!insertMarker) {
    insertMarker = document.createElement('div');
    insertMarker.className = 'insert-marker';
    insertMarker.setAttribute('aria-hidden', 'true');
  }
  return insertMarker;
}

function clearDropMarkers() {
  pageGrid.classList.remove('file-dragover');
  pageGrid.querySelectorAll('.drop-before, .drop-after').forEach(el => {
    el.classList.remove('drop-before', 'drop-after');
  });
  insertMarker?.remove();
}

function showDropMarker(e) {
  pageGrid.classList.add('file-dragover');
  const marker = ensureInsertMarker();
  const index = getFileDropIndex(e);
  marker.dataset.insertIndex = String(index);
  const cards = [...pageGrid.querySelectorAll('.page-card')];
  const beforeNode = cards[index] || null;
  if (marker.parentElement !== pageGrid || marker.nextElementSibling !== beforeNode) {
    pageGrid.insertBefore(marker, beforeNode);
  }
}

function getMarkedDropIndex(e) {
  if (insertMarker?.parentElement === pageGrid && insertMarker.dataset.insertIndex !== undefined) {
    const parsed = Number.parseInt(insertMarker.dataset.insertIndex, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return getFileDropIndex(e);
}

async function handleFiles(fileList, insertIndex = pages.length) {
  const files = [...fileList].filter(f => isPdf(f) || isSupportedImage(f));
  if (!files.length) return showToast('Pilih file PDF atau gambar JPG, JPEG, PNG, WEBP yang valid.');
  initSortable();
  showToast(`Memuat ${files.length} file...`);

  for (const file of files) {
    try {
      if (isPdf(file)) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = {
            id: crypto.randomUUID(),
            kind: 'pdf',
            fileName: file.name,
            pageNumber: i,
            arrayBuffer,
            rotation: 0,
            selected: false
          };
          const card = insertPageAt(page, insertIndex);
          insertIndex += 1;
          await renderThumbnail(page);
        }
      } else {
        const page = await imageFileToPage(file);
        const card = insertPageAt(page, insertIndex);
        insertIndex += 1;
        await renderThumbnail(page);
      }
    } catch (err) {
      console.error(err);
      showToast(`Gagal membuka ${file.name}.`);
    }
  }
  refreshNumbers();
}

async function imageDataUrlToPngBytes(dataUrl, rotation = 0) {
  const img = await loadImageFromDataUrl(dataUrl);
  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  const rotated = rotation % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = rotated ? sourceH : sourceW;
  canvas.height = rotated ? sourceW : sourceH;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -sourceW / 2, -sourceH / 2, sourceW, sourceH);
  ctx.restore();
  const pngDataUrl = canvas.toDataURL('image/png');
  const base64 = pngDataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, width: canvas.width, height: canvas.height };
}

async function addImagePage(outputPdf, pageInfo) {
  const { bytes, width, height } = await imageDataUrlToPngBytes(pageInfo.imageDataUrl, pageInfo.rotation);
  const embeddedImage = await outputPdf.embedPng(bytes);

  // Frameless image export:
  // Ukuran halaman PDF dibuat sama persis dengan ukuran gambar yang sudah diputar.
  // Gambar digambar mulai dari x=0, y=0 dan memenuhi seluruh halaman, tanpa margin,
  // tanpa A4 canvas, dan tanpa frame putih di sisi mana pun.
  const pdfPage = outputPdf.addPage([width, height]);
  pdfPage.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width,
    height
  });
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
});
dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
  fileInput.value = '';
});
fileNameInput.addEventListener('input', updateStatus);
selectAllCheckbox.addEventListener('change', () => {
  const checked = selectAllCheckbox.checked;
  pages.forEach(page => { page.selected = checked; });
  pageGrid.querySelectorAll('.page-card').forEach(card => {
    card.classList.toggle('selected', checked);
    const checkbox = card.querySelector('.select-box input');
    if (checkbox) checkbox.checked = checked;
  });
  updateStatus();
});

['dragenter', 'dragover'].forEach(eventName => {
  pageGrid.addEventListener(eventName, (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    showDropMarker(e);
  });
});
['dragleave', 'drop'].forEach(eventName => {
  pageGrid.addEventListener(eventName, (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    if (eventName === 'drop') {
      const insertIndex = getMarkedDropIndex(e);
      handleFiles(e.dataTransfer.files, insertIndex);
    }
    clearDropMarkers();
  });
});

deleteSelectedBtn.addEventListener('click', () => {
  pages.filter(p => p.selected).forEach(p => document.querySelector(`[data-id="${p.id}"]`)?.remove());
  pages = pages.filter(p => !p.selected);
  refreshNumbers();
});

rotateSelectedBtn.addEventListener('click', async () => {
  const selected = pages.filter(p => p.selected);
  for (const page of selected) {
    page.rotation = (page.rotation + 90) % 360;
    await renderThumbnail(page);
  }
});

closePreviewBtn.addEventListener('click', closePreview);
previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) closePreview();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && previewModal.classList.contains('open')) closePreview();
});

exportBtn.addEventListener('click', async () => {
  const exportName = getSafeExportFileName();
  if (!pages.length || !exportName) return;
  syncOrderFromDOM();
  exportBtn.disabled = true;
  exportBtn.textContent = 'Membuat PDF...';
  try {
    const outputPdf = await PDFDocument.create();
    const cache = new Map();
    for (const pageInfo of pages) {
      if (pageInfo.kind === 'pdf') {
        let sourcePdf = cache.get(pageInfo.fileName + pageInfo.arrayBuffer.byteLength);
        if (!sourcePdf) {
          sourcePdf = await PDFDocument.load(pageInfo.arrayBuffer.slice(0));
          cache.set(pageInfo.fileName + pageInfo.arrayBuffer.byteLength, sourcePdf);
        }
        const [copiedPage] = await outputPdf.copyPages(sourcePdf, [pageInfo.pageNumber - 1]);
        const originalRotation = copiedPage.getRotation().angle || 0;
        copiedPage.setRotation(degrees((originalRotation + pageInfo.rotation) % 360));
        outputPdf.addPage(copiedPage);
      } else {
        await addImagePage(outputPdf, pageInfo);
      }
    }
    const bytes = await outputPdf.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = exportName.toLowerCase().endsWith('.pdf') ? exportName : `${exportName}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('PDF berhasil dibuat.');
  } catch (err) {
    console.error(err);
    showToast('Gagal membuat PDF. Coba file lain atau refresh browser.');
  } finally {
    exportBtn.textContent = 'Export PDF';
    updateStatus();
  }
});

updateStatus();
