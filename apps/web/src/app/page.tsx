'use client';

import { useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { loadGoogleScripts, authorizeGoogleDrive, createFolderPicker, getFilesInFolder, downloadDriveFile } from '@/lib/google';

const MATCH_THRESHOLD = 0.55; 

type InputImage = 
  | { type: 'local', file: File, name: string }
  | { type: 'drive', id: string, name: string };

// Users MUST put their credentials in their .env
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';

export default function StatelessProcessorPage() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [mode, setMode] = useState<'FIND' | 'GROUP' | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  
  // File states
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [targetPreview, setTargetPreview] = useState<string | null>(null);
  const [sourceItems, setSourceItems] = useState<InputImage[]>([]);
  
  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  
  // Result states
  const [matchedBlobs, setMatchedBlobs] = useState<{blob: Blob, url: string, distance: number, name: string}[]>([]);
  const [clusters, setClusters] = useState<{id: string, files: {blob: Blob, url: string, name: string}[]}[]>([]);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  // Load models on mount
  useEffect(() => {
    async function init() {
      try {
        console.log("Loading AI Models...");
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        console.log("AI Models Loaded Successfully");
        setModelsLoaded(true);
      } catch (err: any) {
        console.error("Models failed to load", err);
        setErrorStatus(`Failed to load AI models: ${err.message || 'Unknown error'}. Check if /models files exist.`);
      }

      if (GOOGLE_CLIENT_ID) {
        try {
           await loadGoogleScripts(GOOGLE_CLIENT_ID);
        } catch (err) {
           console.error("Google Scripts failed to load");
        }
      }
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
    if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
      alert("Missing Google Credentials in .env (.local)");
      return;
    }
    
    try {
      let token = googleAccessToken;
      if (!token) {
        token = await authorizeGoogleDrive(GOOGLE_CLIENT_ID);
        setGoogleAccessToken(token);
      }
      
      const folder = await createFolderPicker(token, GOOGLE_API_KEY);
      if (folder) {
        setProgressMsg('Fetching Drive file list...');
        setIsProcessing(true);
        const files = await getFilesInFolder(token, folder.id);
        setSourceItems(files.map(f => ({ type: 'drive', id: f.id, name: f.name })));
        setMatchedBlobs([]);
        setClusters([]);
        setIsProcessing(false);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to Google Drive");
      setIsProcessing(false);
    }
  };

  // ─── SAFE IMAGE LOADER ───
  const getDescriptorsForImageBlob = async (blob: Blob) => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    await new Promise((res) => (img.onload = res));
    const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
    URL.revokeObjectURL(img.src);
    return detections;
  };

  // ─── RUNNING THE FIND MATCH ALGORITHM ───
  const runFindMatch = async () => {
    if (!targetFile || sourceItems.length === 0) return;
    setIsProcessing(true);
    setMatchedBlobs([]);
    setProgressMsg('Extracting target face...');
    setProgressPct(5);

    try {
      const targetDetections = await getDescriptorsForImageBlob(targetFile);
      if (targetDetections.length === 0) {
         alert("No face detected in target image!");
         setIsProcessing(false);
         return;
      }
      const targetFace = targetDetections.reduce((prev, current) => 
        (prev.detection.box.area > current.detection.box.area) ? prev : current
      );
      const faceMatcher = new faceapi.FaceMatcher([new faceapi.LabeledFaceDescriptors('target', [targetFace.descriptor])], MATCH_THRESHOLD);

      const matches: {blob: Blob, url: string, distance: number, name: string}[] = [];

      for (let i = 0; i < sourceItems.length; i++) {
        const item = sourceItems[i];
        setProgressMsg(`Scanning photo ${i + 1} of ${sourceItems.length}...`);
        setProgressPct(10 + Math.floor((i / sourceItems.length) * 90));
        
        let blob: Blob;
        if (item.type === 'drive') {
          // Download dynamically to save RAM!
           blob = await downloadDriveFile(googleAccessToken!, item.id);
        } else {
           blob = item.file as Blob;
        }

        const detections = await getDescriptorsForImageBlob(blob);
        let bestDistance = 1.0;
        let found = false;

        for (const d of detections) {
          const match = faceMatcher.findBestMatch(d.descriptor);
          if (match.label === 'target') {
            found = true;
            if (match.distance < bestDistance) bestDistance = match.distance;
          }
        }

        if (found) {
          matches.push({ blob, url: URL.createObjectURL(blob), distance: bestDistance, name: item.name });
        }
      }

      setMatchedBlobs(matches.sort((a,b) => a.distance - b.distance));
      setProgressMsg('Processing complete!');
      setProgressPct(100);
    } catch (err) {
      console.error(err);
      setProgressMsg('An error occurred during processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── RUNNING THE CLUSTER ALGORITHM ───
  const runClustering = async () => {
    if (sourceItems.length === 0) return;
    setIsProcessing(true);
    setClusters([]);
    setProgressMsg('Initializing clustering engine...');
    setProgressPct(5);

    try {
      const activeClusters: { id: string, descriptor: Float32Array, files: {blob: Blob, url: string, name: string}[] }[] = [];

      for (let i = 0; i < sourceItems.length; i++) {
        const item = sourceItems[i];
        setProgressMsg(`Analyzing faces in photo ${i + 1} of ${sourceItems.length}...`);
        setProgressPct(5 + Math.floor((i / sourceItems.length) * 90));

        let blob: Blob;
        if (item.type === 'drive') {
           blob = await downloadDriveFile(googleAccessToken!, item.id);
        } else {
           blob = item.file as Blob;
        }
        
        const url = URL.createObjectURL(blob);
        const detections = await getDescriptorsForImageBlob(blob);

        for (const d of detections) {
          let matchedCluster = null;
          let bestDist = MATCH_THRESHOLD;

          for (const cluster of activeClusters) {
            const dist = faceapi.euclideanDistance(d.descriptor, cluster.descriptor);
            if (dist < bestDist) {
              bestDist = dist;
              matchedCluster = cluster;
            }
          }

          if (matchedCluster) {
            if (!matchedCluster.files.find(f => f.name === item.name)) {
               matchedCluster.files.push({ blob, url, name: item.name });
            }
          } else {
            activeClusters.push({
              id: `Person ${activeClusters.length + 1}`,
              descriptor: d.descriptor,
              files: [{ blob, url, name: item.name }]
            });
          }
        }
      }

      const validClusters = activeClusters.filter(c => c.files.length >= 2).map(c => ({
        id: c.id, files: c.files
      }));

      setClusters(validClusters);
      setProgressMsg(`Found ${validClusters.length} distinct people!`);
      setProgressPct(100);
    } catch (err) {
      console.error(err);
      setProgressMsg('An error occurred during clustering.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── ZIP EXPORT ───
  const downloadMatches = async () => {
    if (matchedBlobs.length === 0) return;
    setIsProcessing(true);
    setProgressMsg('Zipping files...');
    const zip = new JSZip();
    matchedBlobs.forEach(m => zip.file(m.name, m.blob));
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'PhotoMind-Matches.zip');
    setIsProcessing(false);
  };

  const downloadCluster = async (cluster: any) => {
    setIsProcessing(true);
    setProgressMsg('Zipping cluster...');
    const zip = new JSZip();
    cluster.files.forEach((m: any) => zip.file(m.name, m.blob));
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `PhotoMind-${cluster.id}.zip`);
    setIsProcessing(false);
  };

  if (!modelsLoaded) {
    return (
      <div style={{ height: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 }}>
        {errorStatus ? (
          <div className="card" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', textAlign: 'center' }}>
             <h3>❌ Error</h3>
             <p>{errorStatus}</p>
             <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : (
          <>
            <span className="spinner spinner-lg" />
            <h2 style={{ textAlign: 'center' }}>Loading AI Vision Models...</h2>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Running locally directly inside your browser ensures 100% privacy.</p>
          </>
        )}
      </div>
    );
  }

  if (!mode) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <h1 style={{ marginBottom: 16, fontSize: '2.5rem', padding: '0 20px' }}>Organize with Total Privacy</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 40, maxWidth: 600, margin: '0 auto 40px', padding: '0 20px' }}>
          PhotoMind runs completely in your browser. Uncover identical faces across giant folders of photos automatically. Your pictures are never uploaded to a server.
        </p>

        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', padding: '0 20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: 400, flex: '1 1 300px', cursor: 'pointer', border: '2px solid transparent' }} onClick={() => setMode('FIND')}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: 12 }}>🔍 Find a Specific Person</h2>
            <p style={{ color: 'var(--text-muted)' }}>Provide one photo of a person, then select a folder. We'll extract only the photos they appear in.</p>
          </div>
          <div className="card" style={{ width: '100%', maxWidth: 400, flex: '1 1 300px', cursor: 'pointer', border: '2px solid transparent' }} onClick={() => setMode('GROUP')}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: 12 }}>👥 Group All People</h2>
            <p style={{ color: 'var(--text-muted)' }}>Select a massive folder. The AI will look at every single face and automatically group identical people into collections.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <button className="btn btn-secondary btn-sm" onClick={() => { setMode(null); setMatchedBlobs([]); setClusters([]); setSourceItems([]); setTargetFile(null); }} style={{ marginBottom: 24 }}>
        ← Back to Modes
      </button>

      {mode === 'FIND' && (
        <div className="card" style={{ marginBottom: 32 }}>
          <h2>1. Upload Target Person</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Select a clear, front-facing picture of the person you want to find.</p>
          <input type="file" accept="image/*" onChange={handleTargetUpload} disabled={isProcessing} className="file-input" />
          {targetPreview && (
            <div style={{ marginTop: 16, borderRadius: 8, overflow: 'hidden', width: 120, height: 120 }}>
              <img src={targetPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Target Face" />
            </div>
           )}
        </div>
      )}

      {((mode === 'FIND' && targetFile) || mode === 'GROUP') && (
        <div className="card" style={{ marginBottom: 32 }}>
          <h2>{mode === 'FIND' ? '2. Select Search Source' : '1. Select Source Files'}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Pick the photos you want to be processed. Works on Desktop & Mobile.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
             {/* Mobile / Multi-Select (Universally Supported) */}
             <div style={{ padding: 16, border: '1px dashed var(--border)', borderRadius: 8 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Local Photos (Mobile & PC)</label>
                <input type="file" multiple accept="image/*" onChange={handleLocalSources} disabled={isProcessing} />
             </div>

             {/* Desktop Folder Pick (Webkit) */}
             <div style={{ padding: 16, border: '1px dashed var(--border)', borderRadius: 8 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Local Folder (PC Only)</label>
                {/* @ts-ignore : webkitdirectory */}
                <input type="file" webkitdirectory="" directory="" multiple onChange={handleLocalSources} disabled={isProcessing} />
             </div>

             {/* Google Drive Connect */}
             <div style={{ padding: 16, border: '1px dashed var(--border)', borderRadius: 8 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Cloud Storage</label>
                <button className="btn btn-secondary" onClick={handleDriveFolder} disabled={isProcessing}>
                  📁 Connect Google Drive
                </button>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Requires configuring .env with GOOGLE_CLIENT_ID and GOOGLE_API_KEY
                </p>
             </div>
          </div>

          {sourceItems.length > 0 && <p style={{ marginTop: 24, fontWeight: 700, color: 'var(--brand-primary)' }}>✅ {sourceItems.length} photos ready for scan.</p>}
        </div>
      )}

      {sourceItems.length > 0 && !isProcessing && progressPct === 0 && (
         <div style={{ textAlign: 'center', margin: '40px 0' }}>
            <button className="btn btn-primary btn-lg" onClick={mode === 'FIND' ? runFindMatch : runClustering} style={{ width: '100%', maxWidth: 400 }}>
              ▶ Start AI Scan
            </button>
         </div>
      )}

      {isProcessing && (
        <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 32 }}>
          <span className="spinner spinner-lg" style={{ marginBottom: 16 }} />
          <h3>{progressMsg}</h3>
          <div style={{ background: 'var(--border)', height: 8, borderRadius: 4, width: '100%', maxWidth: 400, margin: '20px auto 0', overflow: 'hidden' }}>
             <div style={{ height: '100%', background: 'var(--brand-primary)', width: `${progressPct}%`, transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {!isProcessing && matchedBlobs.length > 0 && mode === 'FIND' && (
        <div style={{ marginTop: 32 }}>
           <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <h2>🎉 Found {matchedBlobs.length} Matches!</h2>
              <button className="btn btn-primary" onClick={downloadMatches}>
                ⬇️ Download ZIP
              </button>
           </div>
           
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
             {matchedBlobs.map((m, i) => (
                <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-card)', position: 'relative' }}>
                  <img src={m.url} style={{ width: '100%', height: 150, objectFit: 'cover' }} alt="Match" loading="lazy" />
                  <div style={{ padding: 8, fontSize: 11, textAlign: 'center', color: 'var(--text-muted)' }}>
                    {m.name.slice(0, 20)}
                  </div>
                </div>
             ))}
           </div>
        </div>
      )}

      {!isProcessing && clusters.length > 0 && mode === 'GROUP' && (
        <div style={{ marginTop: 32 }}>
           <h2 style={{ marginBottom: 24 }}>🎉 Automatic Face Clusters</h2>
           
           <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
             {clusters.map((cluster, i) => (
                <div key={i} className="card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>{cluster.id} <span style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 'normal' }}>({cluster.files.length} photos)</span></h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadCluster(cluster)}>
                      ⬇️ Save Group ZIP
                    </button>
                  </div>

                  <div style={{ display: 'flex', overflowX: 'auto', gap: 12, paddingBottom: 8 }}>
                    {cluster.files.map((fileInfo, j) => (
                      <div key={j} style={{ width: 100, height: 100, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#e5e7eb' }}>
                         <img src={fileInfo.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Face" loading="lazy" />
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
