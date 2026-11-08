'use client';

import React, { useState, useEffect, useMemo } from 'react';

// WMO Weather interpretation code map
const WMO_WEATHER_MAP = {
  0: { label: '晴朗無雲', icon: '☀️', color: 'text-amber-500' },
  1: { label: '晴時多雲', icon: '🌤️', color: 'text-amber-400' },
  2: { label: '多雲', icon: '⛅', color: 'text-sky-400' },
  3: { label: '陰天', icon: '☁️', color: 'text-slate-400' },
  45: { label: '有霧 / 起霧', icon: '🌫️', color: 'text-slate-400' },
  48: { label: '濃霧', icon: '🌫️', color: 'text-slate-500' },
  51: { label: '微量小雨', icon: '🌦️', color: 'text-blue-400' },
  53: { label: '小雨', icon: '🌧️', color: 'text-blue-400' },
  55: { label: '持續小雨', icon: '🌧️', color: 'text-blue-500' },
  61: { label: '短暫陣雨', icon: '🌧️', color: 'text-blue-500' },
  63: { label: '中雨', icon: '🌧️', color: 'text-blue-600' },
  65: { label: '大雨 / 暴雨', icon: '⛈️', color: 'text-indigo-600' },
  80: { label: '局部陣雨', icon: '🌦️', color: 'text-blue-400' },
  81: { label: '中度陣雨', icon: '🌧️', color: 'text-blue-500' },
  82: { label: '強陣雨', icon: '⛈️', color: 'text-indigo-600' },
  95: { label: '雷陣雨', icon: '⛈️', color: 'text-purple-600' },
  96: { label: '雷陣雨伴隨冰雹', icon: '⛈️', color: 'text-purple-700' },
  99: { label: '強烈雷暴', icon: '⚡', color: 'text-rose-600' }
};

