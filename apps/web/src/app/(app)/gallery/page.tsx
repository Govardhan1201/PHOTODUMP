'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import {
  listPhotos, getCategoryCounts, moveCategory, toggleReviewFlag, deletePhoto,
  Photo, PhotoFilterParams,
} from '@/lib/api';

const CATEGORIES = [
  { key: '',          label: 'All Photos',  emoji: '🖼️' },
  { key: 'WITH_ME',   label: 'With Me',     emoji: '🤳' },
  { key: 'PEOPLE',    label: 'People',      emoji: '👥' },
  { key: 'NATURE',    label: 'Nature',      emoji: '🌿' },
  { key: 'ITEMS',     label: 'Items',       emoji: '📦' },
  { key: 'FOOD',      label: 'Food',        emoji: '🍕' },
  { key: 'VEHICLES',  label: 'Vehicles',    emoji: '🚗' },
  { key: 'BUILDINGS', label: 'Buildings',   emoji: '🏙️' },
  { key: 'UNCERTAIN', label: 'Uncertain',   emoji: '❓' },
];

const CATEGORY_BADGE: Record<string, string> = {
  WITH_ME: 'badge-with-me', PEOPLE: 'badge-people', NATURE: 'badge-nature',
  ITEMS: 'badge-items', FOOD: 'badge-food', VEHICLES: 'badge-vehicles',
  BUILDINGS: 'badge-buildings', MIXED: 'badge-mixed', UNCERTAIN: 'badge-uncertain',
};

const MOVE_OPTIONS = ['WITH_ME','PEOPLE','NATURE','ITEMS','FOOD','VEHICLES','BUILDINGS','MIXED','UNCERTAIN'];

function PhotoCard({ photo, onMove, onFlag, onDelete }: {
  photo: Photo;
  onMove: (id: string, cat: string) => void;
  onFlag: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const src = photo.thumbnailUrl || photo.storageUrl;
  const isPlaceholder = !src || src === '';

  return (
    <div className="photo-card" style={{ position: 'relative' }}>
      {isPlaceholder ? (
        <div style={{
          width: '100%', height: '100%', background: 'var(--gray-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '32px',
        }}>📷</div>
      ) : (
        <img
          src={src}
          alt={photo.originalName}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
      )}

      {/* Category badge */}
      <div className="photo-card-badge">
        <span className={`badge ${CATEGORY_BADGE[photo.category] || ''}`} style={{ fontSize: '10px', padding: '2px 7px' }}>
          {photo.category?.replace('_', ' ')}
        </span>
      </div>

      {/* Confidence */}
      {photo.confidence > 0 && (
        <div className="photo-card-confidence">{Math.round(photo.confidence * 100)}%</div>
      )}

      {/* Review flag */}
      {photo.reviewFlag && (
        <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: '14px' }}>⚠️</div>
      )}

      {/* Hover overlay with actions */}
      <div className="photo-card-overlay">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '4px 8px', fontSize: '11px' }}
            onClick={() => setMenuOpen(o => !o)}
          >Move ▾</button>
          <button
            className="btn btn-sm"
            style={{ background: photo.reviewFlag ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.2)', color: 'white', padding: '4px 8px', fontSize: '11px' }}
            onClick={() => onFlag(photo.id)}
          >⚑</button>
          <button
            className="btn btn-sm"
            style={{ background: 'rgba(239,68,68,0.3)', color: 'white', padding: '4px 8px', fontSize: '11px' }}
            onClick={() => onDelete(photo.id)}
          >✕</button>
        </div>
      </div>

      {/* Move category dropdown */}
      {menuOpen && (
        <div style={{
          position: 'absolute', bottom: 44, left: 8,
          background: 'white', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)',
          zIndex: 10, minWidth: 140, overflow: 'hidden',
        }}>
          {MOVE_OPTIONS.map(cat => (
            <button key={cat} onClick={() => { onMove(photo.id, cat); setMenuOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px', border: 'none', background: 'none',
                fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {cat.replace('_', ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}><span className="spinner spinner-lg" /></div>}>
      <GalleryContent />
    </Suspense>
  );
}

function GalleryContent() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get('category') || '';

  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [search, setSearch]       = useState('');
  const [photos, setPhotos]       = useState<Photo[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [counts, setCounts]       = useState<Record<string, number>>({});
  const [loading, setLoading]     = useState(true);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    const params: PhotoFilterParams = {
      page,
      pageSize: 40,
      search: search || undefined,
      category: selectedCategory || undefined,
    };
    try {
      const [res, cnts] = await Promise.all([listPhotos(params), getCategoryCounts()]);
      setPhotos(res.photos);
      setTotal(res.total);
      setCounts(cnts.counts);
    } catch {}
    setLoading(false);
  }, [selectedCategory, search, page]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);
  useEffect(() => { setPage(1); }, [selectedCategory, search]);

  async function handleMove(photoId: string, category: string) {
    await moveCategory(photoId, category);
    setPhotos(ps => ps.map(p => p.id === photoId ? { ...p, category } : p));
  }

  async function handleFlag(photoId: string) {
    const res = await toggleReviewFlag(photoId);
    setPhotos(ps => ps.map(p => p.id === photoId ? { ...p, reviewFlag: res.reviewFlag } : p));
  }

  async function handleDelete(photoId: string) {
    if (!confirm('Delete this photo?')) return;
    await deletePhoto(photoId);
    setPhotos(ps => ps.filter(p => p.id !== photoId));
    setTotal(t => t - 1);
  }

  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Gallery</h1>
          <p className="page-subtitle">{total.toLocaleString()} photos{selectedCategory ? ` in ${selectedCategory.replace('_', ' ')}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="search"
            className="input"
            placeholder="Search photos…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 220 }}
            id="gallery-search"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="tabs" style={{ overflowX: 'auto' }}>
        {CATEGORIES.map(c => {
          const count = c.key === '' ? totalAll : (counts[c.key] ?? 0);
          return (
            <button
              key={c.key}
              className={`tab ${selectedCategory === c.key ? 'active' : ''}`}
              onClick={() => setSelectedCategory(c.key)}
            >
              {c.emoji} {c.label}
              {count > 0 && <span className="nav-badge" style={{ background: 'var(--gray-200)', color: 'var(--text-secondary)', fontSize: '10px', padding: '1px 6px' }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1', borderRadius: 'var(--radius)', background: 'var(--gray-100)', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3>No photos found</h3>
          <p>{selectedCategory ? 'No photos in this category yet.' : 'Import some photos to get started.'}</p>
        </div>
      ) : (
        <>
          <div className="photo-grid">
            {photos.map(p => (
              <PhotoCard
                key={p.id}
                photo={p}
                onMove={handleMove}
                onFlag={handleFlag}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Pagination */}
          {total > 40 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 32 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Page {page} of {Math.ceil(total / 40)}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p + 1)} disabled={page * 40 >= total}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
