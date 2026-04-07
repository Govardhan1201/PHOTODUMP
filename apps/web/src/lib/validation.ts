// Client-side file validation — mirrors server-side rules.

export const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif']);
export const SUPPORTED_MIME       = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);

export interface ValidationResult {
  ok: boolean;
  validFiles: File[];
  invalidFiles: File[];
  error?: string;
}

function isValidImage(file: File): boolean {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext) || SUPPORTED_MIME.has(file.type.toLowerCase());
}

/**
 * Validate folder selection.
 * Rule: the folder must contain MORE THAN 10 valid images.
 */
export function validateFolderUpload(files: FileList | File[]): ValidationResult {
  const all = Array.from(files);
  const valid = all.filter(isValidImage);
  const invalid = all.filter(f => !isValidImage(f));

  if (valid.length <= 10) {
    return {
      ok: false,
      validFiles: valid,
      invalidFiles: invalid,
      error: `The selected folder contains only ${valid.length} valid image${valid.length === 1 ? '' : 's'}. Please select a folder with more than 10 photos (JPG, PNG, HEIC).`,
    };
  }

  return { ok: true, validFiles: valid, invalidFiles: invalid };
}

/**
 * Validate manual file selection.
 * Rule: at least 10 valid images must be selected.
 */
export function validateFileSelection(files: FileList | File[]): ValidationResult {
  const all = Array.from(files);
  const valid = all.filter(isValidImage);
  const invalid = all.filter(f => !isValidImage(f));

  if (valid.length < 10) {
    return {
      ok: false,
      validFiles: valid,
      invalidFiles: invalid,
      error: `Please select at least 10 valid images. You selected ${valid.length} valid image${valid.length === 1 ? '' : 's'} (${invalid.length} file${invalid.length === 1 ? '' : 's'} were unsupported and skipped).`,
    };
  }

  return { ok: true, validFiles: valid, invalidFiles: invalid };
}

/** Format a file size in bytes to a human-readable string. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format confidence (0–1) as a percentage label. */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
