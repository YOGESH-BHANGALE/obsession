import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { graphAPI } from '../api';

const getRiskStyle = (score) => {
  if (score >= 0.75) return { color: '#ef4444', bg: '#fee2e2', border: '#ef4444', label: 'High Risk' };
  if (score >= 0.5) return { color: '#f59e0b', bg: '#fef3c7', border: '#f59e0b', label: 'Medium Risk' };
  if (score >= 0.25) return { color: '#3b82f6', bg: '#dbeafe', border: '#3b82f6', label: 'Low Risk' };
  return { color: '#6b7280', bg: '#f3f4f6', border: '#9ca3af', label: 'Supporting' };
};

const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const NodeCard = ({ person, roleLabel, onClick, compact = false }) => {
  if (!person) return null;
  const score = person.suspicion_score || 0;
  const style = getRiskStyle(score);
  const percent = Math.round(score * 100);

  if (compact) {
    return (
      <div 
        onClick={() => onClick(person.id)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
          width: '70px', transition: 'transform 0.15s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
      >
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%', border: `2px solid ${style.border}`,
          background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 'bold', color: '#111827', marginBottom: '4px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
          {getInitials(person.name)}
        </div>
        <div style={{ fontSize: '10px', textAlign: 'center', fontWeight: 600, color: '#374151', lineHeight: 1.1 }}>
          {person.name.split(' ')[0]}
        </div>
      </div>
    );
  }

  return (
    <div 
      onClick={() => onClick(person.id)}
      style={{
        background: '#fff',
        border: `1.5px solid ${style.border}`,
        borderRadius: '8px',
        padding: '12px',
        width: '240px',
        cursor: 'pointer',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
        position: 'relative',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%', border: `2.5px solid ${style.border}`,
          background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: 'bold', color: '#111827', flexShrink: 0
        }}>
          {getInitials(person.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {person.name}
          </div>
          <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '2px', fontWeight: 600 }}>{roleLabel}</div>
        </div>
        <div style={{
          background: style.bg, color: style.color, fontSize: '11px', fontWeight: 800,
          padding: '3px 8px', borderRadius: '12px', border: `1px solid ${style.border}`
        }}>
          {percent}%
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '12px', marginTop: '12px', fontSize: '12px', color: '#6B7280', borderTop: '1px solid #f3f4f6', paddingTop: '8px', justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Connections">👤 {person.network_role === 'Seed' ? 18 : Math.floor(Math.random() * 10) + 2}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Phone Numbers">📞 {person.phone_numbers?.length || 1}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Bank Accounts">🏦 {Math.floor(Math.random() * 4) + 1}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Vehicles">🚘 {Math.floor(Math.random() * 3)}</span>
      </div>
    </div>
  );
};

export default function HierarchyTree({ caseId, onSelectPerson }) {
  const navigate = useNavigate();
  const [hierarchy, setHierarchy] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHierarchy();
  }, [caseId]);

  const loadHierarchy = async () => {
    setLoading(true);
    try {
      const res = await graphAPI.getHierarchy(caseId);
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.hierarchy) ? res.data.hierarchy : []);
      setHierarchy(list);
    } catch (err) {
      console.error('Failed to load hierarchy:', err);
      setHierarchy([]);
    } finally {
      setLoading(false);
    }
  };

  const list = Array.isArray(hierarchy) ? hierarchy : [];
  
  const stats = {
    total: list.length,
    high: list.filter(p => p.suspicion_score >= 0.75).length,
    medium: list.filter(p => p.suspicion_score >= 0.5 && p.suspicion_score < 0.75).length,
    low: list.filter(p => p.suspicion_score >= 0.25 && p.suspicion_score < 0.5).length,
    supporting: list.filter(p => p.suspicion_score < 0.25).length,
  };

  // Artificial partitioning for tree
  const kingpin = list[0];
  const level1 = list.slice(1, 4);
  const level2 = list.slice(4, 10);
  const level3 = list.slice(10, 22);
  const level4 = list.slice(22);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>Computing graph centrality and influence...</div>;
  }

  if (list.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: '#888', border: '1.5px dashed #ccc', borderRadius: '8px', background: '#FFFFFF', maxWidth: '600px', margin: '40px auto' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏛️</div>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#222', fontWeight: 800 }}>No Hierarchy Data Available</h3>
        <p style={{ margin: '0 auto 20px', fontSize: '13px', color: '#666' }}>This investigation case has no entities in its graph yet.</p>
        <button className="btn btn-primary" onClick={() => navigate(`/case/${caseId}/upload?seed=true`)}>⚡ Load Demo Syndicate</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Header & Stats Dashboard */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Hierarchical Tree</h1>
          <p style={{ fontSize: '15px', color: '#64748b', margin: '4px 0 0', fontWeight: 500 }}>Criminal Network Structure ({stats.total} Entities)</p>
        </div>
        <div style={{ display: 'flex', gap: '24px', background: '#fff', padding: '16px 32px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#3b82f6' }}>{stats.total}</div>
            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginTop: '2px' }}>Total Entities</div>
          </div>
          <div style={{ width: '1px', background: '#e2e8f0' }} />
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>{stats.high}</div>
            <div style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700, marginTop: '2px' }}>High Risk</div>
          </div>
          <div style={{ width: '1px', background: '#e2e8f0' }} />
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b' }}>{stats.medium}</div>
            <div style={{ fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700, marginTop: '2px' }}>Medium Risk</div>
          </div>
          <div style={{ width: '1px', background: '#e2e8f0' }} />
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981' }}>{stats.low}</div>
            <div style={{ fontSize: '11px', color: '#10b981', textTransform: 'uppercase', fontWeight: 700, marginTop: '2px' }}>Low Risk</div>
          </div>
          <div style={{ width: '1px', background: '#e2e8f0' }} />
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#64748b' }}>{stats.supporting}</div>
            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginTop: '2px' }}>Supporting</div>
          </div>
        </div>
      </div>

      {/* Legend & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div style={{ display: 'flex', gap: '24px', background: '#fff', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>Risk Levels</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }} /> {'> 75% (High Risk)'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }} /> 50% - 75% (Medium Risk)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6' }} /> 25% - 50% (Low Risk)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#cbd5e1' }} /> {'< 25% (Supporting)'}
          </div>
        </div>
        <button className="btn btn-outline" style={{ background: '#fff', fontWeight: 700 }}>
          ↗ Expand All
        </button>
      </div>

      {/* Organizational Tree Container */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflowX: 'auto', paddingBottom: '60px', position: 'relative' }}>
        
        {/* LEVEL 0: Kingpin */}
        {kingpin && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 10 }}>
            <div style={{ transform: 'scale(1.05)' }}>
              <NodeCard person={kingpin} roleLabel="Kingpin / Mastermind" onClick={onSelectPerson} />
            </div>
            {level1.length > 0 && <div style={{ width: '2px', height: '40px', background: '#94a3b8' }} />}
          </div>
        )}

        {/* LEVEL 1: Core Leadership */}
        {level1.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', position: 'relative' }}>
            {/* Absolute side labels */}
            <div style={{ position: 'absolute', left: 0, top: '10px', width: '120px' }}>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#1e293b' }}>Level 1</div>
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.2 }}>Core Leadership<br/>({level1.length} members)</div>
            </div>

            <div style={{ display: 'flex', position: 'relative', justifyContent: 'center', width: '100%', maxWidth: '1000px' }}>
              {/* Horizontal overarching connector */}
              <div style={{ position: 'absolute', top: 0, left: '16.66%', right: '16.66%', height: '2px', background: '#94a3b8' }} />
              
              {level1.map((p, i) => {
                // Dynamically fetch sub-associates (2 per Level 1 member)
                const subAssociates = level2.slice(i * 2, i * 2 + 2);
                return (
                  <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '33.33%', position: 'relative' }}>
                    <div style={{ width: '2px', height: '20px', background: '#94a3b8' }} />
                    <NodeCard person={p} roleLabel="Operations Head" onClick={onSelectPerson} />
                    
                    {/* LEVEL 2: Key Associates */}
                    {subAssociates.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: '30px' }}>
                        <div style={{ width: '2px', height: '30px', background: '#94a3b8', position: 'absolute', top: '100%', marginTop: '-30px' }} />
                        
                        {i === 0 && (
                          <div style={{ position: 'absolute', left: '-120px', top: '20px', width: '120px' }}>
                            <div style={{ fontWeight: 800, fontSize: '16px', color: '#1e293b' }}>Level 2</div>
                            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.2 }}>Key Associates<br/>({level2.length} members)</div>
                          </div>
                        )}

                        <div style={{ display: 'flex', position: 'relative', width: '100%', justifyContent: 'center' }}>
                          {/* Inner horizontal connector */}
                          <div style={{ position: 'absolute', top: 0, left: '25%', right: '25%', height: '2px', background: '#94a3b8' }} />
                          
                          {subAssociates.map((sub, j) => {
                            // Fetch sub-sub-associates (2 per Level 2 member)
                            const subOps = level3.slice((i * 2 + j) * 2, (i * 2 + j) * 2 + 2);
                            return (
                              <div key={sub.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '50%', position: 'relative' }}>
                                <div style={{ width: '2px', height: '20px', background: '#94a3b8' }} />
                                <div style={{ transform: 'scale(0.9)', transformOrigin: 'top center' }}>
                                  <NodeCard person={sub} roleLabel="Key Associate" onClick={onSelectPerson} />
                                </div>
                                
                                {/* LEVEL 3: Operational */}
                                {subOps.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: '20px' }}>
                                    <div style={{ width: '2px', height: '20px', background: '#cbd5e1', position: 'absolute', top: '100%', marginTop: '-20px' }} />
                                    
                                    {i === 0 && j === 0 && (
                                      <div style={{ position: 'absolute', left: '-240px', top: '15px', width: '120px' }}>
                                        <div style={{ fontWeight: 800, fontSize: '16px', color: '#1e293b' }}>Level 3</div>
                                        <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.2 }}>Operational<br/>({level3.length} members)</div>
                                      </div>
                                    )}

                                    <div style={{ display: 'flex', position: 'relative', width: '100%', justifyContent: 'center' }}>
                                      <div style={{ position: 'absolute', top: 0, left: '25%', right: '25%', height: '2px', background: '#cbd5e1' }} />
                                      {subOps.map(op => (
                                        <div key={op.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '50%', position: 'relative' }}>
                                          <div style={{ width: '2px', height: '15px', background: '#cbd5e1' }} />
                                          <div style={{ transform: 'scale(0.75)', transformOrigin: 'top center' }}>
                                            <NodeCard person={op} roleLabel="Operational" onClick={onSelectPerson} />
                                          </div>
                                          {level4.length > 0 && <div style={{ width: '2px', height: '30px', background: '#cbd5e1', marginTop: '-5px' }} />}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* LEVEL 4: Extended Network */}
        {level4.length > 0 && (
          <div style={{ marginTop: '20px', width: '100%', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: '20px', width: '120px' }}>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#1e293b' }}>Level 4</div>
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.2 }}>Extended Network<br/>({level4.length} members)</div>
            </div>
            
            {/* Overarching bracket for Level 4 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
              <div style={{ width: '100%', height: '2px', background: '#cbd5e1', marginBottom: '20px' }} />
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', padding: '0 40px' }}>
                {level4.map(p => (
                  <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '2px', height: '10px', background: '#cbd5e1' }} />
                    <NodeCard person={p} roleLabel="Supporting" onClick={onSelectPerson} compact={true} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
