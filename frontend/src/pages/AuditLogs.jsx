import { useState, useEffect } from 'react';
import { auditAPI, casesAPI } from '../api';

export default function AuditLogs({ user }) {
  const [logs, setLogs] = useState([]);
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [casesRes, logsRes] = await Promise.all([
        casesAPI.list(),
        auditAPI.getLogs(selectedCase || null),
      ]);
      setCases(casesRes.data);
      setLogs(logsRes.data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCase]);

  const safeLogs = Array.isArray(logs) ? logs : [];
  const filteredLogs = safeLogs.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    const detailsStr = typeof l.details === 'string' ? l.details : JSON.stringify(l.details || '');
    return (
      (l.action || '').toLowerCase().includes(s) ||
      detailsStr.toLowerCase().includes(s) ||
      (l.user_id || '').toLowerCase().includes(s) ||
      (l.target_id || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="audit-logs-page animate-fade-in" style={{ padding: '20px 16px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '2px solid var(--black)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', textTransform: 'uppercase' }}>
            System Audit Logs & Chain of Custody
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Immutable evidentiary trail for all graph expansions, evidence views, approvals, and score overrides
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchData}>
          🔄 Refresh Log
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', background: '#fff', border: '1px solid var(--black)', padding: '16px', borderRadius: '6px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Filter by Investigation Case</label>
          <select
            className="form-input"
            value={selectedCase}
            onChange={(e) => setSelectedCase(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">All Cases (Global Audit)</option>
            {cases.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '2 1 300px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Search Action or Details</label>
          <input
            type="text"
            className="form-input"
            placeholder="Search by action name, investigator, entity ID, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Audit Table */}
      <div className="table-responsive" style={{ background: '#fff', border: '1px solid var(--black)', borderRadius: '6px' }}>
        {loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#666' }}>Loading audit records...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
            No audit records matching criteria.
          </div>
        ) : (
          <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--black)', color: '#fff', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '12px 16px' }}>Timestamp</th>
                <th style={{ padding: '12px 16px' }}>Action</th>
                <th style={{ padding: '12px 16px' }}>Investigator</th>
                <th style={{ padding: '12px 16px' }}>Target ID</th>
                <th style={{ padding: '12px 16px' }}>Details / Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : 'var(--white-soft)',
                  }}
                >
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '3px',
                        background: item.action?.includes('REJECT') || item.action?.includes('DENY')
                          ? 'var(--red-light)'
                          : item.action?.includes('APPROVE')
                          ? 'var(--yellow-light)'
                          : '#f0f0f0',
                        color: item.action?.includes('REJECT') || item.action?.includes('DENY')
                          ? 'var(--red-dark)'
                          : 'var(--black)',
                        border: '1px solid rgba(0,0,0,0.1)',
                      }}
                    >
                      {item.action}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                    {item.user_id || 'System'}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '11px', color: '#555' }}>
                    {item.target_id || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                    {typeof item.details === 'object' ? JSON.stringify(item.details) : item.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
