'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listSessions, getCategoryCounts, Session } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

const CATEGORY_INFO: Record<string, { label: string; emoji: string; badge: string }> = {
  WITH_ME:   { label: 'With Me',   emoji: '🤳', badge: 'badge-with-me' },
  PEOPLE:    { label: 'People',    emoji: '👥', badge: 'badge-people' },
  NATURE:    { label: 'Nature',    emoji: '🌿', badge: 'badge-nature' },
  ITEMS:     { label: 'Items',     emoji: '📦', badge: 'badge-items' },
  FOOD:      { label: 'Food',      emoji: '🍕', badge: 'badge-food' },
  VEHICLES:  { label: 'Vehicles',  emoji: '🚗', badge: 'badge-vehicles' },
  BUILDINGS: { label: 'Buildings', emoji: '🏙️', badge: 'badge-buildings' },
  MIXED:     { label: 'Mixed',     emoji: '🎨', badge: 'badge-mixed' },
  UNCERTAIN: { label: 'Uncertain', emoji: '❓', badge: 'badge-uncertain' },
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    QUEUED:     { color: '#f59e0b', label: 'Queued' },
    PROCESSING: { color: '#3b82f6', label: 'Processing' },
    COMPLETED:  { color: '#10b981', label: 'Completed' },
    FAILED:     { color: '#ef4444', label: 'Failed' },
  };
  const { color, label } = map[status] || { color: '#6b7280', label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: '999px',
      background: color + '18', color, fontSize: '12px', fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [counts, setCounts]       = useState<{ total: number; counts: Record<string, number> } | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([listSessions(), getCategoryCounts()])
      .then(([sess, cnts]) => {
        setSessions(sess.sessions.slice(0, 5));
        setCounts(cnts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = counts?.total ?? 0;

  const statsCards = [
    { label: 'Total Photos',    value: total,                        icon: '🖼️' },
    { label: 'With Me',         value: counts?.counts.WITH_ME ?? 0,  icon: '🤳' },
    { label: 'People',          value: counts?.counts.PEOPLE ?? 0,   icon: '👥' },
    { label: 'Needs Review',    value: counts?.counts.UNCERTAIN ?? 0,icon: '⚠️' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
            {user?.name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="page-subtitle">Here's an overview of your photo library.</p>
        </div>
        <Link href="/upload">
          <button className="btn btn-primary">⬆️ Import Photos</button>
        </Link>
      </div>

      {/* Stats */}
      {loading ? (
        <div style={{ display: 'flex', gap: 14 }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="card stats-card" style={{ flex: 1, height: 96, background: 'var(--gray-100)', border: 'none' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 32 }}>
          {statsCards.map(s => (
            <div key={s.label} className="card stats-card">
              <div style={{ fontSize: '20px', marginBottom: 4 }}>{s.icon}</div>
              <div className="stats-card-value">{s.value.toLocaleString()}</div>
              <div className="stats-card-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Category breakdown */}
      {!loading && total > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h3 style={{ marginBottom: 16, fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
            Category Breakdown
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {Object.entries(CATEGORY_INFO).map(([key, info]) => {
              const count = counts?.counts[key] ?? 0;
              if (!count) return null;
              return (
                <Link key={key} href={key === 'WITH_ME' ? '/with-me' : `/gallery?category=${key}`}>
                  <div className="card card-hover" style={{ padding: '16px', textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{ fontSize: '24px', marginBottom: 8 }}>{info.emoji}</div>
                    <div style={{ fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)' }}>{count}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 2 }}>{info.label}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent sessions */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>Recent Imports</h3>
          <Link href="/upload">
            <button className="btn btn-ghost btn-sm">+ New Import</button>
          </Link>
        </div>

        {loading ? (
          <div style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
            {[1,2].map(i => <div key={i} className="card" style={{ height: 66, background: 'var(--gray-100)', border: 'none' }} />)}
          </div>
        ) : sessions.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-state-icon">📂</div>
            <h3>No imports yet</h3>
            <p style={{ marginBottom: 20 }}>Upload a folder or connect Google Drive to get started.</p>
            <Link href="/upload">
              <button className="btn btn-primary">Import Your First Photos</button>
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map(s => (
              <div key={s.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{s.name || 'Untitled Import'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: 2 }}>
                    {s.processedPhotos}/{s.totalPhotos} photos · {s.sourceType.replace('_', ' ')} ·{' '}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <StatusBadge status={s.status} />
                  {s.status === 'PROCESSING' && (
                    <div style={{ width: 80 }}>
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: `${Math.round(s.processedPhotos / Math.max(s.totalPhotos, 1) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
