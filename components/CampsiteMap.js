'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// 客製化地圖 Icon (預設藍色)
const defaultIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// 選取狀態的地圖 Icon (黃色/金色)
const selectedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function CampsiteMap({ campsites, mapMode, onSelectCampsite, selectedCampId }) {
  // 預設中心點：台灣中部附近，適合作為全台檢視視角
  const position = [24.0, 120.9];

  const tileUrl =
    mapMode === '3d'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const attribution =
    mapMode === '3d'
      ? '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      : '&copy; OpenStreetMap contributors';

  return (
    <MapContainer
      center={position}
      zoom={7.5}
      scrollWheelZoom={true}
      className="w-full h-full"
    >
      <TileLayer url={tileUrl} attribution={attribution} />
      {campsites.map((site) => {
        if (!site.latitude || !site.longitude) return null;
        const isSelected = selectedCampId === site.id;

        return (
          <Marker
            key={site.id}
            position={[site.latitude, site.longitude]}
            icon={isSelected ? selectedIcon : defaultIcon}
            zIndexOffset={isSelected ? 1000 : 0}
            eventHandlers={{
              click: () => {
                if (onSelectCampsite) {
                  onSelectCampsite(site); // 🎯 點擊地圖 Marker 時將完整的 site 物件傳回 Home
                }
              }
            }}
          >
            <Popup>
              <div className="p-1 font-sans">
                <h3 className="font-bold text-slate-900 text-sm mb-1.5">{site.name}</h3>
                <p className="text-xs bg-sky-50 text-sky-700 font-semibold px-2 py-1 rounded border border-sky-100 mt-1 mb-0 flex items-center gap-1">
                  ⛰️ {site.altitude || '海拔未知'}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
