// Reading text from a photo of a book spine or cover, right in the browser (Tesseract.js).
// The OCR engine and Czech + English data (~5 MB) are downloaded the first time and then cached.
//
// How it reads a cover:
//  1. a quick pass in three rotations finds which way the text runs (spines have vertical text)
//  2. a detailed pass reads the photo several ways (normal, sparse text, inverted for light
//     text on dark covers)
//  3. only words Tesseract is sure about are kept, and the biggest ones win - the title and
//     the author are the largest text on a cover, while blurbs, publisher logos and pictures
//     are small or produce low-confidence "words"
import { buildCoverQuery, findIsbnInText } from './ocrText';

const QUICK_SIDE = 1000;
const DETAIL_SIDE = 1800;
const MIN_TEXT_SIDE = 1400; // small photos are enlarged, Tesseract reads tiny letters badly

let workerPromise = null;
let progressListener = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js')
      .then(({ createWorker }) => createWorker(['ces', 'eng'], 1, {
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

/**
 * Draw the photo (or the part of it in `crop`, fractions 0..1) scaled to `maxSide`
 * (enlarging small photos), rotated by `deg`, as grayscale with stretched contrast.
 * `invert` turns light text on dark into dark on light.
 */
function prepareCanvas(img, deg, { maxSide = DETAIL_SIDE, invert = false, crop = null } = {}) {
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(c.x * img.naturalWidth);
  const sy = Math.round(c.y * img.naturalHeight);
  const sw = Math.max(Math.round(c.w * img.naturalWidth), 1);
  const sh = Math.max(Math.round(c.h * img.naturalHeight), 1);
  const longest = Math.max(sw, sh);
  const target = Math.max(Math.min(longest, maxSide), Math.min(MIN_TEXT_SIDE, maxSide));
  const scale = Math.min(target / longest, crop ? 4 : 3);
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const sideways = deg % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  // Contrast stretch between the 2nd and 98th percentile (ignores a few very dark/bright pixels)
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0;
    px[i] = g;
    hist[g]++;
  }
  const total = px.length / 4;
  const percentile = (fraction, fromTop) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      const v = fromTop ? 255 - i : i;
      acc += hist[v];
      if (acc >= total * fraction) return v;
    }
    return fromTop ? 0 : 255;
  };
  const lo = percentile(0.02, false);
  const hi = percentile(0.02, true);
  const range = Math.max(hi - lo, 1);
  for (let i = 0; i < px.length; i += 4) {
    let v = Math.min(255, Math.max(0, ((px[i] - lo) * 255) / range));
    if (invert) v = 255 - v;
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/**
 * Flatten Tesseract's blocks into words: { text, confidence, height, x, y, inDictionary }.
 * Sizes and positions are fractions of the image's longest side, so passes at different
 * resolutions can be compared.
 */
function wordsOf(data, side) {
  const words = [];
  (data.blocks || []).forEach(block => (block.paragraphs || []).forEach(par => (par.lines || []).forEach(line => {
    (line.words || []).forEach(w => {
      const b = w.bbox || {};
      words.push({
        text: w.text || '',
        confidence: w.confidence || 0,
        height: Math.max((b.y1 || 0) - (b.y0 || 0), 0) / side,
        x: (b.x0 || 0) / side,
        y: (b.y0 || 0) / side,
        inDictionary: Boolean(w.in_dictionary),
      });
    });
  })));
  return words;
}

async function recognizeWords(worker, canvas, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
  return { words: wordsOf(data, Math.max(canvas.width, canvas.height)), text: data.text || '' };
}

/** How much trustworthy text a quick pass found (to pick the rotation). */
function rotationScore(words) {
  return words
    .filter(w => w.confidence >= 60 && /[A-Za-zÀ-ž]{3,}/.test(w.text))
    .reduce((s, w) => s + w.text.length * (w.confidence / 100) * (w.inDictionary ? 1.5 : 1), 0);
}

/**
 * Read the title and author from a photo of a cover or spine.
 * crop: only read this part of the photo ({ x, y, w, h } as fractions), e.g. the title the user marked.
 * onProgress({ stage: 'download' | 'read', progress: 0..1 })
 * Resolves to { query, isbn, rotation, text }: `isbn` is set when an ISBN was printed on the photo.
 */
export async function readBookPhoto(file, { onProgress, crop = null } = {}) {
  const img = await loadImage(file);

  progressListener = (m) => {
    if (/loading|initializ/i.test(m.status || '')) onProgress?.({ stage: 'download', progress: m.progress || 0 });
  };
  const worker = await getWorker();
  progressListener = null;

  const steps = 6;
  let step = 0;
  const tick = () => onProgress?.({ stage: 'read', progress: ++step / steps });
  onProgress?.({ stage: 'read', progress: 0 });

  // 1. Which way does the text run? Upright wins unless a rotation reads clearly better
  // (Tesseract can partly read sideways text too, which would otherwise flip a cover).
  let best = null;
  for (const rotation of [0, 90, 270]) {
    const r = await recognizeWords(worker, prepareCanvas(img, rotation, { maxSide: QUICK_SIDE, crop }), '3');
    const score = rotationScore(r.words) * (rotation === 0 ? 1.25 : 1);
    if (!best || score > best.score) best = { rotation, score, ...r };
    tick();
  }

  // 2. Read the chosen rotation in detail, several ways
  const passes = [
    { invert: false, psm: '11' }, // sparse text: finds big titles spread over the cover
    { invert: true, psm: '11' }, // light letters on a dark cover
    { invert: false, psm: '3' }, // normal page layout: keeps words of one line together
  ];
  const words = [...best.words];
  let text = best.text;
  for (const pass of passes) {
    const r = await recognizeWords(worker, prepareCanvas(img, best.rotation, { invert: pass.invert, crop }), pass.psm);
    words.push(...r.words);
    text += `\n${r.text}`;
    tick();
  }

  return {
    rotation: best.rotation,
    text,
    query: buildCoverQuery(words),
    isbn: findIsbnInText(text),
  };
}
