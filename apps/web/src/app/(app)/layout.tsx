'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, AuthProvider } from '@/hooks/useAuth';
import { getCategoryCounts } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { href: '/upload',    icon: '⬆️',  label: 'Upload / Import' },
];

const GALLERY_ITEMS = [
  { href: '/gallery',   icon: '🖼️', label: 'All Photos',  key: 'ALL' },
  { href: '/with-me',   icon: '🤳', label: 'With Me',     key: 'WITH_ME' },
  { href: '/gallery?category=PEOPLE',    icon: '👥', label: 'People',    key: 'PEOPLE' },
  { href: '/gallery?category=NATURE',    icon: '🌿', label: 'Nature',    key: 'NATURE' },
  { href: '/gallery?category=ITEMS',     icon: '📦', label: 'Items',     key: 'ITEMS' },
  { href: '/gallery?category=FOOD',      icon: '🍕', label: 'Food',      key: 'FOOD' },
  { href: '/gallery?category=VEHICLES',  icon: '🚗', label: 'Vehicles',  key: 'VEHICLES' },
  { href: '/gallery?category=BUILDINGS', icon: '🏙️', label: 'Buildings', key: 'BUILDINGS' },
  { href: '/review',    icon: '⚠️', label: 'Needs Review', key: 'REVIEW' },
];

function AppSidebar({ counts }: { counts: Record<string, number> }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isActive = (href: string) => {
    if (href === '/gallery' && pathname === '/gallery') return true;
    return pathname.startsWith(href.split('?')[0]) && href !== '/gallery';
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon" style={{ fontSize: '16px' }}>🖼️</div>
        <span className="sidebar-logo-text">PhotoMind</span>
      </div>

      {/* Main Nav */}
      <div className="sidebar-section">
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href}>
            <button className={`sidebar-nav-item ${isActive(item.href) ? 'active' : ''}`}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          </Link>
        ))}
      </div>

      {/* Gallery */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Gallery</div>
        {GALLERY_ITEMS.map(item => {
          const count = item.key === 'ALL'
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : item.key === 'REVIEW'
            ? 0
            : counts[item.key] ?? 0;
          return (
            <Link key={item.href} href={item.href}>
              <button className={`sidebar-nav-item ${isActive(item.href) ? 'active' : ''}`}>
                <span>{item.icon}</span>
                {item.label}
                {count > 0 && <span className="nav-badge">{count > 999 ? '999+' : count}</span>}
              </button>
            </Link>
          );
        })}
      </div>

      {/* People */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">People</div>
        <Link href="/people">
          <button className={`sidebar-nav-item ${pathname === '/people' ? 'active' : ''}`}>
            <span>🫂</span> Face Clusters
          </button>
        </Link>
      </div>

      {/* Bottom */}
      <div className="sidebar-bottom">
        <Link href="/settings">
          <button className="sidebar-nav-item">
            <span>⚙️</span> Settings
          </button>
        </Link>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginTop: 4 }}>
            <div className="avatar" style={{ width: 30, height: 30, fontSize: '12px' }}>
              {(user.name || user.email)[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name || user.email}
              </div>
            </div>
            <button
              onClick={logout}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px' }}
              title="Sign out"
            >↩</button>
          </div>
        )}
      </div>
    </aside>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      getCategoryCounts().then(d => setCounts(d.counts)).catch(() => {});
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }}
        />
      )}

      <AppSidebar counts={counts} />

      <div className="main-content">
        {/* Top nav */}
        <header className="topnav">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSidebarOpen(o => !o)}
            style={{ display: 'none' }}  // shown via CSS on mobile
            id="sidebar-toggle"
          >☰</button>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/upload">
              <button className="btn btn-primary btn-sm">+ Import Photos</button>
            </Link>
            <div className="avatar">{(user.name || user.email)[0].toUpperCase()}</div>
          </div>
        </header>

        <div className="page-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </AuthProvider>
  );
}
