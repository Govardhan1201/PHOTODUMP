'use client';

import { useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { loadGoogleScripts, authorizeGoogleDrive, createFolderPicker, getFilesInFolder, downloadDriveFile } from '@/lib/google';

const BATCH_SIZE = 3; 
const MODES = {
  STRICT:   { threshold: 0.35, size: 1000, label: 'Strict',   desc: 'True Accuracy' },
  MODERATE: { threshold: 0.5,  size: 800,  label: 'Moderate', desc: 'Balanced Scan' },
  LOOSE:    { threshold: 0.65, size: 600,  label: 'Loose',    desc: 'High Speed' }
};

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';

export default function StatelessProcessorPage() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [mode, setMode] = useState<'FIND' | 'GROUP' | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [targetPreview, setTargetPreview] = useState<string | null>(null);
  const [sourceItems, setSourceItems] = useState<InputImage[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  
  const [matchedBlobs, setMatchedBlobs] = useState<{blob: Blob, url: string, distance: number, name: string}[]>([]);
  const [clusters, setClusters] = useState<{id: string, files: {blob: Blob, url: string, name: string}[]}[]>([]);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [processMode, setProcessMode] = useState<keyof typeof MODES>('MODERATE');

  useEffect(() => {
    async function init() {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        setModelsLoaded(true);
      } catch (err: any) {
        setErrorStatus(`Failed to load AI models: ${err.message || 'Unknown error'}`);
      }
      if (GOOGLE_CLIENT_ID) loadGoogleScripts(GOOGLE_CLIENT_ID).catch(() => {});
    }
    init();
  }, []);

  const handleTargetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setTargetFile(file);
      setTargetPreview(URL.createObjectURL(file));
      setMatchedBlobs([]);
    }
  };

  const handleLocalSources = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      setSourceItems(files.map(f => ({ type: 'local', file: f, name: f.name })));
      setMatchedBlobs([]);
      setClusters([]);
    }
  };

  const handleDriveFolder = async () => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) return alert("Missing Google Credentials");
    try {
      let token = googleAccessToken;
      if (!token) {
        token = await authorizeGoogleDrive(GOOGLE_CLIENT_ID);
        setGoogleAccessToken(token);
      }
      const folder = await createFolderPicker(token, GOOGLE_API_KEY);
      if (folder) {
        setProgressMsg('Connecting to Drive...');
        setIsProcessing(true);
        const files = await getFilesInFolder(token, folder.id);
        setSourceItems(files.map(f => ({ type: 'drive', id: f.id, name: f.name })));
        setMatchedBlobs([]);
        setClusters([]);
        setIsProcessing(false);
      }
    } catch (err) {
      alert("Drive connection failed");
      setIsProcessing(false);
    }
  };

  const getDescriptorsForImageBlob = async (blob: Blob) => {
    return new Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>[]>(async (resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.src = url;
      img.onload = async () => {
        try {
          const maxDim = MODES[processMode].size;
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } }
          else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, w, h);
          const detections = await faceapi.detectAllFaces(canvas).withFaceLandmarks().withFaceDescriptors();
          URL.revokeObjectURL(url);
          resolve(detections);
        } catch (err) { URL.revokeObjectURL(url); reject(err); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image failed to load")); };
    });
  };

  const runFindMatch = async () => {
    if (!targetFile || sourceItems.length === 0) return;
    setIsProcessing(true); setMatchedBlobs([]); setProgressMsg('Preparing target...'); setProgressPct(5);
    try {
      const targetDetections = await getDescriptorsForImageBlob(targetFile);
      if (targetDetections.length === 0) { alert("No face detected in target!"); setIsProcessing(false); return; }
      const targetFace = targetDetections.reduce((prev, curr) => (prev.detection.box.area > curr.detection.box.area) ? prev : curr);
      const config = MODES[processMode];
      const matcher = new faceapi.FaceMatcher([new faceapi.LabeledFaceDescriptors('target', [targetFace.descriptor])], config.threshold);

      const matches: any[] = [];
      for (let i = 0; i < sourceItems.length; i += BATCH_SIZE) {
        const batch = sourceItems.slice(i, i + BATCH_SIZE);
        setProgressMsg(`Scanning ${i + 1} - ${Math.min(i + BATCH_SIZE, sourceItems.length)} of ${sourceItems.length}...`);
        setProgressPct(10 + Math.floor((i / sourceItems.length) * 90));
        await Promise.all(batch.map(async (item) => {
          try {
            const blob = item.type === 'drive' ? await downloadDriveFile(googleAccessToken!, item.id) : (item.file as Blob);
            const detections = await getDescriptorsForImageBlob(blob);
            let bestDist = 1.0; let found = false;
            for (const d of detections) {
              const m = matcher.findBestMatch(d.descriptor);
              if (m.label === 'target') { found = true; if (m.distance < bestDist) bestDist = m.distance; }
            }
            if (found) matches.push({ blob, url: URL.createObjectURL(blob), distance: bestDist, name: item.name });
          } catch (err) { console.error(err); }
        }));
        await new Promise(r => setTimeout(r, 0));
      }
      setMatchedBlobs(matches.sort((a,b) => a.distance - b.distance));
      setProgressMsg('Scan complete!'); setProgressPct(100);
    } catch (err) { setProgressMsg('Processing halted due to error'); }
    finally { setIsProcessing(false); }
  };

  const runClustering = async () => {
    if (sourceItems.length === 0) return;
    setIsProcessing(true); setClusters([]); setProgressMsg('Initializing Engine...'); setProgressPct(5);
    try {
      const activeClusters: any[] = [];
      const config = MODES[processMode];
      for (let i = 0; i < sourceItems.length; i += BATCH_SIZE) {
        const batch = sourceItems.slice(i, i + BATCH_SIZE);
        setProgressMsg(`Analyzing ${i + 1} - ${Math.min(i + BATCH_SIZE, sourceItems.length)} of ${sourceItems.length}...`);
        setProgressPct(5 + Math.floor((i / sourceItems.length) * 90));
        await Promise.all(batch.map(async (item) => {
          try {
            const blob = item.type === 'drive' ? await downloadDriveFile(googleAccessToken!, item.id) : (item.file as Blob);
            const detections = await getDescriptorsForImageBlob(blob);
            const url = URL.createObjectURL(blob);
            for (const d of detections) {
              let matched = null; let bDist = config.threshold;
              for (const cl of activeClusters) {
                const dist = faceapi.euclideanDistance(d.descriptor, cl.descriptor);
                if (dist < bDist) { bDist = dist; matched = cl; }
              }
              if (matched) {
                if (!matched.files.find((f:any) => f.name === item.name)) matched.files.push({ blob, url, name: item.name });
              } else {
                activeClusters.push({ id: `Person ${activeClusters.length + 1}`, descriptor: d.descriptor, files: [{ blob, url, name: item.name }] });
              }
            }
          } catch (err) { console.error(err); }
        }));
        await new Promise(r => setTimeout(r, 0));
      }
      setClusters(activeClusters.filter(c => c.files.length >= 2));
      setProgressMsg(`Optimized groups ready!`); setProgressPct(100);
    } catch (err) { setProgressMsg('Error during grouping'); }
    finally { setIsProcessing(false); }
  };

  // ─── RENDERING ───
  if (!modelsLoaded) {
    return (
      <div style={{ height: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        {errorStatus ? (
          <div className="glass-card" style={{ border: '1px solid var(--danger)', color: 'var(--danger)' }}>
             <h3>System Error</h3><p>{errorStatus}</p>
             <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>Re-Initialize</button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 20px' }} />
            <h2 className="animate-in">Calibrating AI Neural Networks...</h2>
            <p className="animate-in" style={{ opacity: 0.6 }}>Stateless obsidian processing active.</p>
          </div>
        )}
      </div>
    );
  }

  if (!mode) {
    return (
      <div className="animate-in" style={{ padding: '60px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div className="badge animate-in" style={{ background: 'var(--obsidian-800)', border: '1px solid var(--emerald-glow)', color: 'var(--emerald)', marginBottom: 20 }}>
            STATELIEST AI • 100% PRIVATE
          </div>
          <h1 className="hero-title animate-in stagger-1">Vision Obsidian</h1>
          <p className="hero-subtitle animate-in stagger-2">
            Professional face identification and grouping. No cloud storage. No traces.
            High-performance local inference for obsidian-level privacy.
          </p>
        </div>

        <div className="mode-option-grid">
          <div className="mode-option-card animate-in stagger-1" onClick={() => setMode('FIND')}>
            <span style={{ fontSize: '32px' }}>🎯</span>
            <h2 style={{ fontSize: '1.4rem', margin: '16px 0 8px' }}>Target Identification</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Provide one reference face and find every match across your entire asset library.</p>
          </div>
          <div className="mode-option-card animate-in stagger-2" onClick={() => setMode('GROUP')}>
            <span style={{ fontSize: '32px' }}>🪐</span>
            <h2 style={{ fontSize: '1.4rem', margin: '16px 0 8px' }}>Neural Grouping</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Cluster every distinct identity into automated dossiers using deep vector analysis.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ padding: '20px 0' }}>
      <button className="btn btn-secondary btn-sm" onClick={() => { setMode(null); setMatchedBlobs([]); setClusters([]); setSourceItems([]); setTargetFile(null); }} style={{ marginBottom: 32 }}>
        ← Terminal Home
      </button>

      {/* STEP 1: TARGET */}
      {mode === 'FIND' && (
        <div className="glass-card animate-in" style={{ marginBottom: 24 }}>
          <h4 style={{ color: 'var(--emerald)', marginBottom: 16 }}>01. Reference Identity</h4>
          <input type="file" accept="image/*" onChange={handleTargetUpload} disabled={isProcessing} style={{ background: 'var(--obsidian-900)', padding: 12, borderRadius: 8, width: '100%', border: '1px solid var(--border)' }} />
          {targetPreview && (
            <div style={{ marginTop: 16, width: 100, height: 100, borderRadius: 12, overflow: 'hidden', border: '2px solid var(--emerald-glow)' }}>
              <img src={targetPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
           )}
        </div>
      )}

      {/* STEP 2: SOURCES */}
      {((mode === 'FIND' && targetFile) || mode === 'GROUP') && (
        <div className="glass-card animate-in" style={{ marginBottom: 24 }}>
          <h4 style={{ color: 'var(--emerald)', marginBottom: 16 }}>02. Input Assets</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
             <div className="mode-option-card" style={{ padding: 20 }}>
                <label style={{ fontSize: '12px', fontWeight: 700, opacity: 0.5, textTransform: 'uppercase' }}>Local / Phone</label>
                <input type="file" multiple accept="image/*" onChange={handleLocalSources} disabled={isProcessing} style={{ marginTop: 8, width: '100%' }} />
             </div>
             <div className="mode-option-card" style={{ padding: 20 }} onClick={handleDriveFolder}>
                <label style={{ fontSize: '12px', fontWeight: 700, opacity: 0.5, textTransform: 'uppercase' }}>Cloud Storage</label>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--emerald)' }}>
                  📡 <span style={{ fontWeight: 700 }}>Connect Drive</span>
                </div>
             </div>
          </div>
          {sourceItems.length > 0 && <div className="animate-in" style={{ marginTop: 16, padding: '8px 16px', background: 'var(--emerald-glow)', borderRadius: 8, color: 'var(--emerald)', fontSize: '13px', fontWeight: 700 }}>
            ● {sourceItems.length} Assets Buffered
          </div>}
        </div>
      )}

      {/* STEP 3: CONTROL & RUN */}
      {sourceItems.length > 0 && !isProcessing && progressPct === 0 && (
         <div className="animate-in" style={{ textAlign: 'center', marginTop: 40 }}>
            <div className="glass-card" style={{ maxWidth: 500, margin: '0 auto 40px', padding: 24 }}>
              <label style={{ fontSize: '13px', fontWeight: 700, marginBottom: 16, display: 'block' }}>Neural Performance Mode</label>
              <div className="segmented-control">
                {(Object.keys(MODES) as Array<keyof typeof MODES>).map(m => (
                  <button key={m} className={`segment-btn ${processMode === m ? 'active' : ''}`} onClick={() => setProcessMode(m)}>
                    {MODES[m].label}
                    <small>{MODES[m].desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary btn-lg" onClick={mode === 'FIND' ? runFindMatch : runClustering} style={{ minWidth: 280 }}>
              Initiate Neural Scan
            </button>
         </div>
      )}

      {/* PROGRESS FLOW */}
      {isProcessing && (
        <div className="glass-card animate-in" style={{ textAlign: 'center', padding: 48, margin: '40px auto', maxWidth: 600 }}>
          <div className="spinner" style={{ margin: '0 auto 24px' }} />
          <h3 style={{ marginBottom: 8 }}>{progressMsg}</h3>
          <div className="progress-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* RESULTS SECT: FIND */}
      {!isProcessing && matchedBlobs.length > 0 && mode === 'FIND' && (
        <div className="animate-in" style={{ marginTop: 48 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <h2 style={{ fontSize: '1.8rem' }}>Found {matchedBlobs.length} Neural Matches</h2>
              <button className="btn btn-primary btn-sm" onClick={() => {
                 const zip = new JSZip();
                 matchedBlobs.forEach(m => zip.file(m.name, m.blob));
                 zip.generateAsync({ type: 'blob' }).then(b => saveAs(b, 'Obsidian-Matches.zip'));
              }}>Export Batch (ZIP)</button>
           </div>
           
           <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20 }}>
             {matchedBlobs.map((m, i) => (
                <div key={i} className="photo-item animate-in" style={{ animationDelay: `${i * 0.05}s` }}>
                  <img src={m.url} loading="lazy" />
                  <div style={{ position: 'absolute', bottom: 0, width: '100%', padding: '10px', background: 'linear-gradient(to top, black, transparent)', fontSize: '10px', opacity: 0.7 }}>
                    {m.name}
                  </div>
                </div>
             ))}
           </div>
        </div>
      )}

      {/* RESULTS SECT: GROUP */}
      {!isProcessing && clusters.length > 0 && mode === 'GROUP' && (
        <div className="animate-in" style={{ marginTop: 48 }}>
           <h2 style={{ marginBottom: 32 }}>Neural Clusters Identified</h2>
           <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
             {clusters.map((cl, i) => (
                <div key={i} className="glass-card animate-in" style={{ animationDelay: `${i * 0.15}s` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3>{cl.id} <span style={{ opacity: 0.4, fontWeight: 'normal', fontSize: '14px' }}>— {cl.files.length} instances</span></h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                        const zip = new JSZip();
                        cl.files.forEach((f:any) => zip.file(f.name, f.blob));
                        zip.generateAsync({ type: 'blob' }).then(b => saveAs(b, `${cl.id}.zip`));
                    }}>Export Dossier</button>
                  </div>
                  <div style={{ display: 'flex', overflowX: 'auto', gap: 12, paddingBottom: 10 }}>
                    {cl.files.map((f:any, j:number) => (
                      <div key={j} style={{ width: 120, height: 120, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)' }}>
                         <img src={f.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      </div>
                    ))}
                  </div>
                </div>
             ))}
           </div>
        </div>
      )}
    </div>
  );
}

type InputImage = 
  | { type: 'local', file: File, name: string }
  | { type: 'drive', id: string, name: string };
