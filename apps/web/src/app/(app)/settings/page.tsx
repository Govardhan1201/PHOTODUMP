'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getMe, getDriveAuthUrl, disconnectDrive, User } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}><span className="spinner spinner-lg" /></div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { user: authUser, logout } = useAuth();
  const searchParams = useSearchParams();
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [driveLoading, setDriveLoading] = useState(false);
  const [successMsg, setSuccessMsg]     = useState('');
  const [errorMsg, setErrorMsg]         = useState('');

  const driveConnected  = searchParams.get('drive_connected') === 'true';
  const driveError      = searchParams.get('drive_error');

  useEffect(() => {
    getMe().then(setUser).catch(() => {}).finally(() => setLoading(false));
    if (driveConnected) setSuccessMsg('✅ Google Drive connected successfully!');
    if (driveError)     setErrorMsg(`Drive connection error: ${driveError}`);
  }, [driveConnected, driveError]);

  async function handleConnectDrive() {
    setDriveLoading(true);
    try {
      const { authUrl } = await getDriveAuthUrl();
      window.location.href = authUrl;
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setDriveLoading(false);
    }
  }

  async function handleDisconnectDrive() {
    if (!confirm('Disconnect Google Drive? You can reconnect anytime.')) return;
    await disconnectDrive();
    setUser(u => u ? { ...u, driveConnected: false } : null);
    setSuccessMsg('Google Drive disconnected.');
  }

  const displayUser = user || authUser;

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your account, integrations, and data.</p>
        </div>
      </div>

      {successMsg && <div className="alert alert-success" style={{ marginBottom: 20 }}>{successMsg}</div>}
      {errorMsg   && <div className="alert alert-error"   style={{ marginBottom: 20 }}>⚠️ {errorMsg}</div>}

      {/* Account section */}
      <section className="card" style={{ padding: '24px', marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16, fontSize: '1rem' }}>👤 Account</h3>
        {loading ? <span className="spinner" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Name</span>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>{displayUser?.name || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Email</span>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>{displayUser?.email}</span>
            </div>
            <div style={{ padding: '12px 0' }}>
              <button className="btn btn-danger btn-sm" onClick={logout}>Sign Out</button>
            </div>
          </div>
        )}
      </section>

      {/* Google Drive section */}
      <section className="card" style={{ padding: '24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1rem' }}>☁️ Google Drive</h3>
          <span style={{
            padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '12px', fontWeight: 600,
            background: displayUser?.driveConnected ? '#d1fae5' : 'var(--gray-100)',
            color: displayUser?.driveConnected ? '#065f46' : 'var(--text-muted)',
          }}>
            {displayUser?.driveConnected ? '● Connected' : '○ Not Connected'}
          </span>
        </div>
        <p style={{ fontSize: '14px', marginBottom: 16 }}>
          Connect your Google Drive to import and scan photo folders directly.
          PhotoMind requests <strong>read-only</strong> access to your Drive.
        </p>
        {displayUser?.driveConnected ? (
          <div style={{ display : 'flex', gap: 10 }}>
            <a href="/upload">
              <button className="btn btn-primary btn-sm">📁 Choose Drive Folder</button>
            </a>
            <button className="btn btn-secondary btn-sm" onClick={handleDisconnectDrive}>Disconnect Drive</button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={handleConnectDrive} disabled={driveLoading}>
            {driveLoading ? <><span className="spinner spinner-sm" />Connecting…</> : '🔗 Connect Google Drive'}
          </button>
        )}

        {/* Credentials note */}
        <div className="alert alert-warning" style={{ marginTop: 16, fontSize: '12px' }}>
          ⚙️ <strong>Developer note:</strong> Requires <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env</code>.
          See README for setup instructions.
        </div>
      </section>

      {/* AI adapter section */}
      <section className="card" style={{ padding: '24px', marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12, fontSize: '1rem' }}>🤖 AI Pipeline</h3>
        <p style={{ fontSize: '14px', marginBottom: 12 }}>
          The current AI adapter is controlled by the <code>AI_ADAPTER</code> environment variable on the backend.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { val: 'mock',     label: 'Mock', desc: 'Deterministic fake results — no credential required.' },
            { val: 'deepface', label: 'DeepFace (local)', desc: 'Real face detection, runs locally (~500 MB models).' },
            { val: 'openai',   label: 'OpenAI GPT-4o', desc: 'Best accuracy — requires OPENAI_API_KEY.' },
          ].map(opt => (
            <div key={opt.val} className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: '13px', minWidth: 140 }}>{opt.label}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{opt.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Danger zone */}
      <section className="card" style={{ padding: '24px', borderColor: '#fecaca' }}>
        <h3 style={{ marginBottom: 12, fontSize: '1rem', color: 'var(--danger)' }}>⚠️ Danger Zone</h3>
        <p style={{ fontSize: '14px', marginBottom: 16 }}>
          These actions are irreversible. Proceed with caution.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-danger btn-sm" onClick={() => alert('Data deletion — implement with DELETE /api/users/me endpoint.')}>
            🗑️ Delete All My Data
          </button>
        </div>
      </section>
    </div>
  );
}
