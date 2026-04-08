'use client';

import { useEffect, useState, useRef } from 'react';
import * as faceapi from 'face-api.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Configuration constants
const MATCH_THRESHOLD = 0.55; 

export default function StatelessProcessorPage() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [mode, setMode] = useState<'FIND' | 'GROUP' | null>(null);
  
  // File states
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [targetPreview, setTargetPreview] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  
  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  
  // Result states
  const [matchedFiles, setMatchedFiles] = useState<{file: File, url: string, distance: number}[]>([]);
  const [clusters, setClusters] = useState<{id: string, files: {file: File, url: string}[]}[]>([]);

  // Load models on mount
  useEffect(() => {
    async function loadModels() {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.error("Failed to load models", err);
        setProgressMsg('Error loading AI models. Please refresh.');
      }
    }
    loadModels();
  }, []);

  const handleTargetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setTargetFile(file);
      setTargetPreview(URL.createObjectURL(file));
      // Reset existing runs
      setMatchedFiles([]);
    }
  };

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      setSourceFiles(files);
      setMatchedFiles([]);
      setClusters([]);
    }
  };

  // ─── HELPER: Process single image to get descriptors ───
  const getDescriptorsForFile = async (file: File) => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    await new Promise((res) => (img.onload = res));
    const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
    URL.revokeObjectURL(img.src);
    return detections;
  };

  // ─── RUNNING THE FIND MATCH ALGORITHM ───
  const runFindMatch = async () => {
    if (!targetFile || sourceFiles.length === 0) return;
    setIsProcessing(true);
    setMatchedFiles([]);
    setProgressMsg('Extracting target face...');
    setProgressPct(5);

    try {
      // 1. Get Target Descriptor
      const targetDetections = await getDescriptorsForFile(targetFile);
      if (targetDetections.length === 0) {
        alert("No face detected in target image!");
        setIsProcessing(false);
        return;
      }
      // Use the largest face in the target image if multiple
      const targetFace = targetDetections.reduce((prev, current) => 
        (prev.detection.box.area > current.detection.box.area) ? prev : current
      );
      const faceMatcher = new faceapi.FaceMatcher([new faceapi.LabeledFaceDescriptors('target', [targetFace.descriptor])], MATCH_THRESHOLD);

      // 2. Scan all folder files
      const matches: {file: File, url: string, distance: number}[] = [];
      for (let i = 0; i < sourceFiles.length; i++) {
        const file = sourceFiles[i];
        setProgressMsg(`Scanning photo ${i + 1} of ${sourceFiles.length}...`);
        setProgressPct(10 + Math.floor((i / sourceFiles.length) * 90));
        
        // Minor timeout to allow React UI to paint
        await new Promise(r => setTimeout(r, 10));

        const detections = await getDescriptorsForFile(file);
        
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
          matches.push({ file, url: URL.createObjectURL(file), distance: bestDistance });
        }
      }

      setMatchedFiles(matches.sort((a,b) => a.distance - b.distance));
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
    if (sourceFiles.length === 0) return;
    setIsProcessing(true);
    setClusters([]);
    setProgressMsg('Initializing clustering engine...');
    setProgressPct(5);

    try {
      const activeClusters: { id: string, descriptor: Float32Array, files: {file: File, url: string}[] }[] = [];

      for (let i = 0; i < sourceFiles.length; i++) {
        const file = sourceFiles[i];
        setProgressMsg(`Analyzing faces in photo ${i + 1} of ${sourceFiles.length}...`);
        setProgressPct(5 + Math.floor((i / sourceFiles.length) * 90));
        
        await new Promise(r => setTimeout(r, 10)); // Yield to UI
        const url = URL.createObjectURL(file);
        const detections = await getDescriptorsForFile(file);

        for (const d of detections) {
          let matchedCluster = null;
          let bestDist = MATCH_THRESHOLD;

          // Compare against all existing clusters
          for (const cluster of activeClusters) {
            const dist = faceapi.euclideanDistance(d.descriptor, cluster.descriptor);
            if (dist < bestDist) {
              bestDist = dist;
              matchedCluster = cluster;
            }
          }

          if (matchedCluster) {
            // Add to existing, avoid adding same file twice to same cluster
            if (!matchedCluster.files.find(f => f.file.name === file.name)) {
               matchedCluster.files.push({ file, url });
            }
          } else {
            // Spawn new cluster
            activeClusters.push({
              id: `Person ${activeClusters.length + 1}`,
              descriptor: d.descriptor,
              files: [{ file, url }]
            });
          }
        }
      }

      // Filter out heavily noise clusters (e.g. < 2 photos) if desired, but we show all > 1
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
    if (matchedFiles.length === 0) return;
    setProgressMsg('Zipping files...');
    setIsProcessing(true);
    const zip = new JSZip();
    matchedFiles.forEach(m => {
      zip.file(m.file.name, m.file);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'PhotoMind-Matches.zip');
    setIsProcessing(false);
    setProgressMsg('Download complete!');
  };

  const downloadCluster = async (cluster: any) => {
    setProgressMsg('Zipping cluster...');
    setIsProcessing(true);
    const zip = new JSZip();
    cluster.files.forEach((m: any) => {
      zip.file(m.file.name, m.file);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `PhotoMind-${cluster.id}.zip`);
    setIsProcessing(false);
    setProgressMsg('');
  };


  if (!modelsLoaded) {
    return (
      <div style={{ height: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span className="spinner spinner-lg" />
        <h2>Loading AI Vision Models...</h2>
        <p style={{ color: 'var(--text-muted)' }}>Running locally ensures 100% privacy.</p>
      </div>
    );
  }

  // Initial Menu Selection
  if (!mode) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <h1 style={{ marginBottom: 16, fontSize: '2.5rem' }}>Organize with Total Privacy</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 40, maxWidth: 600, margin: '0 auto 40px' }}>
          PhotoMind runs completely in your browser. Uncover identical faces across giant folders of photos automatically. Your pictures are never uploaded to a server.
        </p>

        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          <div className="card" style={{ maxWidth: 400, flex: 1, cursor: 'pointer', border: '2px solid transparent' }} onClick={() => setMode('FIND')}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: 12 }}>🔍 Find a Specific Person</h2>
            <p style={{ color: 'var(--text-muted)' }}>Provide one photo of a person, then select a folder. We'll extract only the photos they appear in.</p>
          </div>
          <div className="card" style={{ maxWidth: 400, flex: 1, cursor: 'pointer', border: '2px solid transparent' }} onClick={() => setMode('GROUP')}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: 12 }}>👥 Group All People</h2>
            <p style={{ color: 'var(--text-muted)' }}>Select a massive folder. The AI will look at every single face and automatically group identical people into collections.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px 0' }}>
      <button className="btn btn-secondary btn-sm" onClick={() => { setMode(null); setMatchedFiles([]); setClusters([]); setSourceFiles([]); setTargetFile(null); }} style={{ marginBottom: 24 }}>
        ← Back to Modes
      </button>

      {/* FIND MODE UI */}
      {mode === 'FIND' && (
        <div className="card" style={{ marginBottom: 32 }}>
          <h2>1. Upload Target Person</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Select a clear, front-facing picture of the person you want to find.</p>
          <input type="file" accept="image/*" onChange={handleTargetUpload} disabled={isProcessing} />
          {targetPreview && (
            <div style={{ marginTop: 16, borderRadius: 8, overflow: 'hidden', width: 120, height: 120 }}>
              <img src={targetPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Target Face" />
            </div>
           )}
        </div>
      )}

      {/* FOLDER SELECTION UI */}
      {((mode === 'FIND' && targetFile) || mode === 'GROUP') && (
        <div className="card" style={{ marginBottom: 32 }}>
          <h2>{mode === 'FIND' ? '2. Select Search Folder' : '1. Select Photo Folder'}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Pick the local folder containing all the images you want to be processed.</p>
          {/* @ts-ignore : webkitdirectory is non-standard but heavily supported */}
          <input type="file" webkitdirectory="" directory="" multiple onChange={handleFolderUpload} disabled={isProcessing} />
          {sourceFiles.length > 0 && <p style={{ marginTop: 12, fontWeight: 600 }}>✅ {sourceFiles.length} photos ready for scan.</p>}
        </div>
      )}

      {/* ACTION BLOCK */}
      {sourceFiles.length > 0 && !isProcessing && progressPct === 0 && (
         <div style={{ textAlign: 'center', margin: '40px 0' }}>
            <button className="btn btn-primary btn-lg" onClick={mode === 'FIND' ? runFindMatch : runClustering}>
              ▶ Start AI Scan
            </button>
         </div>
      )}

      {/* PROGRESS UI */}
      {isProcessing && (
        <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 32 }}>
          <span className="spinner spinner-lg" style={{ marginBottom: 16 }} />
          <h3>{progressMsg}</h3>
          <div style={{ background: 'var(--border)', height: 8, borderRadius: 4, width: '100%', maxWidth: 400, margin: '20px auto 0', overflow: 'hidden' }}>
             <div style={{ height: '100%', background: 'var(--btn-primary)', width: `${progressPct}%`, transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {/* COMPLETED PROGRESS / ZIP DOWNLOAD (FIND MODE) */}
      {!isProcessing && matchedFiles.length > 0 && mode === 'FIND' && (
        <div style={{ marginTop: 32 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
              <h2>🎉 Found {matchedFiles.length} Matches!</h2>
              <button className="btn btn-primary" onClick={downloadMatches}>
                ⬇️ Download ZIP
              </button>
           </div>
           
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
             {matchedFiles.map((m, i) => (
                <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-card)', position: 'relative' }}>
                  <img src={m.url} style={{ width: '100%', height: 200, objectFit: 'cover' }} alt="Match" loading="lazy" />
                  <div style={{ padding: 8, fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>
                    {m.file.name.slice(0, 20)}
                  </div>
                </div>
             ))}
           </div>
        </div>
      )}

      {/* COMPLETED CLUSTERS (GROUP MODE) */}
      {!isProcessing && clusters.length > 0 && mode === 'GROUP' && (
        <div style={{ marginTop: 32 }}>
           <h2 style={{ marginBottom: 24 }}>🎉 Automatic Face Clusters</h2>
           
           <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
             {clusters.map((cluster, i) => (
                <div key={i} className="card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>{cluster.id} <span style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 'normal' }}>({cluster.files.length} photos)</span></h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadCluster(cluster)}>
                      ⬇️ Save Group ZIP
                    </button>
                  </div>

                  <div style={{ display: 'flex', overflowX: 'auto', gap: 12, paddingBottom: 8 }}>
                    {cluster.files.map((fileInfo, j) => (
                      <div key={j} style={{ width: 140, height: 140, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#e5e7eb' }}>
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
