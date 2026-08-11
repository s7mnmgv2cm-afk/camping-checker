'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// 修正 Leaflet 預設 Icon 缺失問題
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export default function CampsiteMap({ campsites, mapMode }) {
  // 預設中心點 (新竹山區)
  const center = [24.7100, 121.1500];

  // 根據 2D/3D 切換圖層：2D 使用 OpenStreetMap，3D/高程使用 Esri 衛星圖
  const tileUrl =
    mapMode === '3d'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  return (
    <MapContainer center={center} zoom={10} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer url={tileUrl} />
      {campsites.map((site) => {
        if (!site.latitude || !site.longitude) return null;
        return (
          <Marker key={site.id} position={[site.latitude, site.longitude]} icon={customIcon}>
            <Popup>
              <div className="text-sm font-sans p-1">
                <h3 className="font-bold text-slate-900">{site.name}</h3>
                <p className="text-xs text-slate-600 mt-1">{site.altitude || '海拔估算中'}</p>
                <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                  {site.status === 'available' ? '🟢 有空位' : '🔴 已滿位'}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
