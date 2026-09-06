import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { timelineAPI } from '../api';

const CATEGORY_CONFIG = {
  all: { label: 'All Incidents', icon: '📋', color: '#64748B', bg: '#F1F5F9' },
  crime: { label: 'Crimes & FIRs', icon: '🚨', color: '#EF4444', bg: '#FEF2F2', border: '#F87171' },
  surveillance: { label: 'Surveillance Sightings', icon: '🤝', color: '#F97316', bg: '#FFF7ED', border: '#FB923C' },
  financial: { label: 'Financial Hawala Flows', icon: '💸', color: '#10B981', bg: '#ECFDF5', border: '#34D399' },
  telecom: { label: 'SIGINT & Telecom Spikes', icon: '⚡', color: '#0284C7', bg: '#F0F9FF', border: '#38BDF8' },
};

export default function TimelinePast({ caseId, onSelectPerson }) {
  const containerRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('visual'); // 'visual' | 'feed'
  const [criticalOnly, setCriticalOnly] = useState(false);

  useEffect(() => {
    loadEvents();
  }, [caseId]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await timelineAPI.getPastTimeline(caseId);
      setEvents(res.data || []);
    } catch (err) {
      console.error('Failed to load past timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  // Distinct list of all involved persons across events for filter dropdown
  const allInvolvedPersons = useMemo(() => {
    const set = new Set();
    events.forEach((e) => {
      (e.involved_persons || []).forEach((p) => {
        if (p && p.trim()) set.add(p.trim());
      });
    });
    return Array.from(set).sort();
  }, [events]);

  // Filtered events based on category, person, search query, severity
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      // Category filter
      if (selectedCategory !== 'all') {
        const cat = e.category || (e.event_type?.includes('crime') || e.event_type?.includes('FIR') ? 'crime' : 'telecom');
        if (cat !== selectedCategory) return false;
      }

      // Person filter
      if (selectedPersonFilter) {
        const persons = e.involved_persons || [];
        const matches = persons.some((p) => p.toLowerCase().includes(selectedPersonFilter.toLowerCase()));
        if (!matches && !(e.description || '').toLowerCase().includes(selectedPersonFilter.toLowerCase())) {
          return false;
        }
      }

      // Critical severity filter
      if (criticalOnly) {
        const sev = (e.severity || '').toLowerCase();
        if (sev !== 'critical' && sev !== 'high') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = (e.title || '').toLowerCase().includes(q);
        const inDesc = (e.description || '').toLowerCase().includes(q);
        const inLoc = (e.location || '').toLowerCase().includes(q);
        const inRef = (e.evidence_ref || '').toLowerCase().includes(q);
        const inPersons = (e.involved_persons || []).some((p) => p.toLowerCase().includes(q));
        if (!inTitle && !inDesc && !inLoc && !inRef && !inPersons) return false;
      }

      return true;
    });
  }, [events, selectedCategory, selectedPersonFilter, criticalOnly, searchQuery]);

  // Statistics breakdown
  const stats = useMemo(() => {
    const counts = { total: events.length, crime: 0, surveillance: 0, financial: 0, telecom: 0 };
    events.forEach((e) => {
      const cat = e.category || (e.event_type?.includes('crime') || e.event_type?.includes('FIR') ? 'crime' : 'telecom');
      if (counts[cat] !== undefined) counts[cat]++;
    });

    let timespan = 'N/A';
    if (events.length > 0) {
      const dates = events.map((e) => new Date(e.timestamp)).filter((d) => !isNaN(d.getTime())).sort((a, b) => a - b);
      if (dates.length > 0) {
        const start = dates[0].toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        const end = dates[dates.length - 1].toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        timespan = `${start} — ${end}`;
      }
    }

    return { ...counts, timespan };
  }, [events]);

  // ─── D3 Interactive Horizontal Axis Visualization ───
  useEffect(() => {
    if (viewMode !== 'visual' || !containerRef.current || filteredEvents.length === 0) return;

    d3.select(containerRef.current).selectAll('*').remove();

    const margin = { top: 60, right: 80, bottom: 60, left: 80 };
    const width = Math.max(containerRef.current.clientWidth - margin.left - margin.right, 900);
    const height = 360 - margin.top - margin.bottom;

    const svg = d3
      .select(containerRef.current)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates
    const parsedData = filteredEvents
      .map((d) => ({
        ...d,
        date: new Date(d.timestamp),
      }))
      .filter((d) => !isNaN(d.date.getTime()))
      .sort((a, b) => a.date - b.date);

    if (parsedData.length === 0) return;

    const [minDate, maxDate] = d3.extent(parsedData, (d) => d.date);
    const xScale = d3
      .scaleTime()
      .domain([d3.timeDay.offset(minDate, -8), d3.timeDay.offset(maxDate, 8)])
      .range([0, width]);

    // Baseline central axis line
    const axisY = height / 2;
    svg
      .append('line')
      .attr('x1', 0)
      .attr('y1', axisY)
      .attr('x2', width)
      .attr('y2', axisY)
      .attr('stroke', '#0F172A')
      .attr('stroke-width', 2.5);

    // Axis tick labels
    const xAxis = d3.axisBottom(xScale).ticks(8).tickFormat(d3.timeFormat('%d %b %Y'));
    svg
      .append('g')
      .attr('transform', `translate(0, ${axisY + 34})`)
      .call(xAxis)
      .selectAll('text')
      .attr('font-size', '10.5px')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', '700')
      .attr('fill', '#475569');

    // Render Milestone Points (alternating above & below axis)
    parsedData.forEach((d, i) => {
      const isAbove = i % 2 === 0;
      const x = xScale(d.date);
      const y = isAbove ? axisY - 65 : axisY + 65;

      const cat = d.category || 'telecom';
      const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.telecom;
      const isCrime = cat === 'crime';

      // Connecting dash line
      svg
        .append('line')
        .attr('x1', x)
        .attr('y1', axisY)
        .attr('x2', x)
        .attr('y2', isAbove ? axisY - 18 : axisY + 18)
        .attr('stroke', cfg.color)
        .attr('stroke-width', 1.8)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.8);

      // Milestone dot
      const circle = svg
        .append('circle')
        .attr('cx', x)
        .attr('cy', isAbove ? axisY - 22 : axisY + 22)
        .attr('r', isCrime ? 10 : 8)
        .attr('fill', cfg.color)
        .attr('stroke', '#FFFFFF')
        .attr('stroke-width', 2.5)
        .attr('cursor', 'pointer')
        .attr('filter', 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))')
        .on('click', () => setSelectedEvent(d))
        .on('mouseenter', function () {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', isCrime ? 14 : 12)
            .attr('stroke-width', 3.5);
        })
        .on('mouseleave', function () {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', isCrime ? 10 : 8)
            .attr('stroke-width', 2.5);
        });

      // Milestone Badge Label Box
      const labelText = d.title || d.description || d.event_type;
      const shortLabel = labelText.length > 22 ? labelText.slice(0, 20) + '...' : labelText;

      const labelG = svg
        .append('g')
        .attr('transform', `translate(${x}, ${isAbove ? axisY - 45 : axisY + 45})`)
        .attr('cursor', 'pointer')
        .on('click', () => setSelectedEvent(d));

      labelG
        .append('rect')
        .attr('x', -60)
        .attr('y', isAbove ? -18 : 0)
        .attr('width', 120)
        .attr('height', 20)
        .attr('rx', 4)
        .attr('fill', '#FFFFFF')
        .attr('stroke', cfg.color)
        .attr('stroke-width', 1.5)
        .attr('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))');

      labelG
        .append('text')
        .attr('x', 0)
        .attr('y', isAbove ? -4 : 14)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Inter, sans-serif')
        .attr('font-size', '9.5px')
        .attr('font-weight', '700')
        .attr('fill', '#0F172A')
        .text(`${cfg.icon} ${shortLabel}`);
    });
  }, [filteredEvents, viewMode]);

  // Group events by Year & Month for the Dossier Feed view
  const eventsByMonthYear = useMemo(() => {
    const groups = {};
    filteredEvents.forEach((e) => {
      const d = new Date(e.timestamp);
      if (isNaN(d.getTime())) return;
      const key = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return groups;
  }, [filteredEvents]);

  return (
    <div className="animate-fade-in" style={{ padding: '24px 20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* ─── Header & Tactical Statistics Ribbon ─── */}
      <div
        style={{
          background: '#0F172A',
          color: '#FFFFFF',
          borderRadius: '12px',
          padding: '20px 24px',
          marginBottom: '20px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '20px' }}>⏱️</span>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Evidentiary Past Timeline
              </h1>
              <span style={{ fontSize: '10px', fontWeight: 800, background: '#1E293B', color: '#38BDF8', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(56,189,248,0.3)' }}>
                VERIFIED CHRONOLOGY
              </span>
            </div>
            <p style={{ margin: 0, color: '#94A3B8', fontSize: '12.5px' }}>
              Consolidated judicial evidence record: police FIRs, field surveillance sightings, high-value financial Hawala flows, and telecom anomalies.
            </p>
          </div>

          {/* Timespan Badge */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '6px 14px', borderRadius: '8px', textAlign: 'right' }}>
            <div style={{ fontSize: '9.5px', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8' }}>
              Evidentiary Timespan
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#F8FAFC', marginTop: '2px' }}>
              {stats.timespan}
            </div>
          </div>
        </div>

        {/* Tactical Metrics Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginTop: '18px' }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #38BDF8' }}>
            <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}>Total Incidents</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#F8FAFC', marginTop: '2px' }}>{stats.total}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #EF4444' }}>
            <div style={{ fontSize: '10px', color: '#FCA5A5', fontWeight: 700 }}>Crimes & Police FIRs</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#EF4444', marginTop: '2px' }}>{stats.crime}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #F97316' }}>
            <div style={{ fontSize: '10px', color: '#FED7AA', fontWeight: 700 }}>Surveillance Rendezvous</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#F97316', marginTop: '2px' }}>{stats.surveillance}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #10B981' }}>
            <div style={{ fontSize: '10px', color: '#A7F3D0', fontWeight: 700 }}>Hawala Financial Flows</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#10B981', marginTop: '2px' }}>{stats.financial}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #0284C7' }}>
            <div style={{ fontSize: '10px', color: '#BAE6FD', fontWeight: 700 }}>SIGINT & Telecom Spikes</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0284C7', marginTop: '2px' }}>{stats.telecom}</div>
          </div>
        </div>
      </div>

      {/* ─── Filter & Control Toolbar ─── */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          border: '1.5px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        {/* Left: Category Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedCategory(key)}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: selectedCategory === key ? `1.5px solid ${cfg.color}` : '1.5px solid #E2E8F0',
                background: selectedCategory === key ? cfg.color : '#FFFFFF',
                color: selectedCategory === key ? '#FFFFFF' : '#475569',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
              <span
                style={{
                  fontSize: '10px',
                  background: selectedCategory === key ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  marginLeft: '2px',
                }}
              >
                {key === 'all' ? stats.total : stats[key] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Right: Search, Operative Filter, Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <input
            type="text"
            placeholder="Search narrative, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1.5px solid #CBD5E1',
              fontSize: '11.5px',
              width: '180px',
              outline: 'none',
            }}
          />

          {/* Operative Filter Dropdown */}
          <select
            value={selectedPersonFilter}
            onChange={(e) => setSelectedPersonFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1.5px solid #CBD5E1',
              fontSize: '11.5px',
              fontWeight: 600,
              background: '#FFFFFF',
              cursor: 'pointer',
              maxWidth: '170px',
            }}
          >
            <option value="">All Operatives</option>
            {allInvolvedPersons.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* Critical Only Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={criticalOnly}
              onChange={(e) => setCriticalOnly(e.target.checked)}
              style={{ accentColor: '#EF4444', cursor: 'pointer' }}
            />
            <span>Critical Only</span>
          </label>

          {/* View Mode Switcher (Visual vs Feed) */}
          <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                border: 'none',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                background: viewMode === 'visual' ? '#0F172A' : 'transparent',
                color: viewMode === 'visual' ? '#FFFFFF' : '#64748B',
              }}
            >
              📊 Visual Axis
            </button>
            <button
              type="button"
              onClick={() => setViewMode('feed')}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                border: 'none',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                background: viewMode === 'feed' ? '#0F172A' : 'transparent',
                color: viewMode === 'feed' ? '#FFFFFF' : '#64748B',
              }}
            >
              📑 Dossier Feed
            </button>
          </div>
        </div>
      </div>

      {/* ─── Main Content Display ─── */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <div style={{ fontWeight: 700 }}>Assembling evidentiary chronological records...</div>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '10px', border: '1.5px dashed #CBD5E1' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔍</div>
          <div style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>No matching timeline events found</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Try resetting your category or search filters.</div>
          {(selectedCategory !== 'all' || selectedPersonFilter || searchQuery || criticalOnly) && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                setSelectedCategory('all');
                setSelectedPersonFilter('');
                setSearchQuery('');
                setCriticalOnly(false);
              }}
              style={{ marginTop: '14px' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* VIEW MODE 1: D3 VISUAL AXIS */}
          {viewMode === 'visual' && (
            <div
              style={{
                background: '#FFFFFF',
                border: '1.5px solid #E2E8F0',
                borderRadius: '10px',
                padding: '24px 20px',
                overflowX: 'auto',
                boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B' }}>
                  Interactive Chronological Axis (Showing {filteredEvents.length} events — Click any node to inspect details)
                </div>
                <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>
                  ← Scroll horizontally to inspect earlier/later milestones →
                </div>
              </div>
              <div ref={containerRef} style={{ minWidth: '950px' }} />
            </div>
          )}

          {/* VIEW MODE 2: CHRONOLOGICAL DOSSIER FEED */}
          {viewMode === 'feed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {Object.entries(eventsByMonthYear).map(([monthYear, monthEvents]) => (
                <div key={monthYear}>
                  {/* Month / Year Header Banner */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '14px',
                    }}
                  >
                    <div
                      style={{
                        background: '#0F172A',
                        color: '#FFFFFF',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      📅 {monthYear}
                    </div>
                    <div style={{ flex: 1, height: '1.5px', background: '#E2E8F0' }} />
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>
                      {monthEvents.length} incident{monthEvents.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Incident Cards in Month */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {monthEvents.map((item) => {
                      const cat = item.category || 'telecom';
                      const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.telecom;
                      const dateObj = new Date(item.timestamp);

                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedEvent(item)}
                          style={{
                            background: '#FFFFFF',
                            borderRadius: '8px',
                            border: '1.5px solid #E2E8F0',
                            borderLeft: `4px solid ${cfg.color}`,
                            padding: '14px 18px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '16px' }}>{cfg.icon}</span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  background: cfg.bg,
                                  color: cfg.color,
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  border: `1px solid ${cfg.border || cfg.color}`,
                                }}
                              >
                                {item.event_type || cfg.label}
                              </span>
                              {item.severity && (
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: item.severity === 'critical' ? '#FEE2E2' : item.severity === 'high' ? '#FFEDD5' : '#F1F5F9',
                                    color: item.severity === 'critical' ? '#DC2626' : item.severity === 'high' ? '#C2410C' : '#64748B',
                                  }}
                                >
                                  {item.severity}
                                </span>
                              )}
                              <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>
                                {item.title || item.description}
                              </span>
                            </div>

                            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                              🕒 {dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {dateObj.getHours() !== 0 && ` • ${dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                            </div>
                          </div>

                          <p style={{ margin: '8px 0 10px', fontSize: '12px', color: '#334155', lineHeight: '1.5' }}>
                            {item.description}
                          </p>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '11px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {item.location && (
                                <span style={{ background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                  📍 {item.location}
                                </span>
                              )}
                              {item.evidence_ref && (
                                <span style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                  Ref: {item.evidence_ref}
                                </span>
                              )}
                            </div>

                            {item.involved_persons && item.involved_persons.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                <span style={{ color: '#64748B', fontWeight: 600, fontSize: '10.5px' }}>Involved:</span>
                                {item.involved_persons.map((person) => (
                                  <span
                                    key={person}
                                    style={{
                                      background: '#EFF6FF',
                                      color: '#1D4ED8',
                                      border: '1px solid #BFDBFE',
                                      padding: '2px 7px',
                                      borderRadius: '12px',
                                      fontSize: '10.5px',
                                      fontWeight: 700,
                                    }}
                                  >
                                    👤 {person}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── Incident Dossier Inspector Modal / Drawer ─── */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-scale-up"
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              maxWidth: '680px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
              border: '2px solid #0F172A',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                background: '#0F172A',
                color: '#FFFFFF',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>
                  {CATEGORY_CONFIG[selectedEvent.category]?.icon || '📋'}
                </span>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#38BDF8', letterSpacing: '0.5px' }}>
                    Evidentiary Incident Dossier
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: '#F8FAFC' }}>
                    {selectedEvent.title || 'Timeline Incident Record'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#FFFFFF',
                  borderRadius: '6px',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Top Tags Bar */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: CATEGORY_CONFIG[selectedEvent.category]?.bg || '#F1F5F9',
                    color: CATEGORY_CONFIG[selectedEvent.category]?.color || '#475569',
                    border: `1px solid ${CATEGORY_CONFIG[selectedEvent.category]?.border || '#CBD5E1'}`,
                  }}
                >
                  {selectedEvent.event_type}
                </span>

                {selectedEvent.severity && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: selectedEvent.severity === 'critical' ? '#FEE2E2' : '#FFEDD5',
                      color: selectedEvent.severity === 'critical' ? '#DC2626' : '#C2410C',
                    }}
                  >
                    Severity: {selectedEvent.severity}
                  </span>
                )}

                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                  🕒 {new Date(selectedEvent.timestamp).toLocaleString('en-GB')}
                </span>
              </div>

              {/* Evidence Details Table */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11.5px' }}>
                  {selectedEvent.location && (
                    <div>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Venue / Location: </span>
                      <strong style={{ color: '#0F172A' }}>{selectedEvent.location}</strong>
                    </div>
                  )}
                  {selectedEvent.evidence_ref && (
                    <div>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Official Evidence Ref: </span>
                      <strong style={{ color: '#0F172A' }}>{selectedEvent.evidence_ref}</strong>
                    </div>
                  )}
                  {selectedEvent.source && (
                    <div>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Reporting Source: </span>
                      <strong style={{ color: '#0F172A' }}>{selectedEvent.source}</strong>
                    </div>
                  )}
                  {selectedEvent.amount && (
                    <div>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Financial Sum: </span>
                      <strong style={{ color: '#10B981' }}>₹{selectedEvent.amount.toLocaleString()}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Narrative Brief */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
                  Incident Description & Narrative
                </div>
                <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#1E293B', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px' }}>
                  {selectedEvent.description}
                </div>
              </div>

              {/* Involved Operatives & Quick Links */}
              {selectedEvent.involved_persons && selectedEvent.involved_persons.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '8px' }}>
                    Linked Syndicate Operatives ({selectedEvent.involved_persons.length})
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedEvent.involved_persons.map((person, idx) => {
                      const linkedId = selectedEvent.linked_entity_ids && selectedEvent.linked_entity_ids[idx];
                      return (
                        <div
                          key={person}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#EFF6FF',
                            border: '1.5px solid #BFDBFE',
                            padding: '6px 12px',
                            borderRadius: '8px',
                          }}
                        >
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E40AF' }}>
                            👤 {person}
                          </span>
                          {onSelectPerson && linkedId && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedEvent(null);
                                onSelectPerson(linkedId);
                              }}
                              style={{
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="Inspect entity in Network Graph"
                            >
                              Inspect 🕸️
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                background: '#F8FAFC',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setSelectedEvent(null)}
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
