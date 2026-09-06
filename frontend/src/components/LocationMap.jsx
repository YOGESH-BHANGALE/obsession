import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { locationAPI, createLocationWebSocket } from '../api';

const INDIAN_CITIES = [
  { id: 'all', name: 'All India', icon: '🇮🇳', coords: [21.7679, 78.8718], zoom: 5 },
  { id: 'mumbai', name: 'Mumbai', icon: '🏙️', coords: [19.0760, 72.8777], zoom: 12, desc: 'Financial & Port Hub (BKC / Juhu)' },
  { id: 'delhi', name: 'Delhi NCR', icon: '🏛️', coords: [28.6139, 77.2090], zoom: 12, desc: 'Northern Operative Hub' },
  { id: 'bengaluru', name: 'Bengaluru', icon: '🏢', coords: [12.9716, 77.5946], zoom: 12, desc: 'Southern Communications Hub' },
  { id: 'pune', name: 'Pune', icon: '🎯', coords: [18.5204, 73.8567], zoom: 13, desc: 'Koregaon Park Rendezvous Point' },
];

const BASE_MAPS = {
  dark: {
    name: 'Dark Tactical',
    icon: '🕶️',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO &copy; OpenStreetMap | Tactical Mesh',
    maxZoom: 19,
  },
  satellite: {
    name: 'Satellite Recon',
    icon: '🛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri World Imagery | Intel Recon',
    maxZoom: 18,
  },
  light: {
    name: 'Clean Light',
    icon: '🏙️',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO &copy; OpenStreetMap',
    maxZoom: 19,
  },
};

const TACTICAL_ZONES = [
  { id: 'mum-zone', name: 'Mumbai Financial & Harbor Cordon', coords: [19.0760, 72.8777], radius: 14000, color: '#06B6D4' },
  { id: 'del-zone', name: 'Delhi NCR Command Cordon', coords: [28.6139, 77.2090], radius: 16000, color: '#3B82F6' },
  { id: 'blr-zone', name: 'Bengaluru Tech Node Perimeter', coords: [12.9716, 77.5946], radius: 12000, color: '#10B981' },
  { id: 'pune-zone', name: 'Pune Multi-Target Meeting Perimeter', coords: [18.5204, 73.8567], radius: 6500, color: '#F59E0B' },
];

const OPERATIVE_COLORS = [
  '#EF4444', // Red (Inner ring)
  '#38BDF8', // Cyan/Sky
  '#10B981', // Emerald
  '#A855F7', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#6366F1', // Indigo
  '#14B8A6', // Teal
];

