/**
 * cyberGraphAdapter.js
 * 
 * Transforms backend case intelligence graph (nodes, edges, evidence records)
 * into a clean, intuitive, uncluttered Cyber Crime Investigation Link Graph.
 * 
 * Design Philosophy:
 * - By default, focuses on the core 7-person syndicate hierarchy (just like the concentric rings view)
 *   so investigators immediately see who is who, who reports to whom, and where the money/calls flow.
 * - Digital footprints (phone numbers, device OS, IP, crypto wallet, telegram handles, prior FIRs)
 *   are embedded directly into each suspect's card as compact intelligence pills, avoiding the visual
 *   clutter of 50+ separate floating nodes.
 * - Supports selective on-demand expansion of digital assets for an individual selected suspect.
 */

export const ENTITY_CATEGORIES = {
  PERSON: {
    id: 'PERSON',
    label: 'Suspect / Person',
    icon: '👤',
    color: '#EF4444',
    bgDark: 'rgba(239, 68, 68, 0.12)',
    border: '#DC2626',
    glow: 'rgba(239, 68, 68, 0.4)',
  },
  DEVICE: {
    id: 'DEVICE',
    label: 'Device',
    icon: '💻',
    color: '#06B6D4',
    bgDark: 'rgba(6, 182, 212, 0.12)',
    border: '#0891B2',
    glow: 'rgba(6, 182, 212, 0.4)',
  },
  IP: {
    id: 'IP',
    label: 'IP Address',
    icon: '🌐',
    color: '#3B82F6',
    bgDark: 'rgba(59, 130, 246, 0.12)',
    border: '#2563EB',
    glow: 'rgba(59, 130, 246, 0.4)',
  },
  PHONE: {
    id: 'PHONE',
    label: 'Phone Number',
    icon: '📱',
    color: '#10B981',
    bgDark: 'rgba(16, 185, 129, 0.12)',
    border: '#059669',
    glow: 'rgba(16, 185, 129, 0.4)',
  },
  SOCIAL_ACCOUNT: {
    id: 'SOCIAL_ACCOUNT',
    label: 'Social Account',
    icon: '💬',
    color: '#EC4899',
    bgDark: 'rgba(236, 72, 153, 0.12)',
    border: '#DB2777',
    glow: 'rgba(236, 72, 153, 0.4)',
  },
  CRYPTO_WALLET: {
    id: 'CRYPTO_WALLET',
    label: 'Crypto Wallet',
    icon: '🪙',
    color: '#F59E0B',
    bgDark: 'rgba(245, 158, 11, 0.12)',
    border: '#D97706',
    glow: 'rgba(245, 158, 11, 0.4)',
  },
  LOCATION: {
    id: 'LOCATION',
    label: 'Location',
    icon: '📍',
    color: '#F97316',
    bgDark: 'rgba(249, 115, 22, 0.12)',
    border: '#EA580C',
    glow: 'rgba(249, 115, 22, 0.4)',
  },
  EVIDENCE: {
    id: 'EVIDENCE',
    label: 'Evidence Record',
    icon: '📂',
    color: '#94A3B8',
    bgDark: 'rgba(148, 163, 184, 0.12)',
    border: '#64748B',
    glow: 'rgba(148, 163, 184, 0.4)',
  },
};

