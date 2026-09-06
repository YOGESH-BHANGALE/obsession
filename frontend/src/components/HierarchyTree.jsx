import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { graphAPI } from '../api';

export default function HierarchyTree({ caseId, onSelectPerson }) {
  const navigate = useNavigate();
  const [hierarchy, setHierarchy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadHierarchy();
  }, [caseId]);

  const loadHierarchy = async () => {
    setLoading(true);
    try {
      const res = await graphAPI.getHierarchy(caseId);
      const list = Array.isArray(res.data)
        ? res.data
        : (Array.isArray(res.data?.hierarchy) ? res.data.hierarchy : []);
      setHierarchy(list);
    } catch (err) {
      console.error('Failed to load hierarchy:', err);
      setHierarchy([]);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  };

  const safeList = Array.isArray(hierarchy) ? hierarchy : [];
  const filtered = safeList.filter((item) =>
    (item?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (item?.role || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in" style={{ padding: '20px 16px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid var(--black)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, textTransform: 'uppercase' }}>
            Syndicate Command Hierarchy & Influence Ranking
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Entities ordered by composite influence metrics (PageRank, Betweenness Centrality, and Suspicion)
          </p>
        </div>
        <input
          type="text"
          className="form-input"
          placeholder="Filter by name or rank..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '240px' }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>Computing graph centrality and influence...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#888', border: '1.5px dashed #ccc', borderRadius: '8px', background: '#FFFFFF' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏛️</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#222', fontWeight: 800 }}>
            No Hierarchy Data Available
          </h3>
          <p style={{ margin: '0 auto 20px', fontSize: '13px', color: '#666', maxWidth: '460px' }}>
            This investigation case has no entities in its graph yet. Upload data files or load the pre-configured fictional syndicate dataset.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/case/${caseId}/upload?seed=true`)}
            style={{ fontWeight: 700 }}
          >
            ⚡ Load Demo Syndicate (~40 entities)
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((item, index) => {
            const isTop = index === 0;
            const isLieutenant = index >= 1 && index <= 3;
            const scorePercent = Math.round((item.hierarchy_score || 0) * 100);
            const suspicionPercent = Math.round((item.suspicion_score || 0) * 100);

            return (
              <div
                key={item.id}
                onClick={() => onSelectPerson && onSelectPerson(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '14px',
                  background: isTop ? 'var(--yellow-light)' : '#FFFFFF',
                  border: isTop ? '2.5px solid var(--black)' : '1px solid #E0E0E0',
                  borderRadius: '6px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  boxShadow: isTop ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = isTop ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)';
                }}
              >
                {/* Rank Number */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: isTop ? 'var(--yellow)' : isLieutenant ? '#333' : '#eee',
                    color: isLieutenant ? '#fff' : '#000',
                    border: '1.5px solid var(--black)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '14px',
                    flexShrink: 0,
                  }}
                >
                  #{index + 1}
                </div>

                {/* Avatar */}
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: item.criminal_history_flag ? '#FFEBEE' : '#FFF',
                    border: item.criminal_history_flag ? '2.5px solid var(--red)' : '2px solid var(--black)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '16px',
                    flexShrink: 0,
                  }}
                >
                  {getInitials(item.name)}
                </div>

                {/* Name & Role */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{item.name || 'Unknown Suspect'}</h3>
                    {item.is_seed && (
                      <span style={{ fontSize: '10px', background: '#000', color: '#fff', padding: '1px 6px', borderRadius: '3px', fontWeight: 700 }}>
                        SEED
                      </span>
                    )}
                    {item.criminal_history_flag && (
                      <span style={{ fontSize: '10px', background: 'var(--red-light)', color: 'var(--red-dark)', border: '1px solid var(--red)', padding: '1px 6px', borderRadius: '3px', fontWeight: 700 }}>
                        CRIMINAL RECORD
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Role: <strong>{isTop ? 'Kingpin / Head of Syndicate' : isLieutenant ? 'Lieutenant / Coordinator' : 'Operative / Specialist'}</strong>
                    {item.phone_numbers && item.phone_numbers[0] ? ` • 📞 ${item.phone_numbers[0]}` : ''}
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#666', fontWeight: 700 }}>Influence</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--black)' }}>{scorePercent}%</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#666', fontWeight: 700 }}>Suspicion</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: suspicionPercent >= 75 ? 'var(--red)' : '#333' }}>
                      {suspicionPercent}%
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPerson && onSelectPerson(item.id);
                    }}
                  >
                    View in Graph →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
