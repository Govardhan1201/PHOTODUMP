'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPhotos, getDriveAuthUrl, scanDriveFolder, listDriveFolders, DriveFolder } from '@/lib/api';
import { validateFolderUpload, validateFileSelection } from '@/lib/validation';
import { useJobStatus } from '@/hooks/useJobStatus';
import { useAuth } from '@/hooks/useAuth';

type Mode = 'none' | 'folder' | 'files' | 'drive-connect' | 'drive-folder';

export default function UploadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef  = useRef<HTMLInputElement>(null);

  const [mode, setMode]               = useState<Mode>('none');
  const [validFiles, setValidFiles]   = useState<File[]>([]);
  const [error, setError]             = useState('');
  const [uploading, setUploading]     = useState(false);
  const [sessionId, setSessionId]     = useState<string | null>(null);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolder | null>(null);

  const { progress } = useJobStatus(sessionId);

  function handleFolderChange(e: ChangeEvent<HTMLInputElement>) {
    setError('');
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const result = validateFolderUpload(files);
    if (!result.ok) { setError(result.error!); return; }
    setValidFiles(result.validFiles);
    setMode('folder');
  }

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    setError('');
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const result = validateFileSelection(files);
    if (!result.ok) { setError(result.error!); return; }
    setValidFiles(result.validFiles);
    setMode('files');
  }

  async function handleUpload() {
    if (!validFiles.length) return;
    setUploading(true); setError('');
    try {
      const sourceType = mode === 'folder' ? 'LOCAL_FOLDER' : 'LOCAL_FILES';
      const res = await uploadPhotos(validFiles, sourceType);
      setSessionId(res.sessionId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDriveConnect() {
    setDriveLoading(true); setError('');
    try {
      const { authUrl } = await getDriveAuthUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDriveLoading(false);
    }
  }

  async function handleLoadDriveFolders() {
    setDriveLoading(true); setError('');
    try {
      const { folders } = await listDriveFolders();
      setDriveFolders(folders);
      setMode('drive-folder');
    } catch (err: any) {
      setError(err.message.includes('not connected')
        ? 'Please connect your Google Drive first.'
        : err.message);
    } finally {
      setDriveLoading(false);
    }
  }

  async function handleDriveScan() {
    if (!selectedFolder) return;
    setUploading(true); setError('');
    try {
      const res = await scanDriveFolder(selectedFolder.id, selectedFolder.name);
      setSessionId(res.sessionId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const isProcessing = sessionId !== null;
  const isDone = progress?.status === 'COMPLETED' || progress?.status === 'FAILED';

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Photos</h1>
          <p className="page-subtitle">Choose how you'd like to import your photo collection.</p>
        </div>
      </div>

      {/* Hidden inputs */}
      <input
        ref={folderRef}
        type="file"
        style={{ display: 'none' }}
        // @ts-ignore
        webkitdirectory=""
        multiple
        accept=".jpg,.jpeg,.png,.heic,.heif"
        onChange={handleFolderChange}
      />
      <input
        ref={filesRef}
        type="file"
        style={{ display: 'none' }}
        multiple
        accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic"
        onChange={handleFilesChange}
      />

      {/* Error */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Processing view */}
      {isProcessing && progress ? (
        <div className="card" style={{ padding: '36px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: 16 }}>
            {progress.status === 'COMPLETED' ? '✅' : progress.status === 'FAILED' ? '❌' : '🧠'}
          </div>
          <h3 style={{ marginBottom: 8 }}>
            {progress.status === 'COMPLETED' ? 'Analysis Complete!'
              : progress.status === 'FAILED' ? 'Processing Failed'
              : 'Analyzing your photos…'}
          </h3>
          <p style={{ marginBottom: 24, fontSize: '14px' }}>
            {progress.processedPhotos} of {progress.totalPhotos} photos processed
            {progress.failedPhotos > 0 && ` · ${progress.failedPhotos} failed`}
          </p>
          <div className="progress-bar" style={{ maxWidth: 400, margin: '0 auto 24px' }}>
            <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 24 }}>
            {progress.percent.toFixed(0)}% complete
          </div>
          {isDone && (
            <button className="btn btn-primary" onClick={() => router.push('/gallery')}>
              View Your Gallery →
            </button>
          )}
        </div>
      ) : validFiles.length > 0 ? (
        /* Pre-upload confirmation */
        <div className="card" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ fontSize: '40px' }}>{mode === 'folder' ? '📁' : '🖼️'}</div>
            <div>
              <h3 style={{ marginBottom: 4 }}>
                {validFiles.length} photos ready to process
              </h3>
              <p style={{ fontSize: '14px' }}>
                {mode === 'folder' ? 'Folder import' : 'Manual selection'} · JPG, PNG, HEIC supported
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
              {uploading
                ? <><span className="spinner spinner-sm" />Uploading…</>
                : `🚀 Process ${validFiles.length} Photos`}
            </button>
            <button className="btn btn-secondary" onClick={() => { setValidFiles([]); setMode('none'); setError(''); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : mode === 'drive-folder' ? (
        /* Drive folder picker */
        <div className="card" style={{ padding: '28px' }}>
          <h3 style={{ marginBottom: 4 }}>Select a Google Drive Folder</h3>
          <p style={{ fontSize: '14px', marginBottom: 20 }}>
            Choose a folder to scan. All supported images inside will be processed.
          </p>
          {driveFolders.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px' }}>
              <p>No folders found in your Drive root.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', marginBottom: 20 }}>
              {driveFolders.map(f => (
                <div
                  key={f.id}
                  onClick={() => setSelectedFolder(f)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${selectedFolder?.id === f.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: selectedFolder?.id === f.id ? 'var(--accent-subtle)' : 'var(--bg-card)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.15s',
                  }}
                >
                  <span>📁</span>
                  <span style={{ fontWeight: 500 }}>{f.name}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={handleDriveScan}
              disabled={!selectedFolder || uploading}
            >
              {uploading ? <><span className="spinner spinner-sm" />Scanning…</> : '🚀 Scan Selected Folder'}
            </button>
            <button className="btn btn-secondary" onClick={() => setMode('none')}>Back</button>
          </div>
        </div>
      ) : (
        /* Entry point cards */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {/* Choose Folder */}
          <div
            className="card card-hover upload-zone"
            style={{ cursor: 'pointer' }}
            onClick={() => folderRef.current?.click()}
          >
            <div style={{ fontSize: '40px', marginBottom: 14 }}>📁</div>
            <h3 style={{ marginBottom: 8 }}>Choose Folder</h3>
            <p style={{ fontSize: '14px', marginBottom: 0 }}>
              Select a local folder. The app will scan all images inside it.
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 10 }}>
              Minimum: more than 10 valid images
            </p>
          </div>

          {/* Choose Pictures */}
          <div
            className="card card-hover upload-zone"
            style={{ cursor: 'pointer' }}
            onClick={() => filesRef.current?.click()}
          >
            <div style={{ fontSize: '40px', marginBottom: 14 }}>🖼️</div>
            <h3 style={{ marginBottom: 8 }}>Choose Pictures</h3>
            <p style={{ fontSize: '14px', marginBottom: 0 }}>
              Select individual image files from your computer.
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 10 }}>
              Minimum: 10 images (JPG, PNG, HEIC)
            </p>
          </div>

          {/* Connect Google Drive */}
          <div
            className="card card-hover upload-zone"
            style={{ cursor: 'pointer', opacity: driveLoading ? 0.7 : 1 }}
            onClick={handleDriveConnect}
          >
            <div style={{ fontSize: '40px', marginBottom: 14 }}>🔗</div>
            <h3 style={{ marginBottom: 8 }}>Connect Google Drive</h3>
            <p style={{ fontSize: '14px', marginBottom: 0 }}>
              Authorize PhotoMind to read your Google Drive (read-only).
            </p>
            <p style={{ fontSize: '12px', color: user?.driveConnected ? '#10b981' : 'var(--text-muted)', marginTop: 10, fontWeight: 600 }}>
              {user?.driveConnected ? '✅ Connected' : 'Not connected yet'}
            </p>
          </div>

          {/* Choose Drive Folder */}
          <div
            className="card card-hover upload-zone"
            style={{ cursor: 'pointer', opacity: driveLoading ? 0.7 : 1 }}
            onClick={handleLoadDriveFolders}
          >
            <div style={{ fontSize: '40px', marginBottom: 14 }}>☁️</div>
            <h3 style={{ marginBottom: 8 }}>Choose Drive Folder</h3>
            <p style={{ fontSize: '14px', marginBottom: 0 }}>
              Pick a folder from your Google Drive to scan and organize.
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 10 }}>
              {driveLoading ? '⏳ Loading folders…' : 'Requires Drive connection'}
            </p>
          </div>
        </div>
      )}

      {/* Supported formats note */}
      {mode === 'none' && !isProcessing && (
        <div style={{ marginTop: 24, color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
          Supported formats: <strong>JPG · JPEG · PNG · HEIC</strong>
        </div>
      )}
    </div>
  );
}
