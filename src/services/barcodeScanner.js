// Fast book barcode scanner.
//
// Why not html5-qrcode's built-in camera scanner: it crops the scan box and
// shrinks it to the on-screen size of the box (about 360x180 px), so the bars
// of an EAN-13 code blur together and decoding mostly fails. Here we crop the
// frame at the camera's full resolution instead, use the phone's native
// BarcodeDetector when available (Android Chrome), and fall back to ZXing
// restricted to EAN-13 (iPhone, desktop).

import { Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ZXingHtml5QrcodeDecoder } from 'html5-qrcode/esm/zxing-html5-qrcode-decoder.js';
import { applyZxingFix } from './zxingFix';

// Must run before the first decode
applyZxingFix();

const silentLogger = { log() {}, warn() {}, logError() {}, logErrors() {} };

// Largest width of the image handed to ZXing. Bigger is slower, smaller loses bars.
const MAX_DECODE_WIDTH = 1280;

// Scan guide on screen, as fractions of the visible video area.
export const GUIDE = { left: 0.08, right: 0.92, top: 0.3, bottom: 0.7 };

let zxingDecoder = null;
function getZxing() {
  if (!zxingDecoder) {
    zxingDecoder = new ZXingHtml5QrcodeDecoder(
      [Html5QrcodeSupportedFormats.EAN_13],
      false,
      silentLogger
    );
  }
  return zxingDecoder;
}

let nativeDetectorPromise = null;
/** Native BarcodeDetector restricted to EAN-13, or null when the browser has none. */
export function getNativeDetector() {
  if (!nativeDetectorPromise) {
    nativeDetectorPromise = (async () => {
      try {
        if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (!formats.includes('ean_13')) return null;
        return new window.BarcodeDetector({ formats: ['ean_13'] });
      } catch {
        return null;
      }
    })();
  }
  return nativeDetectorPromise;
}

function createCanvas() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return { canvas, ctx };
}

/**
 * Draw a region of a source onto the canvas, scaled down to MAX_DECODE_WIDTH
 * (never up) and optionally rotated by 90 degrees for vertical barcodes.
 */
function drawRegion({ canvas, ctx }, source, region, rotate = false) {
  const outLong = rotate ? region.h : region.w;
  const scale = Math.min(1, MAX_DECODE_WIDTH / outLong);
  const w = Math.max(1, Math.round(region.w * scale));
  const h = Math.max(1, Math.round(region.h * scale));
  canvas.width = rotate ? h : w;
  canvas.height = rotate ? w : h;
  ctx.save();
  if (rotate) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, w, h);
  ctx.restore();
}

async function decodeCanvas(canvas) {
  try {
    const result = await getZxing().decodeAsync(canvas);
    return result?.text || null;
  } catch {
    return null; // nothing found in this region
  }
}

/** Part of the video frame that is actually visible in a container using object-fit: cover. */
export function visibleRect(videoW, videoH, boxW, boxH) {
  if (!boxW || !boxH) return { x: 0, y: 0, w: videoW, h: videoH };
  const scale = Math.max(boxW / videoW, boxH / videoH);
  const w = Math.min(videoW, boxW / scale);
  const h = Math.min(videoH, boxH / scale);
  return { x: (videoW - w) / 2, y: (videoH - h) / 2, w, h };
}

function subRect(rect, left, top, right, bottom) {
  return {
    x: rect.x + rect.w * left,
    y: rect.y + rect.h * top,
    w: rect.w * (right - left),
    h: rect.h * (bottom - top),
  };
}

/**
 * Continuous scanning of a playing <video>.
 * Calls onDetected(code) once with the first code accepted by isAccepted.
 * Calls onReject(code) for codes that were read but not accepted.
 * Returns a stop() function.
 */
export function startScanLoop(video, { onDetected, onReject, isAccepted = () => true, getViewSize }) {
  let stopped = false;
  let timer = null;
  let attempt = 0;
  const target = createCanvas();

  const schedule = (ms) => {
    if (!stopped) timer = setTimeout(tick, ms);
  };

  const handleCode = (code) => {
    if (!code) return false;
    if (isAccepted(code)) {
      stopped = true;
      onDetected(code);
      return true;
    }
    onReject?.(code);
    return false;
  };

  const tick = async () => {
    if (stopped) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) {
      schedule(100);
      return;
    }

    const native = await getNativeDetector();
    if (stopped) return;

    if (native) {
      // Native detector handles the full frame and any rotation quickly
      try {
        const codes = await native.detect(video);
        for (const c of codes) {
          if (handleCode(c.rawValue)) return;
        }
      } catch {
        // ignore a failed frame
      }
      schedule(60);
      return;
    }

    // ZXing path: wide horizontal band around the guide, at full resolution.
    // Every third attempt tries a vertical band rotated by 90 degrees.
    const { w: boxW, h: boxH } = getViewSize?.() || {};
    const visible = visibleRect(vw, vh, boxW, boxH);
    const vertical = attempt % 3 === 2;
    attempt++;

    const region = vertical
      ? subRect(visible, 0.3, 0.04, 0.7, 0.96)
      : subRect(visible, 0.02, GUIDE.top - 0.08, 0.98, GUIDE.bottom + 0.08);

    drawRegion(target, video, region, vertical);
    const code = await decodeCanvas(target.canvas);
    if (handleCode(code)) return;
    schedule(30);
  };

  schedule(0);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Open the rear camera with settings that help 1D barcodes:
 * high resolution, continuous autofocus and a little zoom when available.
 */
