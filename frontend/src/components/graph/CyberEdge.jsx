/**
 * CyberEdge.jsx
 * 
 * High-clarity custom edge for React Flow + ELK.js.
 * Features prominent, readable semantic badges for financial transfers,
 * call bursts, surveillance meetups, and FIR co-accused links.
 */

import React, { memo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
} from '@xyflow/react';

// Color map for relationship semantics
const REL_COLORS = {
  transferred_to: '#F59E0B',    // Amber / Gold
  communicated_with: '#10B981', // Emerald Green
  co_accused_with: '#EF4444',   // Crimson Red
  co_located_with: '#F97316',   // Orange
  uses_phone: '#059669',
  owns_device: '#06B6D4',
  controls_funds: '#EAB308',
  linked_to: '#64748B',
};

function CyberEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data = {},
  selected,
}) {
  const [isHovered, setIsHovered] = useState(false);

  const {
    relationshipType = 'communicated_with',
    label = '',
    badgeColor = null,
    confidenceScore = 0.85,
    timestamp = '',
    evidenceCount = 1,
    evidenceIds = [],
    source = '',
    edgeRouting = 'ORTHOGONAL',
  } = data;

  const relColor = badgeColor || REL_COLORS[relationshipType] || '#38BDF8';
  const confPct = Math.round((typeof confidenceScore === 'number' ? confidenceScore : 0.85) * 100);

  // Compute smooth clean path
  let edgePath = '';
  let labelX = 0;
  let labelY = 0;

  if (edgeRouting === 'SPLINES') {
    const [path, lx, ly] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    edgePath = path;
    labelX = lx;
    labelY = ly;
  } else {
    const [path, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 16,
      offset: 25,
    });
    edgePath = path;
    labelX = lx;
    labelY = ly;
  }

  const strokeWidth = selected ? 3 : isHovered ? 2.5 : 1.8;
  const strokeColor = selected ? '#38BDF8' : isHovered ? '#FFFFFF' : relColor;

  return (
    <>
      {/* Invisible wider hit area for easy hover and click */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={28}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />

      {/* Styled visible edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          transition: 'stroke 0.2s, stroke-width 0.2s',
          filter: isHovered || selected ? `drop-shadow(0 0 8px ${relColor})` : 'none',
        }}
      />

      {/* Prominent High-Visibility Edge Badge */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            cursor: 'pointer',
            zIndex: isHovered || selected ? 60 : 15,
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            style={{
              background: '#0F172A',
              border: `1.5px solid ${selected ? '#38BDF8' : relColor}`,
              boxShadow: isHovered || selected
                ? `0 0 14px ${relColor}90, 0 4px 14px rgba(0,0,0,0.8)`
                : '0 2px 8px rgba(0,0,0,0.6)',
              borderRadius: '20px',
              padding: '3px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
              fontFamily: "'Inter', system-ui, sans-serif",
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            {/* Main Actionable Label */}
            <span
              style={{
                color: relColor,
                fontWeight: 800,
                fontSize: '11px',
                letterSpacing: '0.2px',
              }}
            >
              {label || relationshipType.replace(/_/g, ' ')}
            </span>

            {/* Confidence Divider & Tag */}
            <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: '9px' }}>•</span>
            <span
              style={{
                color: confPct >= 85 ? '#34D399' : '#FBBF24',
                fontWeight: 700,
                fontSize: '9.5px',
              }}
            >
              {confPct}%
            </span>
          </div>

          {/* Detailed Dossier on Hover */}
          {isHovered && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: '6px',
                background: '#0B0F19',
                border: `1px solid ${relColor}`,
                borderRadius: '8px',
                padding: '10px 12px',
                width: '220px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.9)',
                color: '#E2E8F0',
                fontSize: '10px',
                zIndex: 100,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  color: relColor,
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                }}
              >
                {label || relationshipType.replace(/_/g, ' ')}
              </div>
              <div><strong>Confidence:</strong> {confPct}% Verified</div>
              {data.amount && <div><strong>Amount:</strong> ₹{Number(data.amount).toLocaleString('en-IN')}</div>}
              {data.frequency && <div><strong>Call Frequency:</strong> {data.frequency} events logged</div>}
              {source && <div style={{ marginTop: '2px' }}><strong>Source:</strong> {source}</div>}
              {evidenceIds?.length > 0 && (
                <div style={{ marginTop: '2px' }}>
                  <strong>Ref:</strong> {evidenceIds.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(CyberEdge);
