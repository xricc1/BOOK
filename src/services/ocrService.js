// Reading text from a photo of a book spine or cover, right in the browser (Tesseract.js, Czech).
// The OCR engine and Czech language data (~10 MB) are downloaded the first time and then cached.
import { pickBest, readableQuery } from './ocrText';

const MAX_SIDE = 1800;
let workerPromise = null;
let progressListener = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js')
      .then(({ createWorker }) => createWorker('ces', 1, {
        logger: (m) => progressListener?.(m),
      }))
      .catch((err) => {
        workerPromise = null;
        throw err;
      });
  }
  return workerPromise;
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Draw the photo scaled down, rotated by `deg`, in grayscale with stretched contrast. */
function prepareCanvas(img, deg) {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const sideways = deg % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  // Grayscale + contrast stretch helps with coloured spines and dim shelves
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(max - min, 1);
  for (let i = 0; i < px.length; i += 4) {
    const v = ((px[i] - min) * 255) / range;
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/**
 * Read the text on a photo. Spines have vertical text, so the photo is read in three
 * rotations and the one with the most real words wins.
 * onProgress({ stage: 'download' | 'read', progress: 0..1 })
 * Resolves to { text, query, rotation, confidence }.
 */
export async function readBookPhoto(file, { onProgress } = {}) {
  const img = await loadImage(file);

  progressListener = (m) => {
    if (/loading|initializ/i.test(m.status || '')) onProgress?.({ stage: 'download', progress: m.progress || 0 });
  };
  const worker = await getWorker();
  progressListener = null;

  const rotations = [0, 90, 270];
  const results = [];
  for (const [i, rotation] of rotations.entries()) {
    onProgress?.({ stage: 'read', progress: i / rotations.length });
    const { data } = await worker.recognize(prepareCanvas(img, rotation));
    results.push({ rotation, text: data.text || '', confidence: data.confidence || 0 });
  }
  onProgress?.({ stage: 'read', progress: 1 });

  const best = pickBest(results);
  return { ...best, query: readableQuery(best?.text || '') };
}
