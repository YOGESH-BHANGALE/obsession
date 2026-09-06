import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { locationAPI, createLocationWebSocket } from '../api';

const INDIAN_CITIES = [
  { id: 'all', name: 'All India', icon: '🇮🇳', coords: [21.7679, 78.8718], zoom: 5 },
  { id: 'mumbai', name: 'Mumbai', icon: '🏙️', coords: [19.0760, 72.8777], zoom: 12, region: 'Western Cluster' },
  { id: 'delhi', name: 'Delhi NCR', icon: '🏛️', coords: [28.6139, 77.2090], zoom: 12, region: 'Northern Hub' },
  { id: 'bengaluru', name: 'Bengaluru', icon: '🏢', coords: [12.9716, 77.5946], zoom: 12, region: 'Southern Corridor' },
  { id: 'pune', name: 'Pune', icon: '🎯', coords: [18.5204, 73.8567], zoom: 13, region: 'Koregaon Rendezvous' },
];

const OPERATIVE_COLORS = [
  '#EF4444', // Red
  '#2563EB', // Blue
  '#059669', // Emerald
  '#7C3AED', // Purple
  '#D97706', // Amber
  '#DB2777', // Pink
  '#0891B2', // Cyan
  '#4F46E5', // Indigo
];

export default function LocationMap({ caseId, selectedPersonId }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const trailsRef = useRef({});
  const meetupMarkersRef = useRef([]);

  const [trackedPersons, setTrackedPersons] = useState([]);
  const [meetups, setMeetups] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(selectedPersonId || '');
  const [selectedCity, setSelectedCity] = useState('all');
  const [showGpsTrails, setShowGpsTrails] = useState(true);
  const [showMeetups, setShowMeetups] = useState(true);
  const [loading, setLoading] = useState(true);
  const [livePings, setLivePings] = useState([]);
  const [showStreamFeed, setShowStreamFeed] = useState(true);

  // Sync selectedPersonId prop changes
  useEffect(() => {
    if (selectedPersonId) {
      setSelectedPerson(selectedPersonId);
    }
  }, [selectedPersonId]);

  // Load all tracked entities and physical meetup spots
  useEffect(() => {
    loadTracked();
  }, [caseId]);

  const loadTracked = async () => {
    setLoading(true);
    try {
      const res = await locationAPI.getAllTracked(caseId);
      let personsList = [];
      let meetupsList = [];

      if (Array.isArray(res.data)) {
        personsList = res.data;
      } else if (res.data) {
        personsList = res.data.tracked_persons || [];
        meetupsList = res.data.meetups || [];
      }

      // Normalize person objects
      const normalized = personsList.map((p, idx) => ({
        ...p,
        person_name: p.person_name || p.name || 'Operative',
        location_trail: p.location_trail || p.trail || [],
        color: p.criminal_history_flag || p.confidence_band === 'inner'
          ? '#EF4444'
          : OPERATIVE_COLORS[idx % OPERATIVE_COLORS.length],
      }));

      setTrackedPersons(normalized);
      setMeetups(meetupsList);

      if (selectedPersonId && normalized.some((p) => p.person_id === selectedPersonId)) {
        setSelectedPerson(selectedPersonId);
      }
    } catch (err) {
      console.error('Failed to load tracked locations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initialize Leaflet Map (India Bounded)
  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, {
        center: [21.7679, 78.8718],
        zoom: 5,
        minZoom: 4,
        maxBounds: [
          [5.0, 65.0],
          [38.0, 100.0],
        ],
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | Law Enforcement GeoIntel',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Invalidate size to ensure crisp rendering
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Update Markers, Trails, and Meetups on state change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing layers
    Object.values(markersRef.current).forEach((layer) => {
      if (Array.isArray(layer)) {
        layer.forEach((l) => map.removeLayer(l));
      } else {
        map.removeLayer(layer);
      }
    });
    Object.values(trailsRef.current).forEach((t) => map.removeLayer(t));
    meetupMarkersRef.current.forEach((m) => map.removeLayer(m));

    markersRef.current = {};
    trailsRef.current = {};
    meetupMarkersRef.current = [];

    const activeList = selectedPerson
      ? trackedPersons.filter((p) => p.person_id === selectedPerson)
      : trackedPersons;

    const selectedPersonObj = selectedPerson
      ? trackedPersons.find((p) => p.person_id === selectedPerson)
      : null;

    const allLatLngs = [];

    // 1. Render GPS Trails & Movement Markers
    if (showGpsTrails) {
      activeList.forEach((person) => {
        const trail = person.location_trail || [];
        if (trail.length === 0) return;

        const latLngs = trail.map((pt) => [pt.lat, pt.lng]);
        allLatLngs.push(...latLngs);

        // Polyline movement trail
        const polyline = L.polyline(latLngs, {
          color: person.color || '#2563EB',
          weight: 3.5,
          opacity: 0.85,
          dashArray: '6, 6',
          lineCap: 'round',
        }).addTo(map);
        trailsRef.current[person.person_id] = polyline;

        // Trail Start dot
        const startPt = trail[0];
        const startMarker = L.circleMarker([startPt.lat, startPt.lng], {
          radius: 4.5,
          fillColor: '#FFFFFF',
          fillOpacity: 0.9,
          color: person.color || '#2563EB',
          weight: 2,
        })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: Inter, sans-serif; font-size: 11px;">
              <strong>${person.person_name}</strong> (Origin Point)<br/>
              ${startPt.timestamp ? new Date(startPt.timestamp).toLocaleDateString() : ''}
            </div>
          `);

        // Latest position marker (Pulsing badge)
        const latest = trail[trail.length - 1];
        const initials = person.person_name
          ? person.person_name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
          : 'LOC';

        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div style="
              width: 32px;
              height: 32px;
              border-radius: 50%;
              background: ${person.color || '#2563EB'};
              border: 2.5px solid #FFFFFF;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 11px;
              color: #FFFFFF;
              box-shadow: 0 3px 10px rgba(0,0,0,0.35);
              cursor: pointer;
            ">
              ${initials}
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([latest.lat, latest.lng], { icon: customIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: Inter, sans-serif; min-width: 220px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <span style="font-weight: 800; font-size: 13px; color: #0F172A;">${person.person_name}</span>
                <span style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: ${
                  person.confidence_band === 'inner' ? '#FEE2E2' : '#EFF6FF'
                }; color: ${person.confidence_band === 'inner' ? '#DC2626' : '#2563EB'};">
                  ${person.confidence_band || 'Tracked'}
                </span>
              </div>
              <div style="font-size: 11px; color: #475569; margin: 3px 0;">
                Latest Lat: ${latest.lat.toFixed(4)}, Lng: ${latest.lng.toFixed(4)}
              </div>
              <div style="font-size: 11px; color: #64748B;">
                Total GPS Pings: <strong>${trail.length}</strong>
              </div>
              <div style="font-size: 10px; color: #94A3B8; margin-top: 4px;">
                Last Recorded: ${latest.timestamp ? new Date(latest.timestamp).toLocaleString() : 'Recent'}
              </div>
            </div>
          `);

        markersRef.current[person.person_id] = [startMarker, marker];
      });
    }

    // 2. Render Physical Meetup Spots (Surveillance Points)
    if (showMeetups && meetups.length > 0) {
      const activeMeetups = selectedPersonObj
        ? meetups.filter(
            (m) =>
              m.person_id === selectedPerson ||
              m.person_name === selectedPersonObj.person_name ||
              (m.observed_with && m.observed_with.includes(selectedPersonObj.person_name))
          )
        : meetups;

      activeMeetups.forEach((m) => {
        if (!m.lat || !m.lng) return;
        allLatLngs.push([m.lat, m.lng]);

        const meetupIcon = L.divIcon({
          className: 'meetup-map-pin',
          html: `
            <div style="
              width: 32px;
              height: 32px;
              border-radius: 50%;
              background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
              border: 2px solid #FFFFFF;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 15px;
              box-shadow: 0 4px 10px rgba(234, 88, 12, 0.45);
              cursor: pointer;
            " title="Surveillance Meetup: ${m.city}">
              🤝
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([m.lat, m.lng], { icon: meetupIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: Inter, sans-serif; min-width: 250px; padding: 2px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 10px; font-weight: 800; background: #FEF3C7; color: #92400E; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                  📍 Surveillance Meetup
                </span>
                <span style="font-size: 10px; font-weight: 800; color: #1E293B; background: #E2E8F0; padding: 2px 6px; border-radius: 4px;">
                  ${m.city}
                </span>
              </div>
              <div style="font-weight: 800; font-size: 13px; color: #0F172A; margin-bottom: 4px;">
                Target: ${m.person_name}
              </div>
              ${
                m.observed_with && m.observed_with.length > 0
                  ? `
                <div style="font-size: 11px; margin-bottom: 6px; background: #FFF7ED; padding: 4px 6px; border-radius: 4px; border: 1px solid #FFEDD5;">
                  <span style="font-weight: 700; color: #C2410C;">Associates Present: </span>
                  <span style="font-weight: 800; color: #EA580C;">${m.observed_with.join(', ')}</span>
                </div>
              `
                  : ''
              }
              <div style="font-size: 11px; color: #334155; line-height: 1.4; margin-bottom: 6px; background: #F8FAFC; padding: 6px; border-radius: 4px; border-left: 3px solid #F97316;">
                "${m.description}"
              </div>
              <div style="font-size: 10px; color: #64748B; display: flex; justify-content: space-between; margin-top: 4px;">
                <span>Lat: ${m.lat.toFixed(4)}, Lng: ${m.lng.toFixed(4)}</span>
                <span>${m.timestamp ? new Date(m.timestamp).toLocaleDateString() : 'Active'}</span>
              </div>
              <div style="font-size: 9.5px; color: #94A3B8; margin-top: 4px; text-align: right;">
                Source: ${m.source}
              </div>
            </div>
          `);

        meetupMarkersRef.current.push(marker);
      });
    }

    // Adjust bounds if not explicitly zoomed into a city
    if (selectedCity === 'all' && allLatLngs.length > 0) {
      map.fitBounds(allLatLngs, { padding: [50, 50], maxZoom: 14 });
    }
  }, [trackedPersons, meetups, selectedPerson, showGpsTrails, showMeetups]);

  // Handle City Quick-Jump
  const handleCitySelect = (city) => {
    setSelectedCity(city.id);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (city.id === 'all') {
      const allCoords = [];
      trackedPersons.forEach((p) => {
        (p.location_trail || []).forEach((pt) => allCoords.push([pt.lat, pt.lng]));
      });
      meetups.forEach((m) => {
        if (m.lat && m.lng) allCoords.push([m.lat, m.lng]);
      });
      if (allCoords.length > 0) {
        map.fitBounds(allCoords, { padding: [40, 40], maxZoom: 12 });
      } else {
        map.flyTo(city.coords, city.zoom, { duration: 1.2 });
      }
    } else {
      map.flyTo(city.coords, city.zoom, { duration: 1.2 });
    }
  };

  // WebSocket for Live Location Streaming
  useEffect(() => {
    let ws;
    try {
      ws = createLocationWebSocket(caseId);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'location_ping') {
            setLivePings((prev) => [data, ...prev.slice(0, 19)]);
            // Update trail in state
            setTrackedPersons((prev) =>
              prev.map((p) => {
                if (p.person_id === data.person_id) {
                  return {
                    ...p,
                    location_trail: [...(p.location_trail || []), data],
                  };
                }
                return p;
              })
            );
          }
        } catch (e) {
          console.error(e);
        }
      };
    } catch (e) {
      // WS fallback
    }

    return () => {
      if (ws) ws.close();
    };
  }, [caseId]);

  const totalPings = trackedPersons.reduce((acc, p) => acc + (p.location_trail?.length || 0), 0);

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 140px)',
        position: 'relative',
        background: '#0F172A',
      }}
    >
      {/* Top Interactive Controls Toolbar */}
      <div
        style={{
          padding: '10px 18px',
          background: '#FFFFFF',
          borderBottom: '1.5px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          zIndex: 10,
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        }}
      >
        {/* Left: Operative Selector & City Jump Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569' }}>
              Target:
            </span>
            <select
              className="form-input form-input-sm"
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              style={{
                width: '240px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '6px',
                padding: '5px 8px',
                borderColor: '#CBD5E1',
              }}
            >
              <option value="">All Tracked Persons ({trackedPersons.length})</option>
              {trackedPersons.map((p) => (
                <option key={p.person_id} value={p.person_id}>
                  {p.person_name} ({p.location_trail?.length || 0} pings)
                </option>
              ))}
            </select>
          </div>

          {/* Quick-Jump City Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F1F5F9', padding: '3px', borderRadius: '6px' }}>
            {INDIAN_CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleCitySelect(c)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '5px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: selectedCity === c.id ? '#0F172A' : 'transparent',
                  color: selectedCity === c.id ? '#FFFFFF' : '#475569',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title={c.region || c.name}
              >
                <span>{c.icon}</span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Layer Toggles & Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#334155' }}>
            <input
              type="checkbox"
              checked={showGpsTrails}
              onChange={(e) => setShowGpsTrails(e.target.checked)}
              style={{ accentColor: '#2563EB', cursor: 'pointer' }}
            />
            <span>🛰️ GPS Trails ({totalPings})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#334155' }}>
            <input
              type="checkbox"
              checked={showMeetups}
              onChange={(e) => setShowMeetups(e.target.checked)}
              style={{ accentColor: '#EA580C', cursor: 'pointer' }}
            />
            <span>🤝 Meetup Spots ({meetups.length})</span>
          </label>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: '20px',
              background: '#DCFCE7',
              color: '#15803D',
              border: '1px solid #BBF7D0',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#22C55E',
                boxShadow: '0 0 6px #22C55E',
                display: 'inline-block',
              }}
            />
            <span>GeoIntel Active</span>
          </div>
        </div>
      </div>

      {/* Map Canvas */}
      <div ref={mapRef} style={{ flex: 1, width: '100%', height: '100%', background: '#E2E8F0' }} />

      {/* Floating Legend / Summary Pill (Bottom-Left) */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '20px',
          background: 'rgba(15, 23, 42, 0.92)',
          color: '#FFFFFF',
          padding: '10px 14px',
          borderRadius: '8px',
          zIndex: 1000,
          fontSize: '11px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          maxWidth: '260px',
        }}
      >
        <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '10px', color: '#94A3B8', letterSpacing: '0.5px' }}>
          Surveillance Mesh Legend
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
          <span>Inner Operatives / High Risk</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2563EB', display: 'inline-block' }} />
          <span>Field Operatives / Associates</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EA580C', display: 'inline-block' }} />
          <span>Physical Meetup Observation (🤝)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '12px', height: '2px', background: '#38BDF8', borderTop: '2px dashed #38BDF8', display: 'inline-block' }} />
          <span>GPS Movement Polyline</span>
        </div>
      </div>

      {/* Live Ping Feed Ticker (Bottom-Right) */}
      {livePings.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '12px 14px',
            maxWidth: '320px',
            zIndex: 1000,
            fontSize: '11px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🛰️</span> Live GPS Stream
            </div>
            <button
              type="button"
              onClick={() => setShowStreamFeed(!showStreamFeed)}
              style={{ background: 'none', border: 'none', fontSize: '10px', color: '#64748B', cursor: 'pointer', fontWeight: 700 }}
            >
              {showStreamFeed ? 'Minimize' : 'Expand'}
            </button>
          </div>

          {showStreamFeed && (
            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {livePings.slice(0, 5).map((ping, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{ping.person_name || 'Target'}:</strong>
                  <span style={{ color: '#64748B' }}>
                    {ping.lat?.toFixed(3)}, {ping.lng?.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
