import { useState, useEffect } from 'react';
import { approvalsAPI, casesAPI } from '../api';

export default function ApprovalsGate({ caseId, standingAuth, onToggleStandingAuth, user }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState({});

  useEffect(() => {
    loadApprovals();
  }, [caseId]);

  const loadApprovals = async () => {
    setLoading(true);
    try {
      const res = await approvalsAPI.list(caseId);
      setApprovals(res.data || []);
    } catch (err) {
      console.error('Failed to load approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (approvalId, status) => {
    setActing((prev) => ({ ...prev, [approvalId]: true }));
    try {
      await approvalsAPI.decide(caseId, approvalId, status);
      setApprovals((prev) =>
        prev.map((a) => (a.id === approvalId ? { ...a, status } : a))
      );
    } catch (err) {
      console.error('Failed to commit decision:', err);
    } finally {
      setActing((prev) => ({ ...prev, [approvalId]: false }));
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '20px 16px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid var(--black)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, textTransform: 'uppercase' }}>
            Investigator Approval Gate & Warrant Authorisation
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Bounded DFS traversal candidate vetting and elevated surveillance authorisation queue
          </p>
        </div>

        {/* Standing Authorisation Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f5f5f5', padding: '8px 16px', borderRadius: '6px', border: '1px solid #ccc' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800 }}>Standing Authorisation</div>
            <div style={{ fontSize: '10px', color: '#666' }}>Auto-expand candidates &gt;50%</div>
          </div>
          <button
            className={`btn btn-sm ${standingAuth ? 'btn-accent' : 'btn-outline'}`}
            onClick={onToggleStandingAuth}
          >
            {standingAuth ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading authorisation queue...</div>
      ) : approvals.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#888', border: '1px dashed #ccc', borderRadius: '6px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>Authorisation Queue Clear</h3>
          <p style={{ fontSize: '13px', color: '#666' }}>
            No pending warrants or candidate approvals required at this time.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {approvals.map((req) => {
            const isPending = req.status === 'pending';
            return (
              <div
                key={req.id}
                style={{
                  background: '#FFFFFF',
                  border: '1.5px solid var(--black)',
                  borderLeft: isPending ? '6px solid var(--yellow)' : req.status === 'approved' ? '6px solid #2e7d32' : '6px solid var(--red)',
                  borderRadius: '6px',
                  padding: '18px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        background: isPending ? 'var(--yellow-light)' : '#f0f0f0',
                        border: '1px solid rgba(0,0,0,0.15)',
                      }}
                    >
                      {req.request_type || 'DFS EXPANSION'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      Submitted: {new Date(req.created_at || Date.now()).toLocaleDateString()}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: req.status === 'approved' ? '#2e7d32' : req.status === 'rejected' ? 'var(--red)' : '#b26a00' }}>
                      ● {req.status}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 800 }}>
                    Target: {req.person_name || req.person_id}
                  </h3>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Justification: {req.justification || 'Candidate identified at depth boundary; requires manual investigator confirmation to expand network.'}
                  </p>
                </div>

                {isPending && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleDecision(req.id, 'approved')}
                      disabled={acting[req.id]}
                    >
                      ✓ Approve
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleDecision(req.id, 'rejected')}
                      disabled={acting[req.id]}
                      style={{ color: 'var(--red)' }}
                    >
                      ✕ Reject
                    </button>
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