// Known syndicate roles based on case intelligence
const KNOWN_ROLES = {
  'Vikram Malhotra': {
    role: 'Mastermind / Seed',
    badgeText: 'KINGPIN',
    tier: 1,
    accent: '#FFD600',
    device: 'Hardened ThinkPad X1 (Ubuntu Hardened)',
    ip: '185.220.101.5 (TOR Gateway)',
    wallet: '0x7a92...3210 (ETH)',
    social: '@the_boss_ops (Telegram)',
    c2: 'YARA: CobaltStrike v4.8',
  },
  'Karan Joshi': {
    role: 'Operations Lieutenant & Bridge',
    badgeText: 'BRIDGE NODE',
    tier: 2,
    accent: '#38BDF8',
    device: 'Pixel 8 Pro (GrapheneOS)',
    ip: '103.241.22.84 (VPN Proxy)',
    wallet: '0x3f11...8842 (USDT)',
    social: '@kay_ops (Telegram)',
    simHops: '3 SIM Cards Active',
  },
  'Rohan Sharma': {
    role: 'Hawala Mule Account Holder',
    badgeText: 'MULE ACCT 1',
    tier: 3,
    accent: '#34D399',
    device: 'Samsung Galaxy S22',
    ip: '115.112.44.19 (Mumbai Airtel)',
    wallet: '0x88bb...9901 (TRC-20)',
    social: '@rohan_s',
    bank: 'HDFC Current: ₹12.5L Inflow',
  },
  'Sameer Merchant': {
    role: 'Hawala Cash Angadia Broker',
    badgeText: 'HAWALA BROKER',
    tier: 4,
    accent: '#F59E0B',
    device: 'iPhone 14 Encrypted',
    ip: '14.139.110.2 (Zaveri Bazar)',
    wallet: '0xcc33...4422 (Cash Counter)',
    social: '@merchant_bhai',
    counter: 'Zaveri Bazar Vault-4',
  },
  'Devendra Kumar': {
    role: 'Hawala Cash Courier',
    badgeText: 'CASH COURIER',
    tier: 4,
    accent: '#F97316',
    device: 'Vivo V27 (Burner)',
    ip: '117.201.88.9 (BKC Cell)',
    wallet: 'Cash Hawala Slip #882',
    social: '@dev_express',
    transit: 'BKC - Nariman Point Transit',
  },
  'Amit Patel': {
    role: 'Cyber Technical / Phishing C2',
    badgeText: 'CYBER SPECIALIST',
    tier: 3,
    accent: '#A855F7',
    device: 'MacBook Pro M2 (Kali Linux VM)',
    ip: '45.154.255.8 (Bulletproof Host)',
    wallet: '0x0xAm...7766 (Monero Swapper)',
    social: '@0xamit (Keybase)',
    telemetry: 'Phishing Kit F-492',
  },
  'Pooja Nair': {
    role: 'Co-Accused / Corporate Insider',
    badgeText: 'CO-ACCUSED',
    tier: 3,
    accent: '#EF4444',
    device: 'Dell Latitude Enterprise',
    ip: '49.36.120.65 (Bengaluru)',
    wallet: 'Axis Salary Account',
    social: '@pooja_n',
    priorFir: 'FIR-2022-DEL-0789',
  },
};

/**
 * Builds the cyber investigation graph.
 * 
 * @param {Object} graphData - Backend graph payload { nodes: [], edges: [] }
 * @param {Object} caseInfo - Case metadata
 * @param {Object} options - Configuration options:
 *   - mode: 'syndicate' (default, 7 persons + links) | 'expanded' (suspects + expanded assets) | 'full'
 *   - expandedSuspectId: person ID to expand satellite nodes for
 *   - edgeFilter: 'ALL' | 'TRANSACTION' | 'CALL' | 'FIR' | 'SURVEILLANCE'
 *   - layoutDirection: 'RIGHT' | 'DOWN'
 */
