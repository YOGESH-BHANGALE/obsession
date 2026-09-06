/**
 * CyberNode.jsx
 * 
 * Clean, high-clarity investigation card node for React Flow + ELK.js.
 * Displays suspect hierarchy, risk score, confidence zone, and embedded
 * digital footprint (SIMs, devices, wallets, aliases) without cluttering
 * the canvas with dozens of extra floating nodes.
 */

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ENTITY_CATEGORIES } from './cyberGraphAdapter';

function CyberNode({ data, selected }) {
  const {
    category = 'PERSON',
    title = '',
    primaryValue = '',
    secondaryValue = '',
    badge = '',
    riskScore = null,
    icon = '👤',
    isSeed = false,
    criminalHistory = false,
    confidenceBand = 'outer',
    digitalFootprint = {},
    isSatellite = false,
    isExpanded = false,
    targetPosition = Position.Left,
    sourcePosition = Position.Right,
  } = data || {};

  // If this is an expanded satellite asset node (phone, device, wallet)
  if (isSatellite) {
    const catConfig = ENTITY_CATEGORIES[category] || ENTITY_CATEGORIES.DEVICE;
    return (
      <div
        style={{
          width: '180px',
          background: '#0F172A',
          borderRadius: '8px',
          border: selected ? '2px solid #38BDF8' : `1.5px dashed ${catConfig.border}`,
          boxShadow: selected ? `0 0 16px ${catConfig.color}60` : '0 4px 12px rgba(0,0,0,0.5)',
          padding: '8px 10px',
          color: '#F8FAFC',
          fontFamily: "'Inter', system-ui, sans-serif",
          cursor: 'pointer',
          willChange: 'transform',
        }}
      >
        <Handle
          type="target"
          position={targetPosition}
          style={{
            background: catConfig.color,
            width: '8px',
            height: '8px',
            border: '2px solid #0F172A',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px' }}>{icon}</span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: catConfig.color,
            }}
          >
            {category}
          </span>
        </div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'monospace',
            color: '#F1F5F9',
          }}
          title={title}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: '9px',
            color: '#94A3B8',
            marginTop: '2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {primaryValue}
        </div>
        <Handle
          type="source"
          position={sourcePosition}
          style={{
            background: catConfig.color,
            width: '8px',
            height: '8px',
            border: '2px solid #0F172A',
          }}
        />
      </div>
    );
  }

  // ─── Main Person / Suspect Card ───
  const initials = title
    ? title
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '??';

  // Band accent color (matches concentric rings)
  let bandColor = '#94A3B8';
  let bandBg = 'rgba(148, 163, 184, 0.15)';
  if (confidenceBand === 'inner' || isSeed) {
    bandColor = '#FFD600'; // Gold core
    bandBg = 'rgba(255, 214, 0, 0.18)';
  } else if (confidenceBand === 'middle') {
    bandColor = '#FBBF24'; // Amber middle
    bandBg = 'rgba(251, 191, 36, 0.15)';
  }

  // Risk Score Styling
  let riskBg = 'rgba(16, 185, 129, 0.15)';
  let riskText = '#34D399';
  let riskBorder = 'rgba(16, 185, 129, 0.4)';
  if (riskScore !== null) {
    if (riskScore >= 75) {
      riskBg = 'rgba(239, 68, 68, 0.2)';
      riskText = '#F87171';
      riskBorder = 'rgba(239, 68, 68, 0.6)';
    } else if (riskScore >= 40) {
      riskBg = 'rgba(245, 158, 11, 0.2)';
      riskText = '#FBBF24';
      riskBorder = 'rgba(245, 158, 11, 0.5)';
    }
  }

  return (
    <div
      style={{
        width: isSeed ? '260px' : '248px',
        background: '#0F172A',
        borderRadius: '10px',
        border: selected
          ? '2.5px solid #38BDF8'
          : isSeed
          ? '2px solid #FFD600'
          : criminalHistory
          ? '1.5px solid #EF4444'
          : '1px solid #334155',
        boxShadow: selected
          ? '0 0 24px rgba(56, 189, 248, 0.5), 0 8px 24px rgba(0,0,0,0.7)'
          : isSeed
          ? '0 0 20px rgba(255, 214, 0, 0.35), 0 6px 20px rgba(0,0,0,0.6)'
          : '0 4px 16px rgba(0, 0, 0, 0.5)',
        padding: '12px 14px',
        color: '#F8FAFC',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        position: 'relative',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        cursor: 'pointer',
        willChange: 'transform',
      }}
    >
      {/* React Flow Input Handle */}
      <Handle
        type="target"
        position={targetPosition}
        style={{
          background: bandColor,
          width: '9px',
          height: '9px',
          border: '2px solid #0F172A',
          boxShadow: `0 0 6px ${bandColor}`,
        }}
      />

      {/* Top Header: Avatar + Name + Risk Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        {/* Avatar Circle */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: isSeed ? '#FFD600' : '#1E293B',
            color: isSeed ? '#1A1A1A' : bandColor,
            border: criminalHistory ? '2.5px solid #EF4444' : `2px solid ${bandColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '13px',
            boxShadow: `0 0 10px ${bandColor}40`,
            flexShrink: 0,
          }}
          title={criminalHistory ? 'Prior Criminal History / FIR Record' : 'Suspect Avatar'}
        >
          {initials}
        </div>

        {/* Suspect Title + Role Badge */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: isSeed ? '14px' : '13px',
              fontWeight: 800,
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: '1.2',
            }}
            title={title}
          >
            {isSeed && <span style={{ color: '#FFD600', marginRight: '4px' }}>★</span>}
            {title}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#94A3B8',
              marginTop: '2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={primaryValue}
          >
            {primaryValue}
          </div>
        </div>

        {/* Risk Score Pill */}
        {riskScore !== null && (
          <div
            style={{
              fontSize: '9.5px',
              fontWeight: 800,
              padding: '3px 7px',
              borderRadius: '6px',
              background: riskBg,
              color: riskText,
              border: `1px solid ${riskBorder}`,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '7px' }}>●</span>
            <span>{riskScore}%</span>
          </div>
        )}
      </div>

      {/* Role & Band Badges Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '8.5px',
            fontWeight: 800,
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: '4px',
            background: bandBg,
            color: bandColor,
            border: `1px solid ${bandColor}60`,
            letterSpacing: '0.4px',
          }}
        >
          {badge}
        </span>

        {criminalHistory && (
          <span
            style={{
              fontSize: '8.5px',
              fontWeight: 800,
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#F87171',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              letterSpacing: '0.3px',
            }}
            title="Flagged in Criminal History Record / Prior FIR"
          >
            ⚖️ PRIOR RECORD
          </span>
        )}

        {isSeed && (
          <span
            style={{
              fontSize: '8.5px',
              fontWeight: 800,
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(255, 214, 0, 0.25)',
              color: '#FFD600',
              border: '1px solid #FFD600',
            }}
          >
            SEED
          </span>
        )}
      </div>

      {/* Embedded Digital Footprint Intelligence Chips (Avoids Canvas Node Explosion) */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.25)',
          borderRadius: '6px',
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Phone / SIM */}
        {digitalFootprint.phone && (
          <div
            style={{
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              color: '#CBD5E1',
            }}
          >
            <span style={{ color: '#10B981' }}>📱</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {digitalFootprint.phone}
            </span>
          </div>
        )}

        {/* Primary Asset / Telegram / Bank */}
        {(digitalFootprint.bank || digitalFootprint.social || digitalFootprint.wallet) && (
          <div
            style={{
              fontSize: '9.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              color: '#94A3B8',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span>{digitalFootprint.bank ? '💸' : digitalFootprint.social ? '💬' : '🪙'}</span>
            <span style={{ fontFamily: 'monospace' }}>
              {digitalFootprint.bank || digitalFootprint.social || digitalFootprint.wallet}
            </span>
          </div>
        )}

        {/* Hardware / IP */}
        {digitalFootprint.device && (
          <div
            style={{
              fontSize: '9px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              color: '#64748B',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span>💻</span>
            <span>{digitalFootprint.device.split(' (')[0]}</span>
          </div>
        )}
      </div>

      {/* React Flow Output Handle */}
      <Handle
        type="source"
        position={sourcePosition}
        style={{
          background: bandColor,
          width: '9px',
          height: '9px',
          border: '2px solid #0F172A',
          boxShadow: `0 0 6px ${bandColor}`,
        }}
      />
    </div>
  );
}

export default memo(CyberNode);
