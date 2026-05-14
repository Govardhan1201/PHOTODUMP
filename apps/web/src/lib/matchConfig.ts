/**
 * matchConfig.ts
 * Single source of truth for all matching thresholds and quality filters.
 * Edit here to tune behaviour across the entire app.
 */

export type MatchMode = 'LOOSE' | 'MODERATE' | 'STRICT';
export type ModelTier = 'LIGHT' | 'FULL';

// ─── Similarity Thresholds ─────────────────────────────────────────────────
// ArcFace cosine similarity: 1.0 = identical twin, 0.0 = unrelated strangers.
// These thresholds control what counts as a "match" in each mode.
export const MATCH_MODES: Record<MatchMode, {
  cosineMin: number;
  label: string;
  desc: string;
}> = {
  LOOSE:    { cosineMin: 0.25, label: 'Loose',    desc: 'More Matches'    },
  MODERATE: { cosineMin: 0.38, label: 'Moderate', desc: 'Balanced'        },
  STRICT:   { cosineMin: 0.50, label: 'Strict',   desc: 'High Precision'  },
};

// ─── Confidence Bands ──────────────────────────────────────────────────────
// Results above a mode's cosineMin are further grouped into these bands.
export const CONFIDENCE_BANDS = {
  STRONG:   { min: 0.50, label: 'Strong Match',  color: '#10b981' },
  POSSIBLE: { min: 0.35, label: 'Possible Match', color: '#f59e0b' },
  WEAK:     { min: 0.20, label: 'Borderline',     color: '#6b7280' },
} as const;

export type BandKey = keyof typeof CONFIDENCE_BANDS;

export function getBand(similarity: number): BandKey {
  if (similarity >= CONFIDENCE_BANDS.STRONG.min)   return 'STRONG';
  if (similarity >= CONFIDENCE_BANDS.POSSIBLE.min) return 'POSSIBLE';
  return 'WEAK';
}

// ─── Quality Filters ───────────────────────────────────────────────────────
export const QUALITY = {
  // Faces smaller than this (in original image pixels) are rejected
  MIN_FACE_SIZE_PX: 40,
  // Laplacian variance below this = face is too blurry to recognise reliably
  BLUR_VARIANCE_THRESHOLD: 45,
  // Landmark asymmetry ratio — values far from 0.5 indicate extreme side-angles
  MAX_SIDE_ANGLE_RATIO: 0.22,
};

// ─── Model Configurations ──────────────────────────────────────────────────
export const MODEL_CONFIGS: Record<ModelTier, {
  label: string;
  desc: string;
  onnxPath: string;    // served from /public/models/
  inputName: string;   // ONNX model input tensor name
  outputName: string;  // ONNX model output tensor name
  dims: number;        // embedding vector size
}> = {
  LIGHT: {
    label: 'Fast · 25 MB',
    desc: 'Recommended for mobile & quick scans',
    onnxPath: '/models/arcface_mobilenet.onnx',
    inputName: 'input.1',
    outputName: '683',
    dims: 512,
  },
  FULL: {
    label: 'Accurate · 166 MB',
    desc: 'Best results on desktop with fast connection',
    onnxPath: '/models/arcface_r50.onnx',
    inputName: 'input.1',
    outputName: '683',
    dims: 512,
  },
};
