import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

export default function NetworkGraph({
  graphData,
  onSelectNode,
  onSelectEdge,
  selectedNodeId,
  onDfsExpand,
  standingAuth,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [layoutName, setLayoutName] = useState('concentric');
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);

  // Initialize and update Cytoscape graph
  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    // Destroy existing instance
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    // Prepare elements
    const elements = [];

    // Filter nodes if needed
    (graphData.nodes || []).forEach((node) => {
      const score = node.suspicion_score || 0;
      const isPruned = score < 0.25 && !node.is_seed;
      const band = node.confidence_band || (score >= 0.75 ? 'inner' : score >= 0.5 ? 'middle' : score >= 0.25 ? 'outer' : 'pruned');

      // Pivot filtering
      if (filterType === 'CRIMINAL' && !node.criminal_history_flag) return;
      if (filterType === 'INNER' && band !== 'inner') return;
      if (filterType === 'HIGH_SUSPICION' && score < 0.6) return;

      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          name: isPruned ? '?' : node.name,
          fullName: node.name,
          initials: node.initials || node.name.slice(0, 2).toUpperCase(),
          score: Math.round(score * 100),
          band: band,
          criminal: node.criminal_history_flag,
          isSeed: node.is_seed,
          explored: node.explored,
          photoUrl: node.photo_url || '',
          phone: (node.phone_numbers || [])[0] || '',
        },
      });
    });

    // Edges
    const validNodeIds = new Set(elements.map((e) => e.data.id));
    (graphData.edges || []).forEach((edge, idx) => {
      if (!validNodeIds.has(edge.source) || !validNodeIds.has(edge.target)) return;
      const evType = edge.evidence_type || 'CALL';
      if (filterType === 'CALLS' && evType !== 'CALL') return;
      if (filterType === 'TRANSACTIONS' && evType !== 'TRANSACTION') return;

      elements.push({
        group: 'edges',
        data: {
          id: edge.id || `edge-${idx}`,
          source: edge.source,
          target: edge.target,
          type: evType,
          confidence: edge.confidence || 0.5,
          amount: edge.amount,
          frequency: edge.frequency,
          label: evType === 'TRANSACTION' && edge.amount
            ? `₹${Number(edge.amount).toLocaleString()}`
            : evType === 'CALL' && edge.frequency
            ? `${edge.frequency} calls`
            : evType,
        },
      });
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      boxSelectionEnabled: false,
      autounselectify: false,
      wheelSensitivity: 0.35, // Responsive, fast wheel zoom
      minZoom: 0.15,
      maxZoom: 3.5,
      pixelRatio: 'auto',
      textureOnViewport: true, // Hardware-accelerated snapshot during active zoom
      motionBlur: false,
      style: [
        // Node base
        {
          selector: 'node',
          style: {
            'width': 64,
            'height': 64,
            'background-color': '#FFFFFF',
            'border-width': 2.5,
            'border-color': '#1A1A1A',
            'label': 'data(name)',
            'font-family': 'Inter, sans-serif',
            'font-size': 12,
            'font-weight': 600,
            'color': '#1A1A1A',
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 0.85,
            'text-background-padding': 3,
            'text-background-shape': 'roundrectangle',
            'transition-property': 'border-width, border-color, width, height',
            'transition-duration': '0.15s',
          },
        },
        // Inner zone node (>75%) - Yellow Core
        {
          selector: 'node[band = "inner"]',
          style: {
            'background-color': '#FFD600',
            'border-width': 3.5,
            'border-color': '#1A1A1A',
            'width': 74,
            'height': 74,
            'font-weight': 700,
          },
        },
        // Middle zone node (50-75%) - Light Yellow
        {
          selector: 'node[band = "middle"]',
          style: {
            'background-color': '#FFF9C4',
            'border-width': 2.5,
            'border-color': '#333333',
            'width': 66,
            'height': 66,
          },
        },
        // Outer zone node (25-50%) - White Clean
        {
          selector: 'node[band = "outer"]',
          style: {
            'background-color': '#FFFFFF',
            'border-width': 2,
            'border-color': '#666666',
            'width': 58,
            'height': 58,
          },
        },
        // Pruned / Innocent (<25%) - Question Mark Placeholder outside ring
        {
          selector: 'node[band = "pruned"]',
          style: {
            'background-color': '#F0F0F0',
            'border-style': 'dashed',
            'border-width': 1.5,
            'border-color': '#999999',
            'color': '#888888',
            'width': 46,
            'height': 46,
            'font-size': 10,
          },
        },
        // Criminal History Badge - Red Border
        {
          selector: 'node[criminal]',
          style: {
            'border-color': '#E53935',
            'border-width': 4,
          },
        },
        // Seed Suspect Indicator - Double Border & Yellow Glow
        {
          selector: 'node[isSeed]',
          style: {
            'border-style': 'double',
            'border-width': 6,
            'border-color': '#1A1A1A',
          },
        },
        // Selected Node Highlight
        {
          selector: 'node:selected',
          style: {
            'border-color': '#E53935',
            'border-width': 5,
            'width': 82,
            'height': 82,
          },
        },
        // Edge base
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#888888',
            'curve-style': 'bezier',
            'target-arrow-shape': 'none',
            'opacity': 0.85,
            'font-family': 'Inter, sans-serif',
            'font-size': 10,
            'color': '#333333',
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 0.9,
            'text-background-padding': 2,
            'text-rotation': 'autorotate',
            // Zoom-gated: Edge label visible only on hover or select by default
            'label': '',
          },
        },
        // Edge types
        {
          selector: 'edge[type = "TRANSACTION"]',
          style: {
            'line-color': '#FFB300',
            'width': 3,
            'line-style': 'solid',
          },
        },
        {
          selector: 'edge[type = "CRIMINAL_HISTORY"]',
          style: {
            'line-color': '#E53935',
            'width': 3.5,
            'line-style': 'solid',
          },
        },
        {
          selector: 'edge[type = "SURVEILLANCE"]',
          style: {
            'line-color': '#1A1A1A',
            'width': 2,
            'line-style': 'dashed',
          },
        },
        {
          selector: 'edge[type = "SOCIAL_MEDIA"]',
          style: {
            'line-color': '#757575',
            'width': 1.5,
            'line-style': 'dotted',
          },
        },
        // Zoom-gated edge labels shown cleanly when zoomed in
        {
          selector: 'edge.zoomed-labels',
          style: {
            'label': 'data(label)',
          },
        },
        // Edge selected or hovered
        {
          selector: 'edge:selected',
          style: {
            'width': 4.5,
            'line-color': '#E53935',
            'label': 'data(label)',
            'z-index': 999,
          },
        },
      ],
    });

    // Apply spacious layout
    applyLayout(cy, layoutName);

    // Zoom listener for zoom-gated edge labels (class toggle only — zero React state lag)
    let isZoomedIn = false;
    cy.on('zoom', () => {
      const z = cy.zoom();
      const nowZoomed = z > 1.25;
      if (nowZoomed !== isZoomedIn) {
        isZoomedIn = nowZoomed;
        if (nowZoomed) {
          cy.edges().addClass('zoomed-labels');
        } else {
          cy.edges().removeClass('zoomed-labels');
        }
      }
    });

    // Click events
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      if (onSelectNode) {
        onSelectNode(node.data('id'));
      }
    });

    cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      edge.style('label', edge.data('label'));
      if (onSelectEdge) {
        onSelectEdge(edge.data());
      }
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        if (onSelectNode) onSelectNode(null);
        if (onSelectEdge) onSelectEdge(null);
      }
    });

    cyRef.current = cy;

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [graphData, filterType]);

  // Layout switcher
  const applyLayout = (cy, type) => {
    if (!cy) return;
    let layoutConfig = {};

    if (type === 'concentric') {
      layoutConfig = {
        name: 'concentric',
        concentric: (node) => {
          const band = node.data('band');
          if (band === 'inner') return 4;
          if (band === 'middle') return 3;
          if (band === 'outer') return 2;
          return 1;
        },
        levelWidth: () => 1,
        minNodeSpacing: 95, // SPACIOUS padding
        spacingFactor: 1.6, // Broad spacious rings
        animate: true,
        animationDuration: 500,
      };
    } else if (type === 'cose') {
      layoutConfig = {
        name: 'cose',
        idealEdgeLength: 120,
        nodeOverlap: 40,
        refresh: 20,
        fit: true,
        padding: 50,
        randomize: false,
        componentSpacing: 140,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 60,
        numIter: 1000,
        animate: true,
      };
    } else if (type === 'circle') {
      layoutConfig = {
        name: 'circle',
        padding: 60,
        spacingFactor: 1.4,
        animate: true,
      };
    } else if (type === 'breadthfirst') {
      layoutConfig = {
        name: 'breadthfirst',
        directed: false,
        padding: 60,
        spacingFactor: 1.6,
        animate: true,
      };
    }

    const layout = cy.layout(layoutConfig);
    layout.run();
  };

  const handleLayoutChange = (newLayout) => {
    setLayoutName(newLayout);
    if (cyRef.current) {
      applyLayout(cyRef.current, newLayout);
    }
  };

  // Search & Highlight
  const handleSearch = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!cyRef.current) return;
    const cy = cyRef.current;

    if (!q.trim()) {
      cy.elements().removeClass('dimmed').removeClass('highlighted');
      return;
    }

    const matched = cy.nodes().filter((n) =>
      n.data('fullName')?.toLowerCase().includes(q.toLowerCase()) ||
      n.data('phone')?.includes(q)
    );

    if (matched.length > 0) {
      cy.elements().addClass('dimmed');
      matched.removeClass('dimmed').addClass('highlighted');
      matched.neighborhood().removeClass('dimmed');
      cy.animate({
        center: { eles: matched },
        zoom: 1.2,
        duration: 300,
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Top Controls Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#FFFFFF',
          borderBottom: '1px solid var(--black)',
          zIndex: 10,
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        {/* Left: Layout & View Options */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Layout:
          </span>
          {['concentric', 'cose', 'circle', 'breadthfirst'].map((lt) => (
            <button
              key={lt}
              className={`btn btn-sm ${layoutName === lt ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleLayoutChange(lt)}
              style={{ textTransform: 'capitalize' }}
            >
              {lt === 'concentric' ? '🎯 Concentric Zones' : lt === 'cose' ? '🕸️ Force' : lt}
            </button>
          ))}
        </div>

        {/* Center: Pivot Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Filter:
          </span>
          {[
            { id: 'ALL', label: 'All Entities' },
            { id: 'INNER', label: 'Inner Core (>75%)' },
            { id: 'CRIMINAL', label: 'Criminal Records' },
            { id: 'TRANSACTIONS', label: 'Financial Hawala' },
            { id: 'CALLS', label: 'Calls Only' },
          ].map((flt) => (
            <button
              key={flt.id}
              className={`btn btn-sm ${filterType === flt.id ? 'btn-accent' : 'btn-outline'}`}
              onClick={() => setFilterType(flt.id)}
            >
              {flt.label}
            </button>
          ))}
        </div>

        {/* Right: Search & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            className="form-input form-input-sm"
            placeholder="🔍 Find suspect or phone..."
            value={searchQuery}
            onChange={handleSearch}
            style={{ width: '180px' }}
          />
          <button
            className="btn btn-sm btn-outline"
            title="Zoom In (+25%)"
            onClick={() => {
              if (cyRef.current) {
                const cy = cyRef.current;
                cy.zoom({
                  level: cy.zoom() * 1.25,
                  renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
                });
              }
            }}
          >
            ➕ In
          </button>
          <button
            className="btn btn-sm btn-outline"
            title="Zoom Out (-25%)"
            onClick={() => {
              if (cyRef.current) {
                const cy = cyRef.current;
                cy.zoom({
                  level: cy.zoom() / 1.25,
                  renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
                });
              }
            }}
          >
            ➖ Out
          </button>
          <button
            className="btn btn-sm btn-outline"
            title="Reset Zoom to 100%"
            onClick={() => cyRef.current && cyRef.current.reset()}
          >
            100%
          </button>
          <button
            className="btn btn-sm btn-outline"
            title="Fit all nodes"
            onClick={() => cyRef.current && cyRef.current.fit(null, 50)}
          >
            ⛶ Fit
          </button>
        </div>
      </div>

      {/* Main Spacious Canvas Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          minHeight: '650px',
          background: '#FAFAFA',
          position: 'relative',
        }}
      />

      {/* Floating Concentric Legend Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          background: 'rgba(255, 255, 255, 0.95)',
          border: '1.5px solid var(--black)',
          borderRadius: '6px',
          padding: '12px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          fontSize: '11px',
          zIndex: 10,
          pointerEvents: 'none',
          maxWidth: '300px',
        }}
      >
        <div style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
          Concentric Confidence Rings
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'var(--yellow)', border: '1.5px solid #1A1A1A' }} />
          <span><strong>Inner Zone:</strong> &gt;75% Suspicion (Syndicate Core)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'var(--yellow-light)', border: '1.5px solid #333' }} />
          <span><strong>Middle Zone:</strong> 50–75% (Active Operatives)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#FFFFFF', border: '1.5px solid #666' }} />
          <span><strong>Outer Zone:</strong> 25–50% (Peripherals)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#EEE', border: '1px dashed #999', textAlign: 'center', lineHeight: '14px', fontSize: '9px', fontWeight: 800 }}>?</div>
          <span><strong>Pruned:</strong> &lt;25% (Innocents Placeholder)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', paddingTop: '4px', borderTop: '1px dashed #ddd' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#fff', border: '3px solid #E53935' }} />
          <span><strong>Red Border:</strong> Prior Criminal Record</span>
        </div>
      </div>

      {/* Floating Traversal Info / Status */}
      <div
        style={{
          position: 'absolute',
          top: '60px',
          right: '20px',
          background: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid var(--black)',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '11px',
          zIndex: 10,
        }}
      >
        <div style={{ fontWeight: 700 }}>
          Nodes: <strong>{(graphData?.nodes || []).length}</strong> | Edges: <strong>{(graphData?.edges || []).length}</strong>
        </div>
        <div style={{ color: zoomLevel > 1.3 ? '#2e7d32' : '#666', marginTop: '2px', fontSize: '10px' }}>
          {zoomLevel > 1.3 ? '✓ Detailed edge labels active' : 'ℹ Zoom in to reveal edge labels'}
        </div>
      </div>
    </div>
  );
}
