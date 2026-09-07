/**
 * elkLayout.js
 * 
 * High-performance automated graph layout and edge routing using ELK.js (Eclipse Layout Kernel).
 * Uses Layered Sugiyama algorithm with crossing minimization (LAYER_SWEEP)
 * and Brandes-Kopf node placement to eliminate overlaps and minimize edge crossings.
 */

import ELK_BUNDLE from 'elkjs/lib/elk.bundled.js';
import { Position } from '@xyflow/react';

const ELK = ELK_BUNDLE?.default || ELK_BUNDLE;
const elk = new ELK();

/**
 * Calculates automated layered layout for nodes and edges
 * 
 * @param {Array} nodes - React Flow nodes
 * @param {Array} edges - React Flow edges
 * @param {Object} options - { direction: 'RIGHT' | 'DOWN', edgeRouting: 'ORTHOGONAL' | 'SPLINES' }
 * @returns {Promise<{ nodes: Array, edges: Array }>}
 */
export async function calculateElkLayout(nodes, edges, options = {}) {
  const {
    direction = 'RIGHT', // 'RIGHT' (LR) or 'DOWN' (TB)
    edgeRouting = 'ORTHOGONAL', // 'ORTHOGONAL' or 'SPLINES'
  } = options;

  if (!nodes || nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const isHorizontal = direction === 'RIGHT';

  const elkLayoutOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.edgeRouting': edgeRouting,
    // Crossing minimization using sweeping layers
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.crossingMinimization.greedySwitchCrossingMinimization.activationThreshold': '1',
    // Node placement using Brandes-Koepf for clean alignment and minimal bends
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    // Cycle breaking strategy
    'elk.layered.cycleBreaking.strategy': 'GREEDY',
    // Generous spacing to guarantee zero collision and high readability
    'elk.spacing.nodeNode': '60',
    'elk.layered.spacing.nodeNodeBetweenLayers': isHorizontal ? '130' : '90',
    'elk.spacing.edgeNode': '40',
    'elk.spacing.edgeEdge': '26',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '26',
    'elk.layered.spacing.edgeNodeBetweenLayers': '40',
    'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
  };

  const elkGraph = {
    id: 'root',
    layoutOptions: elkLayoutOptions,
    children: nodes.map((node) => {
      const isSatellite = node.data?.isSatellite;
      const width = isSatellite ? 180 : 252;
      const height = isSatellite ? 68 : 135;

      return {
        id: node.id,
        width,
        height,
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    const layoutedGraph = await elk.layout(elkGraph);

    // Map positions back to React Flow nodes
    const nodePositionMap = new Map();
    (layoutedGraph.children || []).forEach((child) => {
      nodePositionMap.set(child.id, {
        x: child.x,
        y: child.y,
        width: child.width,
        height: child.height,
      });
    });

    const targetPosition = isHorizontal ? Position.Left : Position.Top;
    const sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    const layoutedNodes = nodes.map((node) => {
      const pos = nodePositionMap.get(node.id) || { x: 0, y: 0 };
      return {
        ...node,
        targetPosition,
        sourcePosition,
        position: {
          x: pos.x,
          y: pos.y,
        },
        data: {
          ...node.data,
          targetPosition,
          sourcePosition,
          layoutDirection: direction,
        },
      };
    });

    // Map edge layout / bend points if provided by ELK
    const elkEdgeMap = new Map();
    (layoutedGraph.edges || []).forEach((e) => {
      elkEdgeMap.set(e.id, e);
    });

    const layoutedEdges = edges.map((edge) => {
      const elkEdge = elkEdgeMap.get(edge.id);
      return {
        ...edge,
        data: {
          ...edge.data,
          elkSections: elkEdge?.sections || [],
          edgeRouting,
          layoutDirection: direction,
        },
      };
    });

    return {
      nodes: layoutedNodes,
      edges: layoutedEdges,
    };
  } catch (err) {
    console.error('ELK layout computation failed:', err);
    return { nodes, edges };
  }
}
