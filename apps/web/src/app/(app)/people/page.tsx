'use client';

import { useEffect, useState, useCallback } from 'react';
import { listClusters, getClusterPhotos, labelCluster, mergeClusters, uploadReferenceFaces, FaceCluster } from '@/lib/api';

export default function PeoplePage() {
  const [clusters, setClusters] = useState<FaceCluster[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [isUserCheck, setIsUserCheck] = useState(false);
  const [findMeFiles, setFindMeFiles] = useState<File[]>([]);
  const [findMeResult, setFindMeResult] = useState<{ matchedPhotos: number } | null>(null);
  const [findMeLoading, setFindMeLoading] = useState(false);
  const [findMeError, setFindMeError] = useState('');

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    try {
      const { clusters: data } = await listClusters();
      setClusters(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchClusters(); }, [fetchClusters]);

  async function handleLabel(clusterId: string) {
    if (!labelInput.trim()) return;
    await labelCluster(clusterId, labelInput.trim(), isUserCheck);
    setClusters(cs => cs.map(c => c.id === clusterId ? { ...c, label: labelInput.trim(), isUser: isUserCheck } : c));
    setEditingId(null); setLabelInput(''); setIsUserCheck(false);
  }

  async function handleMerge() {
    if (selected.length < 2) return;
    const [target, ...sources] = selected;
    await mergeClusters(sources, target);
    setSelected([]);
    fetchClusters();
  }

  async function handleFindMe() {
    if (!findMeFiles.length || findMeFiles.length > 3) {
      setFindMeError('Upload 1 to 3 reference photos of yourself.');
      return;
    }
    setFindMeLoading(true); setFindMeError('');
    try {
      const result = await uploadReferenceFaces(findMeFiles);
      setFindMeResult(result);
      fetchClusters();
    } catch (e: any) {
      setFindMeError(e.message);
    } finally {
      setFindMeLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems:'center', justifyContent:'center', height: 300 }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">People</h1>
          <p className="page-subtitle">Face clusters detected in your photos. Label or merge them below.</p>
        </div>
        {selected.length >= 2 && (
          <button className="btn btn-primary" onClick={handleMerge}>
            🔗 Merge {selected.length} Clusters
          </button>
        )}
      </div>

      {/* Find Me panel */}
      <div className="card" style={{ padding: '24px', marginBottom: 28 }}>
        <h3 style={{ marginBottom: 6, fontSize: '1rem' }}>🔍 Find Me in Photos</h3>
        <p style={{ fontSize: '14px', marginBottom: 16, color: 'var(--text-secondary)' }}>
          Upload 1–3 clear photos of your face. PhotoMind will scan every photo to find you.
        </p>
        {findMeResult ? (
          <div className="alert alert-success">
            ✅ Found <strong>{findMeResult.matchedPhotos}</strong> photos with you! Check the <strong>With Me</strong> tab.
          </div>
        ) : (
          <>
            {findMeError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{findMeError}</div>}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <label htmlFor="find-me-upload" style={{ cursor: 'pointer' }}>
                <div className="btn btn-secondary">
                  📷 {findMeFiles.length > 0 ? `${findMeFiles.length} photo(s) selected` : 'Select Reference Photos'}
                </div>
              </label>
              <input
                id="find-me-upload"
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={e => setFindMeFiles(Array.from(e.target.files || []).slice(0, 3))}
              />
              <button
                className="btn btn-primary"
                onClick={handleFindMe}
                disabled={!findMeFiles.length || findMeLoading}
              >
                {findMeLoading ? <><span className="spinner spinner-sm" />Scanning…</> : 'Find Me →'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Cluster grid */}
      {clusters.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👤</div>
          <h3>No face clusters yet</h3>
          <p>Import photos with people to see face groups here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
          {clusters.map(cluster => (
            <div
              key={cluster.id}
              className={`card card-hover cluster-card ${selected.includes(cluster.id) ? 'selected' : ''}`}
              style={{
                border: selected.includes(cluster.id) ? '2px solid var(--accent)' : undefined,
                background: cluster.isUser ? 'var(--accent-subtle)' : undefined,
              }}
              onClick={() => {
                setSelected(s =>
                  s.includes(cluster.id) ? s.filter(id => id !== cluster.id) : [...s, cluster.id]
                );
              }}
            >
              {/* Cover photo */}
              <div
                className={`cluster-avatar ${cluster.isUser ? 'me-badge' : ''}`}
                style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}
              >
                {cluster.coverPhotoUrl ? (
                  <img src={cluster.coverPhotoUrl} alt="face" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : '👤'}
              </div>

              <div style={{ textAlign: 'center', width: '100%' }}>
                {editingId === cluster.id ? (
                  <div onClick={e => e.stopPropagation()}>
                    <input
                      className="input"
                      value={labelInput}
                      onChange={e => setLabelInput(e.target.value)}
                      placeholder="Name this person"
                      style={{ fontSize: '12px', padding: '5px 8px', marginBottom: 6 }}
                      autoFocus
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', marginBottom: 8, cursor: 'pointer', justifyContent: 'center' }}>
                      <input type="checkbox" checked={isUserCheck} onChange={e => setIsUserCheck(e.target.checked)} />
                      This is me
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleLabel(cluster.id)}>Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setLabelInput(''); }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      {cluster.isUser ? '⭐ ' : ''}{cluster.label || 'Unknown'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 8 }}>
                      {cluster.photoCount} photo{cluster.photoCount !== 1 ? 's' : ''}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px' }}
                      onClick={e => { e.stopPropagation(); setEditingId(cluster.id); setLabelInput(cluster.label || ''); setIsUserCheck(cluster.isUser); }}
                    >
                      ✏️ Label
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="alert alert-info" style={{ marginTop: 20 }}>
          {selected.length} cluster{selected.length > 1 ? 's' : ''} selected.
          {selected.length >= 2 ? ' Click "Merge" to combine them.' : ' Select one more to merge.'}
        </div>
      )}
    </div>
  );
}
