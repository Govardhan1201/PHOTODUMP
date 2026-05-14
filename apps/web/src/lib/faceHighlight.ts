/**
 * faceHighlight.ts
 * Draws a colour-coded bounding box and confidence badge on a matched image.
 * Returns a data URL; original blob is not modified.
 * All processing is synchronous in-memory — no files written.
 */

import { CONFIDENCE_BANDS, getBand } from './matchConfig';

export async function drawFaceHighlight(
  blob: Blob,
  box: { x: number; y: number; w: number; h: number },
  similarity: number,
): Promise<string> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const band  = getBand(similarity);
      const color = CONFIDENCE_BANDS[band].color;
      const lw    = Math.max(2, Math.round(img.naturalWidth / 250));

      // Bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth   = lw;
      ctx.strokeRect(box.x, box.y, box.w, box.h);

      // Corner accent marks
      const cs = Math.min(box.w, box.h) * 0.18;
      ctx.lineWidth = lw * 2;
      [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].forEach(([cx, cy]) => {
        const dx = cx === box.x ? 1 : -1;
        const dy = cy === box.y ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx + dx * cs, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + dy * cs);
        ctx.stroke();
      });

      // Confidence badge
      const pct   = Math.round(similarity * 100);
      const fs    = Math.max(11, Math.round(img.naturalWidth / 55));
      const label = `${pct}%`;
      ctx.font = `bold ${fs}px Inter, sans-serif`;
      const tw = ctx.measureText(label).width;
      const bx = box.x;
      const by = box.y > fs + 10 ? box.y - fs - 10 : box.y + box.h + 4;
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, tw + 10, fs + 8);
      ctx.fillStyle = '#000';
      ctx.fillText(label, bx + 5, by + fs + 2);

      resolve(canvas.toDataURL('image/jpeg', 0.90));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}
