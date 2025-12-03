import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import AirportMarkers from './components/AirportMarkers';
import './index.css';

function MapResize() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(map.getContainer());
    return () => resizeObserver.disconnect();
  }, [map]);
  return null;
}

function App() {
  const [mapBounds, setMapBounds] = useState(null);

  // ==================== TOP 10 POPULARES ====================
  const [popularAirports, setPopularAirports] = useState([]);
  const [showPopular, setShowPopular] = useState(false);
  const [loadingPopular, setLoadingPopular] = useState(false);

  const fetchPopular = async () => {
    setLoadingPopular(true);
    try {
      const res = await fetch('http://localhost:3000/airports/popular');
      const data = await res.json();
      setPopularAirports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPopular(false);
    }
  };

  const togglePopular = () => {
    setShowPopular(!showPopular);
    if (!showPopular) fetchPopular();
  };

  // ==================== CRUD + DEBOUNCE ====================
  const [showCrud, setShowCrud] = useState(false);
  const [activeTab, setActiveTab] = useState('crear');

  const [airports, setAirports] = useState([]);
  const [loadingCrud, setLoadingCrud] = useState(false);

  const [form, setForm] = useState({
    iata_code: '', icao: '', name: '', city: '', country: '',
    latitude: '', longitude: '', altitude: '', timezone: ''
  });
  const [editingId, setEditingId] = useState(null);

  // Debounce para búsqueda
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimeout = useRef(null);

  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(debounceTimeout.current);
  }, [search]);

  const loadAirports = async () => {
    setLoadingCrud(true);
    try {
      const res = await fetch('http://localhost:3000/airports');
      const data = await res.json();
      setAirports(data);
    } catch (err) {
      alert('Error cargando aeropuertos');
    } finally {
      setLoadingCrud(false);
    }
  };

  const openCrud = () => {
    setShowCrud(true);
    setActiveTab('crear');
    loadAirports();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      latitude: form.latitude ? parseFloat(form.latitude) : undefined,
      longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      altitude: form.altitude ? parseInt(form.altitude) : undefined,
    };

    try {
      if (editingId) {
        await fetch(`http://localhost:3000/airports/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        alert('Aeropuerto actualizado');
      } else {
        await fetch('http://localhost:3000/airports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        alert('Aeropuerto creado');
      }
      setForm({ iata_code: '', icao: '', name: '', city: '', country: '', latitude: '', longitude: '', altitude: '', timezone: '' });
      setEditingId(null);
      loadAirports();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const editAirport = (airport) => {
    setForm({
      iata_code: airport.iata_code || '',
      icao: airport.icao || '',
      name: airport.name || '',
      city: airport.city || '',
      country: airport.country || '',
      latitude: airport.latitude || '',
      longitude: airport.longitude || '',
      altitude: airport.altitude || '',
      timezone: airport.timezone || ''
    });
    setEditingId(airport.iata_code || airport.icao);
    setActiveTab('crear');
  };

  const deleteAirport = async (identifier) => {
    if (!window.confirm(`¿Borrar ${identifier}?`)) return;
    try {
      await fetch(`http://localhost:3000/airports/${identifier}`, { method: 'DELETE' });
      alert('Borrado');
      loadAirports();
    } catch (err) {
      alert('Error al borrar');
    }
  };

  const filtered = airports.filter(a =>
    [a.name, a.iata_code, a.icao, a.city, a.country].some(field =>
      field?.toString().toLowerCase().includes(debouncedSearch.toLowerCase())
    )
  );

  return (
    <>
      <MapContainer center={[0, 0]} zoom={2} style={{ height: '100vh', width: '100%' }} bounds={mapBounds} minZoom={2}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' noWrap={true} />
        <MapResize />
        <AirportMarkers setMapBounds={setMapBounds} />
      </MapContainer>

      {/* BOTONES FLOTANTES */}
      <button onClick={togglePopular}
        style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, background: '#2563eb', color: 'white', padding: '12px 20px', borderRadius: '12px', border: 'none', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', cursor: 'pointer' }}>
        Top 10 Más Visitados
      </button>

      <button onClick={openCrud}
        style={{ position: 'fixed', top: 20, left: 20, zIndex: 1000, background: '#dc2626', color: 'white', padding: '14px 20px', borderRadius: '12px', border: 'none', fontWeight: 'bold', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', cursor: 'pointer' }}>
        CRUD Aeropuertos
      </button>

      {/* PANEL TOP 10 */}
      {showPopular && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: '380px', height: '100vh', background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(10px)', boxShadow: '-6px 0 30px rgba(0,0,0,0.2)', zIndex: 999, padding: '20px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>Top 10 Más Visitados</h2>
            <button onClick={() => setShowPopular(false)} style={{ background: 'none', border: 'none', fontSize: '30px', cursor: 'pointer' }}>×</button>
          </div>
          {loadingPopular ? <p>Cargando...</p> : popularAirports.length === 0 ? <p>Aún no hay visitas</p> :
            <ol style={{ paddingLeft: '20px' }}>
              {popularAirports.map((a, i) => (
                <li key={a.identifier} style={{ margin: '15px 0', padding: '14px', background: i === 0 ? '#fef3c7' : '#f3f4f6', borderRadius: '10px' }}>
                  <strong>{a.name}</strong><br />
                  <small>{a.iata_code} • {a.icao} • {a.visits} visitas</small>
                </li>
              ))}
            </ol>
          }
        </div>
      )}

      {/* MODAL CRUD */}
      {showCrud && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
             onClick={() => setShowCrud(false)}>
          <div style={{ background: 'white', width: '95%', maxWidth: '1100px', height: '92%', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 70px rgba(0,0,0,0.5)' }}
               onClick={e => e.stopPropagation()}>

            <div style={{ padding: '20px', background: '#1f2937', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Gestor de Aeropuertos</h2>
              <button onClick={() => setShowCrud(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '32px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', background: '#f3f4f6' }}>
              <button onClick={() => setActiveTab('crear')}
                style={{ ...tabBtn, background: activeTab === 'crear' ? 'white' : '#f3f4f6', borderBottom: activeTab === 'crear' ? '4px solid #10b981' : 'none' }}>
                Crear Aeropuerto
              </button>
              <button onClick={() => { setActiveTab('lista'); loadAirports(); }}
                style={{ ...tabBtn, background: activeTab === 'lista' ? 'white' : '#f3f4f6', borderBottom: activeTab === 'lista' ? '4px solid #3b82f6' : 'none' }}>
                Lista y Gestión ({filtered.length})
              </button>
            </div>

            <div style={{ height: 'calc(100% - 130px)', display: 'flex', flexDirection: 'column' }}>
              {activeTab === 'crear' ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '30px 30px 20px 30px' }}>
                    <h3 style={{ margin: '0 0 24px 0', color: '#1f2937' }}>
                      {editingId ? `Editando: ${editingId}` : 'Crear nuevo aeropuerto'}
                    </h3>
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
                      <input placeholder="IATA (ej: EZE)" value={form.iata_code} onChange={e => setForm({...form, iata_code: e.target.value.toUpperCase()})} style={inputStyle} />
                      <input placeholder="ICAO (ej: SAEZ)" value={form.icao} onChange={e => setForm({...form, icao: e.target.value.toUpperCase()})} style={inputStyle} />
                      <input placeholder="Nombre completo *" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={inputStyle} />
                      <input placeholder="Ciudad" value={form.city} onChange={e => setForm({...form, city: e.target.value})} style={inputStyle} />
                      <input placeholder="País" value={form.country} onChange={e => setForm({...form, country: e.target.value})} style={inputStyle} />
                      <input placeholder="Latitud" type="number" step="0.000001" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} style={inputStyle} />
                      <input placeholder="Longitud" type="number" step="0.000001" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} style={inputStyle} />
                      <input placeholder="Altitud (pies)" type="number" value={form.altitude} onChange={e => setForm({...form, altitude: e.target.value})} style={inputStyle} />
                      <input placeholder="Timezone (ej: America/Argentina/Buenos_Aires)" value={form.timezone} onChange={e => setForm({...form, timezone: e.target.value})} style={inputStyle} />
                    </form>
                  </div>

                  {/* BOTONES FIJOS AL FONDO */}
                  <div style={{ padding: '20px 30px', borderTop: '1px solid #e5e7eb', background: 'white', display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
                    <button onClick={handleSubmit} style={{ ...btnStyle, background: '#10b981', padding: '14px 32px', minWidth: '220px' }}>
                      {editingId ? 'Actualizar Aeropuerto' : 'Crear Aeropuerto'}
                    </button>
                    {editingId && (
                      <button onClick={() => {
                        setEditingId(null);
                        setForm({ iata_code: '', icao: '', name: '', city: '', country: '', latitude: '', longitude: '', altitude: '', timezone: '' });
                      }} style={{ ...btnStyle, background: '#6b7280', padding: '14px 24px' }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* PESTAÑA LISTA */
                <div style={{ flex: 1, padding: '30px', overflowY: 'auto' }}>
                  <h3 style={{ marginTop: 0 }}>Lista de aeropuertos</h3>
                  <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: '15px' }} />
                  {search !== debouncedSearch && <small style={{ color: '#6366f1', display: 'block', marginBottom: '10px' }}>Buscando "{search}"...</small>}

                  {loadingCrud ? <p>Cargando...</p> : filtered.length === 0 ? <p>No se encontraron resultados</p> :
                    <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={thStyle}>IATA</th>
                            <th style={thStyle}>ICAO</th>
                            <th style={thStyle}>Nombre</th>
                            <th style={thStyle}>Ciudad/País</th>
                            <th style={thStyle}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(a => (
                            <tr key={a._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={tdStyle}>{a.iata_code || '—'}</td>
                              <td style={tdStyle}>{a.icao || '—'}</td>
                              <td style={tdStyle}>{a.name}</td>
                              <td style={tdStyle}>{a.city && `${a.city}, `}{a.country}</td>
                              <td style={tdStyle}>
                                <button onClick={() => editAirport(a)} style={{...miniBtn, background: '#3b82f6'}}>Editar</button>
                                <button onClick={() => deleteAirport(a.iata_code || a.icao)} style={{...miniBtn, background: '#ef4444', marginLeft: '6px'}}>Borrar</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ESTILOS
const inputStyle = { width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '15px', background: '#fff' };
const btnStyle = { padding: '14px 24px', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };
const miniBtn = { padding: '7px 12px', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' };
const thStyle = { padding: '14px', textAlign: 'left', fontWeight: 'bold', background: '#f9fafb' };
const tdStyle = { padding: '12px', fontSize: '14px' };
const tabBtn = { padding: '18px 32px', border: 'none', background: 'transparent', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', flex: 1 };

export default App;