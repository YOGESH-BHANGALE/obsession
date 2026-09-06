import { useState, useEffect } from 'react';
import { detectionAPI } from '../api';

export default function PatternAlerts({ caseId, onSelectPerson }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await detectionAPI.getAlerts(caseId);
      setAlerts(res.data || []);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [caseId]);

  const handleRunAll = async () => {
    setRunning(true);
    try {
      const res = await detectionAPI.runDetectors(caseId);
      setAlerts(res.data.alerts || []);
    } catch (err) {
      console.error('Failed to run pattern detectors:', err);
    } finally {
      setRunning(false);
    }
  };

  const handleStatusUpdate = async (alertId, newStatus) => {
    try {
      await detectionAPI.reviewAlert(caseId, alertId, newStatus);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: newStatus } : a))
      );
    } catch (err) {
      console.error('Failed to update alert:', err);
    }
  };

  const filtered = alerts.filter((a) => {
    if (filterSeverity === 'ALL') return true;
    return a.severity?.toUpperCase() === filterSeverity;
  });

  return (
    <div className="animate-fade-in" style={{ padding: '20px 16px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid var(--black)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, textTransform: 'uppercase' }}>
            Suspicious Activity Pattern Alerts (12 Detectors)
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Automated intelligence detectors for hawala layering, communication bursts, burner phones, and group co-locations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleRunAll}
            disabled={running}
          >
            {running ? 'Executing Detectors...' : '⚡ Run 12 Pattern Detectors'}
          </button>
        </div>
      </div>

      {/* Severity Filter Strip */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#666' }}>
          Severity:
        </span>
        {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${filterSeverity === s ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilterSeverity(s)}
          >
            {s} ({alerts.filter((a) => (s === 'ALL' ? true : a.severity?.toUpperCase() === s)).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Running detection engine...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#888', border: '1px dashed #ccc', borderRadius: '6px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>No active alerts for this case</h3>
          <p style={{ fontSize: '13px', color: '#666' }}>
            Click &quot;Run 12 Pattern Detectors&quot; to scan the relationship graph, transactions, CDRs, and location trails.
          </p>
          <button className="btn btn-primary" onClick={handleRunAll} disabled={running}>
            Run Detectors Now
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filtered.map((alert) => {
            const isHigh = alert.severity?.toUpperCase() === 'HIGH';
            const isConfirmed = alert.status === 'confirmed';
            const isDismissed = alert.status === 'dismissed';

            return (
              <div
                key={alert.id}
                style={{
                  background: '#FFFFFF',
                  border: isHigh ? '2px solid var(--red)' : '1.5px solid var(--black)',
                  borderLeft: isHigh ? '8px solid var(--red)' : '8px solid var(--yellow)',
                  borderRadius: '6px',
                  padding: '18px 20px',
                  opacity: isDismissed ? 0.6 : 1,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '3px',
                          background: isHigh ? 'var(--red-light)' : 'var(--yellow-light)',
                          color: isHigh ? 'var(--red-dark)' : '#1A1A1A',
                          border: '1px solid rgba(0,0,0,0.15)',
                        }}
                      >
                        {alert.severity} SEVERITY
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#333' }}>
                        {alert.pattern_name || alert.pattern_type}
                      </span>
                      {alert.status && (
                        <span style={{ fontSize: '11px', color: isConfirmed ? '#2e7d32' : isDismissed ? '#888' : '#b26a00', fontWeight: 700 }}>
                          [{alert.status.toUpperCase()}]
                        </span>
                      )}
                    </div>

                    <h3 style={{ margin: '4px 0 8px', fontSize: '16px', fontWeight: 800 }}>
                      {alert.title || alert.description}
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {alert.description}
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleStatusUpdate(alert.id, isConfirmed ? 'pending' : 'confirmed')}
                      style={{ color: isConfirmed ? '#2e7d32' : 'inherit' }}
                    >
                      {isConfirmed ? '✓ Confirmed' : 'Confirm'}
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleStatusUpdate(alert.id, isDismissed ? 'pending' : 'dismissed')}
                    >
                      {isDismissed ? 'Undismiss' : 'Dismiss'}
                    </button>
                  </div>
                </div>

                {/* Involved Entities */}
                {alert.affected_entities && alert.affected_entities.length > 0 && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #eee', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#666' }}>Involved Entities:</span>
                    {alert.affected_entities.map((name, i) => (
                      <span
                        key={i}
                        style={{
                          background: '#f5f5f5',
                          border: '1px solid #ddd',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        👤 {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
