'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  radecToAltAz,
  calculateSolarPosition,
  getMoonPhaseInfo,
  CELESTIAL_TARGETS,
  STARGAZING_GUIDE
} from '../lib/astronomy';

// Helper: Convert degree (0~360) to 16-point traditional compass direction name
export const getHeadingDirectionName = (deg) => {
  if (deg === null || deg === undefined || isNaN(deg)) return '正北 (N)';
  const normalized = (deg % 360 + 360) % 360;
  const directions = [
    { name: '正北 (N)', min: 348.75, max: 11.25 },
    { name: '北北東 (NNE)', min: 11.25, max: 33.75 },
    { name: '東北 (NE)', min: 33.75, max: 56.25 },
    { name: '東北東 (ENE)', min: 56.25, max: 78.75 },
    { name: '正東 (E)', min: 78.75, max: 101.25 },
    { name: '東南東 (ESE)', min: 101.25, max: 123.75 },
    { name: '東南 (SE)', min: 123.75, max: 146.25 },
    { name: '南南東 (SSE)', min: 146.25, max: 168.75 },
    { name: '正南 (S)', min: 168.75, max: 191.25 },
    { name: '南南西 (SSW)', min: 191.25, max: 213.75 },
    { name: '西南 (SW)', min: 213.75, max: 236.25 },
    { name: '西南西 (WSW)', min: 236.25, max: 258.75 },
    { name: '正西 (W)', min: 258.75, max: 281.25 },
    { name: '西北西 (WNW)', min: 281.25, max: 303.75 },
    { name: '西北 (NW)', min: 303.75, max: 326.25 },
    { name: '北北西 (NNW)', min: 326.25, max: 348.75 }
  ];
  if (normalized >= 348.75 || normalized < 11.25) return '正北 (N)';
  const match = directions.find(d => normalized >= d.min && normalized < d.max);
  return match ? match.name : `${Math.round(normalized)}°`;
};

// Calculate angular separation between two horizontal coordinates (in degrees)
function getAngularSeparation(az1, el1, az2, el2) {
  const rad = Math.PI / 180;
  const el1Rad = el1 * rad;
  const el2Rad = el2 * rad;
  const dAzRad = (az1 - az2) * rad;
  const cosDist = Math.sin(el1Rad) * Math.sin(el2Rad) + Math.cos(el1Rad) * Math.cos(el2Rad) * Math.cos(dAzRad);
  return Math.acos(Math.max(-1, Math.min(1, cosDist))) / rad;
}

