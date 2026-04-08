'use client';

import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <div className="main-content" style={{ marginLeft: 0 }}>
        {/* Top nav */}
        <header className="topnav" style={{ padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: '24px' }}>📸</div>
              <strong style={{ fontSize: '18px', letterSpacing: '-0.5px' }}>PhotoMind Processor</strong>
            </Link>
          </div>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="https://github.com/Govardhan1201/PHOTODUMP" target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'var(--text-muted)', fontSize: '14px' }}>
              Stateless Local AI 🔒
            </a>
          </div>
        </header>

        <div className="page-body" style={{ maxWidth: 1200, margin: '0 auto', width: '100%', padding: '0 16px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
