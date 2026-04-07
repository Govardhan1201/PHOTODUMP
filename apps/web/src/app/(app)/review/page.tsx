'use client';

import { useEffect, useState } from 'react';
import { listPhotos, moveCategory, toggleReviewFlag, Photo } from '@/lib/api';

const MOVE_OPTIONS = ['WITH_ME','PEOPLE','NATURE','ITEMS','FOOD','VEHICLES','BUILDINGS','MIXED'];

export default function ReviewPage() {
  const [photos, setPhotos]   = useState<Photo[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);

  useEffect(() => {
    setLoading(true);
    listPhotos({ category: 'UNCERTAIN', page, pageSize: 30 })
      .then(r => { setPhotos(r.photos); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  async function handleMove(photoId: string, category: string) {
    await moveCategory(photoId, category);
    setPhotos(ps => ps.filter(p => p.id !== photoId));
    setTotal(t => t - 1);
  }

  async function handleFlag(photoId: string) {
    const res = await toggleReviewFlag(photoId);
    setPhotos(ps => ps.map(p => p.id === photoId ? { ...p, reviewFlag: res.reviewFlag } : p));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚠️ Needs Review</h1>
          <p className="page-subtitle">
            {total} photo{total !== 1 ? 's' : ''} classified as Uncertain — assign them to the right category.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner spinner-lg" /></div>
      ) : photos.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">✅</div>
          <h3>All clear!</h3>
          <p>No photos need review. Great job keeping your library organized.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {photos.map(p => (
            <div key={p.id} className="card" style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
              {/* Thumbnail */}
              <div style={{ width: 80, height: 80, borderRadius: 'var(--radius)', overflow: 'hidden', flexShrink: 0, background: 'var(--gray-100)' }}>
                {p.thumbnailUrl || p.storageUrl ? (
                  <img src={p.thumbnailUrl || p.storageUrl} alt={p.originalName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📷</div>}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.originalName}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 3 }}>
                  Confidence: {Math.round(p.confidence * 100)}% · Faces: {p.hasFaces ? `${p.faceClusterIds?.length ?? 0}` : 'none'}
                  {p.tags?.length > 0 && ` · Tags: ${p.tags.join(', ')}`}
                </div>
              </div>

              {/* Assign category */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {MOVE_OPTIONS.map(cat => (
                  <button
                    key={cat}
                    className="chip"
                    onClick={() => handleMove(p.id, cat)}
                    style={{ fontSize: '11px' }}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
                <button
                  className="chip"
                  onClick={() => handleFlag(p.id)}
                  style={{ fontSize: '11px', background: p.reviewFlag ? 'var(--accent-subtle)' : undefined, color: p.reviewFlag ? 'var(--accent)' : undefined }}
                >
                  ⚑ Flag
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 30 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
          <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Page {page} of {Math.ceil(total / 30)}
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
