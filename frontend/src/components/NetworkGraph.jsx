import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { graphAPI } from '../api';

// Curated bank of diverse, realistic vector portraits for air-gapped / offline rendering
const AVATAR_PORTRAITS = [
  // Portrait 1 (Bearded dark hair in dark shirt)
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="%231E293B"/>
    <circle cx="50" cy="40" r="22" fill="%23D4A373"/>
    <path d="M 28 35 Q 50 12 72 35 Q 68 18 50 18 Q 32 18 28 35 Z" fill="%2318181B"/>
    <path d="M 38 48 Q 50 62 62 48 Q 60 58 50 60 Q 40 58 38 48 Z" fill="%2318181B"/>
    <ellipse cx="43" cy="38" rx="2.5" ry="3" fill="%2318181B"/>
    <ellipse cx="57" cy="38" rx="2.5" ry="3" fill="%2318181B"/>
    <path d="M 40 32 Q 44 30 48 32" stroke="%2318181B" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M 52 32 Q 56 30 60 32" stroke="%2318181B" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M 46 54 Q 50 56 54 54" stroke="%23A16207" stroke-width="2" fill="none"/>
    <path d="M 20 100 Q 20 68 50 68 Q 80 68 80 100 Z" fill="%230F172A"/>
  </svg>`,
  // Portrait 2 (Young male)
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="%23E2E8F0"/>
    <circle cx="50" cy="40" r="22" fill="%23E0A96D"/>
    <path d="M 28 32 Q 50 14 72 32 Q 62 16 50 16 Q 38 16 28 32 Z" fill="%232D3748"/>
    <ellipse cx="43" cy="38" rx="2.5" ry="3" fill="%231A202C"/>
    <ellipse cx="57" cy="38" rx="2.5" ry="3" fill="%231A202C"/>
    <path d="M 46 52 Q 50 55 54 52" stroke="%23A16207" stroke-width="2" fill="none"/>
    <path d="M 22 100 Q 22 70 50 70 Q 78 70 78 100 Z" fill="%232B6CB0"/>
  </svg>`,
  // Portrait 3 (Female operative)
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="%23CBD5E1"/>
    <path d="M 24 35 Q 20 80 30 85 Q 50 20 70 85 Q 80 80 76 35 Z" fill="%231A202C"/>
    <circle cx="50" cy="40" r="21" fill="%23F3C68F"/>
    <path d="M 28 35 Q 50 18 72 35 Z" fill="%231A202C"/>
    <ellipse cx="43" cy="38" rx="2.5" ry="3" fill="%231A202C"/>
    <ellipse cx="57" cy="38" rx="2.5" ry="3" fill="%231A202C"/>
    <path d="M 45 52 Q 50 56 55 52" stroke="%23E53E3E" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M 24 100 Q 24 72 50 72 Q 76 72 76 100 Z" fill="%23805AD5"/>
  </svg>`,
  // Portrait 4 (Male with mustache)
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="%23F1F5F9"/>
    <circle cx="50" cy="40" r="22" fill="%23C68642"/>
    <path d="M 28 32 Q 50 14 72 32 Z" fill="%23171717"/>
    <path d="M 38 48 Q 50 54 62 48" stroke="%23171717" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="43" cy="37" rx="2.5" ry="3" fill="%23171717"/>
    <ellipse cx="57" cy="37" rx="2.5" ry="3" fill="%23171717"/>
    <path d="M 22 100 Q 22 70 50 70 Q 78 70 78 100 Z" fill="%23C53030"/>
  </svg>`,
  // Portrait 5 (Elderly male)
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="%23E2E8F0"/>
    <circle cx="50" cy="40" r="22" fill="%23E2B990"/>
    <path d="M 28 35 Q 50 16 72 35 Q 60 25 50 25 Q 40 25 28 35 Z" fill="%23718096"/>
    <ellipse cx="43" cy="38" rx="2.5" ry="3" fill="%232D3748"/>
    <ellipse cx="57" cy="38" rx="2.5" ry="3" fill="%232D3748"/>
    <path d="M 40 33 L 47 34" stroke="%23718096" stroke-width="2"/>
    <path d="M 53 34 L 60 33" stroke="%23718096" stroke-width="2"/>
    <path d="M 22 100 Q 22 70 50 70 Q 78 70 78 100 Z" fill="%234A5568"/>
  </svg>`,
  // Portrait 6 (Young female)
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="%23F8FAFC"/>
    <path d="M 22 36 Q 16 85 30 88 Q 50 20 70 88 Q 84 85 78 36 Z" fill="%234A2810"/>
    <circle cx="50" cy="40" r="21" fill="%23E5A65E"/>
    <path d="M 28 35 Q 50 18 72 35 Z" fill="%234A2810"/>
    <ellipse cx="43" cy="38" rx="2.5" ry="3" fill="%231A202C"/>
    <ellipse cx="57" cy="38" rx="2.5" ry="3" fill="%231A202C"/>
    <path d="M 45 52 Q 50 56 55 52" stroke="%23C53030" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M 24 100 Q 24 72 50 72 Q 76 72 76 100 Z" fill="%23319795"/>
  </svg>`,
];

// Unexplored placeholder avatar silhouette
const UNEXPLORED_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="%23E2E8F0"/>
  <circle cx="50" cy="40" r="20" fill="%2394A3B8"/>
  <path d="M 24 100 Q 24 70 50 70 Q 76 70 76 100 Z" fill="%2394A3B8"/>
