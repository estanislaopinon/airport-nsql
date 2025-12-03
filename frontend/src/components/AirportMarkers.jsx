import { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import axios from 'axios';

function AirportMarkers({ setMapBounds }) {
  const [airports, setAirports] = useState([]);
  const map = useMap();

  console.log('Rendering AirportMarkers component');

  useEffect(() => {
    console.log('Fetching airports from http://localhost:3000/airports');
    axios
      .get('http://localhost:3000/airports')
      .then((res) => {
        console.log('Airports fetched:', res.data.length, 'airports');
        setAirports(res.data);
        const markerCluster = L.markerClusterGroup();
        let validMarkers = 0;
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

        res.data.forEach((airport) => {
          const identifier = airport.iata_code || airport.icao;
          if (!identifier) {
            console.warn('Skipping marker for airport with no iata_code or icao:', airport);
            return;
          }
          if (
            airport.latitude != null &&
            airport.longitude != null &&
            !isNaN(airport.latitude) &&
            !isNaN(airport.longitude) &&
            airport.latitude >= -90 &&
            airport.latitude <= 90 &&
            airport.longitude >= -180 &&
            airport.longitude <= 180
          ) {
            console.log('Adding marker for:', identifier);
            const marker = L.marker([airport.latitude, airport.longitude]);
            marker.bindPopup(`
              <b>${airport.name || 'Unknown'}</b><br>
              IATA: ${airport.iata_code || 'N/A'}<br>
              ICAO: ${airport.icao || 'N/A'}<br>
              City: ${airport.city || 'N/A'}<br>
              Country: ${airport.country || 'N/A'}<br>
              Altitude: ${airport.altitude != null ? airport.altitude + ' ft' : 'N/A'}<br>
              Timezone: ${airport.timezone || 'N/A'}
            `);
            marker.on('click', () => {
              console.log(`Sending popularity increment request for ${identifier}`);
              axios
                .get(`http://localhost:3000/airports/${identifier}`)
                .then(() => console.log(`Popularity incremented for ${identifier}`))
                .catch((err) => console.error(`Error incrementing popularity for ${identifier}:`, err));
            });
            markerCluster.addLayer(marker);
            validMarkers++;

            // Update bounds
            minLat = Math.min(minLat, airport.latitude);
            maxLat = Math.max(maxLat, airport.latitude);
            minLng = Math.min(minLng, airport.longitude);
            maxLng = Math.max(maxLng, airport.longitude);
          } else {
            console.warn('Skipping marker for:', identifier, 'due to invalid coordinates:', {
              lat: airport.latitude,
              lng: airport.longitude,
            });
          }
        });

        console.log('Valid markers added:', validMarkers);
        map.addLayer(markerCluster);
        console.log('Marker cluster added to map');

        // Set map bounds if valid
        if (validMarkers > 0) {
          const bounds = [[minLat, minLng], [maxLat, maxLng]];
          console.log('Calculated map bounds:', bounds);
          setMapBounds(bounds);
          map.fitBounds(bounds, { padding: [50, 50] });
        } else {
          console.warn('No valid markers to set map bounds');
        }

        map.invalidateSize();
      })
      .catch((err) => console.error('Error fetching airports:', err));
  }, [map, setMapBounds]);

  return null;
}

export default AirportMarkers;