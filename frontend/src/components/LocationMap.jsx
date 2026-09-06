import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { locationAPI, createLocationWebSocket } from '../api';

export default function LocationMap({ caseId, selectedPersonId }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const trailsRef = useRef({});
  const [trackedPersons, setTrackedPersons] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(selectedPersonId || '');
  const [loading, setLoading] = useState(true);
  const [livePings, setLivePings] = useState([]);

  // Load all tracked entities
  useEffect(() => {
    loadTracked();
  }, [caseId]);

  const loadTracked = async () => {
    setLoading(true);
    try {
      const res = await locationAPI.getAllTracked(caseId);
      setTrackedPersons(res.data || []);
      if (res.data && res.data.length > 0 && !selectedPerson) {
        setSelectedPerson(res.data[0].person_id);
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
      // Center of India
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
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      // Keep map alive between renders unless unmounting
    };
  }, []);

  // Update Markers & Trails on selected person or pings
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing markers and polylines
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    Object.values(trailsRef.current).forEach((t) => map.removeLayer(t));
    markersRef.current = {};
    trailsRef.current = {};

    const activeList = selectedPerson
      ? trackedPersons.filter((p) => p.person_id === selectedPerson)
      : trackedPersons;

    const allLatLngs = [];

    activeList.forEach((person) => {
      const trail = person.location_trail || [];
      if (trail.length === 0) return;

      const latLngs = trail.map((pt) => [pt.lat, pt.lng]);
      allLatLngs.push(...latLngs);

      // Polyline trail
      const polyline = L.polyline(latLngs, {
        color: person.criminal_history_flag ? '#E53935' : '#1A1A1A',
        weight: 3,
        opacity: 0.8,
        dashArray: '6, 6',
      }).addTo(map);
      trailsRef.current[person.person_id] = polyline;

      // Latest position marker
      const latest = trail[trail.length - 1];
      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: ${person.criminal_history_flag ? '#E53935' : '#FFD600'};
            border: 2.5px solid #1A1A1A;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 11px;
            color: #1A1A1A;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          ">
            ${person.person_name ? person.person_name.slice(0, 2).toUpperCase() : 'LOC'}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([latest.lat, latest.lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: Inter, sans-serif;">
            <div style="font-weight: 800; font-size: 14px;">${person.person_name}</div>
            <div style="font-size: 11px; color: #666; margin-top: 2px;">
              Lat: ${latest.lat.toFixed(4)}, Lng: ${latest.lng.toFixed(4)}
            </div>
            <div style="font-size: 10px; color: #888; margin-top: 4px;">
              Timestamp: ${latest.timestamp ? new Date(latest.timestamp).toLocaleString() : 'Recent'}
            </div>
          </div>
        `);

      markersRef.current[person.person_id] = marker;
    });

    if (allLatLngs.length > 0) {
      map.fitBounds(allLatLngs, { padding: [40, 40] });
    }
  }, [trackedPersons, selectedPerson]);

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

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', position: 'relative' }}>
      {/* Top Filter Bar */}
      <div
        style={{
          padding: '12px 20px',
          background: '#FFFFFF',
          borderBottom: '1.5px solid var(--black)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>
            Track Entity:
          </span>
          <select
            className="form-input form-input-sm"
            value={selectedPerson}
            onChange={(e) => setSelectedPerson(e.target.value)}
            style={{ width: '220px' }}
          >
            <option value="">All Tracked Persons ({trackedPersons.length})</option>
            {trackedPersons.map((p) => (
              <option key={p.person_id} value={p.person_id}>
                {p.person_name} ({p.location_trail?.length || 0} pings)
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700 }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#2e7d32' }} />
          <span>India Surveillance Mesh Active</span>
          <span style={{ color: '#888' }}>| OpenStreetMap Local Tiles</span>
        </div>
      </div>

      {/* Map Canvas */}
      <div ref={mapRef} style={{ flex: 1, width: '100%', height: '100%', background: '#eaeaea' }} />

      {/* Live Ping Feed Ticker at bottom */}
      {livePings.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '1.5px solid var(--black)',
            borderRadius: '6px',
            padding: '12px 16px',
            maxWidth: '320px',
            zIndex: 1000,
            fontSize: '11px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
            🛰️ Live Location Stream
          </div>
          <div style={{ maxHeight: '100px', overflowY: 'auto' }}>
            {livePings.slice(0, 4).map((ping, i) => (
              <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #eee' }}>
                <strong>{ping.person_name || 'Target'}:</strong> {ping.lat?.toFixed(3)}, {ping.lng?.toFixed(3)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
