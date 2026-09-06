import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { graphAPI, approvalsAPI } from '../api';

export default function NodeDetailPanel({
  caseId,
  personId,
  onClose,
  onSelectPerson,
  onScoreUpdated,
  user,
}) {
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [overrideScore, setOverrideScore] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [requestingTrack, setRequestingTrack] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!personId) return;
    loadPerson();
  }, [personId, caseId]);

  const loadPerson = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await graphAPI.getPersonDetail(caseId, personId);
      const personObj = res.data?.person || res.data;
      const combined = {
        ...res.data?.graph_node,
        ...personObj,
        fir_records: res.data?.fir_records || [],
        criminal_history: res.data?.criminal_history || [],
        edges: res.data?.edges || []
      };
      setPerson(combined);
      setOverrideScore(combined.suspicion_score != null ? combined.suspicion_score.toFixed(2) : '0.50');
    } catch (err) {
      setError('Failed to fetch person details');
    } finally {
      setLoading(false);
    }
  };

  const handleOverrideScore = async (e) => {
    e.preventDefault();
    const val = parseFloat(overrideScore);
    if (isNaN(val) || val < 0 || val > 1) {
      setError('Score must be between 0.0 and 1.0');
      return;
    }
    if (!overrideReason.trim()) {
      setError('Justification reason is required for evidentiary audit trail.');
      return;
    }

    setSavingOverride(true);
    setError('');
    setMessage('');
    try {
      await graphAPI.overrideScore(caseId, personId, val, overrideReason);
      setMessage('Score successfully updated and logged in audit trail.');
      if (onScoreUpdated) onScoreUpdated();
      loadPerson();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update score');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleRequestTracking = async () => {
    setRequestingTrack(true);
    setError('');
    setMessage('');
    try {
      await approvalsAPI.create(caseId, {
        person_id: personId,
        request_type: 'location_tracking',
        justification: `Elevated surveillance tracking requested by ${user.full_name} (${user.role}) for high-suspicion entity.`,
      });
      setMessage('Live location tracking request submitted for Senior Authority sign-off.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to request tracking');
    } finally {
      setRequestingTrack(false);
    }
  };

  if (!personId) return null;

  return (
    <div className="node-detail-panel-responsive animate-slide-in">
      {/* Panel Header */}
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--black)',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Entity Intelligence Profile
        </span>
        <button
          onClick={onClose}
          aria-label="Close Profile"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '4px',
            color: '#FFFFFF',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '36px',
            minHeight: '36px',
          }}
        >
          ✕
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '36px', textAlign: 'center', color: '#666' }}>Loading dossier...</div>
      ) : !person ? (
        <div style={{ padding: '24px', color: '#666' }}>No records found for entity.</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* Identity Header */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: person.suspicion_score >= 0.75 ? 'var(--yellow)' : '#F0F0F0',
                border: person.criminal_history_flag ? '3.5px solid var(--red)' : '2.5px solid var(--black)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '20px',
                color: '#1A1A1A',
                flexShrink: 0,
              }}
            >
              {(person.name || 'UN').split(' ').filter(Boolean).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '??'}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{person.name}</h2>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                {person.is_seed && (
                  <span style={{ fontSize: '10px', background: 'var(--black)', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontWeight: 700 }}>
                    ★ SEED SUSPECT
                  </span>
                )}
                {person.criminal_history_flag && (
                  <span style={{ fontSize: '10px', background: 'var(--red-light)', color: 'var(--red-dark)', border: '1px solid var(--red)', padding: '2px 6px', borderRadius: '3px', fontWeight: 700 }}>
                    ⚠ CRIMINAL RECORD
                  </span>
                )}
                <span style={{ fontSize: '10px', background: 'var(--yellow-light)', border: '1px solid var(--black)', padding: '2px 6px', borderRadius: '3px', fontWeight: 700, textTransform: 'uppercase' }}>
                  {person.confidence_band || 'Active'} Zone
                </span>
              </div>
            </div>
          </div>

          {/* Suspicion Score Gauge */}
          <div style={{ background: 'var(--white-soft)', border: '1px solid #ddd', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
              <span>Suspicion Score:</span>
              <span style={{ color: person.suspicion_score >= 0.75 ? 'var(--red)' : '#1A1A1A' }}>
                {(person.suspicion_score * 100).toFixed(0)}%
              </span>
            </div>
            <div style={{ height: '8px', width: '100%', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, person.suspicion_score * 100))}%`,
                  background: person.suspicion_score >= 0.75 ? 'var(--red)' : person.suspicion_score >= 0.5 ? 'var(--yellow-dark)' : '#666',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#777', marginTop: '4px' }}>
              <span>Influence Score: {(person.hierarchy_score * 100).toFixed(1)}%</span>
              <span>Status: {person.explored ? 'Explored' : 'Unexplored Candidate'}</span>
            </div>
          </div>

          {/* Quick AI Assistant Query Button */}
          <button
            type="button"
            className="btn btn-sm"
            style={{
              width: '100%',
              marginBottom: '16px',
              background: '#0F172A',
              color: '#38BDF8',
              border: '1px solid #0284C7',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '12px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.2)',
            }}
            onClick={() => navigate(`/case/${caseId}/assistant`)}
          >
            <span>🤖</span> Ask AI Assistant About {person.name}
          </button>

          {message && (
            <div className="alert alert-success" style={{ marginBottom: '12px', fontSize: '12px', padding: '8px 12px' }}>
              {message}
            </div>
          )}
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '12px', fontSize: '12px', padding: '8px 12px' }}>
              {error}
            </div>
          )}

          {/* Sub-tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #ccc', marginBottom: '16px' }}>
            {['overview', 'evidence', 'override'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab ? '3px solid var(--black)' : 'none',
                  fontWeight: activeTab === tab ? 800 : 500,
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  color: activeTab === tab ? 'var(--black)' : '#888',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ fontSize: '13px' }}>
              <div style={{ marginBottom: '14px' }}>
                <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666', display: 'block', marginBottom: '4px' }}>
                  Registered Phone Numbers
                </strong>
                {(person.phone_numbers && person.phone_numbers.length > 0) ? (
                  person.phone_numbers.map((num, i) => (
                    <div key={i} style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '4px 8px', borderRadius: '4px', marginBottom: '4px', display: 'inline-block', marginRight: '6px' }}>
                      📞 {num}
                    </div>
                  ))
                ) : (
                  <span style={{ color: '#888' }}>None on file</span>
                )}
              </div>

              {person.aliases && person.aliases.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666', display: 'block', marginBottom: '4px' }}>
                    Known Aliases / Monikers
                  </strong>
                  <div>
                    {person.aliases.map((al, idx) => (
                      <span key={idx} style={{ background: '#FFF9C4', padding: '2px 8px', borderRadius: '4px', border: '1px solid #E0E0E0', fontSize: '12px', marginRight: '6px' }}>
                        {al}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {person.cross_case_refs && person.cross_case_refs.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666', display: 'block', marginBottom: '4px' }}>
                    Cross-Case References
                  </strong>
                  {person.cross_case_refs.map((ref, idx) => (
                    <div key={idx} style={{ fontSize: '11px', color: 'var(--red-dark)', fontWeight: 600 }}>
                      🔗 {ref}
                    </div>
                  ))}
                </div>
              )}

              {/* Direct Associates */}
              <div style={{ marginTop: '16px' }}>
                <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666', display: 'block', marginBottom: '8px' }}>
                  Direct Network Associates ({(person.neighbors || []).length})
                </strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {(person.neighbors || []).map((nb) => (
                    <div
                      key={nb.id}
                      onClick={() => onSelectPerson && onSelectPerson(nb.id)}
                      style={{
                        padding: '8px 10px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        background: '#fff',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--yellow-light)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                    >
                      <span style={{ fontWeight: 600, fontSize: '12px' }}>{nb.name}</span>
                      <span style={{ fontSize: '11px', color: '#777' }}>
                        {nb.relation_type || 'LINK'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%', marginBottom: '8px' }}
                  onClick={handleRequestTracking}
                  disabled={requestingTrack}
                >
                  📍 {requestingTrack ? 'Requesting...' : 'Request Live Location Tracking'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EVIDENCE RECORDS */}
          {activeTab === 'evidence' && (
            <div style={{ fontSize: '12px' }}>
              <div style={{ marginBottom: '14px' }}>
                <h4 style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>
                  FIRs & Crime History ({ (person.fir_records || []).length })
                </h4>
                {(person.fir_records && person.fir_records.length > 0) ? (
                  person.fir_records.map((fir, i) => (
                    <div key={i} style={{ padding: '8px', borderLeft: '3px solid var(--red)', background: '#fdfafa', marginBottom: '6px' }}>
                      <div style={{ fontWeight: 700 }}>{fir.fir_number} — {fir.police_station}</div>
                      <div style={{ color: '#666', fontSize: '11px' }}>IPC Sections: {fir.sections}</div>
                      <div style={{ marginTop: '4px', color: '#333' }}>{fir.incident_summary}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#888' }}>No FIR filings recorded.</div>
                )}
              </div>

              <div style={{ marginBottom: '14px' }}>
                <h4 style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>
                  Transactions ({ (person.transactions || []).length })
                </h4>
                {(person.transactions && person.transactions.length > 0) ? (
                  person.transactions.slice(0, 5).map((tx, i) => (
                    <div key={i} style={{ padding: '6px 8px', background: '#f9f9f9', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                      <span>₹{Number(tx.amount).toLocaleString()} ({tx.channel})</span>
                      <span style={{ color: '#888' }}>{new Date(tx.timestamp).toLocaleDateString()}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#888' }}>No recorded bank transactions.</div>
                )}
              </div>

              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>
                  Surveillance Reports ({ (person.surveillance || []).length })
                </h4>
                {(person.surveillance && person.surveillance.length > 0) ? (
                  person.surveillance.map((sv, i) => (
                    <div key={i} style={{ padding: '8px', background: '#fafafa', borderLeft: '3px solid var(--black)', marginBottom: '6px' }}>
                      <div style={{ fontWeight: 700 }}>{sv.source} ({new Date(sv.timestamp).toLocaleDateString()})</div>
                      <div style={{ color: '#444', marginTop: '2px' }}>{sv.description}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#888' }}>No surveillance reports filed.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: OVERRIDE SCORE */}
          {activeTab === 'override' && (
            <div>
              <p style={{ fontSize: '12px', color: '#666', lineHeight: 1.4, marginBottom: '14px' }}>
                Investigator override allows manual tuning of suspicion score based on human intelligence.
                All adjustments are logged with mandatory justification for evidentiary integrity.
              </p>
              <form onSubmit={handleOverrideScore}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                    Override Score (0.0 to 1.0)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className="form-input"
                    value={overrideScore}
                    onChange={(e) => setOverrideScore(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                    Justification / Case Notes *
                  </label>
                  <textarea
                    className="form-input"
                    rows="4"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="e.g. Ground informant confirms direct cash delivery to lieutenant on 14-Oct."
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={savingOverride}
                >
                  {savingOverride ? 'Updating Score...' : 'Commit Score Override'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
