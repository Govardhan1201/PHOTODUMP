/**
 * arcfaceEngine.ts
 * Hybrid face recognition pipeline:
 *   - face-api.js SSD MobileNet → face detection + 68-point landmarks
 *   - ONNX Runtime Web + ArcFace → 512-dim embeddings (cosine similarity)
 *
 * All data stays in JS memory for the duration of the session only.
 * Nothing is persisted. URL objects are revoked immediately after use.
 */
'use client';

import * as faceapi from 'face-api.js';
import { QUALITY, MODEL_CONFIGS, type ModelTier } from './matchConfig';

// ArcFace standard 5-point reference landmarks for 112×112 aligned crop
const ARCFACE_REF: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

// ─── Module-level state (session lifetime only) ────────────────────────────
let ort: typeof import('onnxruntime-web') | null = null;
let arcSession: import('onnxruntime-web').InferenceSession | null = null;
let loadedTier: ModelTier | null = null;
let faceApiReady = false;

// ─── Public API ─────────────────────────────────────────────────────────────

export interface DetectedFace {
  /** ArcFace 512-dim embedding */
  embedding: Float32Array;
  /** Bounding box in original image coordinates */
  box: { x: number; y: number; w: number; h: number };
  /** Detection confidence (not identity confidence) */
  detScore: number;
  /** Set when quality check rejects this face */
  rejectedReason?: string;
}

export type ProgressCallback = (stage: string, pct: number) => void;

/**
 * Initialise face-api.js detection models and the ArcFace ONNX session.
 * Safe to call multiple times — skips work that is already done.
 */
export async function loadModels(
  tier: ModelTier,
  onProgress?: ProgressCallback,
): Promise<void> {
  // 1. Load face-api.js models (detection + landmarks only)
  if (!faceApiReady) {
    onProgress?.('Loading face detector…', 10);
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
    ]);
    faceApiReady = true;
  }

  // 2. Load ONNX runtime lazily (avoids SSR issues)
  if (!ort) {
    onProgress?.('Initialising ONNX runtime…', 25);
    ort = (await import('onnxruntime-web/dist/ort.wasm.min.js')) as any;
    ort!.env.wasm.wasmPaths = '/onnx/';
  }

  // 3. Load ArcFace ONNX model (with IndexedDB caching)
  if (arcSession && loadedTier === tier) {
    onProgress?.('Model ready', 100);
    return;
  }

  const cfg = MODEL_CONFIGS[tier];
  onProgress?.(`Checking cache for ${cfg.label}…`, 30);

  const cached = await readFromIDB(tier);
  if (cached) {
    arcSession = await ort.InferenceSession.create(cached);
    loadedTier = tier;
    onProgress?.('Loaded from cache ⚡', 100);
    return;
  }

  // Download with progress
  onProgress?.(`Downloading ${cfg.label}…`, 35);
  const resp = await fetch(cfg.onnxPath);
  if (!resp.ok) throw new Error(`Failed to fetch ArcFace model: ${resp.statusText}`);

  const total = parseInt(resp.headers.get('content-length') || '0', 10);
  const reader = resp.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total > 0) {
      const pct = 35 + Math.floor((received / total) * 55);
      const mb = (received / 1_048_576).toFixed(1);
      onProgress?.(`Downloading ${cfg.label} · ${mb} MB`, pct);
    }
  }

  // Assemble buffer
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { buffer.set(c, offset); offset += c.byteLength; }

  await writeToIDB(tier, buffer.buffer);
  arcSession = await ort.InferenceSession.create(buffer.buffer);
  loadedTier = tier;
  onProgress?.('Model ready ✓', 100);
}

/**
 * Detect faces in an image blob and return ArcFace embeddings + metadata.
 * Applies quality filters (small / blurry / extreme-angle faces are flagged).
 */
export async function getFaceEmbeddings(
  blob: Blob,
  maxDim = 1024,
): Promise<DetectedFace[]> {
  if (!arcSession || !ort) throw new Error('Models not loaded — call loadModels() first');

  const url = URL.createObjectURL(blob);
  const img = await imgFromUrl(url);
  URL.revokeObjectURL(url);

  const scaleCanvas = resizeCanvas(img, maxDim);
  const scale = scaleCanvas.width / img.naturalWidth;

  // Detect with face-api.js
  const rawDets = await faceapi
    .detectAllFaces(scaleCanvas)
    .withFaceLandmarks();

  const results: DetectedFace[] = [];

  for (const d of rawDets) {
    const box = {
      x: d.detection.box.x / scale,
      y: d.detection.box.y / scale,
      w: d.detection.box.width / scale,
      h: d.detection.box.height / scale,
    };

    // Quality: size
    if (box.w < QUALITY.MIN_FACE_SIZE_PX || box.h < QUALITY.MIN_FACE_SIZE_PX) {
      results.push({ embedding: new Float32Array(512), box, detScore: d.detection.score, rejectedReason: 'Face too small' });
      continue;
    }

    // Quality: side-angle via landmark asymmetry
    const pts = d.landmarks.positions;
    const lEye = pts[36], rEye = pts[45], nose = pts[30];
    const eyeSpan = Math.abs(rEye.x - lEye.x);
    const leftFrac = eyeSpan > 0 ? Math.abs(nose.x - lEye.x) / eyeSpan : 0.5;
    if (leftFrac < 0.5 - QUALITY.MAX_SIDE_ANGLE_RATIO || leftFrac > 0.5 + QUALITY.MAX_SIDE_ANGLE_RATIO) {
      results.push({ embedding: new Float32Array(512), box, detScore: d.detection.score, rejectedReason: 'Extreme side angle' });
      continue;
    }

    // Align face to 112×112
    const aligned = alignFace(img, pts);

    // Quality: blur
    if (isBlurry(aligned)) {
      results.push({ embedding: new Float32Array(512), box, detScore: d.detection.score, rejectedReason: 'Face too blurry' });
      continue;
    }

    const embedding = await runArcFace(aligned);
    results.push({ embedding, box, detScore: d.detection.score });
  }

  return results;
}

