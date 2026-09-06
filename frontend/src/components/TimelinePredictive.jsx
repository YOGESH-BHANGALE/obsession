import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { forecastAPI, timelineAPI } from '../api';

const CATEGORY_CONFIG = {
  all: { label: 'All Projections', icon: '🔮', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  rendezvous: { label: 'Syndicate Summits', icon: '🤝', color: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
  financial: { label: 'Hawala Layering Cycles', icon: '💸', color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
  telecom: { label: 'Cellular Spikes', icon: '📱', color: '#2563EB', bg: '#EFF6FF', border: '#93C5FD' },
  location: { label: 'Mobility & Transit Hubs', icon: '📍', color: '#7C3AED', bg: '#F5F3FF', border: '#C4B5FD' },
};

export default function TimelinePredictive({ caseId, onSelectPerson }) {
  const containerRef = useRef(null);
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedForecast, setSelectedForecast] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('visual'); // 'visual' | 'cards'
  const [highConfidenceOnly, setHighConfidenceOnly] = useState(false);

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
      if (res.data?.predictions) {
        setForecasts(res.data.predictions);
      } else {
        await loadForecasts();
      }
    } catch (err) {
      console.error('Failed to run forecast:', err);
    } finally {
      setRunning(false);
    }
  };

  // Distinct list of involved persons for target filter dropdown
  const allInvolvedPersons = useMemo(() => {
    const set = new Set();
    forecasts.forEach((f) => {
      (f.involved_persons || []).forEach((p) => {
        if (p && p.trim()) set.add(p.trim());
      });
    });
    return Array.from(set).sort();
  }, [forecasts]);

  // Filtered forecasts
  const filteredForecasts = useMemo(() => {
    return forecasts.filter((f) => {
      if (selectedCategory !== 'all') {
        const cat = f.category || 'telecom';
        if (cat !== selectedCategory) return false;
      }
      if (selectedPersonFilter) {
        const persons = f.involved_persons || [];
        const inPersons = persons.some((p) => p.toLowerCase().includes(selectedPersonFilter.toLowerCase()));
        const inDesc = (f.description || '').toLowerCase().includes(selectedPersonFilter.toLowerCase());
        const inTitle = (f.title || '').toLowerCase().includes(selectedPersonFilter.toLowerCase());
        if (!inPersons && !inDesc && !inTitle) return false;
      }
      if (highConfidenceOnly) {
        if ((f.confidence || 0) < 0.8) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = (f.title || '').toLowerCase().includes(q);
        const inDesc = (f.description || '').toLowerCase().includes(q);
        const inCity = (f.city || '').toLowerCase().includes(q);
        const inRec = (f.recommendation || '').toLowerCase().includes(q);
        const inPersons = (f.involved_persons || []).some((p) => p.toLowerCase().includes(q));
        if (!inTitle && !inDesc && !inCity && !inRec && !inPersons) return false;
      }
      return true;
    });
  }, [forecasts, selectedCategory, selectedPersonFilter, highConfidenceOnly, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const counts = { total: forecasts.length, rendezvous: 0, financial: 0, telecom: 0, location: 0 };
    let highConfCount = 0;
    forecasts.forEach((f) => {
      const cat = f.category || 'telecom';
      if (counts[cat] !== undefined) counts[cat]++;
      if ((f.confidence || 0) >= 0.8) highConfCount++;
    });

    const nextEvent = forecasts.length > 0 ? forecasts[0] : null;

    return {
      total: counts.total,
      rendezvous: counts.rendezvous,
      financial: counts.financial,
      telecom: counts.telecom,
      location: counts.location,
      highConfCount,
      nextEvent,
    };
  }, [forecasts]);

  // Visual D3 Time Horizon Renderer
  useEffect(() => {
    if (viewMode !== 'visual' || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    if (filteredForecasts.length === 0) return;

    const width = container.clientWidth || 1000;
    const height = 440;
    const margin = { top: 60, right: 60, bottom: 60, left: 60 };

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('style', 'max-width: 100%; height: auto;');

    // Background styling
    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#0F172A')
      .attr('rx', 12);

    // Subtle grid lines
    for (let x = margin.left; x <= width - margin.right; x += 100) {
      svg
        .append('line')
        .attr('x1', x)
        .attr('y1', margin.top)
        .attr('x2', x)
        .attr('y2', height - margin.bottom)
        .attr('stroke', 'rgba(255,255,255,0.04)')
        .attr('stroke-width', 1);
    }

    // Time horizon calculations: today out to +10 days
    const now = new Date();
    const minDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const maxDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    const xScale = d3.scaleTime().domain([minDate, maxDate]).range([margin.left + 20, width - margin.right - 20]);

    const axisY = height / 2;

    // Operational Phase Bands
    const phaseBands = [
      { start: 1, end: 3, label: 'Phase 1: Cellular Escalation (T+1 to T+3d)', fill: 'rgba(37, 99, 235, 0.08)' },
      { start: 3, end: 6, label: 'Phase 2: Transit & Hawala Tranches (T+3 to T+6d)', fill: 'rgba(16, 185, 129, 0.08)' },
      { start: 6, end: 10, label: 'Phase 3: Syndicate Summit (T+6 to T+10d)', fill: 'rgba(217, 119, 6, 0.08)' },
    ];

    phaseBands.forEach((b) => {
      const bStart = new Date(now.getTime() + b.start * 24 * 60 * 60 * 1000);
      const bEnd = new Date(now.getTime() + b.end * 24 * 60 * 60 * 1000);
      const bx1 = Math.max(margin.left, xScale(bStart));
      const bx2 = Math.min(width - margin.right, xScale(bEnd));
      const bw = bx2 - bx1;

      if (bw > 0) {
        svg
          .append('rect')
          .attr('x', bx1)
          .attr('y', margin.top + 10)
          .attr('width', bw)
          .attr('height', height - margin.top - margin.bottom - 20)
          .attr('fill', b.fill)
          .attr('rx', 6);

        svg
          .append('text')
          .attr('x', bx1 + 10)
          .attr('y', margin.top + 28)
          .attr('font-size', '10px')
          .attr('font-weight', '700')
          .attr('fill', 'rgba(255,255,255,0.35)')
          .text(b.label);
      }
    });

    // Central Horizon Axis Line
    svg
      .append('line')
      .attr('x1', margin.left)
      .attr('y1', axisY)
      .attr('x2', width - margin.right)
      .attr('y2', axisY)
      .attr('stroke', '#38BDF8')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '4 4');

    // Milestone Day Markers along Axis
    for (let d = 1; d <= 9; d++) {
      const dayDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
      const mx = xScale(dayDate);
      if (mx >= margin.left && mx <= width - margin.right) {
        svg
          .append('circle')
          .attr('cx', mx)
          .attr('cy', axisY)
          .attr('r', 3)
          .attr('fill', '#94A3B8');

        svg
          .append('text')
          .attr('x', mx)
          .attr('y', axisY + 18)
          .attr('text-anchor', 'middle')
          .attr('font-size', '9.5px')
          .attr('font-weight', '800')
          .attr('fill', '#94A3B8')
          .text(`+${d}D`);
      }
    }

    // Sort forecasts chronologically
    const sorted = [...filteredForecasts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Plot Forecast Nodes with staggering above and below axis
    sorted.forEach((item, idx) => {
      let itemDate = new Date(item.timestamp);
      if (isNaN(itemDate.getTime())) {
        itemDate = new Date(now.getTime() + (idx + 2) * 24 * 60 * 60 * 1000);
      }

      const rawX = xScale(itemDate);
      const x = Math.max(margin.left + 30, Math.min(width - margin.right - 30, rawX));

      const isAbove = idx % 2 === 0;
      const stalkLength = isAbove ? -90 - (idx % 3) * 18 : 90 + (idx % 3) * 18;
      const targetY = axisY + stalkLength;

      const cat = item.category || 'telecom';
      const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.telecom;
      const conf = item.confidence || 0.8;

      // Vertical connecting stalk
      svg
        .append('line')
        .attr('x1', x)
        .attr('y1', axisY)
        .attr('x2', x)
        .attr('y2', targetY)
        .attr('stroke', cfg.color)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '2 2')
        .attr('opacity', 0.8);

      // Milestone Anchor Point on Axis
      svg
        .append('circle')
        .attr('cx', x)
        .attr('cy', axisY)
        .attr('r', 4)
        .attr('fill', cfg.color);

      // Pulsing outer aura for high-confidence predictions
      if (conf >= 0.8) {
        svg
          .append('circle')
          .attr('cx', x)
          .attr('cy', targetY)
          .attr('r', 22)
          .attr('fill', cfg.color)
          .attr('opacity', 0.18);
      }

      // Milestone Pin Node
      svg
        .append('circle')
        .attr('cx', x)
        .attr('cy', targetY)
        .attr('r', 15)
        .attr('fill', '#1E293B')
        .attr('stroke', cfg.color)
        .attr('stroke-width', 2.5)
        .attr('cursor', 'pointer')
        .on('click', () => setSelectedForecast(item));

      // Node Icon
      svg
        .append('text')
        .attr('x', x)
        .attr('y', targetY + 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', '13px')
        .attr('cursor', 'pointer')
        .text(cfg.icon)
        .on('click', () => setSelectedForecast(item));

      // Milestone Label Pill Box
      const shortTitle = (item.title || item.description || 'Projected Event').slice(0, 24) + '...';
      const labelBoxY = isAbove ? targetY - 32 : targetY + 22;

      const labelG = svg
        .append('g')
        .attr('transform', `translate(${x}, ${labelBoxY})`)
        .attr('cursor', 'pointer')
        .on('click', () => setSelectedForecast(item));

      labelG
        .append('rect')
        .attr('x', -70)
        .attr('y', -10)
        .attr('width', 140)
        .attr('height', 22)
        .attr('rx', 4)
        .attr('fill', 'rgba(15, 23, 42, 0.95)')
        .attr('stroke', cfg.color)
        .attr('stroke-width', 1.2);

      labelG
        .append('text')
        .attr('x', 0)
        .attr('y', 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9.5px')
        .attr('font-weight', '700')
        .attr('fill', '#F8FAFC')
        .text(shortTitle);

      // Confidence badge text
      labelG
        .append('text')
        .attr('x', 0)
        .attr('y', isAbove ? -14 : 22)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9px')
        .attr('font-weight', '800')
        .attr('fill', cfg.color)
        .text(`${Math.round(conf * 100)}% Probable (${item.days_ahead || '+3D'})`);
    });
  }, [filteredForecasts, viewMode]);

  // Group forecasts by time horizon for Cards View
  const groupedCards = useMemo(() => {
    const imminent = [];
    const approaching = [];
    const extended = [];

    filteredForecasts.forEach((f) => {
      const days = parseInt((f.days_ahead || '+3').replace(/[^0-9]/g, '')) || 3;
      if (days <= 3) imminent.push(f);
      else if (days <= 5) approaching.push(f);
      else extended.push(f);
    });

    return { imminent, approaching, extended };
  }, [filteredForecasts]);

  return (
    <div className="animate-fade-in" style={{ padding: '24px 20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* ─── Header & Tactical Statistics Ribbon ─── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          color: '#FFFFFF',
          borderRadius: '12px',
          padding: '22px 24px',
          marginBottom: '20px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '22px' }}>🔮</span>
              <h1 style={{ margin: 0, fontSize: '21px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Predictive Future Timeline
              </h1>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38BDF8',
                  padding: '3px 9px',
                  borderRadius: '4px',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                TIME-SERIES PROJECTIONS
              </span>
            </div>
            <p style={{ margin: 0, color: '#94A3B8', fontSize: '13px', maxWidth: '750px', lineHeight: 1.45 }}>
              Continuous exponential smoothing and periodicity modeling over cellular spikes, Hawala layering cycles, physical rendezvous, and mobility transit vectors. No external cloud AI required.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={handleRunForecast}
              disabled={running}
              style={{
                background: running ? '#334155' : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '9px 18px',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: running ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ display: 'inline-block', transform: running ? 'rotate(360deg)' : 'none', transition: 'transform 1s linear' }}>
                ⚡
              </span>
              {running ? 'Computing Time-Series...' : 'Recompute Forecasts'}
            </button>
          </div>
        </div>

        {/* Tactical Metrics Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '12px',
            marginTop: '20px',
            paddingTop: '18px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8' }}>Total Forecasts</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#38BDF8', marginTop: '2px' }}>{stats.total}</div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Across 4 analytical vectors</div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8' }}>High Confidence</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#10B981', marginTop: '2px' }}>{stats.highConfCount}</div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>&ge; 80% statistical probability</div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8' }}>Syndicate Summits</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#F59E0B', marginTop: '2px' }}>{stats.rendezvous}</div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Mumbai / Pune corridors</div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8' }}>Hawala Layering Cycles</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#34D399', marginTop: '2px' }}>{stats.financial}</div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>7-10 day periodicity match</div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8' }}>Next Anticipated Surge</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#E2E8F0', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stats.nextEvent?.days_ahead || '+3 Days'}: {stats.nextEvent?.category?.toUpperCase() || 'TELECOM'}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Projected Pre-Coordination</div>
          </div>
        </div>
      </div>

      {/* ─── Mandatory Evidentiary Advisory Notice ─── */}
      <div
        style={{
          background: 'linear-gradient(90deg, #FFFBEB 0%, #FEF3C7 100%)',
          border: '1.5px solid #F59E0B',
          borderRadius: '8px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.1)',
        }}
      >
        <span style={{ fontSize: '26px' }}>⚠️</span>
        <div style={{ fontSize: '12.5px', color: '#78350F', lineHeight: 1.45 }}>
          <strong>Investigator Notice (Evidentiary Standard):</strong> Predictive timelines are mathematical projections computed via local Holt-Winters exponential smoothing and periodicity modeling. <em>This is an investigative advisory tool, not judicial proof.</em> Do not execute search warrants or formal detentions without independent physical surveillance and lawfully collected CDR corroboration.
        </div>
      </div>

      {/* ─── Filter Pills, Search Bar, and View Mode Toggle ─── */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        {/* Category Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
            const isSelected = selectedCategory === key;
            const count = key === 'all' ? forecasts.length : stats[key] || 0;
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                style={{
                  background: isSelected ? cfg.color : '#F8FAFC',
                  color: isSelected ? '#FFFFFF' : '#475569',
                  border: `1.5px solid ${isSelected ? cfg.color : '#CBD5E1'}`,
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.12)' : 'none',
                }}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                <span
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                    color: isSelected ? '#FFFFFF' : '#64748B',
                    borderRadius: '10px',
                    padding: '1px 6px',
                    fontSize: '10px',
                    fontWeight: 800,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
          <button
            onClick={() => setViewMode('visual')}
            style={{
              background: viewMode === 'visual' ? '#0F172A' : 'transparent',
              color: viewMode === 'visual' ? '#FFFFFF' : '#64748B',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🔮</span> Visual Horizon
          </button>
          <button
            onClick={() => setViewMode('cards')}
            style={{
              background: viewMode === 'cards' ? '#0F172A' : 'transparent',
              color: viewMode === 'cards' ? '#FFFFFF' : '#64748B',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📑</span> Dossier Cards
          </button>
        </div>
      </div>

      {/* ─── Second Row Controls: Operative Filter, High-Confidence Toggle, Search ─── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* Target Operative Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '6px 12px' }}>
          <span style={{ fontSize: '13px' }}>👤</span>
          <select
            value={selectedPersonFilter}
            onChange={(e) => setSelectedPersonFilter(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#1E293B',
              cursor: 'pointer',
            }}
          >
            <option value="">All Syndicate Operatives</option>
            {allInvolvedPersons.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* High Confidence Toggle */}
        <button
          onClick={() => setHighConfidenceOnly(!highConfidenceOnly)}
          style={{
            background: highConfidenceOnly ? '#DCFCE7' : '#FFFFFF',
            border: `1.5px solid ${highConfidenceOnly ? '#10B981' : '#CBD5E1'}`,
            color: highConfidenceOnly ? '#065F46' : '#475569',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🎯</span>
          <span>&ge; 80% Probable Only</span>
        </button>

        {/* Search Bar */}
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search projections, targets, cities, or recommendations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 14px 8px 36px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              outline: 'none',
              boxSizing: 'border-box',
              background: '#FFFFFF',
            }}
          />
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px' }}>
            🔍
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Showing Count */}
        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
          Showing <strong>{filteredForecasts.length}</strong> of {forecasts.length} projections
        </div>
      </div>

      {/* ─── Main Content Views ─── */}
      {loading ? (
        <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '60px 20px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', animation: 'spin 1.5s infinite linear' }}>🔮</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>Computing Multi-Domain Projections...</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
            Running time-series exponential smoothing across call graphs, Hawala layering cycles, and surveillance trails.
          </div>
        </div>
      ) : filteredForecasts.length === 0 ? (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            padding: '50px 20px',
            textAlign: 'center',
            border: '2px dashed #CBD5E1',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📡</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>No Predictions Match Current Filters</div>
          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '500px', margin: '6px auto 16px' }}>
            Try clearing search filters or click &quot;Recompute Forecasts&quot; to re-run mathematical modeling across all case nodes.
          </p>
          <button
            onClick={() => {
              setSelectedCategory('all');
              setSelectedPersonFilter('');
              setHighConfidenceOnly(false);
              setSearchQuery('');
            }}
            style={{
              background: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <>
          {/* ─── 1. Visual Time Horizon View ─── */}
          {viewMode === 'visual' && (
            <div style={{ marginBottom: '24px' }}>
              <div
                style={{
                  background: '#0F172A',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    T+0 (Present Day) ──&gt; T+10 Days Operational Time Horizon
                  </div>
                  <div style={{ color: '#38BDF8', fontSize: '11px', fontWeight: 700 }}>
                    💡 Click any milestone pin to inspect full tactical dossier
                  </div>
                </div>

                <div ref={containerRef} style={{ width: '100%', minHeight: '440px' }} />
              </div>
            </div>
          )}

          {/* ─── 2. Dossier Cards View / Feed View ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Imminent Section */}
            {groupedCards.imminent.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '18px' }}>⚡</span>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, textTransform: 'uppercase', color: '#1E293B', letterSpacing: '0.5px' }}>
                    Imminent Projections (Next 72 Hours / T+1 to T+3 Days)
                  </h3>
                  <span style={{ background: '#EFF6FF', color: '#2563EB', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', border: '1px solid #BFDBFE' }}>
                    {groupedCards.imminent.length} Events
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                  {groupedCards.imminent.map((item) => (
                    <PredictionCard
                      key={item.id}
                      item={item}
                      onSelectPerson={onSelectPerson}
                      onInspect={() => setSelectedForecast(item)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Approaching Section */}
            {groupedCards.approaching.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '18px' }}>📍</span>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, textTransform: 'uppercase', color: '#1E293B', letterSpacing: '0.5px' }}>
                    Approaching Transit & Layering Cycles (T+4 to T+5 Days)
                  </h3>
                  <span style={{ background: '#ECFDF5', color: '#059669', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', border: '1px solid #A7F3D0' }}>
                    {groupedCards.approaching.length} Events
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                  {groupedCards.approaching.map((item) => (
                    <PredictionCard
                      key={item.id}
                      item={item}
                      onSelectPerson={onSelectPerson}
                      onInspect={() => setSelectedForecast(item)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Extended Section */}
            {groupedCards.extended.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '18px' }}>🤝</span>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, textTransform: 'uppercase', color: '#1E293B', letterSpacing: '0.5px' }}>
                    Extended Strategic Summits (T+6 to T+10 Days)
                  </h3>
                  <span style={{ background: '#FFFBEB', color: '#D97706', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', border: '1px solid #FDE68A' }}>
                    {groupedCards.extended.length} Events
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                  {groupedCards.extended.map((item) => (
                    <PredictionCard
                      key={item.id}
                      item={item}
                      onSelectPerson={onSelectPerson}
                      onInspect={() => setSelectedForecast(item)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Detailed Forecast Intelligence Modal ─── */}
      {selectedForecast && (
        <ForecastDetailModal
          forecast={selectedForecast}
          onClose={() => setSelectedForecast(null)}
          onSelectPerson={onSelectPerson}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: Prediction Card
// ─────────────────────────────────────────────────────────────────────────────
function PredictionCard({ item, onSelectPerson, onInspect }) {
  const cat = item.category || 'telecom';
  const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.telecom;
  const conf = item.confidence || 0.8;
  const confPercent = Math.round(conf * 100);

  const confColor = conf >= 0.85 ? '#059669' : conf >= 0.78 ? '#2563EB' : '#D97706';

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderLeft: `6px solid ${cfg.color}`,
        borderRadius: '10px',
        padding: '18px 20px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div>
        {/* Top Header Badge Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 800,
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: '4px',
                background: cfg.bg,
                color: cfg.color,
                border: `1px solid ${cfg.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </span>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 900,
                background: '#0F172A',
                color: '#38BDF8',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              {item.days_ahead || '+3 Days'}
            </span>
          </div>

          {/* Confidence Gauge */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', fontWeight: 900, color: confColor }}>
              {confPercent}% Probable
            </div>
            <div
              style={{
                width: '70px',
                height: '4px',
                background: '#E2E8F0',
                borderRadius: '2px',
                overflow: 'hidden',
                marginTop: '3px',
              }}
            >
              <div
                style={{
                  width: `${confPercent}%`,
                  height: '100%',
                  background: confColor,
                }}
              />
            </div>
          </div>
        </div>

        {/* Title */}
        <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 800, color: '#0F172A', lineHeight: 1.35 }}>
          {item.title}
        </h4>

        {/* Narrative Description */}
        <p style={{ margin: '0 0 12px', fontSize: '13px', lineHeight: 1.5, color: '#334155' }}>
          {item.description}
        </p>

        {/* Tactical Recommendation Banner */}
        {item.recommendation && (
          <div
            style={{
              background: '#F8FAFC',
              border: '1px dashed #94A3B8',
              borderRadius: '6px',
              padding: '10px 12px',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>🛡️</span> Tactical Counter-Measure Recommendation
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', lineHeight: 1.4 }}>
              {item.recommendation}
            </div>
          </div>
        )}

        {/* City / Tranche Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {item.city && (
            <span
              style={{
                background: '#F1F5F9',
                color: '#475569',
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #CBD5E1',
              }}
            >
              📍 {item.city}
            </span>
          )}
          {item.estimated_amount && (
            <span
              style={{
                background: '#ECFDF5',
                color: '#065F46',
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #6EE7B7',
              }}
            >
              💸 Projected Tranche: ₹{Number(item.estimated_amount).toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </div>

      {/* Footer: Operatives & Inspect Button */}
      <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Targets:</span>
          {(item.involved_persons || []).map((name) => (
            <button
              key={name}
              onClick={() => onSelectPerson && onSelectPerson(name)}
              style={{
                background: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#1E293B',
                cursor: 'pointer',
              }}
              title="Click to view operative graph profile"
            >
              {name}
            </button>
          ))}
        </div>

        <button
          onClick={onInspect}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#2563EB',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          Inspect Dossier &rarr;
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: Forecast Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function ForecastDetailModal({ forecast, onClose, onSelectPerson }) {
  const cat = forecast.category || 'telecom';
  const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.telecom;
  const conf = forecast.confidence || 0.8;
  const confPercent = Math.round(conf * 100);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          border: '1px solid #E2E8F0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '20px 24px',
            borderTopLeftRadius: '14px',
            borderTopRightRadius: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: cfg.color,
                  color: '#FFFFFF',
                }}
              >
                {cfg.icon} {cfg.label}
              </span>
              <span style={{ fontSize: '11px', fontWeight: 800, background: '#1E293B', color: '#38BDF8', padding: '3px 8px', borderRadius: '4px' }}>
                {forecast.days_ahead || '+3 Days'}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
              {forecast.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px' }}>
          {/* Statistical Probability Bar */}
          <div style={{ marginBottom: '20px', background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                Mathematical Confidence Index
              </span>
              <span style={{ fontSize: '13px', fontWeight: 900, color: cfg.color }}>
                {confPercent}% Probable ({forecast.days_ahead})
              </span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${confPercent}%`, height: '100%', background: cfg.color }} />
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
              Computed via Simple Exponential Smoothing & Periodicity analysis on historical network telemetry.
            </div>
          </div>

          {/* Narrative Analysis */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B' }}>
              Tactical Intelligence Briefing
            </h4>
            <div style={{ fontSize: '13.5px', lineHeight: 1.55, color: '#1E293B', background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '14px', borderRadius: '8px' }}>
              {forecast.description}
            </div>
          </div>

          {/* Tactical Recommendation Box */}
          {forecast.recommendation && (
            <div style={{ marginBottom: '20px', background: '#FEF2F2', border: '1.5px solid #F87171', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#991B1B', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🛡️</span> Immediate Law Enforcement Counter-Measure
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#7F1D1D', lineHeight: 1.45 }}>
                {forecast.recommendation}
              </div>
            </div>
          )}

          {/* Involved Targets */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B' }}>
              Target Operatives Subject to Projection
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(forecast.involved_persons || []).map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    onClose();
                    if (onSelectPerson) onSelectPerson(name);
                  }}
                  style={{
                    background: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#0F172A',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>👤</span>
                  <span>{name}</span>
                  <span style={{ fontSize: '10px', color: '#64748B' }}>&rarr; Graph</span>
                </button>
              ))}
            </div>
          </div>

          {/* Technical Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px' }}>
            <div>
              <span style={{ color: '#64748B' }}>Projected Date/Time: </span>
              <strong style={{ color: '#1E293B' }}>{new Date(forecast.timestamp).toLocaleString()}</strong>
            </div>
            <div>
              <span style={{ color: '#64748B' }}>Location / Sector: </span>
              <strong style={{ color: '#1E293B' }}>{forecast.city || 'Network Field Nodes'}</strong>
            </div>
            {forecast.predicted_lat && forecast.predicted_lng && (
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748B' }}>Waypoint Coordinates: </span>
                <strong style={{ color: '#1E293B' }}>{forecast.predicted_lat.toFixed(4)}° N, {forecast.predicted_lng.toFixed(4)}° E</strong>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '14px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', borderBottomLeftRadius: '14px', borderBottomRightRadius: '14px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 18px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
}