export function buildCyberGraph(graphData, caseInfo = {}, options = {}) {
  const {
    mode = 'syndicate', // 'syndicate' | 'expanded' | 'full'
    expandedSuspectId = null,
    edgeFilter = 'ALL',
    layoutDirection = 'RIGHT',
  } = options;

  const rawNodes = graphData?.nodes || [];
  const rawEdges = graphData?.edges || [];

  const nodes = [];
  const edges = [];
  const nodeMap = new Map();

  // Helper to add node
  const addNode = (node) => {
    if (nodeMap.has(node.id)) return nodeMap.get(node.id);
    nodeMap.set(node.id, node);
    nodes.push(node);
    return node;
  };

  // Helper to add edge
  const addEdge = (edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return;
    edges.push({
      ...edge,
      id: edge.id || `edge-${edge.source}->${edge.target}-${edge.data?.relationshipType || 'rel'}`,
      type: 'cyberEdge',
    });
  };

  // Helper to format syndicate role
  const getSyndicateRole = (person, known) => {
    if (known.role) return { role: known.role, badge: known.badgeText, tier: known.tier || 1, accent: known.accent || '#FFD600' };
    const r = (person.network_role || '').toLowerCase();
    if (r.includes('kingpin')) {
      return { role: r.includes('financial') ? 'Financial Kingpin / Hawala Controller' : 'Syndicate Mastermind', badge: 'KINGPIN', tier: 1, accent: '#FFD600' };
    }
    if (r.includes('lieutenant')) {
      return { role: 'Operations Lieutenant & Bridge', badge: 'LIEUTENANT', tier: 2, accent: '#38BDF8' };
    }
    if (r.includes('mule')) {
      return { role: 'Hawala Mule Account Holder', badge: 'FINANCIAL MULE', tier: 3, accent: '#34D399' };
    }
    if (r.includes('operative')) {
      return { role: 'Field Operative / Telecom Asset', badge: 'OPERATIVE', tier: 3, accent: '#A855F7' };
    }
    if (r.includes('peripheral')) {
      return { role: 'Peripheral Associate', badge: 'PERIPHERAL', tier: 4, accent: '#94A3B8' };
    }
    if (person.is_seed) {
      return { role: 'Primary Target / Seed', badge: 'TARGET', tier: 1, accent: '#FFD600' };
    }
    const band = person.confidence_band;
    if (band === 'inner') return { role: 'Inner Core Syndicate Member', badge: 'INNER CORE', tier: 1, accent: '#FFD600' };
    if (band === 'middle') return { role: 'Syndicate Operative', badge: 'OPERATIVE', tier: 2, accent: '#38BDF8' };
    return { role: 'Associate / Contact', badge: 'ASSOCIATE', tier: 3, accent: '#94A3B8' };
  };

  // 1. Build Person / Suspect Nodes
  rawNodes.forEach((person) => {
    const pId = person.id;
    const name = person.name || 'Unknown Suspect';
    const known = KNOWN_ROLES[name] || {};
    const riskPct = Math.round((person.suspicion_score || 0) * 100);

    // Determine confidence band
    let band = person.confidence_band;
    if (!band) {
      band = riskPct >= 75 ? 'inner' : riskPct >= 40 ? 'middle' : 'outer';
    }

    // Role text and badge
    const roleInfo = getSyndicateRole(person, known);
    const roleTitle = roleInfo.role;
    const badgeLabel = roleInfo.badge;

    // Digital footprint embedded directly in the card
    const phones = person.phone_numbers || [];
    const primaryPhone = phones[0] || (known.simHops ? '3 SIMs (Hopping)' : (person.city ? `+91 (${person.city})` : '+91 98XXX XXXXX'));
    
    const digitalFootprint = {
      phone: primaryPhone,
      allPhones: phones,
      device: known.device || `${person.occupation || 'Mobile Device'} (${person.city || 'Active Unit'})`,
      ip: known.ip || (person.city ? `${person.city} Gateway` : 'TOR Relay Gateway'),
      wallet: known.wallet || (person.financial_account || (roleInfo.badge.includes('MULE') || roleInfo.badge.includes('FINANCIAL') ? 'Hawala Ledger Mule A/c' : null)),
      bank: known.bank || (roleInfo.badge.includes('MULE') ? 'Mule Account (Layering)' : null),
      social: known.social || (person.aliases?.[0] ? `@${person.aliases[0].toLowerCase().replace(/\s+/g, '_')}` : `@${name.toLowerCase().replace(/\s+/g, '_')}`),
      priorRecord: person.criminal_history_flag ? 'Prior Criminal FIR' : null,
      crossCases: person.cross_case_refs || [],
      aliases: person.aliases || [],
      accentColor: roleInfo.accent,
      tier: roleInfo.tier,
      city: person.city,
      aadhaar: person.aadhaar_id,
      occupation: person.occupation,
    };

    const secondaryDetails = [
      person.city,
      person.aadhaar_id ? `Aadhaar: ${person.aadhaar_id}` : null,
      `Rank: ${(person.hierarchy_score || 0.5).toFixed(2)}`
    ].filter(Boolean).join(' • ');

    // Add clean Suspect Node
    const personNode = addNode({
      id: pId,
      type: 'cyberNode',
      position: { x: 0, y: 0 },
      data: {
        category: 'PERSON',
        title: name,
        primaryValue: person.occupation || roleTitle,
        secondaryValue: secondaryDetails,
        badge: badgeLabel,
        riskScore: riskPct,
        icon: person.is_seed || roleInfo.tier === 1 ? '👑' : '👤',
        isSeed: !!person.is_seed || roleInfo.tier === 1,
        explored: !!person.explored,
        criminalHistory: !!person.criminal_history_flag,
        confidenceBand: band,
        digitalFootprint,
        tier: digitalFootprint.tier,
        isExpanded: expandedSuspectId === pId,
        metadata: {
          suspectId: pId,
          name,
          riskScore: riskPct,
          status: person.is_seed ? 'Primary Target' : 'Active Operative',
          criminalHistory: !!person.criminal_history_flag,
          crossCaseRefs: person.cross_case_refs || [],
          aliases: person.aliases || [],
          confidenceBand: band,
        },
      },
    });

    // 2. If this suspect is expanded (or in 'full' mode), spawn clean satellite asset nodes
    const shouldExpandAssets = mode === 'full' || (mode === 'expanded' && expandedSuspectId === pId);

    if (shouldExpandAssets && personNode) {
      // Asset A: Primary Phone Node
      const phoneId = `asset-phone-${pId}`;
      const phoneNode = addNode({
        id: phoneId,
        type: 'cyberNode',
        position: { x: 0, y: 0 },
        data: {
          category: 'PHONE',
          title: primaryPhone,
          primaryValue: 'Airtel / Jio Carrier',
          secondaryValue: phones.length > 1 ? `${phones.length} SIM Cards Hopped` : 'Active Cell Tower Triangulation',
          badge: 'ACTIVE TELECOM',
          riskScore: Math.min(98, riskPct + 5),
          icon: '📱',
          isSatellite: true,
          parentSuspectId: pId,
        },
      });
      if (phoneNode) {
        addEdge({
          source: pId,
          target: phoneId,
          data: {
            relationshipType: 'uses_phone',
            label: 'SIM / CDR',
            confidenceScore: 0.96,
            evidenceCount: 18,
            source: 'Telecom CDR Feed',
          },
        });
      }

      // Asset B: Device Node
      const devId = `asset-device-${pId}`;
      const devNode = addNode({
        id: devId,
        type: 'cyberNode',
        position: { x: 0, y: 0 },
        data: {
          category: 'DEVICE',
          title: digitalFootprint.device.split(' (')[0],
          primaryValue: digitalFootprint.device.includes('(') ? digitalFootprint.device.split('(')[1].replace(')', '') : 'Forensic Artifact',
          secondaryValue: `IMEI: 86491205${pId.slice(0, 4)}`,
          badge: 'SEIZED HARDWARE',
          riskScore: Math.min(99, riskPct + 8),
          icon: '💻',
          isSatellite: true,
          parentSuspectId: pId,
        },
      });
      if (devNode) {
        addEdge({
          source: pId,
          target: devId,
          data: {
            relationshipType: 'owns_device',
            label: 'HARDWARE',
            confidenceScore: 0.92,
            evidenceCount: 6,
            source: 'Hardware Forensics',
          },
        });
      }

      // Asset C: Crypto Wallet / Bank Account
      const walletId = `asset-wallet-${pId}`;
      const walletNode = addNode({
        id: walletId,
        type: 'cyberNode',
        position: { x: 0, y: 0 },
        data: {
          category: 'CRYPTO_WALLET',
          title: digitalFootprint.wallet || 'Hawala Settlement A/c',
          primaryValue: 'Hawala Settlement Ledger',
          secondaryValue: 'FIU-IND STR Flagged',
          badge: 'TAINTED FUNDS',
          riskScore: Math.min(99, riskPct + 12),
          icon: '🪙',
          isSatellite: true,
          parentSuspectId: pId,
        },
      });
      if (walletNode) {
        addEdge({
          source: pId,
          target: walletId,
          data: {
            relationshipType: 'controls_funds',
            label: 'FINANCIAL',
            confidenceScore: 0.94,
            evidenceCount: 8,
            source: 'Chainalysis / FIU-IND',
          },
        });
      }
    }
  });

  // 3. Inter-Suspect Edges (Meaningful Connections & Category Sorting)
  rawEdges.forEach((e) => {
    const sNode = nodeMap.get(e.source);
    const tNode = nodeMap.get(e.target);
    if (!sNode || !tNode) return;

    const evType = (e.evidence_type || e.evidence_types?.[0] || 'CALL').toUpperCase();
    const relTypeRaw = (e.relationship_type || '').toLowerCase();

    // Map evidence category
    let category = 'CALL';
    if (evType === 'TRANSACTION' || relTypeRaw === 'financial_transfer') {
      category = 'TRANSACTION';
    } else if (evType === 'CALL' || relTypeRaw === 'called') {
      category = 'CALL';
    } else if (evType === 'FIR' || relTypeRaw.includes('fir') || relTypeRaw.includes('police')) {
      category = 'FIR';
    } else if (evType === 'SURVEILLANCE' || relTypeRaw.includes('observed')) {
      category = 'SURVEILLANCE';
    } else if (evType === 'SOCIAL_MEDIA' || relTypeRaw.includes('message') || relTypeRaw.includes('chat') || relTypeRaw.includes('post')) {
      category = 'SOCIAL_MEDIA';
    } else if (evType === 'CRIMINAL_HISTORY' || relTypeRaw.includes('prior_case')) {
      category = 'CRIMINAL_HISTORY';
    }

    // Filter edges if filter active
    if (edgeFilter !== 'ALL') {
      if (edgeFilter === 'FIR') {
        if (category !== 'FIR' && category !== 'CRIMINAL_HISTORY') return;
      } else if (edgeFilter !== category) {
        return;
      }
    }

    let relType = 'communicated_with';
    let label = 'CALL';
    let badgeColor = '#10B981';

    if (category === 'TRANSACTION') {
      relType = 'transferred_to';
      badgeColor = '#F59E0B';
      const amtStr = e.amount ? `₹${Number(e.amount).toLocaleString('en-IN')}` : '₹ Hawala';
      label = amtStr;
    } else if (category === 'CALL') {
      relType = 'communicated_with';
      badgeColor = '#10B981';
      const freq = e.frequency || 1;
      label = freq >= 15 ? `🔥 ${freq} calls (burst)` : freq > 1 ? `${freq} calls` : '1 call (CDR)';
    } else if (category === 'FIR') {
      relType = 'co_accused_with';
      badgeColor = '#EF4444';
      label = relTypeRaw.includes('police') ? 'Police Report' : (e.shared_case || 'Co-Named in FIR');
    } else if (category === 'SURVEILLANCE') {
      relType = 'co_located_with';
      badgeColor = '#F97316';
      label = '📍 Meetup Observed';
    } else if (category === 'SOCIAL_MEDIA') {
      relType = 'communicated_with';
      badgeColor = '#EC4899';
      label = '💬 Telegram / Chat';
    } else if (category === 'CRIMINAL_HISTORY') {
      relType = 'co_accused_with';
      badgeColor = '#DC2626';
      label = '⚖️ Prior Co-Accused';
    }

    const confScore = typeof e.confidence === 'number' ? e.confidence : 0.85;

    addEdge({
      source: e.source,
      target: e.target,
      data: {
        relationshipType: relType,
        evidenceType: category,
        label,
        badgeColor,
        confidenceScore: confScore,
        amount: e.amount,
        frequency: e.frequency,
        timestamp: e.timestamp || new Date().toISOString(),
        evidenceCount: e.frequency || 4,
        evidenceIds: [e.shared_case || `EVID-${category}-${e.source.slice(0, 4)}`],
        source: e.source ? `Investigation Feed (${e.source})` : 'Inter-Suspect Telemetry Link',
        direction: e.direction || 'bidirectional',
      },
    });
  });

  return { nodes, edges };
}
