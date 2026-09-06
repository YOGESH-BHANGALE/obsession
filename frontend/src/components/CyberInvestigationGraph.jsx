/**
 * CyberInvestigationGraph.jsx
 * 
 * Interactive Cyber Crime Investigation Link Analysis & Knowledge Graph.
 * Built with React Flow + ELK.js for automatic crossing-minimized layered layouts.
 * 
 * Simplification & Usability Highlights:
 * - Default: Clean 7-suspect syndicate hierarchy (matches the high clarity of concentric rings)
 * - Zero artificial clutter: Digital footprints (SIMs, IMEI, wallets, FIRs) are embedded inside suspect cards
 * - Clear, high-visibility semantic edge badges (e.g. ₹12.5L Hawala, 18 calls burst, Co-Accused)
 * - Selective on-demand satellite expansion for individual suspects
 * - Quick search & focus, evidence filters, and directional layout toggle
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CyberNode from './graph/CyberNode';
import CyberEdge from './graph/CyberEdge';
import { calculateElkLayout } from './graph/elkLayout';
import { buildCyberGraph } from './graph/cyberGraphAdapter';

const nodeTypes = {
  cyberNode: CyberNode,
};

const edgeTypes = {
  cyberEdge: CyberEdge,
};

export default function CyberInvestigationGraph({
  graphData,
  caseInfo,
  onSelectNode,
  onSelectEdge,
  selectedNodeId,
  onDfsExpand,
  standingAuth,
}) {
  const [layoutDirection, setLayoutDirection] = useState('RIGHT'); // 'RIGHT' or 'DOWN'
  const [edgeRouting, setEdgeRouting] = useState('ORTHOGONAL'); // 'ORTHOGONAL' or 'SPLINES'
  const [viewMode, setViewMode] = useState('syndicate'); // 'syndicate' | 'expanded' | 'full'
  const [edgeFilter, setEdgeFilter] = useState('ALL'); // 'ALL' | 'TRANSACTION' | 'CALL' | 'FIR' | 'SURVEILLANCE'
  const [searchQuery, setSearchQuery] = useState('');
  const [isComputingLayout, setIsComputingLayout] = useState(false);
  const [activeExpandedSuspect, setActiveExpandedSuspect] = useState(selectedNodeId || null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // Sync selectedNodeId prop if changed from outside
  useEffect(() => {
    if (selectedNodeId) {
      setActiveExpandedSuspect(selectedNodeId);
    }
  }, [selectedNodeId]);

  // Compute ELK Layout
  const runLayout = useCallback(async () => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return;
    setIsComputingLayout(true);

    try {
      // 1. Build clean cyber entities
      const { nodes: rawNodes, edges: rawEdges } = buildCyberGraph(graphData, caseInfo, {
        mode: viewMode,
        expandedSuspectId: activeExpandedSuspect,
        edgeFilter,
        layoutDirection,
      });

      // Format edges with matching markers
      const formattedEdges = rawEdges.map((e) => ({
        ...e,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: e.data?.badgeColor || '#64748B',
          width: 14,
          height: 14,
        },
      }));

      // 2. Compute ELK layered layout
      const { nodes: layoutedNodes, edges: layoutedEdges } = await calculateElkLayout(
        rawNodes,
        formattedEdges,
        {
          direction: layoutDirection,
          edgeRouting,
        }
      );

      // Highlight selected node
      const activeId = activeExpandedSuspect || selectedNodeId;
      const finalNodes = layoutedNodes.map((n) => ({
        ...n,
        selected: n.id === activeId,
      }));

      setNodes(finalNodes);
      setEdges(layoutedEdges);

      // Smooth auto-fit
      if (reactFlowInstance) {
        setTimeout(() => {
          reactFlowInstance.fitView({ padding: 0.18, duration: 400 });
        }, 60);
      }
    } catch (err) {
      console.error('Error running ELK layout:', err);
    } finally {
      setIsComputingLayout(false);
    }
  }, [
    graphData,
    caseInfo,
    viewMode,
    activeExpandedSuspect,
    edgeFilter,
    layoutDirection,
    edgeRouting,
    reactFlowInstance,
    selectedNodeId,
  ]);

  // Re-run layout when dependencies change
  useEffect(() => {
    runLayout();
  }, [runLayout]);

  // Handle Node Click
  const handleNodeClick = useCallback(
    (event, node) => {
      const pId = node.id;
      setActiveExpandedSuspect(pId);

      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: n.id === pId,
        }))
      );

      if (node.data?.category === 'PERSON' && onSelectNode) {
        onSelectNode(pId);
      }
    },
    [onSelectNode, setNodes]
  );

  // Handle Edge Click
  const handleEdgeClick = useCallback(
    (event, edge) => {
      if (onSelectEdge) {
        onSelectEdge({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          ...edge.data,
        });
      }
    },
    [onSelectEdge]
  );

  // Search & Focus on Node
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !reactFlowInstance) return;

    const query = searchQuery.toLowerCase().trim();
    const matchedNode = nodes.find(
      (n) =>
        n.data?.title?.toLowerCase().includes(query) ||
        n.data?.primaryValue?.toLowerCase().includes(query) ||
        n.data?.digitalFootprint?.phone?.includes(query) ||
        n.id.toLowerCase().includes(query)
    );

    if (matchedNode) {
      setActiveExpandedSuspect(matchedNode.id);
      reactFlowInstance.setCenter(
        matchedNode.position.x + 120,
        matchedNode.position.y + 60,
        { zoom: 1.25, duration: 500 }
      );
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: n.id === matchedNode.id,
        }))
      );
      if (onSelectNode) {
        onSelectNode(matchedNode.id);
      }
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0B0F19',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* ─── Clean Top Control Toolbar ─── */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.96)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '10px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          zIndex: 30,
        }}
      >
        {/* Left: Search + View Modes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Quick Search */}
          <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '10px',
                  color: '#64748B',
                  fontSize: '12px',
                }}
              >
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find suspect or phone..."
                style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '5px 10px 5px 30px',
                  color: '#F8FAFC',
                  fontSize: '12px',
                  width: '180px',
                  outline: 'none',
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                marginLeft: '6px',
                background: '#2563EB',
                color: '#fff',
                border: 'none',
                padding: '5px 10px',
                fontSize: '11px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Focus
            </button>
          </form>

          {/* View Mode: Syndicate Hierarchy vs Expand */}
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
              onClick={() => setViewMode('syndicate')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                background: viewMode === 'syndicate' ? '#2563EB' : 'transparent',
                color: viewMode === 'syndicate' ? '#FFF' : '#94A3B8',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Clean 7-person syndicate hierarchy (Clean like concentric rings)"
            >
              <span>🎯</span>
              <span>Syndicate Hierarchy</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('expanded')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                background: viewMode === 'expanded' ? '#0891B2' : 'transparent',
                color: viewMode === 'expanded' ? '#FFF' : '#94A3B8',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Expand digital assets (phones, device, wallet) for selected suspect"
            >
              <span>🔍</span>
              <span>Expand Selected Assets</span>
            </button>
          </div>

          {/* Direction Toggle */}
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
              onClick={() => setLayoutDirection('RIGHT')}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                background: layoutDirection === 'RIGHT' ? '#3B82F6' : 'transparent',
                color: layoutDirection === 'RIGHT' ? '#FFF' : '#94A3B8',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              title="Horizontal Left-to-Right Layered Layout"
            >
              ➔ Horizontal
            </button>
            <button
              type="button"
              onClick={() => setLayoutDirection('DOWN')}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                background: layoutDirection === 'DOWN' ? '#3B82F6' : 'transparent',
                color: layoutDirection === 'DOWN' ? '#FFF' : '#94A3B8',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              title="Vertical Top-to-Bottom Hierarchy Layout"
            >
              ↓ Vertical
            </button>
          </div>

          {/* Edge Routing Toggle */}
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
              onClick={() => setEdgeRouting('ORTHOGONAL')}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                background: edgeRouting === 'ORTHOGONAL' ? '#0891B2' : 'transparent',
                color: edgeRouting === 'ORTHOGONAL' ? '#FFF' : '#94A3B8',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              title="Clean 90° Orthogonal Routing"
            >
              ⮑ Orthogonal
            </button>
            <button
              type="button"
              onClick={() => setEdgeRouting('SPLINES')}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                background: edgeRouting === 'SPLINES' ? '#0891B2' : 'transparent',
                color: edgeRouting === 'SPLINES' ? '#FFF' : '#94A3B8',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              title="Smooth Bezier Splines"
            >
              ~ Splines
            </button>
          </div>
        </div>

        {/* Right: Metrics + Fit View */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isComputingLayout && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#38BDF8',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  border: '2px solid #38BDF8',
                  borderTopColor: 'transparent',
                  animation: 'spin 1s linear infinite',
                }}
              />
              ELK Optimizing Layout...
            </div>
          )}

          <div style={{ fontSize: '11px', color: '#94A3B8' }}>
            Suspects: <strong style={{ color: '#F8FAFC' }}>{nodes.length}</strong> | Links:{' '}
            <strong style={{ color: '#F8FAFC' }}>{edges.length}</strong>
          </div>

          <button
            type="button"
            onClick={() => reactFlowInstance?.fitView({ padding: 0.18, duration: 400 })}
            style={{
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 700,
              background: '#334155',
              color: '#F8FAFC',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            ⤢ Fit View
          </button>
        </div>
      </div>

      {/* ─── Evidence Category Filter Strip ─── */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.88)',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          zIndex: 25,
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 800,
            textTransform: 'uppercase',
            color: '#64748B',
            letterSpacing: '0.4px',
          }}
        >
          Evidence Filter:
        </span>

        {[
          { id: 'ALL', label: 'All Links', icon: '⚡' },
          { id: 'TRANSACTION', label: 'Financial Hawala Transfers', icon: '💸' },
          { id: 'CALL', label: 'Phone Calls (CDRs)', icon: '📞' },
          { id: 'FIR', label: 'Co-Accused & Prior FIRs', icon: '⚖️' },
          { id: 'SURVEILLANCE', label: 'Physical Meetups', icon: '📍' },
          { id: 'SOCIAL_MEDIA', label: 'Encrypted Telegram C2', icon: '💬' },
        ].map((flt) => {
          const isActive = edgeFilter === flt.id;
          return (
            <button
              key={flt.id}
              type="button"
              onClick={() => setEdgeFilter(flt.id)}
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: '12px',
                background: isActive ? '#2563EB' : 'rgba(255, 255, 255, 0.04)',
                color: isActive ? '#FFFFFF' : '#94A3B8',
                border: `1px solid ${isActive ? '#3B82F6' : 'rgba(255, 255, 255, 0.08)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{flt.icon}</span>
              <span>{flt.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Main React Flow Canvas ─── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={setReactFlowInstance}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.2}
          maxZoom={2.4}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1E293B" gap={28} size={1.2} />
          <Controls
            style={{
              background: '#0F172A',
              border: '1px solid #334155',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          />
          <MiniMap
            nodeColor={(n) => {
              if (n.data?.isSeed) return '#FFD600';
              if (n.data?.criminalHistory) return '#EF4444';
              if (n.data?.confidenceBand === 'middle') return '#FBBF24';
              return '#64748B';
            }}
            maskColor="rgba(11, 15, 25, 0.75)"
            style={{
              background: '#0F172A',
              border: '1px solid #334155',
              borderRadius: '8px',
            }}
          />
        </ReactFlow>

        {/* ─── Floating Concentric & Hierarchy Legend ─── */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '8px',
            padding: '12px 14px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
            fontSize: '11px',
            zIndex: 10,
            pointerEvents: 'none',
            maxWidth: '310px',
            color: '#E2E8F0',
          }}
        >
          <div
            style={{
              fontWeight: 800,
              textTransform: 'uppercase',
              marginBottom: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              paddingBottom: '4px',
              color: '#38BDF8',
              letterSpacing: '0.4px',
            }}
          >
            Syndicate Hierarchy &amp; Zone Legend
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#FFD600',
                border: '1.5px solid #1A1A1A',
              }}
            />
            <span>
              <strong style={{ color: '#FFD600' }}>Inner Core / Mastermind:</strong> &gt;75% Risk (Vikram)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#FBBF24',
                border: '1.5px solid #1E293B',
              }}
            />
            <span>
              <strong style={{ color: '#FBBF24' }}>Middle Operatives:</strong> 40–75% (Karan, Rohan, Pooja)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#94A3B8',
                border: '1.5px solid #1E293B',
              }}
            />
            <span>
              <strong style={{ color: '#CBD5E1' }}>Outer Peripherals:</strong> Couriers &amp; Mule accts
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '6px',
              paddingTop: '6px',
              borderTop: '1px dashed rgba(255, 255, 255, 0.1)',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#0F172A',
                border: '2.5px solid #EF4444',
              }}
            />
            <span>
              <strong style={{ color: '#F87171' }}>Red Border:</strong> Prior Criminal FIR Flag
            </span>
          </div>
        </div>

        {/* ─── Selected Suspect Quick Action Banner ─── */}
        {activeExpandedSuspect && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(15, 23, 42, 0.94)',
              backdropFilter: 'blur(10px)',
              border: '1px solid #38BDF8',
              borderRadius: '8px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              zIndex: 20,
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: '11px', color: '#CBD5E1' }}>
              Selected: <strong style={{ color: '#FFFFFF' }}>{nodes.find(n => n.id === activeExpandedSuspect)?.data?.title || activeExpandedSuspect}</strong>
            </div>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'expanded' ? 'syndicate' : 'expanded')}
              style={{
                background: viewMode === 'expanded' ? '#EF4444' : '#0891B2',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '10.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {viewMode === 'expanded' ? 'Collapse Assets' : 'Expand Footprint'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
