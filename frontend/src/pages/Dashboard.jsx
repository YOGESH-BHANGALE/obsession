import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { casesAPI, detectionAPI, approvalsAPI } from '../api';

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [crimeTypeFilter, setCrimeTypeFilter] = useState('ALL');

  const filteredCases = cases.filter((c) => {
    const q = searchFilter.toLowerCase().trim();
    const matchQuery = !q ||
      (c.title && c.title.toLowerCase().includes(q)) ||
      (c.case_number && c.case_number.toLowerCase().includes(q)) ||
      (c.description && c.description.toLowerCase().includes(q)) ||
      (c.case_type && c.case_type.toLowerCase().includes(q));
    
    const matchType = crimeTypeFilter === 'ALL' ||
      (c.case_type && c.case_type.toLowerCase().includes(crimeTypeFilter.toLowerCase())) ||
      (crimeTypeFilter === 'Hawala Layering' && (c.title?.toLowerCase().includes('hawala') || c.case_type?.toLowerCase().includes('financial')));

    return matchQuery && matchType;
  });

  const loadCases = async () => {
    try {
      const res = await casesAPI.list();
      setCases(res.data);
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  const handleCreateCase = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await casesAPI.create({
        title: newTitle,
        description: newDesc,
      });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      navigate(`/case/${res.data.id}/graph`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create case');
    } finally {
      setCreating(false);
    }
  };

  const handleSeedDemoCase = async () => {
    setSeeding(true);
    setError('');
    try {
      // Check if an Operation Garuda case already exists — reuse it to avoid duplicate cases
      const existing = cases.find(c => c.title && c.title.toLowerCase().includes('garuda'));
      if (existing) {
        navigate(`/case/${existing.id}/graph`);
        return;
      }
      const res = await casesAPI.create({
        title: 'Operation Garuda — Syndicate Network',
        description: 'Multi-jurisdictional narcotics and illicit hawala financing syndicate involving ~40 operatives across India. Seed suspect: Vikram Malhotra.',
      });
      navigate(`/case/${res.data.id}/upload?seed=true`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to seed demo case');
    } finally {
      setSeeding(false);
    }
  };

  const handleDeleteCase = async (e, caseId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this case? All associated records will be permanently deleted.')) {
      return;
    }
    try {
      await casesAPI.delete(caseId);
      setCases(prev => prev.filter(c => c.id !== caseId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete case');
    }
  };

  const handleResetCases = async () => {
    if (!window.confirm('Reset cases so only 1 clean primary case remains? Extra duplicate cases will be removed.')) {
      return;
    }
    setLoading(true);
    try {
      await casesAPI.resetClean();
      await loadCases();
    } catch (err) {
      setError('Failed to reset cases');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container animate-fade-in" style={{ padding: '20px 16px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '2px solid var(--black)', paddingBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', textTransform: 'uppercase' }}>
            Investigation Cases
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Logged in as <strong>{user.full_name}</strong> ({user.role.replace('_', ' ')})
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {cases.length > 1 && (
            <button
              className="btn btn-outline"
              onClick={handleResetCases}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', borderColor: '#fca5a5' }}
              title="Clean duplicate cases so only 1 primary case remains"
            >
              <span>🧹</span> Clean Extra Cases ({cases.length} → 1)
            </button>
          )}
          <button
            className="btn btn-outline"
            onClick={handleSeedDemoCase}
            disabled={seeding}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>⚡</span> {seeding ? 'Generating...' : 'Load Demo Case (40 Nodes)'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>+</span> New Investigation
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {/* KPI Stats Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div className="stat-card" style={{ background: '#fff', border: '1px solid var(--black)', padding: '16px', borderRadius: '4px', borderLeft: '5px solid var(--black)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)' }}>Total Ingested Cases</div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>{cases.length}</div>
        </div>
        <div className="stat-card" style={{ background: '#fff', border: '1px solid var(--black)', padding: '16px', borderRadius: '4px', borderLeft: '5px solid var(--yellow)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)' }}>Active Inquiries</div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>{cases.filter(c => c.status === 'active' || c.status === 'under_investigation').length}</div>
        </div>
        <div className="stat-card" style={{ background: '#fff', border: '1px solid var(--black)', padding: '16px', borderRadius: '4px', borderLeft: '5px solid var(--red)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)' }}>Standing Authorisations</div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>{cases.filter(c => c.standing_authorisation).length}</div>
        </div>
        <div className="stat-card" style={{ background: '#fff', border: '1px solid var(--black)', padding: '16px', borderRadius: '4px', borderLeft: '5px solid #000' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)' }}>Syndicate Link Analysis</div>
          <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '10px', color: '#111' }}>Vikram Malhotra Network</div>
        </div>
      </div>

      {/* Case Search & Category Filter Strip */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          background: '#fff',
          padding: '12px 16px',
          border: '1px solid var(--black)',
          borderRadius: '4px',
        }}
      >
        <div style={{ flex: '1', minWidth: '240px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search by FIR / Case #, Title, or Crime Type..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '13px',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['ALL', 'Cybercrime', 'Narcotics', 'Fraud', 'Hawala Layering', 'Extortion'].map((ct) => {
            const isSel = crimeTypeFilter === ct;
            return (
              <button
                key={ct}
                onClick={() => setCrimeTypeFilter(ct)}
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  border: '1px solid var(--black)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  background: isSel ? 'var(--black)' : '#f8f9fa',
                  color: isSel ? '#fff' : '#222',
                }}
              >
                {ct}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cases List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>Loading cases...</div>
      ) : filteredCases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', border: '2px dashed #ccc', borderRadius: '8px', background: '#fafafa' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>No matching cases found</h3>
          <p style={{ color: '#666', marginBottom: '20px', fontSize: '14px' }}>
            Try resetting your search query or crime type filter.
          </p>
          <button className="btn btn-outline" onClick={() => { setSearchFilter(''); setCrimeTypeFilter('ALL'); }}>
            Reset Filters
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
          {filteredCases.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/case/${c.id}/graph`)}
              style={{
                background: '#fff',
                border: '1.5px solid var(--black)',
                borderRadius: '6px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--yellow-dark)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--black)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {c.case_number && (
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        background: '#EEF2FF',
                        color: '#4338CA',
                        border: '1px solid #C7D2FE',
                      }}
                    >
                      {c.case_number}
                    </span>
                  )}
                  {c.case_type && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 7px',
                        borderRadius: '3px',
                        background: '#FEF3C7',
                        color: '#92400E',
                        border: '1px solid #FDE68A',
                      }}
                    >
                      {c.case_type}
                    </span>
                  )}
                </div>

                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {c.opened_date || (c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Active')}
                </span>
              </div>

              <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: 'var(--black)', lineHeight: 1.3 }}>
                {c.title}
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: '42px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.description || 'Criminal syndicate network investigation file.'}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #eee' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Standing Auth: <strong>{c.standing_authorisation ? 'ENABLED' : 'OFF'}</strong>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {cases.length > 1 && (
                    <button
                      className="btn btn-sm"
                      onClick={(e) => handleDeleteCase(e, c.id)}
                      style={{
                        background: '#fff',
                        border: '1px solid #fca5a5',
                        color: '#dc2626',
                        fontSize: '11px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        borderRadius: '3px',
                      }}
                      title="Delete duplicate case"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/case/${c.id}/graph`);
                    }}
                  >
                    Investigate Graph →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Case Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#fff',
              border: '2px solid var(--black)',
              borderRadius: '8px',
              padding: '24px',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: '20px', fontWeight: 800 }}>Create New Case</h2>
            <form onSubmit={handleCreateCase}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Case Title *
                </label>
                <input
                  className="form-input"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Operation Blue Star or Hawala Network X"
                  required
                  style={{ width: '100%' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Description / Intelligence Summary
                </label>
                <textarea
                  className="form-input"
                  rows="4"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Brief synopsis of criminal syndicate, known seeds, or source files"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