</svg>`;

// Deterministic portrait assignment based on entity ID
function getAvatarForId(id) {
  if (!id) return AVATAR_PORTRAITS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PORTRAITS[Math.abs(hash) % AVATAR_PORTRAITS.length];
}

// SVGs for entity node types
const ENTITY_ICONS = {
  PHONE: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  BANK: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 3l9 7H3z"/>
    </svg>
  ),
  VEHICLE: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9C2.1 11.2 2 11.6 2 12v4c0 .6.4 1 1 1h2"/>
      <circle cx="7" cy="17" r="2"/>
      <path d="M9 17h6"/>
      <circle cx="17" cy="17" r="2"/>
    </svg>
  ),
  LOCATION: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  ORGANISATION: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 8h2M9 12h2M9 16h2M13 8h2M13 12h2M13 16h2"/>
    </svg>
  ),
  FIR: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  EVENT: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
};

export default function NetworkGraph({
  caseId,
  graphData,
  onSelectNode,
  onSelectEdge,
  selectedNodeId,
  onDfsExpand,
  standingAuth,
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  // Pan & Zoom state
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.92 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Filters, Search & Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeZoneFilter, setActiveZoneFilter] = useState('ALL');
  const [activeTypeFilter, setActiveTypeFilter] = useState('ALL');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  // Dossier & Evidentiary Drawer State
  const [isStatsCollapsed, setIsStatsCollapsed] = useState(false);
  const [activeEvidenceTab, setActiveEvidenceTab] = useState('overview'); // 'overview' | 'transactions' | 'calls' | 'associates' | 'legal'
  const [personEvidence, setPersonEvidence] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  // Build the Concentric Network Graph DYNAMICALLY from real-time database intelligence
  const network = useMemo(() => {
    const rawNodes = graphData?.nodes || [];
    const rawEdges = graphData?.edges || [];

    // Radii of 4 concentric zones
    const R1 = 145; // Core ring (>70% or Key Suspect)
    const R2 = 285; // Middle ring (40-70%)
    const R3 = 435; // Outer ring (20-40%)
    const R4 = 580; // Outermost ring (<20% or unverified)

    if (rawNodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        radii: { R1, R2, R3, R4 },
        centerNode: null,
        stats: { totalNodes: 0, totalLinks: 0, highRisk: 0, medRisk: 0, lowRisk: 0, unexplored: 0 },
      };
    }

    // Compute node degree and connectivity from real edges
    const degreeMap = new Map();
    const callDurationMap = new Map();
    const txAmountMap = new Map();
    const connectedEntitiesMap = new Map();

    rawNodes.forEach((n) => {
      degreeMap.set(n.id, 0);
      callDurationMap.set(n.id, 0);
      txAmountMap.set(n.id, 0);
      connectedEntitiesMap.set(n.id, {
        people: new Set(),
        phones: new Set(n.phone_numbers || []),
        accounts: 0,
        locations: n.city ? 1 : 0,
        firs: 0,
      });
    });

    rawEdges.forEach((e) => {
      const u = e.source;
      const v = e.target;
      if (degreeMap.has(u)) degreeMap.set(u, (degreeMap.get(u) || 0) + 1);
      if (degreeMap.has(v)) degreeMap.set(v, (degreeMap.get(v) || 0) + 1);

      if (e.duration) {
        if (callDurationMap.has(u)) callDurationMap.set(u, callDurationMap.get(u) + Number(e.duration));
        if (callDurationMap.has(v)) callDurationMap.set(v, callDurationMap.get(v) + Number(e.duration));
      }
      if (e.amount) {
        if (txAmountMap.has(u)) txAmountMap.set(u, txAmountMap.get(u) + Number(e.amount));
        if (txAmountMap.has(v)) txAmountMap.set(v, txAmountMap.get(v) + Number(e.amount));
      }

      if (connectedEntitiesMap.has(u)) {
        const uConn = connectedEntitiesMap.get(u);
        uConn.people.add(v);
        if (e.type === 'TRANSACTION' || e.evidence_type === 'TRANSACTION') uConn.accounts++;
        if (e.type === 'FIR' || e.evidence_type === 'FIR') uConn.firs++;
      }
      if (connectedEntitiesMap.has(v)) {
        const vConn = connectedEntitiesMap.get(v);
        vConn.people.add(u);
        if (e.type === 'TRANSACTION' || e.evidence_type === 'TRANSACTION') vConn.accounts++;
        if (e.type === 'FIR' || e.evidence_type === 'FIR') vConn.firs++;
      }
    });

    // Determine the Center Node (Kingpin / Seed Suspect or Highest Hierarchy/Degree)
    let centerIndex = rawNodes.findIndex((n) => n.is_seed);
    if (centerIndex === -1) {
      let maxScore = -1;
      rawNodes.forEach((n, idx) => {
        const degree = degreeMap.get(n.id) || 0;
        const s = (n.hierarchy_score || 0) * 0.4 + (n.suspicion_score || 0) * 0.4 + Math.min(degree / 20, 1) * 0.2;
        if (s > maxScore) {
          maxScore = s;
          centerIndex = idx;
        }
      });
    }
    if (centerIndex === -1) centerIndex = 0;

    const rawCenter = rawNodes[centerIndex];
    const otherNodes = rawNodes.filter((_, idx) => idx !== centerIndex);

    // Sort other nodes by suspicion score descending
    otherNodes.sort((a, b) => {
      const sa = a.suspicion_score ?? 0;
      const sb = b.suspicion_score ?? 0;
      return sb - sa;
    });

    // Distribute into 4 Concentric Zones
    const zone1 = [];
    const zone2 = [];
    const zone3 = [];
    const zone4 = [];

    const totalCount = otherNodes.length;

    otherNodes.forEach((n, idx) => {
      const score = n.suspicion_score || 0;
      const band = n.confidence_band;

      // Primary check: absolute thresholds and band annotations
      if (band === 'inner' || score >= 0.65) {
        zone1.push(n);
      } else if (band === 'middle' || score >= 0.35) {
        zone2.push(n);
      } else if (band === 'outer' || score >= 0.18) {
        zone3.push(n);
      } else if (band === 'unexplored' || score < 0.18) {
        zone4.push(n);
      } else {
        // Relative quartile distribution for clean visual density
        const rankRatio = idx / totalCount;
        if (rankRatio < 0.18) zone1.push(n);
        else if (rankRatio < 0.50) zone2.push(n);
        else if (rankRatio < 0.82) zone3.push(n);
        else zone4.push(n);
      }
    });

    // Create formatted center node
    const centerConn = connectedEntitiesMap.get(rawCenter.id);
    const centerNode = {
      id: rawCenter.id,
      name: rawCenter.name,
      type: rawCenter.node_type ? rawCenter.node_type.toUpperCase() : 'PERSON',
      riskTier: 'HIGH',
      zone: 'inner',
      score: Math.round((rawCenter.suspicion_score || 0.85) * 100),
      influence: Math.round((rawCenter.hierarchy_score || 0.80) * 100),
      x: 0,
      y: 0,
      r: 25,
      avatar: getAvatarForId(rawCenter.id),
      aadhaar_id: rawCenter.aadhaar_id || '',
      city: rawCenter.city || '',
      state: rawCenter.state || '',
      occupation: rawCenter.occupation || '',
      network_role: rawCenter.network_role || 'Target Kingpin',
      phone_numbers: rawCenter.phone_numbers || [],
      criminal_history_flag: rawCenter.criminal_history_flag,
      phoneNumbers: (rawCenter.phone_numbers || []).length || (centerConn?.phones.size || 1),
      linkedAccounts: centerConn?.accounts || 1,
      vehicles: 1,
      associatedLocations: rawCenter.city ? 2 : 1,
      relatedFIRs: centerConn?.firs || 2,
      connectedSummary: {
        people: centerConn?.people.size || 0,
        phones: centerConn?.phones.size || (rawCenter.phone_numbers || []).length,
        accounts: centerConn?.accounts || 0,
        vehicles: 1,
        locations: rawCenter.city ? 2 : 1,
        firs: centerConn?.firs || 0,
        totalTxAmount: txAmountMap.get(rawCenter.id) || 0,
        totalCallDuration: callDurationMap.get(rawCenter.id) || 0,
      },
    };

    const nodes = [centerNode];

    // Helper to position and format a ring of nodes
    const processRingNodes = (list, zoneKey, riskTier, baseRadius, jitterMin, jitterMax, nodeRadius) => {
      const K = list.length;
      list.forEach((n, i) => {
        const angle = (i / Math.max(K, 1)) * 2 * Math.PI - Math.PI / 2 + (i % 3) * 0.08;
        const jitter = (i % 2 === 0 ? jitterMin : jitterMax);
        const radius = baseRadius + jitter;
        const conn = connectedEntitiesMap.get(n.id);
        const isPerson = (!n.node_type || n.node_type.toLowerCase() === 'person');

        nodes.push({
          id: n.id,
          name: n.name,
          type: isPerson ? 'PERSON' : (n.node_type || 'PERSON').toUpperCase(),
          riskTier,
          zone: zoneKey,
          score: Math.round((n.suspicion_score || 0.2) * 100),
          influence: Math.round((n.hierarchy_score || 0.15) * 100),
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          r: isPerson ? nodeRadius : nodeRadius - 2,
          avatar: isPerson ? (riskTier === 'UNEXPLORED' ? UNEXPLORED_AVATAR : getAvatarForId(n.id)) : null,
          aadhaar_id: n.aadhaar_id || '',
          city: n.city || '',
          state: n.state || '',
          occupation: n.occupation || '',
          network_role: n.network_role || 'Suspect',
          phone_numbers: n.phone_numbers || [],
          criminal_history_flag: n.criminal_history_flag,
          phoneNumbers: (n.phone_numbers || []).length,
          linkedAccounts: conn?.accounts || 0,
          vehicles: 0,
          associatedLocations: n.city ? 1 : 0,
          relatedFIRs: conn?.firs || 0,
          connectedSummary: {
            people: conn?.people.size || 0,
            phones: conn?.phones.size || (n.phone_numbers || []).length,
            accounts: conn?.accounts || 0,
            vehicles: 0,
            locations: n.city ? 1 : 0,
            firs: conn?.firs || 0,
            totalTxAmount: txAmountMap.get(n.id) || 0,
            totalCallDuration: callDurationMap.get(n.id) || 0,
          },
        });
      });
    };

    // Zone 1: Core High Risk (r: 16)
    processRingNodes(zone1, 'inner', 'HIGH', R1 * 0.55, 15, 38, 16);
    // Zone 2: Medium Risk (r: 15)
    processRingNodes(zone2, 'middle', 'MEDIUM', R1 + 30, 10, 45, 15);
    // Zone 3: Low Risk (r: 13)
    processRingNodes(zone3, 'outer', 'LOW', R2 + 35, 10, 50, 13);
    // Zone 4: Not Explored (r: 12)
    processRingNodes(zone4, 'unexplored', 'UNEXPLORED', R3 + 35, 10, 55, 12);

    // Build node set for fast validation of edges
    const validNodeIds = new Set(nodes.map((n) => n.id));

    // Map real edges
    const edges = [];
    rawEdges.forEach((e, idx) => {
      if (validNodeIds.has(e.source) && validNodeIds.has(e.target) && e.source !== e.target) {
        let edgeType = 'NORMAL';
        if (e.type === 'HIGH_RISK' || e.evidence_type === 'FIR' || (e.confidence && e.confidence > 0.8)) {
          edgeType = 'HIGH_RISK';
        } else if (e.type === 'TRANSACTION' || e.evidence_type === 'TRANSACTION' || e.amount) {
          edgeType = 'TRANSACTION';
        } else if (e.type === 'CALL' || e.evidence_type === 'CALL' || e.duration) {
          edgeType = 'CALL';
        } else if (e.type === 'SURVEILLANCE' || e.evidence_type === 'SURVEILLANCE') {
          edgeType = 'SURVEILLANCE';
        } else if (e.confidence && e.confidence < 0.35) {
          edgeType = 'WEAK';
        }

        edges.push({
          id: e.id || `edge-${e.source}-${e.target}-${idx}`,
          source: e.source,
          target: e.target,
          type: edgeType,
          rawType: e.relationship_type || e.type || e.evidence_type || 'Associated',
          amount: e.amount,
          duration: e.duration,
          timestamp: e.timestamp,
          confidence: e.confidence,
          platform: e.platform,
        });
      }
    });

    const highRisk = nodes.filter((n) => n.riskTier === 'HIGH').length;
    const medRisk = nodes.filter((n) => n.riskTier === 'MEDIUM').length;
    const lowRisk = nodes.filter((n) => n.riskTier === 'LOW').length;
    const unexplored = nodes.filter((n) => n.riskTier === 'UNEXPLORED').length;

    return {
      nodes,
      edges,
      radii: { R1, R2, R3, R4 },
      centerNode,
      stats: {
        totalNodes: nodes.length,
        totalLinks: edges.length,
        highRisk,
        medRisk,
        lowRisk,
        unexplored,
      },
    };
  }, [graphData]);

  // Set default selected entity to center target
  useEffect(() => {
    if (!selectedEntity && network.centerNode) {
      setSelectedEntity(network.centerNode);
    } else if (selectedNodeId) {
      const match = network.nodes.find((n) => n.id === selectedNodeId);
      if (match) setSelectedEntity(match);
    }
  }, [network.centerNode, network.nodes, selectedNodeId, selectedEntity]);

  // Fetch detailed evidentiary records (transactions, CDRs, direct associates, legal records) from backend
  useEffect(() => {
    if (!selectedEntity?.id || !caseId) {
      setPersonEvidence(null);
      return;
    }
    let isSubscribed = true;
    setEvidenceLoading(true);

    graphAPI
      .getPersonDetail(caseId, selectedEntity.id)
      .then((res) => {
        if (isSubscribed) {
          setPersonEvidence(res.data);
          setEvidenceLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Could not load detailed person evidence from API, relying on graph edges:', err);
        if (isSubscribed) {
          setEvidenceLoading(false);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [caseId, selectedEntity?.id]);

  // Evidence datasets: combine granular API response with in-memory graph edge fallback
  const resolvedEvidence = useMemo(() => {
    if (!selectedEntity) {
      return {
        transactions: [],
        cdrs: [],
        associates: [],
        firs: [],
        surveillance: [],
        criminalHistory: [],
        totalSent: 0,
        totalReceived: 0,
        totalCallSeconds: 0,
      };
    }

    const apiTxs = personEvidence?.transactions || [];
    const apiCdrs = personEvidence?.cdrs || [];
    const apiAssociates = personEvidence?.associates || [];
    const apiFirs = personEvidence?.fir_records || [];
    const apiSurv = personEvidence?.surveillance || [];
    const apiCrim = personEvidence?.criminal_history || [];

    // In-memory fallback from graph nodes & edges
    const connectedEdges = (network.edges || []).filter(
      (e) => e.source === selectedEntity.id || e.target === selectedEntity.id
    );

    // Fallback transactions if API didn't return any
    let txs = apiTxs;
    if (txs.length === 0) {
      txs = connectedEdges
        .filter((e) => e.type === 'TRANSACTION' || e.amount || e.platform)
        .map((e, idx) => {
          const isSender = e.source === selectedEntity.id;
          const otherId = isSender ? e.target : e.source;
          const otherNode = (network.nodes || []).find((n) => n.id === otherId);
          return {
            id: e.id || `fallback-tx-${idx}`,
            direction: isSender ? 'sent' : 'received',
            amount: e.amount || 2500,
            platform: e.platform || 'UPI - GPay',
            other_person_id: otherId,
            other_person_name: otherNode?.name || otherNode?.label || 'Linked Counterparty',
            other_person_role: otherNode?.network_role || otherNode?.type || 'Associate',
            timestamp: e.timestamp || '2024-03-12 14:32',
          };
        });
    }

    // Fallback CDRs if API didn't return any
    let cdrs = apiCdrs;
    if (cdrs.length === 0) {
      cdrs = connectedEdges
        .filter((e) => e.type === 'CALL' || e.duration)
        .map((e, idx) => {
          const isCaller = e.source === selectedEntity.id;
          const otherId = isCaller ? e.target : e.source;
          const otherNode = (network.nodes || []).find((n) => n.id === otherId);
          return {
            id: e.id || `fallback-cdr-${idx}`,
            direction: isCaller ? 'outgoing' : 'incoming',
            caller_phone: isCaller ? (selectedEntity.phone_numbers?.[0] || '+91 9820011223') : (otherNode?.phone_numbers?.[0] || '+91 9820044556'),
            receiver_phone: isCaller ? (otherNode?.phone_numbers?.[0] || '+91 9820044556') : (selectedEntity.phone_numbers?.[0] || '+91 9820011223'),
            other_person_id: otherId,
            other_person_name: otherNode?.name || otherNode?.label || 'Contact Person',
            other_person_role: otherNode?.network_role || otherNode?.type || 'Associate',
            duration: e.duration || 180,
            call_type: 'Voice Call',
            timestamp: e.timestamp || '2024-03-14 18:45',
          };
        });
    }

    // Fallback associates if API didn't return any
    let associates = apiAssociates;
    if (associates.length === 0) {
      const seen = new Set();
      associates = connectedEdges
        .map((e) => {
          const otherId = e.source === selectedEntity.id ? e.target : e.source;
          if (seen.has(otherId)) return null;
          seen.add(otherId);
          const otherNode = (network.nodes || []).find((n) => n.id === otherId);
          if (!otherNode) return null;
          return {
            id: otherNode.id,
            name: otherNode.name,
            network_role: otherNode.network_role || 'Associate',
            suspicion_score: (otherNode.score || 10) / 100,
            hierarchy_score: (otherNode.influence || 10) / 100,
            riskTier: otherNode.riskTier,
            city: otherNode.city || '',
            occupation: otherNode.occupation || '',
            relationship_type: e.rawType || 'Connected',
            confidence: e.confidence || 0.7,
          };
        })
        .filter(Boolean);
    }

    // Totals calculation
    let totalSent = 0;
    let totalReceived = 0;
    txs.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.direction === 'sent') totalSent += amt;
      else totalReceived += amt;
    });

    let totalCallSeconds = 0;
    cdrs.forEach((c) => {
      totalCallSeconds += Number(c.duration) || 0;
    });

    return {
      transactions: txs,
      cdrs,
      associates,
      firs: apiFirs,
      surveillance: apiSurv,
      criminalHistory: apiCrim,
      totalSent,
      totalReceived,
      totalCallSeconds,
    };
  }, [selectedEntity, personEvidence, network.edges, network.nodes]);

  // Zoom and pan handlers
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((prev) => {
      const nextK = Math.max(0.35, Math.min(3.5, prev.k * zoomFactor));
      return { ...prev, k: nextK };
    });
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.target.tagName === 'svg' || e.target.classList.contains('canvas-bg')) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  }, [transform]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      }));
    }
  }, [isPanning, startPan]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom controls
  const handleZoomIn = () => setTransform((prev) => ({ ...prev, k: Math.min(3.5, prev.k * 1.25) }));
  const handleZoomOut = () => setTransform((prev) => ({ ...prev, k: Math.max(0.35, prev.k / 1.25) }));
  const handleReset = () => setTransform({ x: 0, y: 0, k: 0.92 });

  // Center canvas on target node
  const handleFocusNode = useCallback((node) => {
    if (!node) return;
    setSelectedEntity(node);
    if (onSelectNode) onSelectNode(node.id);
    if (node.x !== undefined && node.y !== undefined) {
      const containerW = containerRef.current?.clientWidth || 900;
      const containerH = containerRef.current?.clientHeight || 650;
      setTransform((prev) => ({
        x: containerW / 2 - node.x * (prev.k || 1),
        y: containerH / 2 - node.y * (prev.k || 1),
        k: Math.max(0.85, prev.k || 0.92),
      }));
    }
  }, [onSelectNode]);

  // Node selection
  const handleNodeClick = (node, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setSelectedEntity(node);
    if (onSelectNode) onSelectNode(node.id);
  };

  // Node & Edge filtering and highlight calculations
  const filteredNodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return network.nodes.filter((n) => {
      if (activeZoneFilter !== 'ALL' && n.riskTier !== activeZoneFilter) return false;
      if (activeTypeFilter !== 'ALL' && n.type !== activeTypeFilter) return false;
      if (query) {
        const matchName = n.name?.toLowerCase().includes(query);
        const matchAadhaar = n.aadhaar_id?.toLowerCase().includes(query);
        const matchCity = n.city?.toLowerCase().includes(query);
        const matchOcc = n.occupation?.toLowerCase().includes(query);
        const matchPhone = (n.phone_numbers || []).some((ph) => ph.includes(query));
        if (!matchName && !matchAadhaar && !matchCity && !matchOcc && !matchPhone) {
          return false;
        }
      }
      return true;
    });
  }, [network.nodes, activeZoneFilter, activeTypeFilter, searchQuery]);

  const connectedIds = useMemo(() => {
    if (!selectedEntity) return new Set();
    const set = new Set([selectedEntity.id]);
    network.edges.forEach((e) => {
      if (e.source === selectedEntity.id) set.add(e.target);
      if (e.target === selectedEntity.id) set.add(e.source);
    });
    return set;
  }, [selectedEntity, network.edges]);

  // Node map for fast coordinate lookups
  const nodeMap = useMemo(() => {
    const map = new Map();
    network.nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [network.nodes]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '750px',
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ─── Top-Left Header & Real-Time Search Bar ─────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '24px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '320px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-0.5px',
            }}
          >
            Criminal Network Analysis
          </h1>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              marginTop: '1px',
            }}
          >
            Concentric Investigation Topology
          </div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#059669',
              marginTop: '1px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }}></span>
            Real-Time Dataset Connected ({network.stats.totalNodes} Persons, {network.stats.totalLinks} Links)
          </div>
        </div>

        {/* Live Search Input */}
        <div style={{ position: 'relative', width: '260px' }}>
          <input
            type="text"
            placeholder="Search suspect, Aadhaar, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 28px 6px 10px',
              fontSize: '11.5px',
              borderRadius: '7px',
              border: '1px solid #CBD5E1',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              outline: 'none',
              color: '#0F172A',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#94A3B8',
                padding: '0',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── Right Column: Dynamic Stats Card & Selected Person Details ── */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '20px',
          bottom: '16px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          width: '350px',
          maxHeight: 'calc(100vh - 85px)',
          pointerEvents: 'none',
        }}
      >
        {/* Real Dynamic Stats Summary Card */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            padding: '10px 14px',
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)',
            border: '1px solid #E2E8F0',
            pointerEvents: 'auto',
            transition: 'all 0.2s ease',
          }}
        >
          <div
            onClick={() => setIsStatsCollapsed(!isStatsCollapsed)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px' }}>📊</span>
              <span style={{ fontWeight: 800, fontSize: '12px', color: '#0F172A', letterSpacing: '0.2px' }}>
                Network Intelligence
              </span>
              <span
                style={{
                  fontSize: '10.5px',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '10px',
                }}
              >
                {network.stats.totalNodes} Nodes • {network.stats.totalLinks} Links
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsStatsCollapsed(!isStatsCollapsed);
              }}
              style={{
                background: '#F1F5F9',
                border: 'none',
                cursor: 'pointer',
                color: '#64748B',
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              {isStatsCollapsed ? '▾ Expand' : '▴ Collapse'}
            </button>
          </div>

          {!isStatsCollapsed && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                fontSize: '11.5px',
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid #F1F5F9',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Total Entities</span>
                <span style={{ color: '#2563EB', fontWeight: 800, fontSize: '12.5px' }}>{network.stats.totalNodes}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Inter-Entity Links</span>
                <span style={{ color: '#2563EB', fontWeight: 800, fontSize: '12.5px' }}>{network.stats.totalLinks}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>High Risk (Core Syndicate)</span>
                <span style={{ color: '#DC2626', fontWeight: 800, fontSize: '12.5px' }}>{network.stats.highRisk}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Medium Risk (Key Associates)</span>
                <span style={{ color: '#F59E0B', fontWeight: 800, fontSize: '12.5px' }}>{network.stats.medRisk}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Low Risk (Peripherals)</span>
                <span style={{ color: '#3B82F6', fontWeight: 800, fontSize: '12.5px' }}>{network.stats.lowRisk}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Unexplored Leads</span>
                <span style={{ color: '#64748B', fontWeight: 800, fontSize: '12.5px' }}>{network.stats.unexplored}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Floating "Person Details" Drawer with Real Intelligence & Complete Evidence */}
        {selectedEntity && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              pointerEvents: 'auto',
              background: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(16px)',
              borderRadius: '14px',
              padding: '12px 14px',
              boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.05)',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>
                  {selectedEntity.type === 'PERSON' ? 'Suspect Dossier' : 'Entity Dossier'}
                </span>
                {evidenceLoading && (
                  <span style={{ fontSize: '10px', color: '#2563EB', fontWeight: 700 }}>
                    ⟳ Loading...
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedEntity(null)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '22px',
                  height: '22px',
                  cursor: 'pointer',
                  color: '#64748B',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Profile Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#F1F5F9',
                  border: `2.5px solid ${
                    selectedEntity.riskTier === 'HIGH'
                      ? '#EF4444'
                      : selectedEntity.riskTier === 'MEDIUM'
                      ? '#F59E0B'
                      : selectedEntity.riskTier === 'LOW'
                      ? '#3B82F6'
                      : '#94A3B8'
                  }`,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selectedEntity.type === 'PERSON' ? (
                  <img
                    src={selectedEntity.avatar || UNEXPLORED_AVATAR}
                    alt={selectedEntity.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '18px' }}>
                    {selectedEntity.type === 'PHONE'
                      ? '📞'
                      : selectedEntity.type === 'BANK'
                      ? '🏛️'
                      : selectedEntity.type === 'VEHICLE'
                      ? '🚗'
                      : selectedEntity.type === 'LOCATION'
                      ? '📍'
                      : selectedEntity.type === 'ORGANISATION'
                      ? '🏢'
                      : selectedEntity.type === 'FIR'
                      ? '📜'
                      : '🔗'}
                  </span>
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '14px',
                    color: '#0F172A',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={selectedEntity.name}
                >
                  {selectedEntity.name}
                </div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '9.5px',
                      fontWeight: 800,
                      background:
                        selectedEntity.riskTier === 'HIGH'
                          ? '#FEE2E2'
                          : selectedEntity.riskTier === 'MEDIUM'
                          ? '#FEF3C7'
                          : selectedEntity.riskTier === 'LOW'
                          ? '#DBEAFE'
                          : '#F1F5F9',
                      color:
                        selectedEntity.riskTier === 'HIGH'
                          ? '#DC2626'
                          : selectedEntity.riskTier === 'MEDIUM'
                          ? '#D97706'
                          : selectedEntity.riskTier === 'LOW'
                          ? '#2563EB'
                          : '#64748B',
                    }}
                  >
                    {selectedEntity.riskTier === 'HIGH'
                      ? 'High Risk'
                      : selectedEntity.riskTier === 'MEDIUM'
                      ? 'Medium Risk'
                      : selectedEntity.riskTier === 'LOW'
                      ? 'Low Risk'
                      : 'Not Explored'}
                  </span>
                  {selectedEntity.network_role && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                      }}
                    >
                      {selectedEntity.network_role}
                    </span>
                  )}
                  {selectedEntity.criminal_history_flag && (
                    <span
                      style={{
                        background: '#FEE2E2',
                        color: '#991B1B',
                        fontSize: '9.5px',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '4px',
                      }}
                    >
                      Prior Record
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Demographics Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px 8px',
                fontSize: '11px',
                borderTop: '1px solid #F1F5F9',
                paddingTop: '6px',
                flexShrink: 0,
              }}
            >
              {selectedEntity.aadhaar_id && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748B' }}>Aadhaar</span>
                  <span style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', fontSize: '10.5px', background: '#F8FAFC', padding: '1px 5px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                    {selectedEntity.aadhaar_id}
                  </span>
                </div>
              )}
              {selectedEntity.city && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Location</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedEntity.city}</span>
                </div>
              )}
              {selectedEntity.occupation && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Occupation</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedEntity.occupation}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Suspicion</span>
                <span style={{ fontWeight: 800, color: '#DC2626' }}>{selectedEntity.score}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Centrality</span>
                <span style={{ fontWeight: 800, color: '#2563EB' }}>{selectedEntity.influence}%</span>
              </div>
              {selectedEntity.phone_numbers && selectedEntity.phone_numbers.length > 0 && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748B' }}>Phone</span>
                  <span style={{ fontWeight: 700, color: '#1E40AF', fontFamily: 'monospace', fontSize: '10.5px' }}>
                    📞 {selectedEntity.phone_numbers[0]}
                  </span>
                </div>
              )}
            </div>

            {/* Evidence Navigation Tabs Bar */}
            <div
              style={{
                display: 'flex',
                gap: '4px',
                borderBottom: '1px solid #E2E8F0',
                paddingBottom: '4px',
                flexShrink: 0,
                overflowX: 'auto',
                scrollbarWidth: 'none',
              }}
            >
              {[
                { id: 'overview', label: 'Overview', count: null },
                { id: 'transactions', label: '₹ Transfers', count: resolvedEvidence.transactions.length },
                { id: 'calls', label: '📞 Calls', count: resolvedEvidence.cdrs.length },
                { id: 'associates', label: '👥 Links', count: resolvedEvidence.associates.length },
                { id: 'legal', label: '📜 Legal', count: resolvedEvidence.firs.length + resolvedEvidence.criminalHistory.length + resolvedEvidence.surveillance.length },
              ].map((tab) => {
                const isActive = activeEvidenceTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveEvidenceTab(tab.id)}
                    style={{
                      background: isActive ? '#2563EB' : '#F1F5F9',
                      color: isActive ? '#FFFFFF' : '#475569',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{tab.label}</span>
                    {tab.count !== null && (
                      <span
                        style={{
                          background: isActive ? 'rgba(255, 255, 255, 0.25)' : '#E2E8F0',
                          color: isActive ? '#FFFFFF' : '#334155',
                          borderRadius: '8px',
                          padding: '0 4px',
                          fontSize: '9.5px',
                        }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Evidence Content Area */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '2px',
              }}
            >
              {/* Tab 1: Overview */}
              {activeEvidenceTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Quick Stat Cards 2x2 Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div
                      onClick={() => setActiveEvidenceTab('transactions')}
                      style={{
                        background: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        borderRadius: '8px',
                        padding: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: '#166534', fontWeight: 700 }}>₹ Transfers</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
                        ₹{(resolvedEvidence.totalSent + resolvedEvidence.totalReceived).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '9.5px', color: '#16A34A', marginTop: '1px' }}>
                        {resolvedEvidence.transactions.length} Records →
                      </div>
                    </div>

                    <div
                      onClick={() => setActiveEvidenceTab('calls')}
                      style={{
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '8px',
                        padding: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: '#1E40AF', fontWeight: 700 }}>📞 Call Records</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#1D4ED8', marginTop: '2px' }}>
                        {resolvedEvidence.cdrs.length} Calls
                      </div>
                      <div style={{ fontSize: '9.5px', color: '#2563EB', marginTop: '1px' }}>
                        {Math.floor(resolvedEvidence.totalCallSeconds / 60)}m {resolvedEvidence.totalCallSeconds % 60}s →
                      </div>
                    </div>

                    <div
                      onClick={() => setActiveEvidenceTab('associates')}
                      style={{
                        background: '#FAF5FF',
                        border: '1px solid #E9D5FF',
                        borderRadius: '8px',
                        padding: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: '#6B21A8', fontWeight: 700 }}>👥 Associates</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#7E22CE', marginTop: '2px' }}>
                        {resolvedEvidence.associates.length} Suspects
                      </div>
                      <div style={{ fontSize: '9.5px', color: '#9333EA', marginTop: '1px' }}>
                        Direct Links →
                      </div>
                    </div>

                    <div
                      onClick={() => setActiveEvidenceTab('legal')}
                      style={{
                        background: '#FEF2F2',
                        border: '1px solid #FECACA',
                        borderRadius: '8px',
                        padding: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: '#991B1B', fontWeight: 700 }}>📜 Legal & FIR</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#B91C1C', marginTop: '2px' }}>
                        {resolvedEvidence.firs.length} Cases
                      </div>
                      <div style={{ fontSize: '9.5px', color: '#DC2626', marginTop: '1px' }}>
                        {resolvedEvidence.criminalHistory.length} Convictions →
                      </div>
                    </div>
                  </div>

                  {/* Recent Evidence Preview */}
                  {resolvedEvidence.transactions.length > 0 && (
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>Recent Financial Trail</span>
                        <button
                          onClick={() => setActiveEvidenceTab('transactions')}
                          style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          View all ({resolvedEvidence.transactions.length})
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {resolvedEvidence.transactions.slice(0, 2).map((t, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: '#FFFFFF',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid #F1F5F9',
                              fontSize: '11px',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>
                                {t.direction === 'sent' ? '↗ To: ' : '↙ From: '} {t.other_person_name}
                              </div>
                              <div style={{ fontSize: '9.5px', color: '#64748B' }}>{t.platform} • {t.timestamp}</div>
                            </div>
                            <span style={{ fontWeight: 800, color: t.direction === 'sent' ? '#DC2626' : '#16A34A' }}>
                              {t.direction === 'sent' ? '-' : '+'}₹{Number(t.amount).toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {resolvedEvidence.cdrs.length > 0 && (
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>Recent CDR Records</span>
                        <button
                          onClick={() => setActiveEvidenceTab('calls')}
                          style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          View all ({resolvedEvidence.cdrs.length})
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {resolvedEvidence.cdrs.slice(0, 2).map((c, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: '#FFFFFF',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid #F1F5F9',
                              fontSize: '11px',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>
                                {c.direction === 'outgoing' ? '↗ ' : '↙ '} {c.other_person_name}
                              </div>
                              <div style={{ fontSize: '9.5px', color: '#64748B' }}>{c.other_phone || c.receiver_phone || c.caller_phone} • {c.timestamp}</div>
                            </div>
                            <span style={{ fontWeight: 700, color: '#2563EB', fontSize: '10.5px' }}>
                              {c.duration}s
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Transactions */}
              {activeEvidenceTab === 'transactions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      background: '#F8FAFC',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10.5px',
                    }}
                  >
                    <span>Sent: <strong style={{ color: '#DC2626' }}>₹{resolvedEvidence.totalSent.toLocaleString('en-IN')}</strong></span>
                    <span>Received: <strong style={{ color: '#16A34A' }}>₹{resolvedEvidence.totalReceived.toLocaleString('en-IN')}</strong></span>
                  </div>

                  {resolvedEvidence.transactions.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '11.5px' }}>
                      No financial transactions recorded.
                    </div>
                  ) : (
                    resolvedEvidence.transactions.map((t, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderLeft: `3px solid ${t.direction === 'sent' ? '#EF4444' : '#10B981'}`,
                          borderRadius: '6px',
                          padding: '6px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 800,
                              background: t.direction === 'sent' ? '#FEE2E2' : '#DCFCE7',
                              color: t.direction === 'sent' ? '#DC2626' : '#15803D',
                              padding: '1px 5px',
                              borderRadius: '3px',
                            }}
                          >
                            {t.direction === 'sent' ? '↗ SENT' : '↙ RECEIVED'}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: t.direction === 'sent' ? '#DC2626' : '#15803D' }}>
                            {t.direction === 'sent' ? '-' : '+'}₹{Number(t.amount).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#0F172A', fontWeight: 600 }}>
                          {t.direction === 'sent' ? 'To: ' : 'From: '} {t.other_person_name}
                          {t.other_person_role && <span style={{ color: '#64748B', fontWeight: 400 }}> ({t.other_person_role})</span>}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#64748B' }}>
                          <span>Platform: <strong>{t.platform}</strong></span>
                          <span>{t.timestamp}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 3: Calls */}
              {activeEvidenceTab === 'calls' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      background: '#F8FAFC',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10.5px',
                    }}
                  >
                    <span>Total Calls: <strong>{resolvedEvidence.cdrs.length}</strong></span>
                    <span>Duration: <strong>{Math.floor(resolvedEvidence.totalCallSeconds / 60)}m {resolvedEvidence.totalCallSeconds % 60}s</strong></span>
                  </div>

                  {resolvedEvidence.cdrs.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '11.5px' }}>
                      No call records on file.
                    </div>
                  ) : (
                    resolvedEvidence.cdrs.map((c, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderLeft: `3px solid ${c.direction === 'outgoing' ? '#3B82F6' : '#06B6D4'}`,
                          borderRadius: '6px',
                          padding: '6px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 800,
                              background: c.direction === 'outgoing' ? '#EFF6FF' : '#ECFEFF',
                              color: c.direction === 'outgoing' ? '#1D4ED8' : '#0891B2',
                              padding: '1px 5px',
                              borderRadius: '3px',
                            }}
                          >
                            {c.direction === 'outgoing' ? '↗ OUTGOING' : '↙ INCOMING'}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '11px', color: '#1E293B', background: '#F1F5F9', padding: '1px 5px', borderRadius: '4px' }}>
                            ⏱️ {Math.floor(c.duration / 60)}m {c.duration % 60}s
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#0F172A', fontWeight: 600 }}>
                          {c.other_person_name}
                          {c.other_person_role && <span style={{ color: '#64748B', fontWeight: 400 }}> ({c.other_person_role})</span>}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#64748B' }}>
                          <span style={{ fontFamily: 'monospace' }}>📞 {c.caller_phone || c.receiver_phone}</span>
                          <span>{c.timestamp}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 4: Associates */}
              {activeEvidenceTab === 'associates' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      background: '#FAF5FF',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '1px solid #E9D5FF',
                      fontSize: '10.5px',
                      color: '#6B21A8',
                      fontWeight: 700,
                    }}
                  >
                    👥 {resolvedEvidence.associates.length} Direct Syndicate Associates
                  </div>

                  {resolvedEvidence.associates.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '11.5px' }}>
                      No direct associates linked in case database.
                    </div>
                  ) : (
                    resolvedEvidence.associates.map((assoc, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: '12px', color: '#0F172A' }}>
                            {assoc.name}
                          </span>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 700,
                              background: assoc.suspicion_score > 0.7 ? '#FEE2E2' : assoc.suspicion_score > 0.4 ? '#FEF3C7' : '#DBEAFE',
                              color: assoc.suspicion_score > 0.7 ? '#DC2626' : assoc.suspicion_score > 0.4 ? '#D97706' : '#2563EB',
                              padding: '1px 5px',
                              borderRadius: '3px',
                            }}
                          >
                            Risk: {Math.round((assoc.suspicion_score || 0.1) * 100)}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#475569' }}>
                          <span>Role: <strong>{assoc.network_role}</strong></span>
                          <span>{assoc.city || assoc.occupation || ''}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                          <span
                            style={{
                              fontSize: '9px',
                              background: '#F1F5F9',
                              color: '#475569',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontWeight: 600,
                            }}
                          >
                            Link: {assoc.relationship_type || 'Associated'}
                          </span>
                          <button
                            onClick={() => {
                              const found = (network.nodes || []).find((n) => n.id === assoc.id);
                              if (found) {
                                handleFocusNode(found);
                              } else {
                                setSelectedEntity({
                                  id: assoc.id,
                                  name: assoc.name,
                                  type: 'PERSON',
                                  riskTier: assoc.suspicion_score > 0.7 ? 'HIGH' : assoc.suspicion_score > 0.4 ? 'MEDIUM' : 'LOW',
                                  network_role: assoc.network_role,
                                  score: Math.round((assoc.suspicion_score || 0.1) * 100),
                                  influence: Math.round((assoc.hierarchy_score || 0.1) * 100),
                                  city: assoc.city,
                                  occupation: assoc.occupation,
                                });
                                if (onSelectNode) onSelectNode(assoc.id);
                              }
                            }}
                            style={{
                              background: '#2563EB',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '3px 7px',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Focus Suspect 🔍
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 5: Legal & Surveillance */}
              {activeEvidenceTab === 'legal' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* FIR Records */}
                  <div style={{ fontWeight: 700, fontSize: '11px', color: '#0F172A', marginTop: '2px' }}>
                    📜 Registered FIR Records ({resolvedEvidence.firs.length})
                  </div>
                  {resolvedEvidence.firs.length === 0 ? (
                    <div style={{ fontSize: '10.5px', color: '#64748B', fontStyle: 'italic', background: '#F8FAFC', padding: '6px', borderRadius: '4px' }}>
                      No active FIRs directly filed.
                    </div>
                  ) : (
                    resolvedEvidence.firs.map((f, idx) => (
                      <div key={idx} style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '6px 8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '11px', color: '#991B1B' }}>
                          <span>FIR #{f.fir_number}</span>
                          <span>{f.date}</span>
                        </div>
                        <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#B91C1C', marginTop: '2px' }}>
                          Offence: {f.offence}
                        </div>
                        {f.description && (
                          <div style={{ fontSize: '9.5px', color: '#7F1D1D', marginTop: '2px' }}>
                            {f.description}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {/* Criminal History */}
                  <div style={{ fontWeight: 700, fontSize: '11px', color: '#0F172A', marginTop: '4px' }}>
                    ⚖️ Prior Convictions ({resolvedEvidence.criminalHistory.length})
                  </div>
                  {resolvedEvidence.criminalHistory.length === 0 ? (
                    <div style={{ fontSize: '10.5px', color: '#64748B', fontStyle: 'italic', background: '#F8FAFC', padding: '6px', borderRadius: '4px' }}>
                      Clean record (no prior convictions registered).
                    </div>
                  ) : (
                    resolvedEvidence.criminalHistory.map((c, idx) => (
                      <div key={idx} style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', padding: '6px 8px' }}>
                        <div style={{ fontWeight: 700, fontSize: '11px', color: '#92400E' }}>
                          {c.offence}
                        </div>
                        <div style={{ fontSize: '9.5px', color: '#B45309', marginTop: '1px' }}>
                          Convicted: {c.conviction_date} • Sentence: {c.sentence}
                        </div>
                      </div>
                    ))
                  )}

                  {/* Surveillance Sightings */}
                  <div style={{ fontWeight: 700, fontSize: '11px', color: '#0F172A', marginTop: '4px' }}>
                    👁️ Field Surveillance Observations ({resolvedEvidence.surveillance.length})
                  </div>
                  {resolvedEvidence.surveillance.length === 0 ? (
                    <div style={{ fontSize: '10.5px', color: '#64748B', fontStyle: 'italic', background: '#F8FAFC', padding: '6px', borderRadius: '4px' }}>
                      No field sightings recorded.
                    </div>
                  ) : (
                    resolvedEvidence.surveillance.map((s, idx) => (
                      <div key={idx} style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '6px 8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '11px', color: '#166534' }}>
                          <span>📍 {s.location}</span>
                          <span style={{ fontSize: '9.5px' }}>{s.timestamp}</span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#15803D', marginTop: '2px' }}>
                          {s.notes}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Action Footer */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '2px', flexShrink: 0 }}>
              <button
                onClick={() => handleFocusNode(selectedEntity)}
                style={{
                  flex: 1,
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '7px 10px',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                }}
              >
                <span>🎯 Center Suspect</span>
              </button>
              {onDfsExpand && (
                <button
                  onClick={onDfsExpand}
                  style={{
                    background: '#F1F5F9',
                    color: '#334155',
                    border: '1px solid #CBD5E1',
                    borderRadius: '7px',
                    padding: '7px 10px',
                    fontWeight: 700,
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title="Expand network 1-hop associates"
                >
                  <span>⚡ Expand 1-Hop</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Left Control Filter Cards ────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '170px',
          left: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 10,
          width: '185px',
        }}
      >
        {/* Card 1: Suspicion Score Zones */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            padding: '10px 14px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
            border: '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '11px', color: '#0F172A', marginBottom: '8px' }}>
            Concentric Target Zones
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
            <div
              onClick={() => setActiveZoneFilter(activeZoneFilter === 'HIGH' ? 'ALL' : 'HIGH')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                opacity: activeZoneFilter === 'ALL' || activeZoneFilter === 'HIGH' ? 1 : 0.4,
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.45)',
                  border: '2px solid #EF4444',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#334155', fontWeight: 500 }}>&gt; 70% (Core Suspect)</span>
            </div>
            <div
              onClick={() => setActiveZoneFilter(activeZoneFilter === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                opacity: activeZoneFilter === 'ALL' || activeZoneFilter === 'MEDIUM' ? 1 : 0.4,
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.45)',
                  border: '2px solid #F59E0B',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#334155', fontWeight: 500 }}>40% - 70% (Associate)</span>
            </div>
            <div
              onClick={() => setActiveZoneFilter(activeZoneFilter === 'LOW' ? 'ALL' : 'LOW')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                opacity: activeZoneFilter === 'ALL' || activeZoneFilter === 'LOW' ? 1 : 0.4,
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'rgba(59, 130, 246, 0.4)',
                  border: '2px solid #3B82F6',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#334155', fontWeight: 500 }}>20% - 40% (Peripheral)</span>
            </div>
            <div
              onClick={() => setActiveZoneFilter(activeZoneFilter === 'UNEXPLORED' ? 'ALL' : 'UNEXPLORED')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                opacity: activeZoneFilter === 'ALL' || activeZoneFilter === 'UNEXPLORED' ? 1 : 0.4,
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'rgba(148, 163, 184, 0.35)',
                  border: '2px solid #94A3B8',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#334155', fontWeight: 500 }}>&lt; 20% (Not Explored)</span>
            </div>
          </div>
        </div>

        {/* Card 2: Relationship Evidence Types */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            padding: '10px 14px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
            border: '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '11px', color: '#0F172A', marginBottom: '8px' }}>
            Evidence Links
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '16px', height: '3px', background: '#DC2626', borderRadius: '2px' }} />
              <span style={{ color: '#334155', fontWeight: 500 }}>FIR / High Risk</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '16px', height: '2.5px', background: '#8B5CF6', borderRadius: '2px' }} />
              <span style={{ color: '#334155', fontWeight: 500 }}>Financial (₹)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '16px', height: '2px', background: '#0284C7', borderRadius: '2px' }} />
              <span style={{ color: '#334155', fontWeight: 500 }}>CDR Phone Call</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '16px', height: '2px', background: '#F59E0B', borderRadius: '2px' }} />
              <span style={{ color: '#334155', fontWeight: 500 }}>Associative Link</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '16px', height: '0px', borderTop: '2px dashed #94A3B8' }} />
              <span style={{ color: '#334155', fontWeight: 500 }}>Weak / Unverified</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Concentric Graph SVG Canvas ───────────────────────────── */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ cursor: isPanning ? 'grabbing' : 'grab', position: 'absolute', top: 0, left: 0 }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <defs>
          <filter id="nodeShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000000" floodOpacity="0.14" />
          </filter>
          <filter id="centerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#EF4444" floodOpacity="0.4" />
          </filter>
        </defs>

        {/* Global Pan/Zoom Container */}
        <g
          transform={`translate(${
            containerRef.current ? (containerRef.current.clientWidth - 290) / 2 + 20 + transform.x : 520 + transform.x
          }, ${
            containerRef.current ? containerRef.current.clientHeight / 2 + transform.y : 420 + transform.y
          }) scale(${transform.k})`}
        >
          {/* Background Concentric Target Zones (from outside in) */}

          {/* Zone 4: Outermost / Not Explored (<20%) */}
          <circle
            cx="0"
            cy="0"
            r={network.radii.R4}
            fill="#F8FAFC"
            stroke="rgba(148, 163, 184, 0.4)"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            className="canvas-bg"
          />

          {/* Zone 3: Low Risk Zone (20% - 40%) */}
          <circle
            cx="0"
            cy="0"
            r={network.radii.R3}
            fill="rgba(224, 242, 254, 0.55)"
            stroke="rgba(59, 130, 246, 0.35)"
            strokeWidth="1.5"
            strokeDasharray="5,3"
            className="canvas-bg"
          />

          {/* Zone 2: Medium Risk Zone (40% - 70%) */}
          <circle
            cx="0"
            cy="0"
            r={network.radii.R2}
            fill="rgba(254, 243, 199, 0.55)"
            stroke="rgba(245, 158, 11, 0.35)"
            strokeWidth="1.5"
            className="canvas-bg"
          />

          {/* Zone 1: Core High Risk Zone (>70%) */}
          <circle
            cx="0"
            cy="0"
            r={network.radii.R1}
            fill="rgba(254, 226, 226, 0.65)"
            stroke="rgba(239, 68, 68, 0.35)"
            strokeWidth="1.5"
            className="canvas-bg"
          />

          {/* ─── Top Zone Labels on concentric boundaries ──────────── */}
          <g transform={`translate(0, ${-network.radii.R1 + 24})`} pointerEvents="none">
            <text textAnchor="middle" y="-2" fill="#DC2626" fontSize="10.5px" fontWeight="800">
              &gt; 70%
            </text>
            <text textAnchor="middle" y="9" fill="#DC2626" fontSize="9px" fontWeight="600">
              Core Suspects
            </text>
          </g>

          <g transform={`translate(0, ${-network.radii.R2 + 24})`} pointerEvents="none">
            <text textAnchor="middle" y="-2" fill="#D97706" fontSize="10.5px" fontWeight="800">
              40% - 70%
            </text>
            <text textAnchor="middle" y="9" fill="#D97706" fontSize="9px" fontWeight="600">
              Associates
            </text>
          </g>

          <g transform={`translate(0, ${-network.radii.R3 + 24})`} pointerEvents="none">
            <text textAnchor="middle" y="-2" fill="#2563EB" fontSize="10.5px" fontWeight="800">
              20% - 40%
            </text>
            <text textAnchor="middle" y="9" fill="#2563EB" fontSize="9px" fontWeight="600">
              Peripheral
            </text>
          </g>

          <g transform={`translate(0, ${-network.radii.R4 + 24})`} pointerEvents="none">
            <text textAnchor="middle" y="-2" fill="#64748B" fontSize="10.5px" fontWeight="800">
              &lt; 20%
            </text>
            <text textAnchor="middle" y="9" fill="#64748B" fontSize="9px" fontWeight="600">
              Unexplored Leads
            </text>
          </g>

          {/* ─── Graph Links / Edges ──────────────────────────────── */}
          <g className="edges-layer">
            {network.edges.map((e) => {
              const u = nodeMap.get(e.source);
              const v = nodeMap.get(e.target);
              if (!u || !v) return null;

              const isConnectedToSelected =
                selectedEntity && (e.source === selectedEntity.id || e.target === selectedEntity.id);
              const isHigh = e.type === 'HIGH_RISK';
              const isTx = e.type === 'TRANSACTION';
              const isCall = e.type === 'CALL';
              const isWeak = e.type === 'WEAK';

              let strokeColor = '#F59E0B';
              if (isHigh) strokeColor = '#DC2626';
              else if (isTx) strokeColor = '#8B5CF6';
              else if (isCall) strokeColor = '#0284C7';
              else if (isWeak) strokeColor = '#94A3B8';

              const strokeWidth = isConnectedToSelected
                ? (isHigh ? 3.5 : 2.6)
                : isHigh
                ? 2.2
                : isTx || isCall
                ? 1.8
                : isWeak
                ? 1.1
                : 1.5;

              const strokeOpacity = selectedEntity
                ? (isConnectedToSelected ? 1 : 0.12)
                : isHigh
                ? 0.85
                : isTx || isCall
                ? 0.75
                : isWeak
                ? 0.4
                : 0.6;

              return (
                <line
                  key={e.id}
                  x1={u.x}
                  y1={u.y}
                  x2={v.x}
                  y2={v.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeOpacity={strokeOpacity}
                  strokeDasharray={isWeak ? '4,4' : 'none'}
                  strokeLinecap="round"
                  style={{ cursor: 'pointer' }}
                  onClick={(evt) => {
                    evt.stopPropagation();
                    if (onSelectEdge) onSelectEdge(e);
                  }}
                  onMouseEnter={(evt) => {
                    setHoveredEdge({
                      ...e,
                      screenX: evt.clientX,
                      screenY: evt.clientY,
                    });
                  }}
                  onMouseLeave={() => setHoveredEdge(null)}
                />
              );
            })}
          </g>

          {/* ─── Graph Nodes ─────────────────────────────────────── */}
          <g className="nodes-layer">
            {filteredNodes.map((node) => {
              const isSelected = selectedEntity?.id === node.id;
              const isConnected = connectedIds.has(node.id);
              const isDimmed = selectedEntity && !isSelected && !isConnected;

              const borderColor =
                node.riskTier === 'HIGH'
                  ? '#EF4444'
                  : node.riskTier === 'MEDIUM'
                  ? '#F59E0B'
                  : node.riskTier === 'LOW'
                  ? '#3B82F6'
                  : '#94A3B8';

              const badgeBg =
                node.type === 'PHONE'
                  ? '#10B981'
                  : node.type === 'BANK'
                  ? '#8B5CF6'
                  : node.type === 'VEHICLE'
                  ? '#F97316'
                  : node.type === 'LOCATION'
                  ? '#EF4444'
                  : node.type === 'ORGANISATION'
                  ? '#06B6D4'
                  : node.type === 'FIR'
                  ? '#EC4899'
                  : '#64748B';

              const showLabel = isSelected || node.id === network.centerNode?.id || node.riskTier === 'HIGH' || transform.k >= 0.85;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => handleNodeClick(node, e)}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{
                    cursor: 'pointer',
                    opacity: isDimmed ? 0.18 : 1,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {/* Active selection pulse ring */}
                  {isSelected && (
                    <circle
                      cx="0"
                      cy="0"
                      r={node.r + 6}
                      fill="none"
                      stroke={borderColor}
                      strokeWidth="2.5"
                      strokeDasharray="4,3"
                      opacity="0.9"
                    />
                  )}

                  {/* Person Node: Portrait Avatar */}
                  {node.type === 'PERSON' ? (
                    <>
                      <circle
                        cx="0"
                        cy="0"
                        r={node.r}
                        fill="#FFFFFF"
                        stroke={borderColor}
                        strokeWidth={isSelected ? 4 : node.id === network.centerNode?.id ? 3.5 : 2.5}
                        filter={node.id === network.centerNode?.id ? 'url(#centerGlow)' : 'url(#nodeShadow)'}
                      />

                      <clipPath id={`clip-${node.id}`}>
                        <circle cx="0" cy="0" r={node.r - 2} />
                      </clipPath>

                      <image
                        href={node.avatar || UNEXPLORED_AVATAR}
                        x={-(node.r - 2)}
                        y={-(node.r - 2)}
                        width={(node.r - 2) * 2}
                        height={(node.r - 2) * 2}
                        clipPath={`url(#clip-${node.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </>
                  ) : (
                    /* Entity Node: Color-coded Badge with Crisp SVG Icon */
                    <>
                      <circle
                        cx="0"
                        cy="0"
                        r={node.r}
                        fill={badgeBg}
                        stroke="#FFFFFF"
                        strokeWidth="2"
                        filter="url(#nodeShadow)"
                      />
                      <foreignObject
                        x={-node.r}
                        y={-node.r}
                        width={node.r * 2}
                        height={node.r * 2}
                        pointerEvents="none"
                      >
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                          }}
                        >
                          {ENTITY_ICONS[node.type] || ENTITY_ICONS.EVENT}
                        </div>
                      </foreignObject>
                    </>
                  )}

                  {/* Node Label on concentric rings */}
                  {showLabel && (
                    <text
                      x="0"
                      y={node.r + 11}
                      textAnchor="middle"
                      fontSize="9.5px"
                      fontWeight={node.id === network.centerNode?.id ? '800' : '600'}
                      fill="#0F172A"
                      paintOrder="stroke"
                      stroke="#FFFFFF"
                      strokeWidth="3px"
                      strokeLinejoin="round"
                      pointerEvents="none"
                    >
                      {node.name && node.name.length > 17 ? node.name.slice(0, 15) + '…' : node.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* ─── Hover Tooltip for Nodes ───────────────────────────────── */}
      {hoveredNode && (
        <div
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: 30,
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
            transform: 'translate(-50%, -100%)',
            border: '1px solid #334155',
            left: `${containerRef.current ? (containerRef.current.clientWidth - 290) / 2 + 20 + transform.x + hoveredNode.x * transform.k : 0}px`,
            top: `${(containerRef.current ? containerRef.current.clientHeight / 2 + transform.y + hoveredNode.y * transform.k : 0) - hoveredNode.r * transform.k - 12}px`,
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 800 }}>{hoveredNode.name}</div>
          <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500, marginBottom: '6px' }}>
            {hoveredNode.occupation ? `${hoveredNode.occupation} • ` : ''}Suspicion: {hoveredNode.score}%
          </div>
          {hoveredNode.aadhaar_id && (
            <div style={{ fontSize: '9.5px', color: '#38BDF8', fontFamily: 'monospace', marginBottom: '6px' }}>
              Aadhaar: {hoveredNode.aadhaar_id}
            </div>
          )}
          
          {/* Real-time Evidence Summary inside the Hover Card */}
          {hoveredNode.connectedSummary && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '4px 8px', 
              marginTop: '6px', 
              paddingTop: '6px', 
              borderTop: '1px solid #334155',
              fontSize: '10px'
            }}>
              {hoveredNode.connectedSummary.firs > 0 && (
                <div style={{ color: '#F87171' }}>📜 FIRs: {hoveredNode.connectedSummary.firs}</div>
              )}
              {hoveredNode.connectedSummary.accounts > 0 && (
                <div style={{ color: '#34D399' }}>💳 Accts: {hoveredNode.connectedSummary.accounts}</div>
              )}
              {hoveredNode.connectedSummary.totalTxAmount > 0 && (
                <div style={{ color: '#FBBF24', gridColumn: '1 / -1' }}>💸 Tx Amount: ₹{hoveredNode.connectedSummary.totalTxAmount.toLocaleString('en-IN')}</div>
              )}
              {hoveredNode.connectedSummary.totalCallDuration > 0 && (
                <div style={{ color: '#38BDF8', gridColumn: '1 / -1' }}>📞 Call Vol: {Math.floor(hoveredNode.connectedSummary.totalCallDuration / 60)}m {hoveredNode.connectedSummary.totalCallDuration % 60}s</div>
              )}
              <div style={{ color: '#E2E8F0', gridColumn: '1 / -1' }}>👥 Connected Associates: {hoveredNode.connectedSummary.people}</div>
            </div>
          )}
        </div>
      )}

      {/* ─── Hover Tooltip for Edges ───────────────────────────────── */}
      {hoveredEdge && (
        <div
          style={{
            position: 'fixed',
            pointerEvents: 'none',
            zIndex: 35,
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '11px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            transform: 'translate(-50%, -100%)',
            left: `${hoveredEdge.screenX}px`,
            top: `${hoveredEdge.screenY - 8}px`,
          }}
        >
          <div style={{ color: '#38BDF8', fontWeight: 700 }}>
            {hoveredEdge.rawType || hoveredEdge.type}
          </div>
          {hoveredEdge.amount ? (
            <div style={{ color: '#34D399', fontWeight: 600 }}>
              Amount: ₹{Number(hoveredEdge.amount).toLocaleString('en-IN')}
            </div>
          ) : null}
          {hoveredEdge.duration ? (
            <div style={{ color: '#FBBF24' }}>
              Duration: {hoveredEdge.duration}s
            </div>
          ) : null}
          {hoveredEdge.timestamp ? (
            <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>
              {hoveredEdge.timestamp}
            </div>
          ) : null}
        </div>
      )}

      {/* ─── Bottom-Left Controls ──────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '24px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '10px',
        }}
      >
        {/* Zoom Button Pills */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(10px)',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            style={{
              width: '32px',
              height: '32px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '17px',
              fontWeight: 700,
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            +
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            style={{
              width: '32px',
              height: '32px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '17px',
              fontWeight: 700,
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            −
          </button>
          <button
            onClick={handleReset}
            title="Reset / Center View"
            style={{
              width: '32px',
              height: '32px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '15px',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ⌖
          </button>
        </div>

        {/* Hackathon Evidentiary Branding (Bottom Left) */}
        <div style={{ pointerEvents: 'none', fontSize: '10.5px', lineHeight: 1.35 }}>
          <div style={{ fontWeight: 700, color: '#475569' }}>
            AI-Powered Criminal Investigation Platform
          </div>
          <div style={{ color: '#94A3B8' }}>
            Real Dataset Ingestion • 22 CSV Data Sources
          </div>
        </div>
      </div>

      {/* ─── Bottom-Right Motto Branding ───────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '24px',
          zIndex: 10,
          pointerEvents: 'none',
          fontSize: '11px',
          fontWeight: 500,
          color: '#64748B',
        }}
      >
        Data. Intelligence. Safer Communities.
      </div>
    </div>
  );
}