/**
 * Cosine similarity between two ArcFace embeddings.
 * Returns a value in [−1, 1]. Higher = more similar.
 */
export function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// ─── Private helpers ───────────────────────────────────────────────────────

function imgFromUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function resizeCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  let w = img.naturalWidth, h = img.naturalHeight;
  if (w > maxDim || h > maxDim) {
    if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
    else        { w = Math.round(w * maxDim / h); h = maxDim; }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return c;
}

function alignFace(
  img: HTMLImageElement,
  pts: faceapi.Point[],
): HTMLCanvasElement {
  // Map 68-point landmarks → 5 key points matching ArcFace reference
  const src: [number, number][] = [
    [pts[36].x, pts[36].y], // left eye left corner
    [pts[45].x, pts[45].y], // right eye right corner
    [pts[30].x, pts[30].y], // nose tip
    [pts[48].x, pts[48].y], // mouth left
    [pts[54].x, pts[54].y], // mouth right
  ];

  const [a, b, c, d, tx, ty] = umeyama(src, ARCFACE_REF);
  const out = document.createElement('canvas');
  out.width = 112; out.height = 112;
  const ctx = out.getContext('2d')!;
  ctx.transform(a, b, c, d, tx, ty);
  ctx.drawImage(img, 0, 0);
  return out;
}

/** Simplified similarity transform (Umeyama, 5-point) */
function umeyama(
  src: [number, number][],
  dst: [number, number][],
): [number, number, number, number, number, number] {
  const n = src.length;
  let sx = 0, sy = 0, su = 0, sv = 0;
  let sxu = 0, syu = 0, sxv = 0, syv = 0;
  let sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    sx += x; sy += y; su += u; sv += v;
    sxu += x * u; syu += y * u; sxv += x * v; syv += y * v;
    sxx += x * x; syy += y * y;
  }
  const det = n * (sxx + syy) - (sx * sx + sy * sy);
  if (Math.abs(det) < 1e-10) return [1, 0, 0, 1, 0, 0];
  const a  = (n * (sxu + syv) - (sx * su + sy * sv)) / det;
  const b  = (n * (syu - sxv) - (sy * su - sx * sv)) / det;
  const tx = (su - a * sx + b * sy) / n;
  const ty = (sv - b * sx - a * sy) / n;
  return [a, b, -b, a, tx, ty];
}

/** Laplacian-variance blur detection */
function isBlurry(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const w = canvas.width, h = canvas.height;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];

  let sum = 0, sumSq = 0;
  const total = (w - 2) * (h - 2);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const lap = 4 * gray[y * w + x]
        - gray[(y - 1) * w + x] - gray[(y + 1) * w + x]
        - gray[y * w + x - 1]   - gray[y * w + x + 1];
      sum += lap; sumSq += lap * lap;
    }
  }
  const variance = sumSq / total - (sum / total) ** 2;
  return variance < QUALITY.BLUR_VARIANCE_THRESHOLD;
}

async function runArcFace(canvas: HTMLCanvasElement): Promise<Float32Array> {
  const ctx = canvas.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, 112, 112);
  const tensor = new Float32Array(3 * 112 * 112);
  for (let i = 0; i < 112 * 112; i++) {
    tensor[i]               = (data[i * 4]     / 255 - 0.5) / 0.5; // R
    tensor[112 * 112 + i]   = (data[i * 4 + 1] / 255 - 0.5) / 0.5; // G
    tensor[2 * 112 * 112 + i] = (data[i * 4 + 2] / 255 - 0.5) / 0.5; // B
  }
  const cfg = MODEL_CONFIGS[loadedTier!];
  const inp = new ort!.Tensor('float32', tensor, [1, 3, 112, 112]);
  const out = await arcSession!.run({ [cfg.inputName]: inp });
  return out[cfg.outputName].data as Float32Array;
}

// ─── IndexedDB caching (model weights only — not biometric data) ───────────
function openIDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open('photomind-onnx-cache', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('weights');
    req.onsuccess = () => res(req.result);
    req.onerror   = rej;
  });
}

async function readFromIDB(tier: ModelTier): Promise<ArrayBuffer | null> {
  try {
    const db  = await openIDB();
    const tx  = db.transaction('weights', 'readonly');
    const req = tx.objectStore('weights').get(`arcface_${tier}`);
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result ?? null);
      req.onerror   = rej;
    });
  } catch { return null; }
}

async function writeToIDB(tier: ModelTier, buf: ArrayBuffer): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction('weights', 'readwrite');
    tx.objectStore('weights').put(buf, `arcface_${tier}`);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = rej; });
  } catch { /* cache failure is non-fatal */ }
}
