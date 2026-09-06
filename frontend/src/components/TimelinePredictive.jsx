import { useState, useEffect } from 'react';
import { forecastAPI, timelineAPI } from '../api';

export default function TimelinePredictive({ caseId, onSelectPerson }) {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadForecasts = async () => {
    setLoading(true);
    try {
      const res = await timelineAPI.getPredictedTimeline(caseId);
      setForecasts(res.data || []);
    } catch (err) {
      console.error('Failed to load predictions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForecasts();
  }, [caseId]);

  const handleRunForecast = async () => {
    setRunning(true);
    try {
      const res = await forecastAPI.run(caseId);
      setForecasts(res.data.predictions || []);
    } catch (err) {
      console.error('Failed to run forecast:', err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '20px 16px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid var(--black)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, textTransform: 'uppercase' }}>
            Predictive Future Timeline (Statistical Forecast)
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Local statistical exponential smoothing on communication and mobility trends. No cloud AI required.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleRunForecast}
          disabled={running}
        >
          {running ? 'Computing Trends...' : '⚡ Recompute Forecasts'}
        </button>
      </div>

      {/* Uncertainty Disclaimer Banner as strictly requested by CLAUD2.pdf */}
      <div
        style={{
          background: 'var(--yellow-light)',
          border: '1.5px solid var(--black)',
          borderRadius: '6px',
          padding: '14px 18px',
          marginBottom: '24px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '24px' }}>⚠️</span>
        <div style={{ fontSize: '12px', color: '#1A1A1A', lineHeight: 1.4 }}>
          <strong>Investigator Notice (Evidentiary Standard):</strong> Predictive timelines are mathematical projections based on historical periodicity and frequency anomalies. <em>This is one input among others, not a certainty.</em> Do not use predictive events as primary probable cause without physical corroboration.
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Analyzing time-series trends...</div>
      ) : forecasts.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888', border: '1px dashed #ccc', borderRadius: '6px' }}>
          No forecast anomalies currently detected. Click &quot;Recompute Forecasts&quot; to run time-series projection across all edges.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {forecasts.map((item, idx) => {
            const isIncreasing = item.trend === 'increasing';
            return (
              <div
                key={item.id || idx}
                style={{
                  background: '#FFFFFF',
                  border: '1.5px solid var(--black)',
                  borderLeft: isIncreasing ? '6px solid var(--red)' : '6px solid var(--yellow)',
                  borderRadius: '6px',
                  padding: '18px 20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '3px',
                        background: isIncreasing ? 'var(--red-light)' : 'var(--yellow-light)',
                        color: isIncreasing ? 'var(--red-dark)' : '#1A1A1A',
                        border: '1px solid rgba(0,0,0,0.15)',
                      }}
                    >
                      {item.trend === 'increasing' ? '📈 Surge Expected' : '📉 Anomaly / OpSec Drop'}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#555' }}>
                      Projected Date: {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '+7 Days'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 800 }}>
                    Confidence: {Math.round((item.confidence || 0.6) * 100)}%
                  </div>
                </div>

                <p style={{ margin: '8px 0 0', fontSize: '14px', lineHeight: 1.5, color: '#1A1A1A' }}>
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
