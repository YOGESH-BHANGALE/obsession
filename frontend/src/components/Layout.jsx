import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Layout({ user, onLogout, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-close mobile drawer whenever route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [path]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', path: '/' },
  ];

  const adminItems = [
    { id: 'audit', label: 'Audit Logs', icon: '📋', path: '/audit' },
  ];

  const handleNavClick = (targetPath) => {
    setMobileMenuOpen(false);
    navigate(targetPath);
  };

  const userInitials = (user?.full_name || 'US')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="app-layout">
      {/* Mobile Top App Bar (Visible on mobile screens <= 768px) */}
      <header className="mobile-app-bar">
        <div className="mobile-app-bar-left">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
          <div className="mobile-logo" onClick={() => handleNavClick('/')} style={{ cursor: 'pointer' }}>
            <div className="mobile-logo-icon">C</div>
            <div>
              <div className="mobile-logo-text">CNAP</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'rgba(255, 214, 0, 0.15)',
              border: '1px solid rgba(255, 214, 0, 0.3)',
              color: 'var(--yellow)',
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.role?.replace('_', ' ')}
          </div>
          <div className="sidebar-avatar" style={{ width: '30px', height: '30px', fontSize: '12px' }}>
            {userInitials}
          </div>
        </div>
      </header>

      {/* Backdrop overlay for mobile drawer */}
      <div
        className={`sidebar-backdrop ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar Navigation (Desktop column or mobile drawer) */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">C</div>
            <div>
              <div className="sidebar-logo-text">CNAP</div>
              <div className="sidebar-logo-sub">Criminal Network Analysis</div>
            </div>
          </div>
          {/* Close button visible inside mobile drawer */}
          <button
            type="button"
            className="mobile-menu-btn"
            style={{ display: mobileMenuOpen ? 'flex' : 'none', border: '1px solid #ccc', color: '#1A1A1A' }}
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-title">Navigation</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${path === item.path ? 'active' : ''}`}
              onClick={() => handleNavClick(item.path)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}

          {path.startsWith('/case/') && (
            <>
              <div className="sidebar-section-title" style={{ marginTop: '12px' }}>Case Views</div>
              {[
                { id: 'graph', label: 'Network Graph', icon: '🕸️' },
                { id: 'assistant', label: 'AI Assistant', icon: '🤖' },
                { id: 'hierarchy', label: 'Hierarchy Tree', icon: '🏛️' },
                { id: 'timeline', label: 'Past Timeline', icon: '⏱️' },
                { id: 'predicted', label: 'Predictive Timeline', icon: '🔮' },
                { id: 'alerts', label: 'Pattern Alerts', icon: '⚡' },
                { id: 'map', label: 'Location Tracking', icon: '📍' },
                { id: 'approvals', label: 'Approvals', icon: '✅' },
                { id: 'upload', label: 'Upload Data', icon: '📁' },
              ].map((item) => {
                const caseId = path.split('/')[2];
                const tab = path.split('/')[3] || 'graph';
                return (
                  <button
                    key={item.id}
                    className={`sidebar-nav-item ${tab === item.id ? 'active' : ''}`}
                    onClick={() => handleNavClick(`/case/${caseId}/${item.id}`)}
                  >
                    <span className="sidebar-nav-icon">{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </>
          )}

          {(user?.role === 'admin' || user?.role === 'senior_authority') && (
            <>
              <div className="sidebar-section-title" style={{ marginTop: '12px' }}>Admin</div>
              {adminItems.map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-nav-item ${path === item.path ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.path)}
                >
                  <span className="sidebar-nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {userInitials}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.full_name}</div>
              <div className="sidebar-user-role">{user?.role?.replace('_', ' ')}</div>
            </div>
          </div>
          <button
            className="btn btn-outline btn-sm"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
