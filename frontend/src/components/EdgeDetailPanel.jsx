export default function EdgeDetailPanel({ edge, onClose }) {
  if (!edge) return null;

  return (
    <div className="edge-detail-panel-responsive animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#888' }}>
          Inter-Entity Link Detail
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 800 }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 800,
            padding: '3px 8px',
            borderRadius: '4px',
            background: edge.type === 'TRANSACTION' ? 'var(--yellow)' : edge.type === 'CRIMINAL_HISTORY' ? 'var(--red-light)' : '#f0f0f0',
            color: edge.type === 'CRIMINAL_HISTORY' ? 'var(--red-dark)' : '#1A1A1A',
            border: '1px solid rgba(0,0,0,0.15)',
          }}
        >
          {edge.type}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#444' }}>
          Confidence: {Math.round((edge.confidence || 0.5) * 100)}%
        </span>
      </div>

      <div style={{ background: '#f9f9f9', padding: '10px', borderRadius: '4px', border: '1px solid #eee', fontSize: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#666' }}>Source Node:</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{edge.source}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#666' }}>Target Node:</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{edge.target}</span>
        </div>
        {edge.amount != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#666' }}>Transaction Sum:</span>
            <span style={{ fontWeight: 800, color: 'var(--red-dark)' }}>₹{Number(edge.amount).toLocaleString()}</span>
          </div>
        )}
        {edge.frequency != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#666' }}>Total Call Count:</span>
            <span style={{ fontWeight: 700 }}>{edge.frequency} calls</span>
          </div>
        )}
        {edge.label && (
          <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #ddd', color: '#444' }}>
            {edge.label}
          </div>
        )}
      </div>
    </div>
  );
}