// Convert degrees to 8-point cardinal direction in Chinese
function getCardinalDirection(deg) {
  if (deg === null || deg === undefined) return '未知';
  const directions = ['北風 (N)', '東北風 (NE)', '東風 (E)', '東南風 (SE)', '南風 (S)', '西南風 (SW)', '西風 (W)', '西北風 (NW)'];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

// Beaufort scale calculator
function getBeaufortScale(kmh) {
  if (kmh < 1) return { level: 0, desc: '無風', advice: '非常適合露營，空氣靜止' };
  if (kmh <= 5) return { level: 1, desc: '軟風', advice: '微弱氣流，炊事舒適' };
  if (kmh <= 11) return { level: 2, desc: '輕風', advice: '樹葉微動，搭帳極為輕鬆' };
  if (kmh <= 19) return { level: 3, desc: '微風', advice: '微風拂面，需拉好基本營繩' };
  if (kmh <= 28) return { level: 4, desc: '和風', advice: '地面塵土揚起，建議使用 25cm 以上營釘' };
  if (kmh <= 38) return { level: 5, desc: '清風', advice: '小樹晃動，天幕迎風面放低，加強抗風水線' };
  if (kmh <= 49) return { level: 6, desc: '強風', advice: '大樹枝搖動，須下 30cm 大黑釘，注意天幕受風' };
  return { level: 7, desc: '疾風 / 烈風', advice: '全樹搖動，建議收折大型高天幕，嚴防拔釘' };
}

// Astronomical calculation for Sun Elevation and Azimuth
function calculateSolarPosition(date, lat, lng) {
  const rad = Math.PI / 180;
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
  const hour = date.getHours() + date.getMinutes() / 60;
  
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  
  const timeOffset = eqtime + 4 * lng - 480; // UTC+8
  const tst = hour * 60 + timeOffset;
  const ha = (tst / 4 - 180) * rad;
  const latRad = lat * rad;
  
  const sinElev = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(ha);
  const elev = Math.asin(Math.max(-1, Math.min(1, sinElev)));
  
  const sinZenith = Math.cos(elev);
  let azRad = Math.acos(Math.max(-1, Math.min(1, (Math.sin(decl) - Math.sin(latRad) * sinElev) / (Math.cos(latRad) * sinZenith))));
  let az = azRad / rad;
  if (Math.sin(ha) > 0) {
    az = 360 - az;
  }
  
  return {
    elevation: Math.round(elev / rad * 10) / 10,
    azimuth: Math.round(az * 10) / 10
  };
}

export default function CampsiteWeatherModal({ campsite, isOpen, onClose, onOpenAR }) {
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedHour, setSelectedHour] = useState(12); // 06 to 18

  // Default coordinate fallback for central Taiwan if not in db
  const lat = campsite?.latitude ? Number(campsite.latitude) : 24.1;
  const lng = campsite?.longitude ? Number(campsite.longitude) : 121.0;

  useEffect(() => {
    if (!isOpen || !campsite) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant&timezone=Asia%2FTaipei`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('無法取得氣象資料');
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setWeatherData(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error('Weather fetch error:', err);
          setError('氣象資料連線逾時，請稍後再試。');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, campsite, lat, lng]);

  // Compute Sun Trajectory for the current day
  const today = useMemo(() => new Date(), []);
  
  const solarTrajectory = useMemo(() => {
    const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    return hours.map(h => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, 0);
      const pos = calculateSolarPosition(d, lat, lng);
      return { hour: h, timeStr: `${h < 10 ? '0' : ''}${h}:00`, ...pos };
    });
  }, [today, lat, lng]);

  // Current selected hour solar position
  const currentSunPos = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), selectedHour, 0);
    return calculateSolarPosition(d, lat, lng);
  }, [today, selectedHour, lat, lng]);

  if (!isOpen || !campsite) return null;

  const current = weatherData?.current;
  const daily = weatherData?.daily;
  const currentWeatherInfo = current ? (WMO_WEATHER_MAP[current.weather_code] || { label: '多雲', icon: '⛅', color: 'text-slate-400' }) : null;
  const windDir = current?.wind_direction_10m ?? daily?.wind_direction_10m_dominant?.[0] ?? 0;
  const windSpeed = current?.wind_speed_10m ?? 10;
  const beaufort = getBeaufortScale(windSpeed);

  // Compass SVG parameters
  const CX = 160;
  const CY = 160;
  const R = 115; // Outer horizon radius

  // Convert azimuth & elevation to (x, y) on polar sky dome
  // Outer circle (R=115) is elevation=0 (horizon). Center is elevation=90 (zenith).
  const polarToXY = (azimuth, elevation) => {
    const clampedElev = Math.max(0, Math.min(90, elevation));
    const distFromCenter = R * (1 - clampedElev / 90);
    const rad = (azimuth - 90) * (Math.PI / 180);
    return {
      x: CX + distFromCenter * Math.cos(rad),
      y: CY + distFromCenter * Math.sin(rad)
    };
  };

  const sunCurrentXY = polarToXY(currentSunPos.azimuth, Math.max(0, currentSunPos.elevation));

  // Build SVG path for sun trajectory
  const trajectoryPoints = solarTrajectory
    .filter(pt => pt.elevation >= -2)
    .map(pt => polarToXY(pt.azimuth, Math.max(0, pt.elevation)));

  const trajectoryPathD = trajectoryPoints.length > 1
    ? `M ${trajectoryPoints[0].x} ${trajectoryPoints[0].y} ` + trajectoryPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  // Wind arrow vector (Wind comes FROM windDir, blowing TOWARDS windDir + 180°)
  const windSourceRad = (windDir - 90) * (Math.PI / 180);
  const windArrowLength = 55;
  const windStartX = CX + (windArrowLength / 2) * Math.cos(windSourceRad);
  const windStartY = CY + (windArrowLength / 2) * Math.sin(windSourceRad);
  const windEndX = CX - (windArrowLength / 2) * Math.cos(windSourceRad);
  const windEndY = CY - (windArrowLength / 2) * Math.sin(windSourceRad);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-4xl max-h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200/80 bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 flex justify-between items-center flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-3xl">⛅</span>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                {campsite.name} - 天氣預報 & 日照風向羅盤
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 flex items-center gap-2 flex-wrap font-medium">
              <span>📍 {campsite.region || campsite.location || '台灣'}</span>
              <span>•</span>
              <span>🌐 緯度 {lat.toFixed(4)}°N, 經度 {lng.toFixed(4)}°E</span>
              {campsite.altitude && (
                <>
                  <span>•</span>
                  <span className="text-sky-700 font-bold">⛰️ {campsite.altitude}</span>
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl font-bold text-sm shadow-sm transition-colors"
          >
            ✕ 關閉
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {loading ? (
            <div className="text-center py-16 text-slate-500 font-medium">
              <div className="text-3xl mb-2 animate-bounce">📡</div>
              正在連線衛星氣象站讀取最新氣候、日出日落與風向預測...
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-xl text-center text-sm border border-rose-200">
              {error}
            </div>
          ) : (
            <>
              {/* 🌞 即時天氣與日出日落概覽卡片 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                  <span className="text-xs font-bold text-slate-500 block mb-1">🌡️ 當前氣溫</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">{current?.temperature_2m ?? '--'}°C</span>
                    <span className="text-xs text-slate-500">體感 {current?.apparent_temperature ?? '--'}°</span>
                  </div>
                  <span className="text-xs text-emerald-600 font-semibold mt-1 inline-block">
                    {currentWeatherInfo.icon} {currentWeatherInfo.label}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                  <span className="text-xs font-bold text-slate-500 block mb-1">💧 降雨機率 & 濕度</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-blue-600">{daily?.precipitation_probability_max?.[0] ?? 0}%</span>
                    <span className="text-xs text-slate-500">最高降雨</span>
                  </div>
                  <span className="text-xs text-slate-500 mt-1 inline-block">
                    相對濕度: {current?.relative_humidity_2m ?? '--'}%
                  </span>
                </div>

                <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-2xl">
                  <span className="text-xs font-bold text-amber-800 block mb-1">🌅 日出時間 (Sunrise)</span>
                  <span className="text-xl font-black text-amber-900">
                    {daily?.sunrise?.[0] ? daily.sunrise[0].split('T')[1] : '06:05'}
                  </span>
                  <span className="text-xs text-amber-700 block mt-1 font-medium">
                    晨曦黃金時刻，適合賞日出雲海
                  </span>
                </div>

                <div className="bg-orange-50/70 border border-orange-200 p-3.5 rounded-2xl">
                  <span className="text-xs font-bold text-orange-800 block mb-1">🌇 日落時間 (Sunset)</span>
                  <span className="text-xl font-black text-orange-900">
                    {daily?.sunset?.[0] ? daily.sunset[0].split('T')[1] : '17:15'}
                  </span>
                  <span className="text-xs text-orange-700 block mt-1 font-medium">
                    入夜降溫快，請提早準備照明
                  </span>
                </div>
              </div>

              {/* 🧭 指南針盤：整合經緯度、太陽即時方位與風向預測 */}
              <div className="bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-xl border border-slate-800">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="text-lg font-black text-amber-400 flex items-center gap-2">
                      🧭 營地 360° 指南針天球盤：太陽方位 & 風向流場
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      全天投影：中心為天頂 (仰角 90°)，外圈為地平線 (仰角 0°)。黃線為整日太陽軌跡。
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {onOpenAR && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAR(campsite, { windDir, windSpeed });
                        }}
                        className="px-3 py-1 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-slate-950 font-black text-xs rounded-full shadow flex items-center gap-1 transition-all"
                      >
                        📱 開啟 AR 實境相機透視
                      </button>
                    )}
                    <div className="bg-slate-800/80 px-3 py-1 rounded-full text-xs font-mono text-emerald-400 border border-slate-700">
                      經緯度: {lat.toFixed(2)}°N, {lng.toFixed(2)}°E
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  
                  {/* Left: SVG 360° Compass Dial */}
                  <div className="lg:col-span-6 flex flex-col items-center justify-center">
                    <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px]">
                      <svg viewBox="0 0 320 320" className="w-full h-full select-none">
                        {/* Background Dial Circles */}
                        <circle cx={CX} cy={CY} r={R} fill="#0f172a" stroke="#334155" strokeWidth="2.5" />
                        <circle cx={CX} cy={CY} r={R * 0.66} fill="none" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3 3" />
                        <circle cx={CX} cy={CY} r={R * 0.33} fill="none" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3 3" />
                        <circle cx={CX} cy={CY} r={3} fill="#64748b" />

                        {/* Crosshairs */}
                        <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
                        <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />

                        {/* Cardinal Direction Marks */}
                        <text x={CX} y={CY - R + 18} fill="#ef4444" fontSize="13" fontWeight="900" textAnchor="middle">北 (N)</text>
                        <text x={CX + R - 22} y={CY + 5} fill="#38bdf8" fontSize="13" fontWeight="900" textAnchor="middle">東 (E)</text>
                        <text x={CX} y={CY + R - 10} fill="#f59e0b" fontSize="13" fontWeight="900" textAnchor="middle">南 (S)</text>
                        <text x={CX - R + 22} y={CY + 5} fill="#cbd5e1" fontSize="13" fontWeight="900" textAnchor="middle">西 (W)</text>

                        {/* Diagonal Direction Marks */}
                        <text x={CX + R * 0.65} y={CY - R * 0.65 + 5} fill="#64748b" fontSize="10" fontWeight="bold" textAnchor="middle">東北</text>
                        <text x={CX + R * 0.65} y={CY + R * 0.65} fill="#64748b" fontSize="10" fontWeight="bold" textAnchor="middle">東南</text>
                        <text x={CX - R * 0.65} y={CY + R * 0.65} fill="#64748b" fontSize="10" fontWeight="bold" textAnchor="middle">西南</text>
                        <text x={CX - R * 0.65} y={CY - R * 0.65 + 5} fill="#64748b" fontSize="10" fontWeight="bold" textAnchor="middle">西北</text>

                        {/* Sun Trajectory Arc */}
                        {trajectoryPathD && (
                          <path d={trajectoryPathD} fill="none" stroke="#f59e0b" strokeWidth="3" opacity="0.6" strokeDasharray="4 2" />
                        )}

                        {/* Sun Hour Milestone Nodes */}
                        {solarTrajectory.map((pt) => {
                          if (pt.elevation < 0) return null;
                          const pos = polarToXY(pt.azimuth, pt.elevation);
                          const isSelected = pt.hour === selectedHour;
                          return (
                            <g key={pt.hour} className="cursor-pointer" onClick={() => setSelectedHour(pt.hour)}>
                              <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={isSelected ? 6 : 3.5}
                                fill={isSelected ? '#fbbf24' : '#d97706'}
                                stroke="#fff"
                                strokeWidth={isSelected ? 2 : 1}
                              />
                              <text
                                x={pos.x}
                                y={pos.y - 7}
                                fill={isSelected ? '#fef08a' : '#94a3b8'}
                                fontSize={isSelected ? "11" : "8"}
                                fontWeight={isSelected ? "900" : "bold"}
                                textAnchor="middle"
                              >
                                {pt.timeStr}
                              </text>
                            </g>
                          );
                        })}

                        {/* Wind Direction Arrow (Centered) */}
                        <g opacity="0.85">
                          <defs>
                            <marker id="wind-arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                              <polygon points="0 0, 6 3, 0 6" fill="#38bdf8" />
                            </marker>
                          </defs>
                          <line
                            x1={windStartX}
                            y1={windStartY}
                            x2={windEndX}
                            y2={windEndY}
                            stroke="#38bdf8"
                            strokeWidth="3.5"
                            markerEnd="url(#wind-arrowhead)"
                          />
                          <text
                            x={windEndX}
                            y={windEndY + 12}
                            fill="#38bdf8"
                            fontSize="9"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            💨 氣流吹向 {(windDir + 180) % 360}°
                          </text>
                        </g>

                        {/* Current Selected Active Sun Node */}
                        {currentSunPos.elevation >= 0 && (
                          <g>
                            <circle cx={sunCurrentXY.x} cy={sunCurrentXY.y} r="14" fill="#fbbf24" opacity="0.25" className="animate-ping" />
                            <circle cx={sunCurrentXY.x} cy={sunCurrentXY.y} r="9" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" />
                            <text x={sunCurrentXY.x} y={sunCurrentXY.y + 3.5} fontSize="11" textAnchor="middle">☀️</text>
                          </g>
                        )}
                      </svg>
                    </div>

                    <div className="flex items-center gap-4 text-xs mt-2 text-slate-400">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span> 太陽天球軌跡</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block"></span> 氣流方向 (從 {getCardinalDirection(windDir)} 吹往 {getCardinalDirection((windDir + 180) % 360)})</span>
                    </div>
                  </div>

                  {/* Right: Interactive Controls & Camping Advice */}
                  <div className="lg:col-span-6 space-y-4">
                    
                    {/* Time Selector Slider */}
                    <div className="bg-slate-800/70 p-4 rounded-2xl border border-slate-700">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-bold text-amber-300">
                          ⏰ 檢視各時間點太陽方位：
                        </label>
                        <span className="text-base font-black text-amber-400 bg-amber-950/70 px-2.5 py-0.5 rounded-lg border border-amber-800">
                          {selectedHour < 10 ? `0${selectedHour}` : selectedHour}:00
                        </span>
                      </div>
                      <input
                        type="range"
                        min="6"
                        max="18"
                        step="1"
                        value={selectedHour}
                        onChange={(e) => setSelectedHour(Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400 mb-2"
                      />
                      <div className="flex justify-between text-xs font-semibold text-slate-400">
                        <span>🌅 06:00 (日出)</span>
                        <span>☀️ 12:00 (正午)</span>
                        <span>🌇 18:00 (日落)</span>
                      </div>
                    </div>

                    {/* Solar Angle Data */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                        <span className="text-xs text-slate-400 block mb-0.5">🧭 太陽方位角 (Azimuth)</span>
                        <div className="text-lg font-black text-white flex items-baseline gap-1">
                          <span>{currentSunPos.azimuth}°</span>
                          <span className="text-xs text-amber-400 font-semibold">
                            ({getCardinalDirection(currentSunPos.azimuth)})
                          </span>
                        </div>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                        <span className="text-xs text-slate-400 block mb-0.5">📐 太陽仰角 (Elevation)</span>
                        <div className="text-lg font-black text-white flex items-baseline gap-1">
                          <span>{currentSunPos.elevation}°</span>
                          <span className="text-xs text-slate-400 font-normal">
                            {currentSunPos.elevation > 45 ? '頂頭高照' : currentSunPos.elevation > 15 ? '斜照' : currentSunPos.elevation > 0 ? '近地平' : '地平線下'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Wind Forecast Details */}
                    <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-sky-300">💨 風向與風速預測：</span>
                        <span className="font-mono text-emerald-400">{windSpeed} km/h (蒲福 {beaufort.level} 級 {beaufort.desc})</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        主要吹 <strong className="text-sky-300">{getCardinalDirection(windDir)} ({windDir}°)</strong>。{beaufort.advice}。
                      </p>
                    </div>

                    {/* Camping Tent Pitching Advice */}
                    <div className="bg-amber-950/40 p-4 rounded-2xl border border-amber-800/60 text-xs space-y-2">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                        ⛺ 帳篷與天幕搭設最佳方位指南（風向流場 × 日照防護）：
                      </span>
                      <ul className="list-disc pl-4 text-slate-300 space-y-1.5 leading-relaxed">
                        <li>
                          <strong>🌬️ 抗風結構定軸（安全最優先）</strong>：
                          當前氣流從 <strong className="text-sky-300">{getCardinalDirection(windDir)} ({windDir}°)</strong> 吹來。
                          <br />• <strong>隧道帳／一房一廳</strong>：長軸務必平行風向（呈 {windDir}° ~ {(windDir + 180) % 360}° 軸線），圓弧後臀部正對來風面破風，前客廳門處於背風面進出安全。
                          <br />• <strong>天幕</strong>：主脊線必須平行風向，迎風側主柱調低 30~50cm 呈人字斜面分流氣流，嚴禁布面垂直迎風當風帆。
                        </li>
                        <li>
                          <strong>🌅 避晨曬防熱醒（睡眠舒適）</strong>：
                          早晨陽光自 <strong className="text-amber-300">{getCardinalDirection(solarTrajectory[1].azimuth)} ({solarTrajectory[1].azimuth}°)</strong> 升起。
                          帳門若轉向<strong>西南西或正西（240° ~ 270°）</strong>，寢室區置於西側後方，可有效阻隔 06:00~07:30 低角度陽光溫室效應熱醒。
                        </li>
                        <li>
                          <strong>🌇 午後抗西曬</strong>：
                          午後 14:00 至日落，陽光位於 <strong className="text-amber-300">{getCardinalDirection(solarTrajectory[8].azimuth)} ~ {getCardinalDirection(solarTrajectory[11].azimuth)} ({solarTrajectory[8].azimuth}° ~ {solarTrajectory[11].azimuth}°)</strong>。
                          天幕西側或西南側翼應斜拉下壓至離地 40~60cm，形成低角度遮陽盾。
                        </li>
                        <li>
                          <strong>🔥 焚火台與炭火安全區</strong>：
                          務必擺放在帳篷與天幕的<strong>絕對下風處（即 {(windDir + 180) % 360}° 側）</strong>至少 3~5 公尺之外，嚴防飛火星灼破帳布與一氧化碳濃煙倒灌。
                        </li>
                      </ul>
                    </div>

                  </div>
                </div>
              </div>

              {/* 📅 未來 7 天天氣預報 */}
              {daily && daily.time && (
                <div>
                  <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-1.5">
                    <span>📅</span> 未來一週逐日天氣預報
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                    {daily.time.slice(0, 7).map((dateStr, idx) => {
                      const wCode = daily.weather_code[idx];
                      const info = WMO_WEATHER_MAP[wCode] || { label: '多雲', icon: '⛅' };
                      const dateObj = new Date(dateStr);
                      const monthDay = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
                      const dayOfWeek = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'][dateObj.getDay()];
                      const maxT = Math.round(daily.temperature_2m_max[idx]);
                      const minT = Math.round(daily.temperature_2m_min[idx]);
                      const rainProb = daily.precipitation_probability_max[idx];

                      return (
                        <div
                          key={dateStr}
                          className={`p-3 rounded-2xl border text-center flex flex-col justify-between transition-all ${
                            idx === 0 ? 'bg-blue-50/70 border-blue-200 shadow-sm' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div>
                            <span className="text-xs font-bold text-slate-500 block">
                              {idx === 0 ? '今日' : dayOfWeek}
                            </span>
                            <span className="text-xs font-black text-slate-800">{monthDay}</span>
                            <div className="text-2xl my-1.5">{info.icon}</div>
                            <span className="text-xs font-bold text-slate-700 block truncate">{info.label}</span>
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-200/60 text-xs">
                            <div className="font-extrabold text-slate-800">
                              {maxT}° <span className="text-slate-400 font-normal">/ {minT}°</span>
                            </div>
                            <div className="text-xs text-blue-600 font-bold mt-0.5">
                              💧 {rainProb}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <span>數據來源：Open-Meteo 高解析數值氣象模型與天文太陽軌跡算法</span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow transition-colors"
          >
            完成關閉
          </button>
        </div>

      </div>
    </div>
  );
}
