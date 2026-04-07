import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PhotoMind — Organize Your Memories with AI',
  description: 'Upload your photos and let AI automatically sort them into smart categories — faces, nature, food, travel and more.',
};

const features = [
  {
    icon: '🧠',
    title: 'AI-Powered Sorting',
    desc: 'Every photo is automatically classified into smart categories using computer vision.',
  },
  {
    icon: '👤',
    title: 'Face Recognition',
    desc: 'Detect people across thousands of photos and group them by identity automatically.',
  },
  {
    icon: '🔍',
    title: 'Find Me',
    desc: 'Upload 1–3 selfies and PhotoMind will find every photo you appear in.',
  },
  {
    icon: '📁',
    title: 'Google Drive',
    desc: 'Connect your Drive, pick a folder, and scan it — no manual download needed.',
  },
  {
    icon: '✏️',
    title: 'Manual Control',
    desc: 'Correct wrong classifications, merge face clusters, and flag photos for review.',
  },
  {
    icon: '⚡',
    title: 'Fast & Private',
    desc: 'Processing runs in the background. Your photos stay yours — no third-party sharing.',
  },
];

const categories = [
  { label: 'With Me',   color: '#7c3aed', bg: '#ede9fe', emoji: '🤳' },
  { label: 'People',    color: '#1d4ed8', bg: '#dbeafe', emoji: '👥' },
  { label: 'Nature',    color: '#065f46', bg: '#d1fae5', emoji: '🌿' },
  { label: 'Food',      color: '#991b1b', bg: '#fee2e2', emoji: '🍕' },
  { label: 'Vehicles',  color: '#0369a1', bg: '#e0f2fe', emoji: '🚗' },
  { label: 'Buildings', color: '#374151', bg: '#f3f4f6', emoji: '🏙️' },
  { label: 'Items',     color: '#92400e', bg: '#fef3c7', emoji: '📦' },
  { label: 'Uncertain', color: '#713f12', bg: '#fefce8', emoji: '❓' },
];

export default function LandingPage() {
  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg-surface)' }}>
      {/* ── Navbar ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '60px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px',
          }}>🖼️</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>PhotoMind</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/login">
            <button className="btn btn-secondary btn-sm">Sign In</button>
          </Link>
          <Link href="/register">
            <button className="btn btn-primary btn-sm">Get Started</button>
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="hero-badge">
          ✨ Powered by AI vision
        </div>
        <h1 className="hero-title">
          Your photos,<br />intelligently organized
        </h1>
        <p className="hero-subtitle">
          Upload thousands of travel photos or connect your Google Drive. PhotoMind
          detects faces, clusters people, and sorts every image into smart folders — automatically.
        </p>
        <div className="hero-cta">
          <Link href="/register">
            <button className="btn btn-primary btn-lg">
              Start Organizing Free →
            </button>
          </Link>
          <Link href="/login">
            <button className="btn btn-secondary btn-lg">
              Sign In
            </button>
          </Link>
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 48 }}>
          {categories.map(c => (
            <span key={c.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              background: c.bg,
              color: c.color,
              fontWeight: 600,
              fontSize: '13px',
            }}>
              {c.emoji} {c.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="features-grid">
          {features.map(f => (
            <div key={f.title} className="card feature-card">
              <div className="feature-icon" style={{ fontSize: '22px' }}>{f.icon}</div>
              <h3 style={{ marginBottom: 8, fontSize: '1.05rem' }}>{f.title}</h3>
              <p style={{ fontSize: '14px', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA footer ── */}
      <section style={{ textAlign: 'center', padding: '80px 24px' }}>
        <h2 style={{ marginBottom: 16 }}>Ready to organize your memories?</h2>
        <p style={{ marginBottom: 32, color: 'var(--text-secondary)' }}>
          Works with local folders, direct photo selection, and Google Drive.
        </p>
        <Link href="/register">
          <button className="btn btn-primary btn-lg">Create Free Account →</button>
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '24px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: 'var(--text-muted)', fontSize: '13px', flexWrap: 'wrap', gap: 8,
      }}>
        <span>© 2026 PhotoMind. All rights reserved.</span>
        <span>Built with Next.js + FastAPI</span>
      </footer>
    </main>
  );
}
