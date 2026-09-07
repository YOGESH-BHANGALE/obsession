import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { casesAPI, graphAPI, detectionAPI } from '../api';
import NetworkGraph from '../components/NetworkGraph';
import CyberInvestigationGraph from '../components/CyberInvestigationGraph';
import HierarchyTree from '../components/HierarchyTree';
import TimelinePast from '../components/TimelinePast';
import TimelinePredictive from '../components/TimelinePredictive';
import PatternAlerts from '../components/PatternAlerts';
import LocationMap from '../components/LocationMap';
import ApprovalsGate from '../components/ApprovalsGate';
import UploadData from '../components/UploadData';
import NodeDetailPanel from '../components/NodeDetailPanel';
import EdgeDetailPanel from '../components/EdgeDetailPanel';
import AIInvestigatorAssistant from '../components/AIInvestigatorAssistant';

export default function CaseView({ user }) {
  const { caseId, tab = 'graph' } = useParams();
  const navigate = useNavigate();

  const [caseInfo, setCaseInfo] = useState(null);
  const [allCases, setAllCases] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [expandingDfs, setExpandingDfs] = useState(false);
  const [graphViewMode, setGraphViewMode] = useState('concentric'); // 'concentric' | 'cyber'
  const [error, setError] = useState('');

  const loadCaseData = async () => {
    try {
      const [cRes, gRes] = await Promise.all([
        casesAPI.get(caseId),
        graphAPI.getGraph(caseId),
      ]);
      setCaseInfo(cRes.data);
      setGraphData(gRes.data);
    } catch (err) {
      console.error('Failed to load case data:', err);
      setError('Failed to load case intelligence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCaseData();
  }, [caseId]);

  useEffect(() => {
    casesAPI.list().then((res) => {
      setAllCases(res.data || []);
    }).catch((err) => console.error('Failed to list cases:', err));
  }, []);

  const handleToggleStandingAuth = async () => {
    try {
      const res = await casesAPI.toggleStandingAuth(caseId);
      setCaseInfo((prev) => ({
        ...prev,
        standing_authorisation: res.data.standing_authorisation,
      }));
    } catch (err) {
      console.error('Failed to toggle standing auth:', err);
    }
  };

  const handleDfsExpansion = async () => {
    setExpandingDfs(true);
    try {
      // Find seed suspect or current selected node
      const seed = (graphData.nodes || []).find((n) => n.is_seed) || (graphData.nodes || [])[0];
      if (!seed) {
        setError('No seed suspect defined. Upload or seed case data first.');
        setExpandingDfs(false);
        return;
      }
      // Trigger pattern run and reload graph
      await detectionAPI.runDetectors(caseId);
      await loadCaseData();
    } catch (err) {
      console.error('DFS expansion error:', err);
    } finally {
      setExpandingDfs(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100%', overflow: 'hidden' }}>
      {/* Top Case Bar */}
      <header
        style={{
          background: 'var(--black)',
          color: '#FFFFFF',
          padding: '10px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm btn-outline"
            style={{ color: '#fff', borderColor: '#444' }}
            onClick={() => navigate('/')}
          >
            ← Cases
          </button>

          {/* Quick Case Switcher Dropdown */}
          <select
            value={caseId}
            onChange={(e) => navigate(`/case/${e.target.value}/graph`)}
            style={{
              background: '#1E293B',
              color: '#F8FAFC',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '11.5px',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
              maxWidth: '280px',
            }}
          >
            <option value="master">🌐 Master Syndicate (All 140 Cases)</option>
            {allCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.case_number ? `${c.case_number} - ` : ''}{c.title}
              </option>
            ))}
          </select>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 800, letterSpacing: '-0.3px' }}>
                {caseInfo?.title || 'Case Intelligence'}
              </h1>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  background: 'var(--yellow)',
                  color: '#000',
                }}
              >
                {caseInfo?.status}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
              Real Entities: <strong>{(graphData.nodes || []).length}</strong> | Real Links: <strong>{(graphData.edges || []).length}</strong>
            </div>
          </div>
        </div>

        {/* Global Case Actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {tab === 'graph' && (
            <div
              style={{
                display: 'flex',
                background: '#1E293B',
                borderRadius: '6px',
                padding: '2px',
                border: '1px solid #334155',
              }}
            >
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: graphViewMode === 'concentric' ? '#2563EB' : 'transparent',
                  color: graphViewMode === 'concentric' ? '#FFF' : '#94A3B8',
                  border: 'none',
                  fontSize: '11px',
                  padding: '4px 8px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={() => setGraphViewMode('concentric')}
              >
                ⭕ Concentric Graph
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: graphViewMode === 'cyber' ? '#2563EB' : 'transparent',
                  color: graphViewMode === 'cyber' ? '#FFF' : '#94A3B8',
                  border: 'none',
                  fontSize: '11px',
                  padding: '4px 8px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={() => setGraphViewMode('cyber')}
              >
                ⚡ Link Graph (ELK)
              </button>
            </div>
          )}

          <button
            className="btn btn-sm btn-accent"
            onClick={handleDfsExpansion}
            disabled={expandingDfs}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <span>⚡</span> {expandingDfs ? 'Expanding...' : 'Gated Traversal'}
          </button>

          <button
            className="btn btn-sm"
            style={{
              background: tab === 'assistant' ? '#38BDF8' : 'rgba(56, 189, 248, 0.15)',
              color: tab === 'assistant' ? '#0F172A' : '#38BDF8',
              border: '1px solid #38BDF8',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              boxShadow: tab === 'assistant' ? '0 0 12px rgba(56, 189, 248, 0.4)' : 'none',
            }}
            onClick={() => navigate(`/case/${caseId}/assistant`)}
          >
            <span>🤖</span> AI Assistant
          </button>

          <button
            className={`btn btn-sm ${caseInfo?.standing_authorisation ? 'btn-accent' : 'btn-outline'}`}
            style={{ color: caseInfo?.standing_authorisation ? '#000' : '#fff', borderColor: '#555' }}
            onClick={handleToggleStandingAuth}
          >
            Auth: {caseInfo?.standing_authorisation ? 'ON' : 'OFF'}
          </button>
        </div>
      </header>

      {/* Case Views Horizontal Tab Strip */}
      <nav className="case-tabs-scroll" aria-label="Case View Tabs">
        {[
          { id: 'graph', label: 'Network Graph', icon: '🕸️' },
          { id: 'assistant', label: 'AI Assistant', icon: '🤖' },
          { id: 'hierarchy', label: 'Hierarchy', icon: '🏛️' },
          { id: 'timeline', label: 'Past Timeline', icon: '⏱️' },
          { id: 'predicted', label: 'Predictive', icon: '🔮' },
          { id: 'alerts', label: 'Pattern Alerts', icon: '⚡' },
          { id: 'map', label: 'Locations', icon: '📍' },
          { id: 'approvals', label: 'Approvals', icon: '✅' },
          { id: 'upload', label: 'Upload Data', icon: '📁' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`case-tab-pill ${tab === item.id ? 'active' : ''}`}
            onClick={() => navigate(`/case/${caseId}/${item.id}`)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Main View Area */}
      <main style={{ flex: 1, position: 'relative', overflow: tab === 'graph' ? 'hidden' : 'auto', background: '#F8F9FA' }}>
        {tab === 'graph' && (
          graphViewMode === 'cyber' ? (
            <CyberInvestigationGraph
              graphData={graphData}
              caseInfo={caseInfo}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                setSelectedEdge(null);
              }}
              onSelectEdge={(edge) => {
                setSelectedEdge(edge);
                setSelectedNodeId(null);
              }}
              selectedNodeId={selectedNodeId}
              onDfsExpand={handleDfsExpansion}
              standingAuth={caseInfo?.standing_authorisation}
            />
          ) : (
            <NetworkGraph
              caseId={caseId}
              graphData={graphData}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                setSelectedEdge(null);
              }}
              onSelectEdge={(edge) => {
                setSelectedEdge(edge);
                setSelectedNodeId(null);
              }}
              selectedNodeId={selectedNodeId}
              onDfsExpand={handleDfsExpansion}
              standingAuth={caseInfo?.standing_authorisation}
            />
          )
        )}

        {tab === 'hierarchy' && (
          <HierarchyTree
            caseId={caseId}
            onSelectPerson={(id) => {
              setSelectedNodeId(id);
              navigate(`/case/${caseId}/graph`);
            }}
          />
        )}

        {tab === 'timeline' && (
          <TimelinePast
            caseId={caseId}
            onSelectPerson={(id) => {
              setSelectedNodeId(id);
              navigate(`/case/${caseId}/graph`);
            }}
          />
        )}

        {tab === 'predicted' && (
          <TimelinePredictive
            caseId={caseId}
            onSelectPerson={(id) => {
              setSelectedNodeId(id);
              navigate(`/case/${caseId}/graph`);
            }}
          />
        )}

        {tab === 'alerts' && (
          <PatternAlerts
            caseId={caseId}
            onSelectPerson={(id) => {
              setSelectedNodeId(id);
              navigate(`/case/${caseId}/graph`);
            }}
          />
        )}

        {tab === 'map' && (
          <LocationMap
            caseId={caseId}
            selectedPersonId={selectedNodeId}
          />
        )}

        {tab === 'approvals' && (
          <ApprovalsGate
            caseId={caseId}
            standingAuth={caseInfo?.standing_authorisation}
            onToggleStandingAuth={handleToggleStandingAuth}
            user={user}
          />
        )}

        {tab === 'upload' && (
          <UploadData
            caseId={caseId}
            onDataIngested={loadCaseData}
          />
        )}

        {tab === 'assistant' && (
          <AIInvestigatorAssistant
            caseId={caseId}
            caseInfo={caseInfo}
            preselectedPersonId={selectedNodeId}
          />
        )}

        {/* Side Details Panels (used for ELK graph, hierarchy and other views) */}
        {selectedNodeId && (tab !== 'graph' || graphViewMode !== 'concentric') && (
          <NodeDetailPanel
            caseId={caseId}
            personId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
            onSelectPerson={(id) => setSelectedNodeId(id)}
            onScoreUpdated={loadCaseData}
            user={user}
          />
        )}

        {selectedEdge && (
          <EdgeDetailPanel
            edge={selectedEdge}
            onClose={() => setSelectedEdge(null)}
          />
        )}
      </main>
    </div>
  );
}