export async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('NO_CAMERA_API');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });

  const track = stream.getVideoTracks()[0];
  let capabilities = {};
  try {
    capabilities = track.getCapabilities?.() || {};
  } catch {
    capabilities = {};
  }

  const advanced = {};
  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
    advanced.focusMode = 'continuous';
  }
  let zoom = null;
  if (capabilities.zoom) {
    const { min = 1, max = 1 } = capabilities.zoom;
    // Slight zoom lets the phone stay far enough from the book to focus
    zoom = Math.min(max, Math.max(min, 2));
    if (zoom !== min) advanced.zoom = zoom;
  }
  if (Object.keys(advanced).length) {
    try {
      await track.applyConstraints({ advanced: [advanced] });
    } catch {
      // camera rejected the hint, keep defaults
    }
  }

  return { stream, track, capabilities, zoom };
}

export function stopStream(stream) {
  stream?.getTracks().forEach(t => t.stop());
}

/** Read a barcode from a photo. Tries the native detector, then ZXing on several crops. */
export async function decodeImageFile(file, isAccepted = () => true) {
  const bitmap = await loadImage(file);
  try {
    const native = await getNativeDetector();
    if (native) {
      try {
        const codes = await native.detect(bitmap);
        const hit = codes.map(c => c.rawValue).find(isAccepted);
        if (hit) return hit;
      } catch {
        // fall through to ZXing
      }
    }

    const w = bitmap.width;
    const h = bitmap.height;
    const full = { x: 0, y: 0, w, h };
    const target = createCanvas();
    const regions = [
      [full, false],
      [full, true],
      // horizontal bands across the photo
      ...[0, 0.2, 0.4, 0.6].map(t => [subRect(full, 0, t, 1, t + 0.4), false]),
      // vertical bands for a rotated code
      ...[0, 0.2, 0.4, 0.6].map(l => [subRect(full, l, 0, l + 0.4, 1), true]),
      // full-resolution windows for a small code in a big photo (no downscaling)
      ...fullResWindows(w, h, false),
      ...fullResWindows(w, h, true),
    ];
    for (const [region, rotate] of regions) {
      drawRegion(target, bitmap, region, rotate);
      const code = await decodeCanvas(target.canvas);
      if (code && isAccepted(code)) return code;
    }
    return null;
  } finally {
    bitmap.close?.();
    if (bitmap.objectUrl) URL.revokeObjectURL(bitmap.objectUrl);
  }
}

/**
 * Overlapping windows MAX_DECODE_WIDTH long (along the barcode direction) so
 * they are decoded at the photo's native resolution. Center windows first.
 */
function fullResWindows(w, h, rotate) {
  const along = rotate ? h : w; // barcode direction
  const across = rotate ? w : h;
  if (along <= MAX_DECODE_WIDTH) return [];
  const win = MAX_DECODE_WIDTH;
  const step = win / 2;
  const starts = [];
  for (let s = 0; s + win < along; s += step) starts.push(s);
  if (starts[starts.length - 1] !== along - win) starts.push(along - win);
  const bandH = Math.min(across, Math.max(win * 0.5, across * 0.35));
  const bandStarts = [(across - bandH) / 2, 0, across - bandH];
  const center = along / 2;
  starts.sort((a, b) => Math.abs(a + win / 2 - center) - Math.abs(b + win / 2 - center));
  const out = [];
  for (const b of bandStarts) {
    for (const s of starts) {
      const region = rotate
        ? { x: b, y: s, w: bandH, h: win }
        : { x: s, y: b, w: win, h: bandH };
      out.push([region, rotate]);
    }
  }
  return out;
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // older Safari: fall back to an <img>
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  img.objectUrl = url; // revoked after decoding
  // <img> exposes natural size; mirror it as width/height for drawRegion callers
  return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
}
