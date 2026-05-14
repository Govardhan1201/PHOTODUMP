'use client';

import { useEffect, useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { loadModels, getFaceEmbeddings, cosineSim } from '@/lib/arcfaceEngine';
import { drawFaceHighlight } from '@/lib/faceHighlight';
import { MATCH_MODES, CONFIDENCE_BANDS, getBand, MODEL_CONFIGS, type MatchMode, type ModelTier, type BandKey } from '@/lib/matchConfig';
import { loadGoogleScripts, authorizeGoogleDrive, createFolderPicker, getFilesInFolder, downloadDriveFile } from '@/lib/google';

const GOOGLE_CLIENT_ID_ENV = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY_ENV   = process.env.NEXT_PUBLIC_GOOGLE_API_KEY   || '';
const BATCH = 3;

type InputImage = { type: 'local'; file: File; name: string } | { type: 'drive'; id: string; name: string };

type MatchResult = {
  highlightedUrl: string;
  originalUrl: string;
  blob: Blob;
  name: string;
  similarity: number;
  band: BandKey;
  faceCount: number;
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function Page() {
  // Model state
  const [modelTier,   setModelTier]   = useState<ModelTier>('LIGHT');
  const [modelsReady, setModelsReady] = useState(false);
  const [initStage,   setInitStage]   = useState('Initialising…');
  const [initPct,     setInitPct]     = useState(0);
  const [initError,   setInitError]   = useState('');

  // Session state
  const [matchMode,     setMatchMode]     = useState<MatchMode>('MODERATE');
  const [targetFile,    setTargetFile]    = useState<File | null>(null);
  const [targetPreview, setTargetPreview] = useState('');
  const [sourceItems,   setSourceItems]   = useState<InputImage[]>([]);
  const [results,       setResults]       = useState<MatchResult[]>([]);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [stage,      setStage]      = useState('');
  const [pct,        setPct]        = useState(0);

  // Google Drive
  const [driveToken,   setDriveToken]   = useState('');
  const [manualCid,    setManualCid]    = useState('');
  const [manualKey,    setManualKey]    = useState('');
  const [showDriveDlg, setShowDriveDlg] = useState(false);

  const activeCid = manualCid || GOOGLE_CLIENT_ID_ENV;
  const activeKey = manualKey || GOOGLE_API_KEY_ENV;

  // Load models on mount
  useEffect(() => {
    loadModels(modelTier, (s, p) => { setInitStage(s); setInitPct(p); })
      .then(() => setModelsReady(true))
      .catch(e => setInitError(e?.message || String(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-init when tier changes (only after user explicitly switches)
  const firstMount = useRef(true);
  useEffect(() => {
    if (firstMount.current) { firstMount.current = false; return; }
    setModelsReady(false); setInitPct(0);
    loadModels(modelTier, (s, p) => { setInitStage(s); setInitPct(p); })
      .then(() => setModelsReady(true))
      .catch(e => setInitError(e?.message || String(e)));
  }, [modelTier]);

  useEffect(() => {
    if (activeCid) loadGoogleScripts(activeCid).catch(() => {});
  }, [activeCid]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTarget = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setTargetFile(f);
    setTargetPreview(URL.createObjectURL(f));
    setResults([]);
  };

  const handleLocalSrc = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    setSourceItems(files.map(f => ({ type: 'local', file: f, name: f.name })));
    setResults([]);
  };

  const handleZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const zf = e.target.files?.[0]; if (!zf) return;
    setProcessing(true); setStage('Extracting archive…'); setPct(5);
    try {
      const zip = await JSZip.loadAsync(zf);
      const entries = Object.keys(zip.files).filter(n => !zip.files[n].dir && /\.(jpe?g|png)$/i.test(n));
      const out: InputImage[] = [];
      for (let i = 0; i < entries.length; i++) {
        const blob = await zip.files[entries[i]].async('blob');
        const name = entries[i].split('/').pop()!;
        out.push({ type: 'local', file: new File([blob], name), name });
        setPct(5 + Math.floor(i / entries.length * 90));
      }
      setSourceItems(out); setResults([]);
      setStage(`Extracted ${out.length} photos`); setPct(100);
    } catch { setStage('ZIP extraction failed'); }
    finally { setProcessing(false); setTimeout(() => setPct(0), 800); }
  };

  const handleDrive = async () => {
    if (!activeCid || !activeKey) { setShowDriveDlg(true); return; }
    try {
      let token = driveToken;
      if (!token) {
        setProcessing(true); setStage('Opening Google auth…');
        token = await authorizeGoogleDrive(activeCid);
        setDriveToken(token);
      }
      const folder = await createFolderPicker(token, activeKey);
      if (folder) {
        setStage(`Loading "${folder.name}"…`); setProcessing(true);
        const files = await getFilesInFolder(token, folder.id);
        setSourceItems(files.map(f => ({ type: 'drive', id: f.id, name: f.name })));
        setResults([]);
      }
    } catch (err: any) {
      alert(`Drive error: ${err?.message || 'Connection failed'}. Check Google Cloud Console Origins.`);
    } finally { setProcessing(false); setPct(0); }
  };

  // ── Core search ───────────────────────────────────────────────────────────
  const runSearch = async () => {
    if (!targetFile || !sourceItems.length) return;
    setProcessing(true); setResults([]); setPct(2);

    try {
      // 1. Reference embedding
      setStage('Detecting reference face…');
      const refFaces = await getFaceEmbeddings(targetFile);
      const ref = refFaces.find(f => !f.rejectedReason);
      if (!ref) { alert('No usable face found in your reference photo. Try a clearer, front-facing photo.'); setProcessing(false); return; }

      const threshold = MATCH_MODES[matchMode].cosineMin;
      const matches: MatchResult[] = [];

      // 2. Scan sources in batches
      for (let i = 0; i < sourceItems.length; i += BATCH) {
        const batch = sourceItems.slice(i, i + BATCH);
        const bEnd  = Math.min(i + BATCH, sourceItems.length);
        setStage(`Scanning ${i + 1}–${bEnd} of ${sourceItems.length}…`);
        setPct(5 + Math.floor(i / sourceItems.length * 88));

        await Promise.all(batch.map(async item => {
          try {
            const blob: Blob = item.type === 'drive'
              ? await downloadDriveFile(driveToken, item.id)
              : item.file;

            const faces = await getFaceEmbeddings(blob);
            const valid = faces.filter(f => !f.rejectedReason);
            if (!valid.length) return;

            // Best match across all faces in image
            let best = -1, bestFace = valid[0];
            for (const face of valid) {
              const s = cosineSim(ref.embedding, face.embedding);
              if (s > best) { best = s; bestFace = face; }
            }
            if (best < threshold) return;

            const band = getBand(best);
            const originalUrl = URL.createObjectURL(blob);
            const highlightedUrl = await drawFaceHighlight(blob, bestFace.box, best);
            matches.push({ blob, originalUrl, highlightedUrl, name: item.name, similarity: best, band, faceCount: valid.length });
          } catch { /* skip unreadable images */ }
        }));

        await new Promise(r => setTimeout(r, 0)); // yield to UI
      }

      matches.sort((a, b) => b.similarity - a.similarity);
      setResults(matches);
      setStage(`Done — ${matches.length} match${matches.length !== 1 ? 'es' : ''} found`);
      setPct(100);
    } catch (e: any) {
      setStage(`Error: ${e?.message || 'Unknown error'}`);
    } finally { setProcessing(false); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const downloadAll = async () => {
    const zip = new JSZip();
    results.forEach(r => zip.file(r.name, r.blob));
    saveAs(await zip.generateAsync({ type: 'blob' }), 'face-matches.zip');
  };

  const byBand = (band: BandKey) => results.filter(r => r.band === band);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (!modelsReady) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
        {initError ? (
          <div className="glass-card" style={{ maxWidth: 480, textAlign: 'center', border: '1px solid #ef4444', color: '#ef4444' }}>
            <h3 style={{ marginBottom: 8 }}>Initialisation Failed</h3>
            <p style={{ fontSize: 13 }}>{initError}</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
            <div className="spinner" style={{ margin: '0 auto 24px' }} />
            <h2 style={{ marginBottom: 8 }}>{initStage}</h2>
            <div className="progress-bar" style={{ maxWidth: 400, margin: '16px auto 24px' }}>
              <div className="progress-fill" style={{ width: `${initPct}%` }} />
            </div>
            {/* Model tier selector shown during init */}
            <div className="glass-card" style={{ padding: 20, marginTop: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Choose accuracy model:</p>
              <div className="segmented-control" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {(['LIGHT', 'FULL'] as ModelTier[]).map(t => (
                  <button key={t} className={`segment-btn ${modelTier === t ? 'active' : ''}`}
                    onClick={() => setModelTier(t)} disabled={processing}>
                    {MODEL_CONFIGS[t].label}
                    <small>{MODEL_CONFIGS[t].desc}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: main ──────────────────────────────────────────────────────────
  return (
    <div className="animate-in" style={{ padding: '20px 0' }}>

      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--obsidian-800)', border: '1px solid var(--emerald-glow)', color: 'var(--emerald)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
            STATELESS AI · 100% PRIVATE
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.4rem)', letterSpacing: '-0.03em' }}>Vision Obsidian</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Temporary face search · No data stored · Session-only</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Model:</span>
          <div className="segmented-control" style={{ gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {(['LIGHT', 'FULL'] as ModelTier[]).map(t => (
              <button key={t} className={`segment-btn ${modelTier === t ? 'active' : ''}`}
                onClick={() => setModelTier(t)} style={{ padding: '6px 10px', fontSize: 11 }}>
                {MODEL_CONFIGS[t].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 1 — Reference photo */}
      <div className="glass-card animate-in" style={{ marginBottom: 20 }}>
        <h4 style={{ color: 'var(--emerald)', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Step 1</h4>
        <h3 style={{ marginBottom: 12 }}>Upload Reference Photo</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>One clear, front-facing photo of the person to search for.</p>
        <input type="file" accept="image/jpeg,image/png" onChange={handleTarget} id="ref-input" style={{ display: 'none' }} disabled={processing} />
        <button className="btn btn-primary" onClick={() => document.getElementById('ref-input')?.click()} disabled={processing}>
          {targetFile ? '↺ Change Photo' : 'Select Photo'}
        </button>
        {targetPreview && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 90, height: 90, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--emerald-glow)', flexShrink: 0 }}>
              <img src={targetPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--emerald)' }}>✓ Reference loaded</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{targetFile?.name}</div>
            </div>
          </div>
        )}
      </div>

      {/* Step 2 — Source images */}
      {targetFile && (
        <div className="glass-card animate-in" style={{ marginBottom: 20 }}>
          <h4 style={{ color: 'var(--emerald)', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Step 2</h4>
          <h3 style={{ marginBottom: 12 }}>Choose Source Images</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>

            {/* Local photos */}
            <div className="mode-option-card" style={{ padding: 20, textAlign: 'center' }}>
              <span style={{ fontSize: 28, display: 'block', marginBottom: 10 }}>📸</span>
              <h4 style={{ marginBottom: 6, fontSize: 14 }}>Photos / Folder</h4>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>Local files or phone gallery</p>
              <input type="file" multiple accept="image/jpeg,image/png" onChange={handleLocalSrc} id="src-input" style={{ display: 'none' }} disabled={processing} />
              <button className="btn btn-secondary btn-sm" onClick={() => document.getElementById('src-input')?.click()} style={{ width: '100%' }}>Select</button>
            </div>

            {/* ZIP */}
            <div className="mode-option-card" style={{ padding: 20, textAlign: 'center' }}>
              <span style={{ fontSize: 28, display: 'block', marginBottom: 10 }}>📦</span>
              <h4 style={{ marginBottom: 6, fontSize: 14 }}>ZIP Archive</h4>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>Upload a .zip of photos</p>
              <input type="file" accept=".zip" onChange={handleZip} id="zip-input" style={{ display: 'none' }} disabled={processing} />
              <button className="btn btn-secondary btn-sm" onClick={() => document.getElementById('zip-input')?.click()} style={{ width: '100%' }}>Upload ZIP</button>
            </div>

            {/* Google Drive */}
            <div className="mode-option-card" style={{ padding: 20, textAlign: 'center' }}>
              <span style={{ fontSize: 28, display: 'block', marginBottom: 10 }}>☁️</span>
              <h4 style={{ marginBottom: 6, fontSize: 14 }}>Google Drive</h4>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>Select a Drive folder</p>
              <button className="btn btn-secondary btn-sm" onClick={handleDrive} style={{ width: '100%' }} disabled={processing}>Connect</button>
            </div>
          </div>

          {sourceItems.length > 0 && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--emerald-glow)', borderRadius: 8, color: 'var(--emerald)', fontSize: 13, fontWeight: 700 }}>
              ✓ {sourceItems.length} images ready
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Mode & run */}
      {targetFile && sourceItems.length > 0 && !processing && pct === 0 && (
        <div className="glass-card animate-in" style={{ marginBottom: 20 }}>
          <h4 style={{ color: 'var(--emerald)', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Step 3</h4>
          <h3 style={{ marginBottom: 16 }}>Select Matching Mode</h3>
          <div className="segmented-control" style={{ marginBottom: 24 }}>
            {(Object.keys(MATCH_MODES) as MatchMode[]).map(m => (
              <button key={m} className={`segment-btn ${matchMode === m ? 'active' : ''}`} onClick={() => setMatchMode(m)}>
                {MATCH_MODES[m].label}
                <small>{MATCH_MODES[m].desc}</small>
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-lg" onClick={runSearch} style={{ width: '100%' }}>
            Start Face Search
          </button>
        </div>
      )}

      {/* Progress */}
      {processing && (
        <div className="glass-card animate-in" style={{ textAlign: 'center', padding: 40, marginBottom: 20 }}>
          <div className="spinner" style={{ margin: '0 auto 20px' }} />
          <h3 style={{ marginBottom: 12 }}>{stage}</h3>
          <div className="progress-bar" style={{ maxWidth: 400, margin: '0 auto' }}>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Results */}
      {!processing && results.length > 0 && (
        <div className="animate-in" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            <h2>{results.length} Match{results.length !== 1 ? 'es' : ''} Found</h2>
            <button className="btn btn-primary btn-sm" onClick={downloadAll}>⬇ Export All (ZIP)</button>
          </div>

          {(['STRONG', 'POSSIBLE', 'WEAK'] as BandKey[]).map(band => {
            const group = byBand(band);
            if (!group.length) return null;
            const { label, color } = CONFIDENCE_BANDS[band];
            return (
              <div key={band} style={{ marginBottom: 36 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                  <h3 style={{ fontSize: '1rem', color, margin: 0 }}>{label}</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{group.length} photo{group.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 16 }}>
                  {group.map((r, i) => (
                    <div key={i} className="photo-item animate-in" style={{ animationDelay: `${i * 0.04}s`, cursor: 'pointer' }}
                      title={`${r.name} · ${Math.round(r.similarity * 100)}% match · ${r.faceCount} face${r.faceCount !== 1 ? 's' : ''} detected`}>
                      <img src={r.highlightedUrl || r.originalUrl} loading="lazy" alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 10px', background: 'linear-gradient(to top,rgba(0,0,0,0.85),transparent)', fontSize: 10 }}>
                        <div style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                        {r.faceCount > 1 && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{r.faceCount} faces</div>}
                      </div>
                      <div style={{ position: 'absolute', top: 8, right: 8, background: color, color: '#000', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                        {Math.round(r.similarity * 100)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!processing && results.length === 0 && pct === 100 && (
        <div className="glass-card animate-in" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
          <h3>No matches found</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 13 }}>Try switching to Loose mode or use a clearer reference photo.</p>
        </div>
      )}

      {/* Drive credentials modal */}
      {showDriveDlg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="glass-card animate-in" style={{ maxWidth: 480, width: '100%', padding: 36, border: '1px solid var(--emerald-glow)' }}>
            <h2 style={{ color: 'var(--emerald)', marginBottom: 8 }}>Google Drive Setup</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>Paste your Google Cloud credentials to enable Drive folder access.</p>
            {[{ label: 'Client ID', val: manualCid, set: setManualCid, ph: '123456-abc.apps.googleusercontent.com' },
              { label: 'API Key',   val: manualKey, set: setManualKey, ph: 'AIzaSy…' }].map(({ label, val, set, ph }) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{label}</label>
                <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
                  style={{ width: '100%', padding: '10px 12px', background: '#000', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setShowDriveDlg(false); handleDrive(); }}>Save & Connect</button>
              <button className="btn btn-secondary" onClick={() => setShowDriveDlg(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