export default function CampsiteARModal({
  campsite,
  isOpen,
  onClose,
  windDir: propWindDir,
  windSpeed: propWindSpeed,
  initialLocationMode = 'campsite'
}) {
  const videoRef = useRef(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  // AR View Mode: 'sun' (太陽搭帳導引) | 'stars' (夜間星空圖)
  const [arViewMode, setArViewMode] = useState('sun');

  // Location Mode: 'campsite' (營地座標) | 'current' (目前所在地 GPS)
  const [locationMode, setLocationMode] = useState(initialLocationMode);
  const [userCoords, setUserCoords] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  // Realtime Live Wind State (auto-fetched for campsite or GPS coordinates)
  const [liveWind, setLiveWind] = useState(null);
  const [loadingWind, setLoadingWind] = useState(false);

  // Gyroscope / Orientation state
  const [heading, setHeading] = useState(0); // 0° to 360° (Compass Azimuth)
  const [pitch, setPitch] = useState(0); // -90° to 90° (地勢前後傾角，平放桌面為 0°)
  const [roll, setRoll] = useState(0); // -90° to 90° (地勢左右側傾，平放桌面為 0°)
  const [camElevation, setCamElevation] = useState(25); // -90° to 90° (鏡頭仰角，預設 25° 仰望星空)
  
  // Sun Simulation mode (Summer / Winter / Current)
  const [seasonMode, setSeasonMode] = useState('current');

  // Star Simulation mode (Realtime / 20:00 / 23:00 / 02:00 / 04:30)
  const [simStarHour, setSimStarHour] = useState('now');

  // Stargazing Guide Drawer / Modal state
  const [showStargazingGuide, setShowStargazingGuide] = useState(false);
  const [guideActiveSection, setGuideActiveSection] = useState(0);

  // Manual Star Target selection
  const [selectedStarTarget, setSelectedStarTarget] = useState(null);

  const campLat = campsite?.latitude ? Number(campsite.latitude) : 24.1;
  const campLng = campsite?.longitude ? Number(campsite.longitude) : 121.0;

  // Active coordinates based on selected locationMode
  const lat = (locationMode === 'current' && userCoords) ? userCoords.lat : campLat;
  const lng = (locationMode === 'current' && userCoords) ? userCoords.lng : campLng;

  // Handle GPS location request
  const handleSwitchToGPS = () => {
    if (userCoords) {
      setLocationMode('current');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('此裝置瀏覽器不支援 GPS 定位，已維持營地模式');
      setTimeout(() => setGeoError(null), 3500);
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        setUserCoords(coords);
        setLocationMode('current');
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setIsLocating(false);
        let msg = '無法取得 GPS 定位，已維持營地模式';
        if (err.code === 1) msg = '未允許 GPS 定位權限，請於瀏覽器設定中開啟';
        else if (err.code === 2) msg = 'GPS 訊號不可用，請至戶外空曠處再試';
        else if (err.code === 3) msg = 'GPS 定位逾時，請稍後重試';
        setGeoError(msg);
        setTimeout(() => setGeoError(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  // Sync initialLocationMode on modal open
  useEffect(() => {
    if (!isOpen) return;
    if (initialLocationMode === 'current') {
      handleSwitchToGPS();
    } else {
      setLocationMode('campsite');
    }
  }, [isOpen, initialLocationMode]);

  // Auto-fetch real-time live wind from Open-Meteo for active coordinates (campsite or GPS)
  useEffect(() => {
    if (!isOpen) return;

    if (locationMode === 'campsite' && propWindDir !== undefined && propWindSpeed !== undefined && propWindDir !== null) {
      setLiveWind({ windDir: propWindDir, windSpeed: propWindSpeed });
      return;
    }

    let isMounted = true;
    setLoadingWind(true);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m&timezone=Asia%2FTaipei`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Wind fetch failed');
        return res.json();
      })
      .then(data => {
        if (isMounted && data?.current) {
          setLiveWind({
            windDir: Math.round(data.current.wind_direction_10m ?? 0),
            windSpeed: Math.round(data.current.wind_speed_10m ?? 0)
          });
          setLoadingWind(false);
        }
      })
      .catch(err => {
        console.warn('Realtime wind fetch notice:', err);
        if (isMounted) setLoadingWind(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, lat, lng, locationMode, propWindDir, propWindSpeed]);

  const windDir = liveWind?.windDir ?? (propWindDir !== undefined && propWindDir !== null ? propWindDir : 45);
  const windSpeed = liveWind?.windSpeed ?? (propWindSpeed !== undefined && propWindSpeed !== null ? propWindSpeed : 10);

  // 1. Calculate Sun milestones for current or selected season
  const sunMilestones = useMemo(() => {
    let targetDate = new Date();
    if (seasonMode === 'summer') targetDate = new Date(2026, 5, 21); // June 21
    if (seasonMode === 'winter') targetDate = new Date(2026, 11, 21); // Dec 21

    const hours = [
      { h: 6, label: '🌅 清晨日出 (06:00)', tag: '晨曬起點' },
      { h: 7, label: '☀️ 晨光加溫 (07:00)', tag: '防熱醒關鍵' },
      { h: 9, label: '☀️ 早晨斜陽 (09:00)', tag: '曬帳時段' },
      { h: 12, label: '🔥 正午頂光 (12:00)', tag: '天頂直射' },
      { h: 14, label: '🌇 午後西曬 (14:00)', tag: '西曬高溫' },
      { h: 16, label: '🌇 傍晚斜陽 (16:00)', tag: '天幕側翼下壓' },
      { h: 17.5, label: '🌆 日落黃昏 (17:30)', tag: '夜暮降溫' }
    ];

    return hours.map(item => {
      const d = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), Math.floor(item.h), (item.h % 1) * 60);
      const pos = calculateSolarPosition(d, lat, lng);
      return { ...item, ...pos };
    });
  }, [seasonMode, lat, lng]);

  // Recommended tent door orientation (Default: 250° WSW to prevent morning direct sunlight)
  const recommendedDoorAzimuth = useMemo(() => {
    if (windSpeed > 20) {
      return (windDir + 180) % 360;
    }
    return 250;
  }, [windDir, windSpeed]);

  // 2. Active observation date for Stargazing
  const activeStarDate = useMemo(() => {
    const now = new Date();
    if (simStarHour === 'now') return now;
    const d = new Date(now);
    if (simStarHour === '20:00') {
      d.setHours(20, 0, 0, 0);
    } else if (simStarHour === '23:00') {
      d.setHours(23, 0, 0, 0);
    } else if (simStarHour === '02:00') {
      d.setHours(2, 0, 0, 0);
      if (now.getHours() > 4) d.setDate(d.getDate() + 1);
    } else if (simStarHour === '04:30') {
      d.setHours(4, 30, 0, 0);
      if (now.getHours() > 4) d.setDate(d.getDate() + 1);
    }
    return d;
  }, [simStarHour]);

  // 3. Moon Phase Information for active observation date
  const moonInfo = useMemo(() => {
    return getMoonPhaseInfo(activeStarDate);
  }, [activeStarDate]);

  // 4. Compute real-time horizontal coordinates (Azimuth & Elevation) for CELESTIAL_TARGETS
  const computedStars = useMemo(() => {
    return CELESTIAL_TARGETS.map(target => {
      const pos = radecToAltAz(target.ra, target.dec, activeStarDate, lat, lng);
      return {
        ...target,
        azimuth: pos.azimuth,
        elevation: pos.elevation
      };
    });
  }, [activeStarDate, lat, lng]);

  // 5. Detect Star locked by Central Reticle
  const lockedStar = useMemo(() => {
    if (arViewMode !== 'stars') return null;
    let closest = null;
    let minSep = 999;

    for (const star of computedStars) {
      if (star.elevation < -5) continue;
      const sep = getAngularSeparation(heading, camElevation, star.azimuth, star.elevation);
      if (sep < minSep) {
        minSep = sep;
        closest = star;
      }
    }

    if (minSep <= 14) {
      return { ...closest, separation: Math.round(minSep * 10) / 10 };
    }
    return null;
  }, [arViewMode, computedStars, heading, camElevation]);

  // Request Gyroscope & Camera Permissions on open
  useEffect(() => {
    if (!isOpen) return;

    let localStream = null;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      })
      .then(stream => {
        localStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setHasCamera(true);
      })
      .catch(err => {
        console.warn('Camera access notice:', err);
        setCameraError('未偵測到後置鏡頭或未允許相機權限，已啟動 AR 實境全景模擬器。');
        setHasCamera(false);
      });
    }

    const handleOrientation = (e) => {
      let currentHeading = 0;
      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        currentHeading = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        currentHeading = (360 - e.alpha) % 360;
      }

      const rawBeta = e.beta !== null ? e.beta : 0;
      const rawGamma = e.gamma !== null ? e.gamma : 0;

      const groundPitch = Math.max(-90, Math.min(90, Math.round(rawBeta)));
      const groundRoll = Math.max(-90, Math.min(90, Math.round(rawGamma)));
      const cameraElevation = Math.max(-90, Math.min(90, Math.round(90 - rawBeta)));

      setHeading(Math.round(currentHeading));
      setPitch(groundPitch);
      setRoll(groundRoll);
      setCamElevation(cameraElevation);
      setPermissionGranted(true);
    };

    if (typeof DeviceOrientationEvent !== 'undefined') {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(res => {
            if (res === 'granted') {
              window.addEventListener('deviceorientation', handleOrientation);
            }
          })
          .catch(() => {});
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen]);

  const handleRequestMotionPermission = () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(res => {
          if (res === 'granted') {
            setPermissionGranted(true);
          } else {
            alert('需允許裝置動作與方向感測，方能自動轉動羅盤與星空天體方位。');
          }
        })
        .catch(console.error);
    }
  };

  if (!isOpen || !campsite) return null;

  // Angular difference between device heading and recommended tent door azimuth
  let azimuthDiff = (recommendedDoorAzimuth - heading + 540) % 360 - 180;
  const isAligned = Math.abs(azimuthDiff) <= 12;

  // Compass directions for HUD ribbon
  const cardinalTicks = [
    { deg: 0, label: '北 (N)' },
    { deg: 45, label: '東北 (NE)' },
    { deg: 90, label: '東 (E)' },
    { deg: 135, label: '東南 (SE)' },
    { deg: 180, label: '南 (S)' },
    { deg: 225, label: '西南 (SW)' },
    { deg: 270, label: '西 (W)' },
    { deg: 315, label: '西北 (NW)' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-hidden select-none">
      <div className="relative w-full h-full sm:max-w-5xl sm:max-h-[94vh] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden bg-slate-950 text-white border border-slate-700 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Header Floating Glass Bar */}
        <div className="relative shrink-0 z-30 px-3 py-2 bg-slate-900/95 backdrop-blur-md border-b border-white/10 flex justify-between items-center shadow-lg gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black flex items-center gap-1.5 text-white shrink-0">
                <span>{arViewMode === 'sun' ? '☀️' : '🌌'}</span>
                <span>{arViewMode === 'sun' ? 'AR 實境搭帳導引' : 'AR 夜間星空導引'}</span>
              </h2>

              {/* ☀️ 太陽 vs 🌌 星空 模式切換 */}
              <div className="inline-flex items-center bg-slate-950 p-0.5 rounded-lg border border-indigo-400/30 text-xs shadow-inner">
                <button
                  type="button"
                  onClick={() => setArViewMode('sun')}
                  className={`px-2 py-0.5 rounded-md font-black transition-all flex items-center gap-1 ${
                    arViewMode === 'sun'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>☀️ 日照</span>
                </button>
                <button
                  type="button"
                  onClick={() => setArViewMode('stars')}
                  className={`px-2 py-0.5 rounded-md font-black transition-all flex items-center gap-1 ${
                    arViewMode === 'stars'
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>🌌 星空</span>
                </button>
              </div>

              {/* 📍 測量定位切換器 (營地 vs 目前所在地) */}
              <div className="inline-flex items-center bg-slate-950/85 p-0.5 rounded-lg border border-white/20 text-xs shadow-inner">
                <button
                  type="button"
                  onClick={() => setLocationMode('campsite')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center gap-1 ${
                    locationMode === 'campsite'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>🏕️ 營地</span>
                </button>
                <button
                  type="button"
                  onClick={handleSwitchToGPS}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center gap-1 ${
                    locationMode === 'current'
                      ? 'bg-sky-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>📍 GPS</span>
                  {isLocating && <span className="animate-spin text-xs">⏳</span>}
                </button>
              </div>

              {/* 觀星重點手冊按鈕 */}
              <button
                type="button"
                onClick={() => setShowStargazingGuide(true)}
                className="px-2 py-0.5 bg-gradient-to-r from-purple-600/80 to-indigo-600/80 hover:from-purple-600 hover:to-indigo-600 border border-purple-400/40 text-purple-100 hover:text-white rounded-lg text-xs font-black shadow-md transition-all flex items-center gap-1 shrink-0"
              >
                <span>📖 觀星指南</span>
              </button>
            </div>

              <p className="text-xs text-slate-200 flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate mt-0.5">
                <span className="text-slate-300 font-bold flex items-center gap-1">
                  <span>{locationMode === 'current' ? '📍 定位' : '🏕️ 營地'}：</span>
                  <span className={locationMode === 'current' ? 'text-sky-300 font-mono font-bold' : 'text-amber-300 font-bold'}>
                    {locationMode === 'current'
                      ? (userCoords ? `${userCoords.lat.toFixed(2)}°N, ${userCoords.lng.toFixed(2)}°E` : (isLocating ? '衛星定位中...' : '目前所在地'))
                      : (campsite?.name || '指定營地')}
                  </span>
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-amber-300 font-semibold">
                  面向：<strong className="text-amber-400 font-mono font-black">{heading}°</strong>（{getHeadingDirectionName(heading)}）
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-sky-300 font-medium">相機仰角：{camElevation}°</span>
                {arViewMode === 'stars' && (
                  <>
                    <span className="text-slate-500">|</span>
                    <span className="text-purple-300 font-semibold flex items-center gap-1">
                      <span>{moonInfo.icon}</span>
                      <span>{moonInfo.phaseName} ({moonInfo.illumination}% 光害)</span>
                    </span>
                  </>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-xl font-bold text-xs backdrop-blur-md transition-colors shrink-0 ml-2"
            >
              ✕ 關閉
            </button>
          </div>

        {/* GPS Error Notification Toast */}
        {geoError && (
          <div className="bg-amber-500/95 text-slate-950 text-xs font-bold px-4 py-1.5 flex items-center justify-between shadow-md transition-all z-40 border-b border-amber-600">
            <span className="flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{geoError}</span>
            </span>
            <button onClick={() => setGeoError(null)} className="text-slate-900 hover:text-black font-black text-sm px-1.5">✕</button>
          </div>
        )}

        {/* Main AR Viewport (Camera Video + Sky Dome Markers) */}
        <div className="relative flex-1 w-full overflow-hidden flex items-center justify-center bg-slate-950">
          
          {/* 1. Live Rear Camera View */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${hasCamera ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* 1.5 Desktop / Fallback Stargazing Night Sky Backdrop */}
          {!hasCamera && (
            <div className={`absolute inset-0 transition-colors duration-500 flex flex-col items-center justify-center p-6 text-center ${
              arViewMode === 'stars' 
                ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black' 
                : 'bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950/60'
            }`}>
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30"></div>
              
              {/* Star dust simulation particles */}
              {arViewMode === 'stars' && (
                <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(#818cf8_1px,transparent_1px)] [background-size:24px_24px]"></div>
              )}

              <div className="relative z-10 max-w-md bg-slate-900/90 border border-slate-700/80 p-4 sm:p-5 rounded-2xl shadow-xl backdrop-blur-md mb-8">
                <span className="text-3xl block mb-2">{arViewMode === 'stars' ? '🌌' : '🔭'}</span>
                <p className="text-sm font-bold text-slate-200 mb-1">
                  {cameraError || (arViewMode === 'stars' ? '夜間星空全景模擬器' : 'AR 實境全景模擬模式')}
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  用手機開啟即可直接啟動後置鏡頭與真實陀螺儀！目前可透過下方旋轉按鈕或仰角調整模擬天頂視野。
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => setHeading(h => (h + 315) % 360)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-600"
                  >
                    ↺ 逆轉 45°
                  </button>
                  <button
                    onClick={() => setHeading(h => (h + 45) % 360)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-600"
                  >
                    ↻ 順轉 45°
                  </button>
                  <button
                    onClick={() => setCamElevation(e => Math.min(85, e + 15))}
                    className="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-800 text-xs font-bold rounded-lg border border-indigo-500/40 text-indigo-200"
                  >
                    ▲ 仰角 +15°
                  </button>
                  <button
                    onClick={() => setCamElevation(e => Math.max(-10, e - 15))}
                    className="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-800 text-xs font-bold rounded-lg border border-indigo-500/40 text-indigo-200"
                  >
                    ▼ 仰角 -15°
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. Top Rolling Compass Ribbon & Guidance Banner */}
          <div 
            style={{ top: '10px' }}
            className="absolute left-0 right-0 z-20 flex flex-col items-center pointer-events-none px-3"
          >
            {/* Realtime Facing Direction Badge */}
            <div className="mb-1.5 px-3.5 py-1 rounded-full bg-slate-950/90 border border-amber-400/50 shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs sm:text-sm animate-in fade-in duration-150">
              <span className="text-amber-400 font-black flex items-center gap-1">
                <span>🧭 目前面向：</span>
              </span>
              <span className="font-mono font-black text-amber-300 text-sm sm:text-base">
                {heading}°
              </span>
              <span className="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md text-xs sm:text-sm shadow-sm">
                {getHeadingDirectionName(heading)}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-sky-300 font-bold text-xs">仰角 {camElevation}°</span>
            </div>

            {/* Compass Ribbon */}
            <div className="relative w-72 sm:w-96 h-9 bg-slate-900/85 backdrop-blur-md border border-white/20 rounded-full overflow-hidden shadow-xl flex items-center justify-center">
              <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 shadow-[0_0_8px_#f59e0b]"></div>
              <div className="absolute bottom-0.5 text-xs text-amber-300 font-mono font-black z-10 px-1.5 py-0.2 rounded bg-slate-950/80 border border-amber-400/30">
                ▲ {heading}°
              </div>

              <div
                className="absolute flex items-center h-full transition-transform ease-out duration-75"
                style={{ transform: `translateX(${-heading * 4}px)` }}
              >
                {[-360, 0, 360].map(offset => (
                  <div key={offset} className="flex relative" style={{ width: '1440px' }}>
                    {cardinalTicks.map(t => (
                      <div
                        key={t.deg}
                        className="absolute flex flex-col items-center"
                        style={{ left: `${t.deg * 4}px` }}
                      >
                        <span className={`text-xs font-black ${t.deg === 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                          {t.label}
                        </span>
                        <div className={`w-0.5 h-2 mt-0.5 ${t.deg === 0 ? 'bg-rose-400' : 'bg-slate-400'}`}></div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Dynamic Guidance Banner: Sun mode vs Stars mode */}
            {arViewMode === 'sun' ? (
              <div className="mt-2 px-3.5 py-1.5 rounded-2xl bg-slate-950/90 border border-white/25 backdrop-blur-md text-center max-w-[92vw] sm:max-w-md shadow-2xl transition-all">
                {isAligned ? (
                  <div>
                    <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-extrabold text-xs sm:text-sm">
                      <span>🎯 完美搭帳朝向（{heading}°）</span>
                    </div>
                    <p className="text-xs text-emerald-200/90 mt-0.5 leading-tight">
                      ✨ 帳門對此方位！06:00~07:30 晨曬在背後不熱醒，避開主風向
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-center gap-1.5 text-amber-400 font-black text-xs sm:text-sm">
                      {azimuthDiff > 0 ? (
                        <>
                          <span className="animate-pulse">👉 請向右轉動</span>
                          <span className="font-mono text-sm sm:text-base bg-amber-400/20 px-1.5 py-0.2 rounded border border-amber-400/30">
                            {Math.abs(Math.round(azimuthDiff))}°
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="animate-pulse">👈 請向左轉動</span>
                          <span className="font-mono text-sm sm:text-base bg-amber-400/20 px-1.5 py-0.2 rounded border border-amber-400/30">
                            {Math.abs(Math.round(azimuthDiff))}°
                          </span>
                        </>
                      )}
                      <span className="text-slate-300 font-medium text-xs">
                        | 目標: <strong className="text-amber-300 font-mono">{recommendedDoorAzimuth}°</strong> (西南西)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 px-3.5 py-1.5 rounded-2xl bg-slate-950/90 border border-indigo-400/40 backdrop-blur-md text-center max-w-[92vw] sm:max-w-md shadow-2xl transition-all">
                {lockedStar ? (
                  <div className="text-xs">
                    <span className="text-emerald-400 font-black inline-flex items-center gap-1">
                      <span>🎯 已鎖定天體：</span>
                      <strong className="text-white text-sm">{lockedStar.name}</strong>
                    </span>
                    <span className="text-indigo-200 ml-1.5">
                      ({lockedStar.constellation} · 視星等 {lockedStar.mag})
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-indigo-200 flex items-center justify-center gap-1.5 font-bold">
                    <span>🌌 旋轉手機仰望天頂！中央十字準心可鎖定星體與銀河核心</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. AR HUD: Floating Markers in Sky Dome */}
          <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
            {/* 3A. SUN MODE: Sun Path Markers */}
            {arViewMode === 'sun' && sunMilestones.map(sun => {
              const azDiff = (sun.azimuth - heading + 540) % 360 - 180;
              const elDiff = sun.elevation - camElevation;
              const inFOV = Math.abs(azDiff) < 38 && Math.abs(elDiff) < 28;
              const screenX = 50 + (azDiff / 38) * 45;
              const screenY = 50 - (elDiff / 28) * 40;

              if (!inFOV || sun.elevation < -5) return null;

              return (
                <div
                  key={sun.label}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-100 animate-in fade-in zoom-in-75"
                  style={{ left: `${screenX}%`, top: `${screenY}%` }}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-amber-400/20 animate-ping absolute inset-0"></div>
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 border-2 border-white shadow-[0_0_20px_#f59e0b] flex items-center justify-center text-xl">
                      ☀️
                    </div>
                  </div>
                  <div className="bg-slate-900/90 border border-amber-400/60 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xl backdrop-blur-md mt-1 text-center whitespace-nowrap">
                    <span className="text-amber-300 block">{sun.label}</span>
                    <span className="text-xs text-slate-300">方位 {sun.azimuth}° | 仰角 {sun.elevation}°</span>
                    <span className="text-xs text-emerald-400 block font-semibold">{sun.tag}</span>
                  </div>
                </div>
              );
            })}

            {/* 3B. STARS MODE: Celestial Objects & Milky Way Core */}
            {arViewMode === 'stars' && computedStars.map(star => {
              const azDiff = (star.azimuth - heading + 540) % 360 - 180;
              const elDiff = star.elevation - camElevation;
              const inFOV = Math.abs(azDiff) < 38 && Math.abs(elDiff) < 28;
              const screenX = 50 + (azDiff / 38) * 45;
              const screenY = 50 - (elDiff / 28) * 40;

              if (!inFOV || star.elevation < -5) return null;

              const isLocked = lockedStar?.id === star.id;
              const isDeepSky = star.type === 'deepsky';

              return (
                <div
                  key={star.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-auto cursor-pointer transition-all duration-150 animate-in fade-in zoom-in-75"
                  style={{ left: `${screenX}%`, top: `${screenY}%` }}
                  onClick={() => setSelectedStarTarget(star)}
                >
                  {/* Special Rendering for Milky Way Core */}
                  {isDeepSky ? (
                    <div className="relative flex items-center justify-center">
                      <div className="w-32 h-16 rounded-full bg-gradient-to-r from-purple-600/30 via-pink-500/40 to-amber-400/30 blur-md animate-pulse absolute"></div>
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-700 via-pink-600 to-amber-400 border-2 border-purple-200 shadow-[0_0_25px_#ec4899] flex items-center justify-center text-2xl z-10">
                        🌌
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex items-center justify-center">
                      {isLocked && (
                        <div className="w-10 h-10 rounded-full bg-emerald-400/30 animate-ping absolute"></div>
                      )}
                      <div className={`rounded-full flex items-center justify-center transition-all ${
                        isLocked 
                          ? 'w-9 h-9 bg-emerald-400 text-slate-950 font-black shadow-[0_0_20px_#10b981]' 
                          : star.mag < 0.5 
                            ? 'w-8 h-8 bg-gradient-to-tr from-amber-300 to-yellow-100 text-slate-950 shadow-[0_0_15px_#fde047]' 
                            : star.mag < 1.8
                              ? 'w-7 h-7 bg-gradient-to-tr from-sky-200 to-indigo-300 text-slate-950 shadow-[0_0_10px_#7dd3fc]'
                              : 'w-6 h-6 bg-slate-200 text-slate-900 shadow-sm'
                      }`}>
                        <span className="text-sm">{star.icon}</span>
                      </div>
                    </div>
                  )}

                  {/* Star Badge Card */}
                  <div className={`px-2.5 py-1 rounded-xl text-xs font-bold shadow-xl backdrop-blur-md mt-1.5 text-center whitespace-nowrap border transition-all ${
                    isLocked 
                      ? 'bg-emerald-950/90 border-emerald-400 text-emerald-100 shadow-[0_0_15px_#10b981]' 
                      : 'bg-slate-900/90 border-indigo-400/40 text-white'
                  }`}>
                    <div className="flex items-center gap-1 justify-center">
                      <span className={isLocked ? 'text-emerald-300 font-extrabold' : 'text-amber-300 font-bold'}>
                        {star.name.split(' (')[0]}
                      </span>
                      <span className="text-xs px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-normal">
                        {star.badge}
                      </span>
                    </div>
                    <span className="text-xs text-slate-300 block">
                      仰角 {star.elevation}° | 方位 {star.azimuth}°
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. AR Central Reticle */}
          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
            {arViewMode === 'sun' ? (
              <div className={`relative w-40 h-40 sm:w-52 sm:h-52 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                isAligned 
                  ? 'border-emerald-400 shadow-[0_0_30px_#10b981] scale-105 bg-emerald-500/10' 
                  : 'border-white/30 border-dashed'
              }`}>
                <div className="absolute w-full h-0.5 bg-white/20"></div>
                <div className="absolute h-full w-0.5 bg-white/20"></div>
                <div className={`w-4 h-4 rounded-full border transition-colors ${
                  isAligned ? 'border-emerald-400 bg-emerald-400/40 scale-125' : 'border-white/60'
                }`}></div>
                
                {isAligned && (
                  <div className="absolute -top-3.5 px-3.5 py-1 bg-emerald-500 text-slate-950 font-black text-xs rounded-full shadow-lg animate-bounce">
                    🎯 完美朝向！
                  </div>
                )}
              </div>
            ) : (
              <div className={`relative w-44 h-44 sm:w-56 sm:h-56 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                lockedStar 
                  ? 'border-emerald-400 shadow-[0_0_35px_#10b981] scale-105 bg-emerald-500/15' 
                  : 'border-indigo-400/40 border-dashed'
              }`}>
                {/* Crosshairs */}
                <div className="absolute w-full h-0.5 bg-indigo-400/30"></div>
                <div className="absolute h-full w-0.5 bg-indigo-400/30"></div>
                <div className={`w-5 h-5 rounded-full border-2 transition-all ${
                  lockedStar 
                    ? 'border-emerald-400 bg-emerald-400/50 scale-125 shadow-[0_0_15px_#10b981]' 
                    : 'border-indigo-300/60'
                }`}></div>

                {/* Target Locked Floating Card */}
                {lockedStar && (
                  <div className="absolute -top-12 px-3 py-1 bg-emerald-500 text-slate-950 font-black text-xs rounded-full shadow-xl animate-bounce flex items-center gap-1.5">
                    <span>✨ 已鎖定：{lockedStar.name}</span>
                    <span className="bg-slate-950 text-emerald-300 px-1.5 py-0.2 rounded-full text-xs">
                      {lockedStar.elevation}° 仰角
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Bottom HUD Status Row (Leveler + Wind / Moon side-by-side) */}
          <div className="absolute bottom-3 left-3 right-3 z-20 flex justify-between items-end gap-2 pointer-events-none">
            {/* Left Gyro Pitch/Roll Leveler */}
            <div className="bg-slate-950/85 backdrop-blur-md border border-white/20 p-2.5 sm:p-3 rounded-2xl text-xs space-y-1 shadow-lg max-w-[48%]">
              <span className="text-slate-400 font-bold block truncate">📐 地勢傾角</span>
              <div className="flex items-center gap-1.5 font-mono font-bold">
                {Math.abs(pitch) <= 2 && Math.abs(roll) <= 2 ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span>平坦 0°</span>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-sans font-bold">水平</span>
                  </span>
                ) : (
                  <>
                    <span className={Math.abs(pitch) > 5 ? 'text-amber-400' : 'text-emerald-400'}>
                      {pitch > 0 ? `坡 +${pitch}°` : `坡 ${pitch}°`}
                    </span>
                    <span className="text-slate-500">|</span>
                    <span className={Math.abs(roll) > 5 ? 'text-amber-400' : 'text-emerald-400'}>
                      {roll > 0 ? `右 +${roll}°` : `左 ${roll}°`}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-sky-300 font-medium truncate pt-0.5 border-t border-white/10">
                {arViewMode === 'stars' 
                  ? (Math.abs(pitch) <= 2 ? '✅ 地面平整 適合架三腳架' : '💡 架相機注意腳架配重')
                  : (Math.abs(pitch) <= 2 ? '✅ 地面平整 適合搭帳' : '💡 睡墊頭朝上坡')
                }
              </p>
            </div>

            {/* Right HUD: Live Wind in Sun mode VS Moon Phase Light Pollution in Star mode */}
            {arViewMode === 'sun' ? (
              <div className="bg-slate-950/85 backdrop-blur-md border border-white/20 p-2.5 sm:p-3 rounded-2xl text-xs space-y-1 shadow-lg max-w-[48%] text-right">
                <span className="text-slate-400 font-bold flex items-center justify-end gap-1.5 truncate">
                  <span className={`w-1.5 h-1.5 rounded-full ${loadingWind ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
                  <span>💨 即時氣流風向</span>
                </span>
                <div className="text-sky-300 font-extrabold font-mono text-xs sm:text-sm truncate">
                  來風 {windDir}° {getHeadingDirectionName(windDir)}
                </div>
                <p className="text-xs text-slate-300 truncate pt-0.5 border-t border-white/10">
                  {windSpeed} km/h · {locationMode === 'current' ? '當前位置即時風場' : '長軸順風破風'}
                </p>
              </div>
            ) : (
              <div className="bg-slate-950/85 backdrop-blur-md border border-purple-500/30 p-2.5 sm:p-3 rounded-2xl text-xs space-y-1 shadow-lg max-w-[50%] text-right">
                <span className="text-purple-300 font-bold flex items-center justify-end gap-1.5 truncate">
                  <span>{moonInfo.icon}</span>
                  <span>{moonInfo.phaseName} · 月光害指數</span>
                </span>
                <div className="text-amber-300 font-black text-xs truncate">
                  {moonInfo.rating.split(' ')[0]} ({moonInfo.illumination}% 照度)
                </div>
                <p className="text-xs text-slate-300 truncate pt-0.5 border-t border-white/10">
                  {moonInfo.phaseDays < 7 || moonInfo.phaseDays > 22 ? '🌌 最佳深空拍攝良夜' : '🌙 建議觀測明亮行星'}
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Selected Star Details Bottom Drawer Overlay */}
        {(lockedStar || selectedStarTarget) && arViewMode === 'stars' && (
          <div className="z-30 px-4 py-2.5 bg-slate-900/95 backdrop-blur-md border-t border-indigo-500/30 flex items-center justify-between gap-3 text-xs animate-in slide-in-from-bottom duration-150">
            {(() => {
              const currentTarget = selectedStarTarget || lockedStar;
              return (
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center text-xl shrink-0 shadow-md">
                    {currentTarget.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm font-black text-white">{currentTarget.name}</strong>
                      <span className="px-2 py-0.2 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-400/30">
                        {currentTarget.constellation}
                      </span>
                      <span className="text-slate-400 font-mono">
                        視星等：{currentTarget.mag}
                      </span>
                      <span className="text-emerald-400 font-mono font-bold">
                        仰角 {currentTarget.elevation}° / 方位 {currentTarget.azimuth}°
                      </span>
                    </div>
                    <p className="text-slate-300 text-xs mt-0.5 truncate">
                      {currentTarget.story}
                    </p>
                  </div>
                  {selectedStarTarget && (
                    <button
                      onClick={() => setSelectedStarTarget(null)}
                      className="text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 shrink-0 font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Bottom Floating Control Deck */}
        <div className="z-30 px-4 py-3 bg-slate-900/90 backdrop-blur-md border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-3">
          
          {/* Left Controls: Season selector (Sun mode) VS Time simulator (Star mode) */}
          {arViewMode === 'sun' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-400">☀️ 太陽軌跡季節：</span>
              <div className="bg-slate-800 p-1 rounded-xl flex gap-1 border border-slate-700">
                <button
                  onClick={() => setSeasonMode('current')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    seasonMode === 'current' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  今日現況
                </button>
                <button
                  onClick={() => setSeasonMode('summer')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    seasonMode === 'summer' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  夏至 (防晨曬)
                </button>
                <button
                  onClick={() => setSeasonMode('winter')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    seasonMode === 'winter' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  冬至 (迎暖陽)
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-indigo-300">🌌 觀星推演時段：</span>
              <div className="bg-slate-800 p-1 rounded-xl flex gap-1 border border-indigo-400/30 overflow-x-auto max-w-full">
                {[
                  { key: 'now', label: '即時' },
                  { key: '20:00', label: '20:00 入夜' },
                  { key: '23:00', label: '23:00 午夜' },
                  { key: '02:00', label: '02:00 凌晨' },
                  { key: '04:30', label: '04:30 拂曉' }
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => setSimStarHour(item.key)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                      simStarHour === item.key 
                        ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md' 
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            {!permissionGranted && typeof DeviceOrientationEvent !== 'undefined' && (
              <button
                onClick={handleRequestMotionPermission}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1"
              >
                🧭 啟動陀螺儀權限
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowStargazingGuide(true)}
              className="px-3.5 py-1.5 bg-indigo-900/80 hover:bg-indigo-800 border border-indigo-400/40 text-indigo-100 hover:text-white font-black text-xs rounded-xl shadow transition-all flex items-center gap-1"
            >
              <span>📖 觀星指南</span>
            </button>
            <button
              onClick={onClose}
              className="px-5 py-1.5 bg-white text-slate-950 hover:bg-slate-200 font-black text-xs rounded-xl shadow transition-colors"
            >
              完成關閉
            </button>
          </div>

        </div>

        {/* 📖 Stargazing Highlights Field Guide Modal Drawer */}
        {showStargazingGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-lg animate-in fade-in duration-150">
            <div className="relative w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
              
              {/* Drawer Header */}
              <div className="px-5 py-4 border-b border-white/10 bg-slate-900/95 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🌌</span>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      {STARGAZING_GUIDE.title}
                    </h3>
                    <p className="text-xs text-indigo-300">
                      {STARGAZING_GUIDE.sub}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStargazingGuide(false)}
                  className="text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl font-bold text-xs transition-colors"
                >
                  ✕ 關閉
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-white/10 bg-slate-950/60 overflow-x-auto p-1.5 gap-1.5">
                {STARGAZING_GUIDE.sections.map((sec, idx) => (
                  <button
                    key={sec.title}
                    onClick={() => setGuideActiveSection(idx)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      guideActiveSection === idx
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{sec.icon}</span>
                    <span>{sec.title.split(' ')[0]}</span>
                    <span className="text-xs px-1.5 py-0.2 rounded-full bg-white/10 text-white/80">
                      {sec.tag}
                    </span>
                  </button>
                ))}
              </div>

              {/* Active Tab Content */}
              <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
                {(() => {
                  const activeSec = STARGAZING_GUIDE.sections[guideActiveSection];
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">{activeSec.icon}</span>
                        <div>
                          <h4 className="text-base font-black text-amber-300">
                            {activeSec.title}
                          </h4>
                          <span className="text-xs text-indigo-300">
                            露營現場實用觀測守則 · 標籤：{activeSec.tag}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3 mt-4">
                        {activeSec.points.map((pt, i) => (
                          <div
                            key={i}
                            className="p-3.5 rounded-2xl bg-slate-800/80 border border-white/10 flex items-start gap-3 shadow-sm hover:border-indigo-400/40 transition-colors"
                          >
                            <span className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow">
                              {i + 1}
                            </span>
                            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                              {pt}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Special Callout based on section */}
                      {guideActiveSection === 0 && (
                        <div className="mt-5 p-4 rounded-2xl bg-purple-950/40 border border-purple-500/30 flex items-center gap-3">
                          <span className="text-2xl">💡</span>
                          <p className="text-xs text-purple-200">
                            <strong>營地即時月相：</strong>當前農曆月面照度約 {moonInfo.illumination}%，{moonInfo.advice}
                          </p>
                        </div>
                      )}

                      {guideActiveSection === 1 && (
                        <div className="mt-5 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-center gap-3">
                          <span className="text-2xl">📸</span>
                          <p className="text-xs text-amber-200">
                            <strong>夜拍小秘訣：</strong>若無三腳架，可將手機靠在營柱、保溫杯或露營椅背上，利用倒數計時 3 秒自拍，確保零晃動拍出絕美銀河！
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Drawer Footer */}
              <div className="px-5 py-3 border-t border-white/10 bg-slate-900/90 flex justify-between items-center text-xs">
                <span className="text-slate-400">
                  切換上方標籤查閱更多觀測要點
                </span>
                <button
                  onClick={() => setShowStargazingGuide(false)}
                  className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-xl shadow transition-colors"
                >
                  返回 AR 星空
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