export default function LocationMap({ caseId, selectedPersonId }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const layersGroupRef = useRef({
    markers: {},
    trails: {},
    meetups: [],
    zones: [],
  });

  const [trackedPersons, setTrackedPersons] = useState([]);
  const [meetups, setMeetups] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(selectedPersonId || '');
  const [selectedCity, setSelectedCity] = useState('all');
  const [baseMapStyle, setBaseMapStyle] = useState('dark');
  const [showGpsTrails, setShowGpsTrails] = useState(true);
  const [showMeetups, setShowMeetups] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [loading, setLoading] = useState(true);
  const [livePings, setLivePings] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [panelTab, setPanelTab] = useState('targets'); // 'targets' | 'meetups' | 'cities'
  const [mouseCoords, setMouseCoords] = useState({ lat: 21.7679, lng: 78.8718 });
  const [playbackIndex, setPlaybackIndex] = useState(null); // null means full trail
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackTimerRef = useRef(null);

  // Sync selectedPersonId prop changes
  useEffect(() => {
    if (selectedPersonId) {
      setSelectedPerson(selectedPersonId);
    }
  }, [selectedPersonId]);

  // Load tracked persons and surveillance meetups
  useEffect(() => {
    loadData();
  }, [caseId]);

  const loadData = async () => {
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
        color:
          p.criminal_history_flag || p.confidence_band === 'inner'
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

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [21.7679, 78.8718],
        zoom: 5,
        minZoom: 4,
        maxBounds: [
          [5.0, 65.0],
          [38.0, 100.0],
        ],
        zoomControl: false,
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      // Track mouse coordinates for live HUD
      map.on('mousemove', (e) => {
        setMouseCoords({
          lat: e.latlng.lat,
          lng: e.latlng.lng,
        });
      });

      // Default Dark Tactical Tile Layer
      const baseCfg = BASE_MAPS[baseMapStyle];
      tileLayerRef.current = L.tileLayer(baseCfg.url, {
        attribution: baseCfg.attribution,
        maxZoom: baseCfg.maxZoom,
        subdomains: 'abcd',
      }).addTo(map);

      mapInstanceRef.current = map;

      // Invalidate size after render
      setTimeout(() => {
        map.invalidateSize();
      }, 250);
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

  // 2. Base Tile Layer Switching
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const baseCfg = BASE_MAPS[baseMapStyle] || BASE_MAPS.dark;
    tileLayerRef.current = L.tileLayer(baseCfg.url, {
      attribution: baseCfg.attribution,
      maxZoom: baseCfg.maxZoom,
      subdomains: 'abcd',
    }).addTo(map);
  }, [baseMapStyle]);

  // Determine maximum trail steps for timeline scrubber
  const maxTrailLength = useMemo(() => {
    let max = 0;
    trackedPersons.forEach((p) => {
      const len = p.location_trail?.length || 0;
      if (len > max) max = len;
    });
    return Math.max(max, 1);
  }, [trackedPersons]);

  // Timeline playback animation effect
  useEffect(() => {
    if (isPlaying) {
      playbackTimerRef.current = setInterval(() => {
        setPlaybackIndex((prev) => {
          const next = (prev === null ? 1 : prev) + 1;
          if (next > maxTrailLength) {
            setIsPlaying(false);
            return maxTrailLength;
          }
          return next;
        });
      }, 600);
    } else {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    }
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, maxTrailLength]);

  // 3. Render Overlays: Trails, Markers, Meetups, Zones
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const group = layersGroupRef.current;

    // Clear old layers
    Object.values(group.markers).forEach((layers) => {
      if (Array.isArray(layers)) layers.forEach((l) => map.removeLayer(l));
      else map.removeLayer(layers);
    });
    Object.values(group.trails).forEach((t) => map.removeLayer(t));
    group.meetups.forEach((m) => map.removeLayer(m));
    group.zones.forEach((z) => map.removeLayer(z));

    group.markers = {};
    group.trails = {};
    group.meetups = [];
    group.zones = [];

    const allLatLngs = [];

    // ─── Tactical Operational Cordon Zones ───
    if (showZones) {
      TACTICAL_ZONES.forEach((zone) => {
        const circle = L.circle(zone.coords, {
          radius: zone.radius,
          color: zone.color,
          weight: 1.5,
          opacity: 0.7,
          dashArray: '4, 4',
          fillColor: zone.color,
          fillOpacity: 0.06,
        }).addTo(map).bindPopup(`
          <div style="font-family: Inter, sans-serif; font-size: 11px;">
            <div style="font-weight: 800; color: ${zone.color}; text-transform: uppercase; margin-bottom: 2px;">
              🛡️ Surveillance Perimeter
            </div>
            <div style="font-weight: 700; color: #F8FAFC;">${zone.name}</div>
            <div style="font-size: 10px; color: #94A3B8; margin-top: 3px;">
              Radius: ${(zone.radius / 1000).toFixed(1)} km | Multi-node SIGINT
            </div>
          </div>
        `, { className: 'tactical-popup' });

        group.zones.push(circle);
      });
    }

    const activeList = selectedPerson
      ? trackedPersons.filter((p) => p.person_id === selectedPerson)
      : trackedPersons;

    const selectedPersonObj = selectedPerson
      ? trackedPersons.find((p) => p.person_id === selectedPerson)
      : null;

    // ─── GPS Trails & Movement Markers ───
    if (showGpsTrails) {
      activeList.forEach((person) => {
        let fullTrail = person.location_trail || [];
        if (fullTrail.length === 0) return;

        // Apply chronological playback slice if scrubber is active
        const trail = playbackIndex !== null
          ? fullTrail.slice(0, Math.min(playbackIndex, fullTrail.length))
          : fullTrail;

        if (trail.length === 0) return;

        const latLngs = trail.map((pt) => [pt.lat, pt.lng]);
        allLatLngs.push(...latLngs);

        // Movement Polyline with glow
        const polyline = L.polyline(latLngs, {
          color: person.color || '#38BDF8',
          weight: 3.5,
          opacity: 0.9,
          dashArray: '8, 6',
          lineCap: 'round',
        }).addTo(map);
        group.trails[person.person_id] = polyline;

        // Origin / Start Point Marker
        const startPt = trail[0];
        const startMarker = L.circleMarker([startPt.lat, startPt.lng], {
          radius: 4.5,
          fillColor: '#FFFFFF',
          fillOpacity: 0.95,
          color: person.color || '#38BDF8',
          weight: 2.5,
        }).addTo(map).bindPopup(`
          <div style="font-family: Inter, sans-serif; font-size: 11px;">
            <div style="font-weight: 800; color: #38BDF8;">${person.person_name} (Origin)</div>
            <div style="color: #94A3B8; font-size: 10px;">${startPt.timestamp ? new Date(startPt.timestamp).toLocaleDateString() : ''}</div>
          </div>
        `, { className: 'tactical-popup' });

        // Latest Position Pulsing Radar Marker
        const latest = trail[trail.length - 1];
        const isInner = person.confidence_band === 'inner' || person.criminal_history_flag;
        const pulseClass = isInner ? 'radar-pulse-red' : 'radar-pulse-blue';

        const initials = person.person_name
          ? person.person_name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
          : 'OP';

        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div style="
              position: relative;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              background: ${person.color || '#38BDF8'};
              border: 2.5px solid #FFFFFF;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 900;
              font-size: 11px;
              color: #FFFFFF;
              animation: ${pulseClass} 2s infinite ease-in-out;
              box-shadow: 0 4px 14px rgba(0,0,0,0.5);
              cursor: pointer;
            ">
              ${initials}
              <span style="
                position: absolute;
                top: -3px;
                right: -3px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: ${isInner ? '#EF4444' : '#10B981'};
                border: 2px solid #FFFFFF;
              "></span>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const latestMarker = L.marker([latest.lat, latest.lng], { icon: customIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: Inter, sans-serif; min-width: 240px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-weight: 800; font-size: 14px; color: #F8FAFC;">${person.person_name}</span>
                <span style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; background: ${
                  isInner ? '#7F1D1D' : '#1E3A8A'
                }; color: ${isInner ? '#FCA5A5' : '#93C5FD'}; border: 1px solid ${isInner ? '#EF4444' : '#3B82F6'};">
                  ${person.confidence_band || 'Tracked'}
                </span>
              </div>
              <div style="font-size: 11px; color: #CBD5E1; margin: 4px 0; display: flex; justify-content: space-between;">
                <span>GPS Fix:</span>
                <code style="color: #38BDF8; font-weight: 700;">${latest.lat.toFixed(4)}, ${latest.lng.toFixed(4)}</code>
              </div>
              <div style="font-size: 11px; color: #CBD5E1; margin: 4px 0; display: flex; justify-content: space-between;">
                <span>Pings Logged:</span>
                <strong style="color: #F8FAFC;">${trail.length} / ${fullTrail.length}</strong>
              </div>
              <div style="font-size: 10px; color: #94A3B8; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
                Last Seen: ${latest.timestamp ? new Date(latest.timestamp).toLocaleString() : 'Live'}
              </div>
            </div>
          `, { className: 'tactical-popup' });

        group.markers[person.person_id] = [startMarker, latestMarker];
      });
    }

    // ─── Physical Surveillance Rendezvous Markers ───
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
              width: 34px;
              height: 34px;
              border-radius: 50%;
              background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
              border: 2.5px solid #FFFFFF;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
              animation: meetup-glow-pulse 2.2s infinite ease-in-out;
              box-shadow: 0 4px 14px rgba(234, 88, 12, 0.5);
              cursor: pointer;
            " title="Surveillance Rendezvous: ${m.city}">
              🤝
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const marker = L.marker([m.lat, m.lng], { icon: meetupIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: Inter, sans-serif; min-width: 260px; padding: 2px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 9.5px; font-weight: 800; background: #7C2D12; color: #FED7AA; border: 1px solid #F97316; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                  📍 Rendezvous Sighting
                </span>
                <span style="font-size: 10px; font-weight: 800; color: #F8FAFC; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">
                  ${m.city}
                </span>
              </div>
              <div style="font-weight: 800; font-size: 14px; color: #F8FAFC; margin-bottom: 4px;">
                Subject: ${m.person_name}
              </div>
              ${
                m.observed_with && m.observed_with.length > 0
                  ? `
                <div style="font-size: 11px; margin-bottom: 6px; background: rgba(249, 115, 22, 0.15); border: 1px solid rgba(249, 115, 22, 0.4); padding: 5px 8px; border-radius: 4px;">
                  <span style="font-weight: 700; color: #FED7AA;">Met With: </span>
                  <span style="font-weight: 800; color: #F97316;">${m.observed_with.join(', ')}</span>
                </div>
              `
                  : ''
              }
              <div style="font-size: 11px; color: #E2E8F0; line-height: 1.45; margin-bottom: 6px; background: rgba(0,0,0,0.3); padding: 7px; border-radius: 4px; border-left: 3px solid #F97316;">
                "${m.description}"
              </div>
              <div style="font-size: 10px; color: #94A3B8; display: flex; justify-content: space-between; margin-top: 4px;">
                <span>Coords: ${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}</span>
                <span>${m.timestamp ? new Date(m.timestamp).toLocaleDateString() : 'Active'}</span>
              </div>
              <div style="font-size: 9.5px; color: #64748B; margin-top: 4px; text-align: right;">
                Source: ${m.source}
              </div>
            </div>
          `, { className: 'tactical-popup' });

        group.meetups.push(marker);
      });
    }

    // Adjust bounds if All India is selected and not in active playback
    if (selectedCity === 'all' && allLatLngs.length > 0 && playbackIndex === null) {
      map.fitBounds(allLatLngs, { padding: [50, 50], maxZoom: 13 });
    }
  }, [trackedPersons, meetups, selectedPerson, showGpsTrails, showMeetups, showZones, playbackIndex]);

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

  // Focus directly on an operative
  const focusOnOperative = (personId) => {
    setSelectedPerson(personId);
    const p = trackedPersons.find((x) => x.person_id === personId);
    if (!p || !p.location_trail || p.location_trail.length === 0) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    const trail = p.location_trail;
    const latest = trail[trail.length - 1];
    map.flyTo([latest.lat, latest.lng], 12, { duration: 1.2 });
  };

  // Focus directly on a meetup
  const focusOnMeetup = (m) => {
    if (!m.lat || !m.lng) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([m.lat, m.lng], 14, { duration: 1.2 });
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

  // Group meetups by city for the inspector drawer
  const meetupsByCity = useMemo(() => {
    const map = {};
    meetups.forEach((m) => {
      const c = m.city || 'Other';
      if (!map[c]) map[c] = [];
      map[c].push(m);
    });
    return map;
  }, [meetups]);

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 140px)',
        position: 'relative',
        background: '#0B0F19',
        overflow: 'hidden',
      }}
    >
      {/* ─── Top Tactical Command Toolbar ─── */}
      <div
        style={{
          padding: '10px 18px',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        {/* Left: Operative Selector & City Focus Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8', letterSpacing: '0.5px' }}>
              Target:
            </span>
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              style={{
                background: '#1E293B',
                color: '#F8FAFC',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                minWidth: '220px',
              }}
            >
              <option value="">All Operatives ({trackedPersons.length})</option>
              {trackedPersons.map((p) => (
                <option key={p.person_id} value={p.person_id}>
                  {p.confidence_band === 'inner' ? '🔴 ' : '🔵 '}
                  {p.person_name} ({p.location_trail?.length || 0} pings)
                </option>
              ))}
            </select>
          </div>

          {/* Quick-Jump City Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(0,0,0,0.35)', padding: '3px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
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
                  background: selectedCity === c.id ? '#2563EB' : 'transparent',
                  color: selectedCity === c.id ? '#FFFFFF' : '#94A3B8',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title={c.desc || c.name}
              >
                <span>{c.icon}</span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Base Layer Switcher, Layer Toggles, & Drawer Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Base Layer Switcher (Dark / Satellite / Light) */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', padding: '2px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
            {Object.entries(BASE_MAPS).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => setBaseMapStyle(key)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: baseMapStyle === key ? '#38BDF8' : 'transparent',
                  color: baseMapStyle === key ? '#0F172A' : '#94A3B8',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>

          {/* Layer Toggles */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', color: '#E2E8F0' }}>
            <input
              type="checkbox"
              checked={showGpsTrails}
              onChange={(e) => setShowGpsTrails(e.target.checked)}
              style={{ accentColor: '#38BDF8', cursor: 'pointer' }}
            />
            <span>🛰️ Trails ({totalPings})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', color: '#E2E8F0' }}>
            <input
              type="checkbox"
              checked={showMeetups}
              onChange={(e) => setShowMeetups(e.target.checked)}
              style={{ accentColor: '#F97316', cursor: 'pointer' }}
            />
            <span>🤝 Meetups ({meetups.length})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', color: '#E2E8F0' }}>
            <input
              type="checkbox"
              checked={showZones}
              onChange={(e) => setShowZones(e.target.checked)}
              style={{ accentColor: '#10B981', cursor: 'pointer' }}
            />
            <span>🛡️ Cordons</span>
          </label>

          {/* Intel Drawer Button */}
          <button
            type="button"
            onClick={() => setShowPanel(!showPanel)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: showPanel ? '#38BDF8' : '#1E293B',
              color: showPanel ? '#0F172A' : '#F8FAFC',
              border: '1px solid rgba(255,255,255,0.15)',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>📁</span> Intel Drawer
          </button>
        </div>
      </div>

      {/* ─── Leaflet Map Canvas ─── */}
      <div ref={mapContainerRef} style={{ flex: 1, width: '100%', height: '100%', background: '#0B0F19' }} />

      {/* ─── Interactive Tactical Side Drawer (Inspector Panel) ─── */}
      {showPanel && (
        <div
          style={{
            position: 'absolute',
            top: '56px',
            right: '16px',
            bottom: '50px',
            width: '340px',
            background: 'rgba(15, 23, 42, 0.96)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '10px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
            color: '#F8FAFC',
            overflow: 'hidden',
          }}
        >
          {/* Drawer Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)' }}>
            <button
              type="button"
              onClick={() => setPanelTab('targets')}
              style={{
                flex: 1,
                padding: '10px 0',
                background: panelTab === 'targets' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: panelTab === 'targets' ? '#38BDF8' : '#94A3B8',
                border: 'none',
                borderBottom: panelTab === 'targets' ? '2px solid #38BDF8' : 'none',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Operatives ({trackedPersons.length})
            </button>
            <button
              type="button"
              onClick={() => setPanelTab('meetups')}
              style={{
                flex: 1,
                padding: '10px 0',
                background: panelTab === 'meetups' ? 'rgba(249, 115, 22, 0.15)' : 'transparent',
                color: panelTab === 'meetups' ? '#F97316' : '#94A3B8',
                border: 'none',
                borderBottom: panelTab === 'meetups' ? '2px solid #F97316' : 'none',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Meetups ({meetups.length})
            </button>
            <button
              type="button"
              onClick={() => setPanelTab('cities')}
              style={{
                flex: 1,
                padding: '10px 0',
                background: panelTab === 'cities' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                color: panelTab === 'cities' ? '#10B981' : '#94A3B8',
                border: 'none',
                borderBottom: panelTab === 'cities' ? '2px solid #10B981' : 'none',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              City Hubs
            </button>
          </div>

          {/* Drawer Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {panelTab === 'targets' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {trackedPersons.map((p) => (
                  <div
                    key={p.person_id}
                    onClick={() => focusOnOperative(p.person_id)}
                    style={{
                      padding: '10px 12px',
                      background: selectedPerson === p.person_id ? 'rgba(56, 189, 248, 0.12)' : 'rgba(30, 41, 59, 0.5)',
                      border: `1px solid ${selectedPerson === p.person_id ? '#38BDF8' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#F8FAFC' }}>
                        {p.person_name}
                      </span>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: p.confidence_band === 'inner' ? '#7F1D1D' : '#1E3A8A',
                          color: p.confidence_band === 'inner' ? '#FCA5A5' : '#93C5FD',
                        }}
                      >
                        {p.confidence_band || 'Tracked'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>GPS Pings: <strong style={{ color: '#38BDF8' }}>{p.location_trail?.length || 0}</strong></span>
                      <span>Click to Focus 🎯</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panelTab === 'meetups' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {meetups.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => focusOnMeetup(m)}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(30, 41, 59, 0.5)',
                      border: '1px solid rgba(249, 115, 22, 0.25)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 800, fontSize: '12px', color: '#F97316' }}>
                        📍 {m.city}
                      </span>
                      <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                        {m.timestamp ? new Date(m.timestamp).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: '#F8FAFC' }}>
                      Subject: {m.person_name}
                    </div>
                    {m.observed_with && m.observed_with.length > 0 && (
                      <div style={{ fontSize: '10.5px', color: '#FED7AA', marginTop: '2px' }}>
                        Met: {m.observed_with.join(', ')}
                      </div>
                    )}
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px', fontStyle: 'italic', lineHeight: '1.3' }}>
                      "{m.description?.slice(0, 75)}..."
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panelTab === 'cities' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(meetupsByCity).map(([city, list]) => (
                  <div
                    key={city}
                    onClick={() => {
                      const matched = INDIAN_CITIES.find((c) => c.name.toLowerCase().includes(city.toLowerCase()));
                      if (matched) handleCitySelect(matched);
                    }}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(30, 41, 59, 0.5)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: '#10B981' }}>
                        {city}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#38BDF8' }}>
                        {list.length} Meetups Logged
                      </span>
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px' }}>
                      Targets sighted: {[...new Set(list.map((x) => x.person_name))].join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Bottom Chronological Trail Playback Scrubber Bar ─── */}
      <div
        style={{
          position: 'absolute',
          bottom: '26px',
          left: '20px',
          right: showPanel ? '370px' : '20px',
          background: 'rgba(15, 23, 42, 0.94)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '8px 14px',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          transition: 'right 0.2s ease',
        }}
      >
        {/* Play/Pause Toggle */}
        <button
          type="button"
          onClick={() => {
            if (isPlaying) {
              setIsPlaying(false);
            } else {
              if (playbackIndex === null || playbackIndex >= maxTrailLength) {
                setPlaybackIndex(1);
              }
              setIsPlaying(true);
            }
          }}
          style={{
            background: isPlaying ? '#EF4444' : '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <span>{isPlaying ? '⏸ Pause' : '▶ Play Trail'}</span>
        </button>

        {/* Scrubber Label */}
        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', whiteSpace: 'nowrap' }}>
          Time Scrubber: {playbackIndex !== null ? `Step ${playbackIndex} / ${maxTrailLength}` : 'Full History'}
        </span>

        {/* Range Slider */}
        <input
          type="range"
          min="1"
          max={maxTrailLength}
          value={playbackIndex !== null ? playbackIndex : maxTrailLength}
          onChange={(e) => {
            setIsPlaying(false);
            setPlaybackIndex(parseInt(e.target.value, 10));
          }}
          style={{
            flex: 1,
            accentColor: '#38BDF8',
            cursor: 'pointer',
          }}
        />

        {/* Reset / All History Button */}
        {playbackIndex !== null && (
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setPlaybackIndex(null);
            }}
            style={{
              background: 'transparent',
              color: '#38BDF8',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Show All
          </button>
        )}
      </div>

      {/* ─── Bottom HUD Live Telemetry Status Bar ─── */}
      <div
        style={{
          position: 'absolute',
          bottom: '2px',
          left: '0',
          right: '0',
          height: '22px',
          background: '#090D16',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 16px',
          fontSize: '9.5px',
          color: '#64748B',
          zIndex: 1000,
          fontFamily: 'monospace',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>🛰️ GEO-INTEL MESH V2.4</span>
          <span>● TARGETS: {trackedPersons.length}</span>
          <span>● PINGS: {totalPings}</span>
          <span>● RENDEZVOUS: {meetups.length}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>
            CURSOR: {mouseCoords.lat.toFixed(4)}°N, {mouseCoords.lng.toFixed(4)}°E
          </span>
          <span style={{ color: '#22C55E', fontWeight: 800 }}>● ENCRYPTED FEED ACTIVE</span>
        </div>
      </div>
    </div>
  );
}
