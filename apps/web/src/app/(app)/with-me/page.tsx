'use client';

import { useEffect, useState } from 'react';
import { listPhotos, Photo } from '@/lib/api';
import Link from 'next/link';

export default function WithMePage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]     = useState(1);

  useEffect(() => {
    setLoading(true);
    listPhotos({ category: 'WITH_ME', page, pageSize: 40 })
      .then(r => { setPhotos(r.photos); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🤳 With Me</h1>
          <p className="page-subtitle">
            {total > 0 ? `${total} photos you appear in` : 'Photos where you were detected'}
          </p>
        </div>
        <Link href="/people">
          <button className="btn btn-secondary">Run Find Me →</button>
        </Link>
      </div>

      {/* Info card */}
      {total === 0 && !loading && (
        <div className="card" style={{ padding: '32px', textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '48px', marginBottom: 16 }}>🤳</div>
          <h3 style={{ marginBottom: 8 }}>No "With Me" photos yet</h3>
          <p style={{ marginBottom: 20 }}>
            Go to the <strong>People</strong> tab and run "Find Me" by uploading 1–3 reference selfies.
            PhotoMind will scan all your photos and group the ones you appear in.
          </p>
          <Link href="/people">
            <button className="btn btn-primary">→ Run Find Me</button>
          </Link>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1', borderRadius: 'var(--radius)', background: 'var(--gray-100)' }} />
          ))}
        </div>
      ) : (
        <div className="photo-grid">
          {photos.map(p => (
            <div key={p.id} className="photo-card">
              {p.thumbnailUrl || p.storageUrl ? (
                <img src={p.thumbnailUrl || p.storageUrl} alt={p.originalName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', background: 'var(--gray-100)' }}>📷</div>
              )}
              <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '10px', padding: '2px 7px', borderRadius: 'var(--radius-full)' }}>
                {Math.round(p.confidence * 100)}%
              </div>
              {p.faceClusterIds?.length > 0 && (
                <div style={{ position: 'absolute', bottom: 8, left: 8 }}>
                  <span className="badge badge-with-me" style={{ fontSize: '10px', padding: '1px 6px' }}>
                    {p.faceClusterIds.length} face{p.faceClusterIds.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 40 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 28 }}>
          <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>Page {page} of {Math.ceil(total / 40)}</span>
          <button className="btn btn-secondary btn-sm" disabled={page * 40 >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
