'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// 客製化地圖 Icon
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
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
            icon={customIcon}
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
                <h3 className="font-bold text-slate-900 text-sm">{site.name}</h3>
                <p className="text-xs text-slate-600 my-1">{site.altitude || '海拔未知'}</p>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                    site.status === 'available'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {site.status === 'available' ? '🟢 有空位' : '🔴 已滿位'}
                </span>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
