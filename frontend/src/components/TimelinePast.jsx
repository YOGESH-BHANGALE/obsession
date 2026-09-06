import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { timelineAPI } from '../api';

export default function TimelinePast({ caseId, onSelectPerson }) {
  const containerRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);

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

  useEffect(() => {
    if (!containerRef.current || events.length === 0) return;

    // Clear previous SVG
    d3.select(containerRef.current).selectAll('*').remove();

    const margin = { top: 60, right: 60, bottom: 60, left: 60 };
    const width = containerRef.current.clientWidth - margin.left - margin.right;
    const height = 340 - margin.top - margin.bottom;

    const svg = d3
      .select(containerRef.current)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates
    const parsedData = events
      .map((d) => ({
        ...d,
        date: new Date(d.timestamp),
      }))
      .filter((d) => !isNaN(d.date.getTime()))
      .sort((a, b) => a.date - b.date);

    if (parsedData.length === 0) return;

    // Time scale
    const [minDate, maxDate] = d3.extent(parsedData, (d) => d.date);
    const xScale = d3
      .scaleTime()
      .domain([d3.timeDay.offset(minDate, -2), d3.timeDay.offset(maxDate, 2)])
      .range([0, width]);

    // Baseline axis
    const axisY = height / 2;
    svg
      .append('line')
      .attr('x1', 0)
      .attr('y1', axisY)
      .attr('x2', width)
      .attr('y2', axisY)
      .attr('stroke', '#1A1A1A')
      .attr('stroke-width', 2.5);

    // Axis labels
    const xAxis = d3.axisBottom(xScale).ticks(8).tickFormat(d3.timeFormat('%d %b %Y'));
    svg
      .append('g')
      .attr('transform', `translate(0, ${axisY + 30})`)
      .call(xAxis)
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', '600')
      .attr('fill', '#333');

    // Alternate event dots above and below baseline
    parsedData.forEach((d, i) => {
      const isAbove = i % 2 === 0;
      const x = xScale(d.date);
      const y = isAbove ? axisY - 60 : axisY + 60;
      const isCrime = d.event_type === 'crime_event' || d.event_type === 'FIR' || d.event_type?.toLowerCase().includes('fir');

      // Connecting line
      svg
        .append('line')
        .attr('x1', x)
        .attr('y1', axisY)
        .attr('x2', x)
        .attr('y2', isAbove ? axisY - 14 : axisY + 14)
        .attr('stroke', '#999')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,3');

      // Dot
      const circle = svg
        .append('circle')
        .attr('cx', x)
        .attr('cy', isAbove ? axisY - 18 : axisY + 18)
        .attr('r', isCrime ? 9 : 7)
        .attr('fill', isCrime ? '#E53935' : '#FFFFFF')
        .attr('stroke', isCrime ? '#C62828' : '#1A1A1A')
        .attr('stroke-width', 2.5)
        .attr('cursor', 'pointer')
        .on('click', () => setSelectedEvent(d))
        .on('mouseenter', function () {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', isCrime ? 12 : 10)
            .attr('stroke-width', 3.5);
        })
        .on('mouseleave', function () {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', isCrime ? 9 : 7)
            .attr('stroke-width', 2.5);
        });

      // Label text
      svg
        .append('text')
        .attr('x', x)
        .attr('y', isAbove ? axisY - 34 : axisY + 42)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Inter, sans-serif')
        .attr('font-size', '10px')
        .attr('font-weight', isCrime ? '700' : '500')
        .attr('fill', isCrime ? '#C62828' : '#1A1A1A')
        .text(d.description ? (d.description.length > 25 ? d.description.slice(0, 22) + '...' : d.description) : d.event_type);
    });
  }, [events]);

  return (
    <div className="animate-fade-in" style={{ padding: '20px 16px', maxWidth: '1300px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid var(--black)', paddingBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, textTransform: 'uppercase' }}>
            Evidentiary Past Timeline
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Chronological sequence of verified communications, financial movements, and registered crime incidents
          </p>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontWeight: 700, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#FFFFFF', border: '2px solid #1A1A1A' }} />
            <span>Network / Communication Event</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#E53935', border: '2px solid #C62828' }} />
            <span>Registered Crime Event (FIR / Seizure)</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading chronological events...</div>
      ) : events.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888', border: '1px dashed #ccc', borderRadius: '6px' }}>
          No timeline events found. Seed the syndicate case to view timeline history.
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', border: '1.5px solid var(--black)', borderRadius: '8px', padding: '20px', overflowX: 'auto' }}>
          <div ref={containerRef} style={{ minWidth: '800px' }} />
        </div>
      )}

      {/* Event Details Card */}
      {selectedEvent && (
        <div
          style={{
            marginTop: '20px',
            background: '#FFFFFF',
            border: '2px solid var(--black)',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  background: selectedEvent.event_type === 'crime_event' ? 'var(--red-light)' : 'var(--yellow-light)',
                  color: selectedEvent.event_type === 'crime_event' ? 'var(--red-dark)' : 'var(--black)',
                  border: '1px solid rgba(0,0,0,0.2)',
                }}
              >
                {selectedEvent.event_type}
              </span>
              <h3 style={{ margin: '8px 0 4px', fontSize: '18px', fontWeight: 800 }}>
                {selectedEvent.description || 'Timeline Event'}
              </h3>
              <div style={{ fontSize: '12px', color: '#666' }}>
                🕒 {new Date(selectedEvent.timestamp).toLocaleString()}
              </div>
            </div>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setSelectedEvent(null)}
            >
              Close
            </button>
          </div>
          {selectedEvent.details && (
            <div style={{ marginTop: '12px', background: '#f9f9f9', padding: '12px', borderRadius: '4px', fontSize: '13px' }}>
              {typeof selectedEvent.details === 'object' ? JSON.stringify(selectedEvent.details, null, 2) : selectedEvent.details}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
