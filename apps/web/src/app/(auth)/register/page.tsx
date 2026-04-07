'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { register } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const { access_token, user } = await register(email, name, password);
      setAuth(access_token, user);
      router.push('/upload');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(99,102,241,0.12) 0%, transparent 70%)',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: '40px 36px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48,
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            borderRadius: 12, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '22px',
            margin: '0 auto 12px',
          }}>🖼️</div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Create your account</h1>
          <p style={{ fontSize: '14px' }}>Start organizing your photos with AI</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>⚠️ {error}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="label" htmlFor="name">Full name</label>
            <input
              id="name" type="text" className="input"
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Alex Johnson" required
            />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="reg-email">Email address</label>
            <input
              id="reg-email" type="email" className="input"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required
            />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password" type="password" className="input"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters" required minLength={8}
            />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password" type="password" className="input"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password" required
            />
          </div>
          <button
            id="register-submit"
            type="submit"
            className="btn btn-primary"
            style={{ marginTop: 6 }}
            disabled={loading}
          >
            {loading ? <><span className="spinner spinner-sm" />Creating account…</> : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: '14px', color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
