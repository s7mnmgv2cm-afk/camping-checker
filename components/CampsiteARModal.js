'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  radecToAltAz,
  calculateSolarPosition,
  getMoonPhaseInfo,
  CELESTIAL_TARGETS,
  getRealtimeCelestialTargets,
  CONSTELLATIONS,
  STARGAZING_GUIDE,
  getBeaufortWindSafety,
  BEAUFORT_SCALE_TABLE
} from '../lib/astronomy';
import {
  computePeaksFromLocation,
  TAIWAN_PEAKS,
  TAIWAN_RIDGES,
  getDistanceMeters
} from '../lib/peaks';
import {
  POI_CATEGORIES,
  computeNearbyPOIs,
  projectPOIsToScreen,
  fetchCampsiteSpots
} from '../lib/poi';

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

  // SkyView Constellation Line Art Toggle & Selection
  const [showConstellationLines, setShowConstellationLines] = useState(true);
  const [selectedConstellation, setSelectedConstellation] = useState(null);
  const [simControlsMinimized, setSimControlsMinimized] = useState(true); // 預設收合模擬器，視野 100% 留空給實景
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false); // 📱 實景最大化：可隱藏頂部模式與定位選單

  // Beaufort Wind & Structural Safety Alert Modal
  const [showWindSafetyModal, setShowWindSafetyModal] = useState(false);
  const [windTableTab, setWindTableTab] = useState('summary'); // 'summary' | 'full'

  // PeakVisor Mountain Ridge Mode State
  const [peakMaxDistance, setPeakMaxDistance] = useState(60); // 25km, 50km, 80km
  const [showRidgeLines, setShowRidgeLines] = useState(true);
  const [selectedPeak, setSelectedPeak] = useState(null);
  const [dismissedPeakId, setDismissedPeakId] = useState(null); // 📱 隱藏鎖定山峰字卡
  const [isPeakDrawerCollapsed, setIsPeakDrawerCollapsed] = useState(true); // 📱 預設縮小為單行透明膠囊
  const [showPeakControls, setShowPeakControls] = useState(false); // 📱 辨識半徑與設定面板可收合/隱藏
  const [isBottomDeckCollapsed, setIsBottomDeckCollapsed] = useState(true); // 📱 預設收合底部工具列，保持視野開闊
  const [isDeviceLandscape, setIsDeviceLandscape] = useState(false);

  // Star Mode State (Dismissible & Collapsible Star & Moon Drawers)
  const [dismissedStarId, setDismissedStarId] = useState(null); // 📱 隱藏鎖定天體字卡 (如天樞星)
  const [isStarDrawerCollapsed, setIsStarDrawerCollapsed] = useState(true); // 📱 預設縮小/隱藏天體字卡
  const [isMoonCardDismissed, setIsMoonCardDismissed] = useState(true); // 📱 預設收合為極簡透明月相微膠囊，最大化星空視野

  // Spots Mode State (Dismissible & Collapsible POI Drawers & Top Banner)
  const [dismissedPoiId, setDismissedPoiId] = useState(null); // 📱 隱藏鎖定景點字卡
  const [isPoiDrawerCollapsed, setIsPoiDrawerCollapsed] = useState(true); // 📱 預設縮小為單行透明膠囊
  const [isSpotsBannerDismissed, setIsSpotsBannerDismissed] = useState(false); // 📱 隱藏頂部周邊景點橫幅以節省空間

  // 📐 Auto-detect native device orientation changes (Portrait 65° vs Landscape 105°)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia ? window.matchMedia('(orientation: landscape)') : null;

    const checkOrientation = () => {
      // 1. Check CSS matchMedia (most reliable across iOS Safari and modern browsers)
      const isMqlLandscape = mql ? mql.matches : false;
      // 2. Check window aspect ratio
      const isAspectLandscape = window.innerWidth > window.innerHeight;
      // 3. Check visualViewport if available
      const isVisualLandscape = window.visualViewport ? (window.visualViewport.width > window.visualViewport.height) : false;
      // 4. Check screen orientation API if available
      const screenAngle = window.screen?.orientation?.angle;
      const isAngleLandscape = screenAngle === 90 || screenAngle === 270;
      const screenType = window.screen?.orientation?.type || '';
      const isTypeLandscape = typeof screenType === 'string' && screenType.includes('landscape');
      // 5. Check legacy window.orientation
      const winOrient = typeof window.orientation !== 'undefined' ? (Math.abs(window.orientation) === 90 || Math.abs(window.orientation) === 270) : false;

      const isLand = isMqlLandscape || isAspectLandscape || isVisualLandscape || isAngleLandscape || isTypeLandscape || winOrient;
      setIsDeviceLandscape(!!isLand);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    if (mql && mql.addEventListener) {
      mql.addEventListener('change', checkOrientation);
    }
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', checkOrientation);
    }
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      if (mql && mql.removeEventListener) {
        mql.removeEventListener('change', checkOrientation);
      }
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', checkOrientation);
      }
    };
  }, []);

  const modalRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenGuide, setShowFullscreenGuide] = useState(false); // 📱 iPhone / Android 滿版沉浸教學

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator?.standalone);

    // 在 iOS Safari 上，系統限制一般網頁不能隱藏網址列，點擊時智慧彈出「加入主畫面」滿版指南
    if (isIOS && !isStandalone) {
      setShowFullscreenGuide(true);
      return;
    }

    const modalElem = modalRef.current || document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (modalElem.requestFullscreen) {
        modalElem.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => setShowFullscreenGuide(true));
      } else if (modalElem.webkitRequestFullscreen) {
        modalElem.webkitRequestFullscreen();
        setIsFullscreen(true);
      } else {
        setShowFullscreenGuide(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 📐 FOV 自動連動：手機橫放自動切換為 105° 超廣角全景，拿直自動切換為 65° 標準視角
  const effectiveLandscape = isDeviceLandscape;

  // 📱 極致沉浸模式：星空模式（直向與橫向）或 橫向遠山模式，自動把所有可以隱藏的都隱藏起來！
  useEffect(() => {
    if (!isOpen) return;
    if (arViewMode === 'stars') {
      setIsHeaderCollapsed(true);
      setIsBottomDeckCollapsed(true);
      setIsMoonCardDismissed(true);
      setIsStarDrawerCollapsed(true);
      setSelectedStarTarget(null);
      if (!selectedStarTarget) {
        setDismissedStarId(lockedStar?.id || null);
      }
    } else if (effectiveLandscape && arViewMode === 'mountain') {
      setIsHeaderCollapsed(true);
      setIsPeakDrawerCollapsed(true);
      setShowPeakControls(false);
      setIsBottomDeckCollapsed(true);
      setSelectedPeak(null);
      if (!selectedPeak) {
        setDismissedPeakId(lockedPeak?.id || null);
      }
    } else if (arViewMode === 'spots') {
      if (effectiveLandscape) {
        setIsHeaderCollapsed(true);
        setIsPoiDrawerCollapsed(true);
        setIsSpotsBannerDismissed(true);
        setIsBottomDeckCollapsed(true);
        setSelectedPoi(null);
        if (!selectedPoi) {
          setDismissedPoiId(lockedPoi?.id || null);
        }
      }
    }
  }, [isOpen, arViewMode, effectiveLandscape]);

  // 🧭 Google AI Overview Nearby POIs (Trails, Waterfalls, Viewpoints)
  const [poiSpots, setPoiSpots] = useState([]);
  const [loadingSpots, setLoadingSpots] = useState(false);
  const [spotSource, setSpotSource] = useState(null);
  const [spotToast, setSpotToast] = useState(null);
  const [poiCategory, setPoiCategory] = useState('all');
  const [poiMaxDistance, setPoiMaxDistance] = useState(15); // 3km, 5km, 15km, 25km
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [poiOverviewSummary, setPoiOverviewSummary] = useState('');

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

  // Fetch Google AI Overview spots when modal opens, campsite changes, or locationMode changes
  useEffect(() => {
    if (!isOpen || (!campsite && !userCoords)) return;
    let isMounted = true;
    setLoadingSpots(true);

    fetchCampsiteSpots(campsite, { lat, lng, locationMode })
      .then(spots => {
        if (isMounted) {
          setPoiSpots(spots || []);
          if (spots?.__meta?.source) {
            setSpotSource(spots.__meta.source);
          }
          if (spots?.__meta?.summary) {
            setPoiOverviewSummary(spots.__meta.summary);
          }
          setLoadingSpots(false);
        }
      })
      .catch(err => {
        console.warn('Google Overview spots load failed:', err);
        if (isMounted) setLoadingSpots(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, campsite?.id, campsite?.name, locationMode, (locationMode === 'current' && userCoords ? `${userCoords.lat.toFixed(3)}_${userCoords.lng.toFixed(3)}` : null)]);

  // 景點即時查詢冷卻與位移保護常數 (冷卻十分鐘 + 500m 位移檢查)
  const SPOTS_REFRESH_COOLDOWN_MS = 10 * 60 * 1000; // 10 分鐘冷卻 (600,000 ms)
  const SPOTS_DISPLACEMENT_THRESHOLD_METERS = 500; // 500 公尺位移檢查門檻

  // 即時計算冷卻剩餘分鐘數
  const [cooldownRemainingMin, setCooldownRemainingMin] = useState(0);

  useEffect(() => {
    const checkCooldown = () => {
      if (typeof window === 'undefined') return;
      try {
        const raw = localStorage.getItem('campsite_spots_last_refresh_meta');
        if (!raw) {
          setCooldownRemainingMin(0);
          return;
        }
        const meta = JSON.parse(raw);
        const timeElapsed = Date.now() - (meta.timestamp || 0);
        const distMoved = (meta.lat != null && meta.lng != null)
          ? getDistanceMeters(lat, lng, meta.lat, meta.lng)
          : 999999;
        if (timeElapsed < SPOTS_REFRESH_COOLDOWN_MS && distMoved < SPOTS_DISPLACEMENT_THRESHOLD_METERS) {
          setCooldownRemainingMin(Math.ceil((SPOTS_REFRESH_COOLDOWN_MS - timeElapsed) / 60000));
        } else {
          setCooldownRemainingMin(0);
        }
      } catch (e) {
        setCooldownRemainingMin(0);
      }
    };
    checkCooldown();
    const timer = setInterval(checkCooldown, 10000);
    return () => clearInterval(timer);
  }, [lat, lng, loadingSpots]);

  // 手動即時探勘/重新查詢營區周邊景點 (方案 C: Google 即時實境探勘 + 雲端回存 + 10分鐘/500m冷卻防護)
  const handleRefreshSpots = async () => {
    if (!campsite && !userCoords) return;

    // 1. 冷卻十分鐘 + 500m 位移檢查 (防止同地點頻繁重複查詢浪費資源)
    if (typeof window !== 'undefined') {
      try {
        const lastMetaRaw = localStorage.getItem('campsite_spots_last_refresh_meta');
        if (lastMetaRaw) {
          const lastMeta = JSON.parse(lastMetaRaw);
          const timeElapsed = Date.now() - (lastMeta.timestamp || 0);
          const distMoved = (lastMeta.lat != null && lastMeta.lng != null)
            ? getDistanceMeters(lat, lng, lastMeta.lat, lastMeta.lng)
            : 999999;

          if (timeElapsed < SPOTS_REFRESH_COOLDOWN_MS && distMoved < SPOTS_DISPLACEMENT_THRESHOLD_METERS) {
            const remainingSec = Math.ceil((SPOTS_REFRESH_COOLDOWN_MS - timeElapsed) / 1000);
            const remainingMin = Math.ceil(remainingSec / 60);
            const distDisplay = Math.round(distMoved);
            setSpotToast(`⏳ 原地探勘保護中（位移 ${distDisplay}m 未達 500m），冷卻尚餘 ${remainingMin} 分鐘，已保留最新實境景點！`);
            setTimeout(() => setSpotToast(null), 4000);
            return;
          }

          if (distMoved >= SPOTS_DISPLACEMENT_THRESHOLD_METERS) {
            const distText = distMoved >= 1000 ? `${(distMoved / 1000).toFixed(1)} km` : `${Math.round(distMoved)} 公尺`;
            setSpotToast(`🚶‍♂️ 偵測到位移 ${distText}（超過 500m 門檻），立即啟動新座標 Google 實境探勘...`);
          }
        }
      } catch (e) {
        console.warn('Check refresh cooldown meta error:', e);
      }
    }

    setLoadingSpots(true);
    try {
      const isCurrentGps = locationMode === 'current';
      const cacheKey = isCurrentGps
        ? `campsite_ai_spots_v3_gps_${Number(lat).toFixed(3)}_${Number(lng).toFixed(3)}`
        : `campsite_ai_spots_v3_${campsite?.id || campsite?.name || 'default'}`;
      if (typeof window !== 'undefined') {
        localStorage.removeItem(cacheKey);
      }
      const spots = await fetchCampsiteSpots(campsite, {
        forceRefresh: true,
        lat,
        lng,
        locationMode
      });
      setPoiSpots(spots || []);
      if (spots?.__meta?.source) {
        setSpotSource(spots.__meta.source);
      }
      if (spots?.__meta?.summary) {
        setPoiOverviewSummary(spots.__meta.summary);
      }

      // 紀錄本次成功探勘的時間與座標，用於 10 分鐘 + 500m 位移比對
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('campsite_spots_last_refresh_meta', JSON.stringify({
            timestamp: Date.now(),
            lat,
            lng,
            campsiteId: campsite?.id || null
          }));
          setCooldownRemainingMin(10);
        } catch (e) {
          console.warn('Failed to save refresh meta:', e);
        }
      }

      if (spots?.__meta?.source === 'google_places_live_cached') {
        setSpotToast('🌐 已依即時座標完成 Google 實境探勘並同步回存雲端！');
      } else if (spots?.__meta?.source === 'google_places_live_gps') {
        setSpotToast('📍 已依據您當前 GPS 定位即時探勘 Google 周邊景點！');
      } else {
        setSpotToast('✨ 已更新最新營地周邊步道與景點！');
      }
      setTimeout(() => setSpotToast(null), 3500);
    } catch (err) {
      console.warn('Failed to refresh spots:', err);
      setSpotToast('⚠️ 查詢稍有延遲，已載入精選山林景點備用方案');
      setTimeout(() => setSpotToast(null), 3000);
    } finally {
      setLoadingSpots(false);
    }
  };

  const windDir = liveWind?.windDir ?? (propWindDir !== undefined && propWindDir !== null ? propWindDir : 45);
  const windSpeed = liveWind?.windSpeed ?? (propWindSpeed !== undefined && propWindSpeed !== null ? propWindSpeed : 10);
  const windSafety = useMemo(() => getBeaufortWindSafety(windSpeed), [windSpeed]);

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

  // 4. Compute real-time horizontal coordinates (Azimuth & Elevation) for all observable targets (Planets + Stars + Galaxies)
  const computedStars = useMemo(() => {
    const allTargets = getRealtimeCelestialTargets(activeStarDate);
    return allTargets.map(target => {
      const pos = radecToAltAz(target.ra, target.dec, activeStarDate, lat, lng);
      return {
        ...target,
        azimuth: pos.azimuth,
        elevation: pos.elevation
      };
    });
  }, [activeStarDate, lat, lng]);

  // 5. Compute real-time Constellations with Star coordinates, Lines, and Center Points
  const computedConstellations = useMemo(() => {
    const starFovH = effectiveLandscape ? 52.5 : 38;
    const starFovV = effectiveLandscape ? 20 : 28;

    return CONSTELLATIONS.map(c => {
      const starMap = {};
      let visSumX = 0;
      let visSumY = 0;
      let visibleStars = 0;

      const starsWithPos = c.stars.map(s => {
        const pos = radecToAltAz(s.ra, s.dec, activeStarDate, lat, lng);
        const azDiff = (pos.azimuth - heading + 540) % 360 - 180;
        const elDiff = pos.elevation - camElevation;
        const screenX = 50 + (azDiff / starFovH) * 45;
        const screenY = 50 - (elDiff / starFovV) * 40;
        const inFOV = Math.abs(azDiff) <= starFovH && Math.abs(elDiff) <= starFovV && pos.elevation > -5;

        const starObj = {
          ...s,
          azimuth: pos.azimuth,
          elevation: pos.elevation,
          screenX: Math.round(screenX * 10) / 10,
          screenY: Math.round(screenY * 10) / 10,
          inFOV
        };
        starMap[s.id] = starObj;

        if (inFOV) {
          visSumX += screenX;
          visSumY += screenY;
          visibleStars++;
        }
        return starObj;
      });

      const centerX = visibleStars > 0 ? Math.round((visSumX / visibleStars) * 10) / 10 : null;
      const centerY = visibleStars > 0 ? Math.round((visSumY / visibleStars) * 10) / 10 : null;

      return {
        ...c,
        starMap,
        starsWithPos,
        visibleStars,
        centerX,
        centerY
      };
    });
  }, [activeStarDate, lat, lng, heading, camElevation, effectiveLandscape]);

  // 6. Detect Star or Constellation locked by Central Reticle
  const lockedStar = useMemo(() => {
    if (arViewMode !== 'stars') return null;
    let closest = null;
    let minSep = 999;

    // Check individual celestial targets (Milky Way core, Polaris, etc.)
    for (const star of computedStars) {
      if (star.elevation < -5) continue;
      const sep = getAngularSeparation(heading, camElevation, star.azimuth, star.elevation);
      if (sep < minSep) {
        minSep = sep;
        closest = star;
      }
    }

    // Check all stars in constellations
    for (const c of computedConstellations) {
      for (const star of c.starsWithPos) {
        if (star.elevation < -5) continue;
        const sep = getAngularSeparation(heading, camElevation, star.azimuth, star.elevation);
        if (sep < minSep) {
          minSep = sep;
          closest = {
            ...star,
            constellation: c.name,
            icon: c.icon,
            story: `${c.name}之成員恆星，視星等約 ${star.mag}。${c.story}`
          };
        }
      }
    }

    if (minSep <= 14) {
      return { ...closest, separation: Math.round(minSep * 10) / 10 };
    }
    return null;
  }, [arViewMode, computedStars, computedConstellations, heading, camElevation]);

  // Active Constellation highlighted by user selection or reticle target lock
  const activeConstellation = useMemo(() => {
    if (selectedConstellation) return selectedConstellation;
    if (!lockedStar) return null;
    const starConstellName = lockedStar.constellation?.split(' (')[0];
    return computedConstellations.find(c =>
      c.stars.some(s => s.id === lockedStar.id || s.name.includes(lockedStar.name.split(' (')[0])) ||
      (starConstellName && c.name.includes(starConstellName))
    ) || null;
  }, [selectedConstellation, lockedStar, computedConstellations]);

  // 🧭 智慧天體仰角引導指針 (Off-Screen Sky Radar Guidance)：
  // 當使用者水平轉向天體方位 (例如土星 171°)，但垂直仰角不足或過高 (例如土星在 66° 高空但鏡頭平視 15°) 時，
  // 自動偵測並浮現直覺的向上/向下抬手引導指示，秒速化解「方位對了卻看不到」的疑惑！
  const skyAimGuidance = useMemo(() => {
    if (arViewMode !== 'stars' || lockedStar) return null;

    const starFovH = effectiveLandscape ? 52.5 : 38;
    const starFovV = effectiveLandscape ? 20 : 28;

    // 優先順序：1. 使用者手動選中的天體，2. 當前夜空主要行星 (土星、木星、火星、金星) 或月球、一等亮星
    const priorityTargets = selectedStarTarget 
      ? [selectedStarTarget] 
      : computedStars.filter(s => s.type === 'moon' || s.type === 'planet' || s.mag <= 1.2);

    for (const target of priorityTargets) {
      if (target.elevation < -5) continue;
      const azDiff = (target.azimuth - heading + 540) % 360 - 180;
      const elDiff = target.elevation - camElevation;

      // 使用者水平方位已大致對準 (夾角 <= 45°)
      if (Math.abs(azDiff) <= 45) {
        if (elDiff > starFovV) {
          return {
            target,
            direction: 'up',
            degreeDiff: Math.round(elDiff),
            azDiff: Math.round(azDiff),
            message: `👆 請將手機向上抬起 ${Math.round(elDiff)}°（目標仰角 ${target.elevation}°）`
          };
        } else if (elDiff < -starFovV) {
          return {
            target,
            direction: 'down',
            degreeDiff: Math.round(Math.abs(elDiff)),
            azDiff: Math.round(azDiff),
            message: `👇 請將手機向下壓低 ${Math.round(Math.abs(elDiff))}°（目標仰角 ${target.elevation}°）`
          };
        }
      }
    }
    return null;
  }, [arViewMode, lockedStar, selectedStarTarget, computedStars, heading, camElevation, effectiveLandscape]);

  // Reset dismissed star when reticle locks onto another star
  useEffect(() => {
    if (lockedStar && lockedStar.id !== dismissedStarId) {
      // 📱 星空模式下，準心掠過星體不自動彈出大字卡遮蔽夜空，維持收合，除非使用者主動選取特定天體
      setIsStarDrawerCollapsed(true);
      if (!selectedStarTarget) {
        setDismissedStarId(lockedStar.id);
      }
    }
  }, [lockedStar?.id, selectedStarTarget]);

  // 7. Compute PeakVisor Mountain Peaks & Ridge Lines from observer location
  const campElevation = campsite?.altitude 
    ? (parseFloat(String(campsite.altitude).replace(/[^0-9.]/g, '')) || 500)
    : (campsite?.elevation ? (parseFloat(String(campsite.elevation).replace(/[^0-9.]/g, '')) || 500) : 500);

  const computedPeaks = useMemo(() => {
    if (arViewMode !== 'mountain') return [];
    const peaks = computePeaksFromLocation(lat, lng, campElevation, peakMaxDistance);
    const fovH = effectiveLandscape ? 105 : 65; // Horizontal Field of View: 105° ultra-wide in landscape panorama
    const fovV = effectiveLandscape ? 40 : 55; // Vertical Field of View

    const projected = peaks.map(p => {
      let azDiff = (p.azimuth - heading + 540) % 360 - 180;
      let elDiff = p.apparentElevation - camElevation;

      const screenX = 50 + (azDiff / (fovH / 2)) * 50;
      const screenY = 50 - (elDiff / (fovV / 2)) * 50;
      const isVisible = screenX >= -20 && screenX <= 120 && screenY >= -20 && screenY <= 120;
      const inView = screenX >= 0 && screenX <= 100 && screenY >= 0 && screenY <= 100;

      return {
        ...p,
        screenX,
        screenY,
        isVisible,
        inView,
        distKm: p.distKm || p.distanceKm,
        desc: p.desc || p.story,
        azimuthDir: getHeadingDirectionName(p.azimuth)
      };
    });

    // 🎯 智慧多層錯位避讓 (Multi-Tier Collision Avoidance Layout, 仿 PeakFinder / PeakVisor):
    // 1. 先將可見山峰依距離排序（近景優先佔據第 0 層基準高度）
    // 2. 當鄰近山峰水平距離 < 8.5% 時，自動指派至高一層 (Tier 1: +14px, Tier 2: +28px) 錯開高度
    // 3. 超過 3 層且水平重疊者轉為極簡微標籤 (isCompact)，達成 100% 零遮蔽、全名清晰可見
    const visibleList = projected.filter(p => p.isVisible);
    const sorted = [...visibleList].sort((a, b) => (a.distKm || 999) - (b.distKm || 999));

    const occupiedTiers = [];
    const tierMap = new Map();

    sorted.forEach(p => {
      let chosenTier = 0;
      let isCompact = false;
      const threshold = 8.5; // 水平避讓門檻 (%)

      for (let t = 0; t <= 2; t++) {
        const conflict = occupiedTiers.some(occ => occ.tier === t && Math.abs(occ.screenX - p.screenX) < threshold);
        if (!conflict) {
          chosenTier = t;
          break;
        }
        if (t === 2) {
          chosenTier = 0;
          isCompact = true;
        }
      }

      occupiedTiers.push({ screenX: p.screenX, tier: chosenTier });
      tierMap.set(p.id, { tier: chosenTier, isCompact });
    });

    return projected.map(p => {
      const info = tierMap.get(p.id) || { tier: 0, isCompact: false };
      return {
        ...p,
        tier: info.tier,
        isCompact: info.isCompact
      };
    });
  }, [arViewMode, lat, lng, campElevation, peakMaxDistance, heading, camElevation, effectiveLandscape]);

  // Compute Mountain Ridges connecting member peaks
  const computedRidges = useMemo(() => {
    if (arViewMode !== 'mountain' || !showRidgeLines) return [];
    
    // Quick map by id
    const peakMap = new Map();
    computedPeaks.forEach(p => peakMap.set(p.id, p));

    return TAIWAN_RIDGES.map(ridge => {
      const segments = [];
      for (let i = 0; i < ridge.peakIds.length - 1; i++) {
        const id1 = ridge.peakIds[i];
        const id2 = ridge.peakIds[i + 1];
        const p1 = peakMap.get(id1);
        const p2 = peakMap.get(id2);
        if (p1 && p2) {
          if ((p1.screenX >= -30 && p1.screenX <= 130) || (p2.screenX >= -30 && p2.screenX <= 130)) {
            segments.push({ p1, p2 });
          }
        }
      }
      if (segments.length === 0) return null;
      return {
        ...ridge,
        segments
      };
    }).filter(Boolean);
  }, [arViewMode, showRidgeLines, computedPeaks]);

  // PeakVisor Continuous Mountain Skyline Contour across all visible peaks
  const computedMountainSkyline = useMemo(() => {
    if (arViewMode !== 'mountain' || !showRidgeLines) return null;
    
    const visiblePeaks = computedPeaks
      .filter(p => p.screenX >= -20 && p.screenX <= 120 && p.screenY >= -30 && p.screenY <= 120)
      .sort((a, b) => a.screenX - b.screenX);

    if (visiblePeaks.length === 0) return null;

    if (visiblePeaks.length === 1) {
      const p = visiblePeaks[0];
      const leftX = Math.max(-10, p.screenX - 25);
      const rightX = Math.min(110, p.screenX + 25);
      const baseY = Math.min(100, p.screenY + 22);
      return {
        type: 'single',
        path: `M ${leftX.toFixed(1)} ${baseY.toFixed(1)} Q ${(p.screenX - 8).toFixed(1)} ${(p.screenY + 6).toFixed(1)} ${p.screenX.toFixed(1)} ${p.screenY.toFixed(1)} Q ${(p.screenX + 8).toFixed(1)} ${(p.screenY + 6).toFixed(1)} ${rightX.toFixed(1)} ${baseY.toFixed(1)}`,
        fillPath: `M ${leftX.toFixed(1)} ${baseY.toFixed(1)} Q ${(p.screenX - 8).toFixed(1)} ${(p.screenY + 6).toFixed(1)} ${p.screenX.toFixed(1)} ${p.screenY.toFixed(1)} Q ${(p.screenX + 8).toFixed(1)} ${(p.screenY + 6).toFixed(1)} ${rightX.toFixed(1)} ${baseY.toFixed(1)} V 100 H ${leftX.toFixed(1)} Z`,
        peaks: visiblePeaks
      };
    }

    let pathD = '';
    let firstPoint = null;

    visiblePeaks.forEach((p, idx) => {
      if (idx === 0) {
        const startX = Math.max(-15, p.screenX - 20);
        const startY = Math.min(95, p.screenY + 18);
        pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${(p.screenX - 8).toFixed(1)} ${(p.screenY + 5).toFixed(1)} ${p.screenX.toFixed(1)} ${p.screenY.toFixed(1)}`;
        firstPoint = { x: startX, y: startY };
      } else {
        const prev = visiblePeaks[idx - 1];
        const saddleX = (prev.screenX + p.screenX) / 2;
        const saddleY = Math.max(prev.screenY, p.screenY) + Math.min(18, Math.abs(p.screenX - prev.screenX) * 0.35);
        pathD += ` Q ${((prev.screenX + saddleX) / 2).toFixed(1)} ${(saddleY - 2).toFixed(1)} ${saddleX.toFixed(1)} ${saddleY.toFixed(1)} Q ${((saddleX + p.screenX) / 2).toFixed(1)} ${(saddleY - 2).toFixed(1)} ${p.screenX.toFixed(1)} ${p.screenY.toFixed(1)}`;
      }

      if (idx === visiblePeaks.length - 1) {
        const endX = Math.min(115, p.screenX + 20);
        const endY = Math.min(95, p.screenY + 18);
        pathD += ` Q ${(p.screenX + 8).toFixed(1)} ${(p.screenY + 5).toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
      }
    });

    const fillPath = `${pathD} V 100 H ${firstPoint?.x ? firstPoint.x.toFixed(1) : -15} Z`;

    return {
      type: 'multi',
      path: pathD,
      fillPath,
      peaks: visiblePeaks
    };
  }, [arViewMode, showRidgeLines, computedPeaks]);

  // Detect Mountain Peak locked by Central Reticle
  const lockedPeak = useMemo(() => {
    if (arViewMode !== 'mountain') return null;
    let closest = null;
    let minSep = 999;

    for (const p of computedPeaks) {
      const sep = getAngularSeparation(heading, camElevation, p.azimuth, p.apparentElevation);
      if (sep < minSep) {
        minSep = sep;
        closest = p;
      }
    }

    if (minSep <= 12) {
      return { ...closest, separation: Math.round(minSep * 10) / 10 };
    }
    return null;
  }, [arViewMode, computedPeaks, heading, camElevation]);

  // Reset dismissed peak when reticle locks onto another peak
  useEffect(() => {
    if (lockedPeak && lockedPeak.id !== dismissedPeakId) {
      if (effectiveLandscape) {
        // 在橫向模式下保持極簡收合與隱藏，不主動干擾視野，除非使用者主動選取特定山峰
        setIsPeakDrawerCollapsed(true);
        if (!selectedPeak) {
          setDismissedPeakId(lockedPeak.id);
        }
      } else {
        setDismissedPeakId(null);
        setIsPeakDrawerCollapsed(false);
      }
    }
  }, [lockedPeak?.id, effectiveLandscape, selectedPeak]);

  // 8. Compute Google AI Overview POIs (Trails, Waterfalls, Viewpoints)
  const computedPOIs = useMemo(() => {
    if (arViewMode !== 'spots') return [];
    const pois = computeNearbyPOIs(lat, lng, campElevation, poiMaxDistance, poiCategory, poiSpots);
    return projectPOIsToScreen(pois, heading, camElevation, effectiveLandscape ? 105 : 65, effectiveLandscape ? 40 : 55).map(p => ({
      ...p,
      azimuthDir: getHeadingDirectionName(p.azimuth)
    }));
  }, [arViewMode, lat, lng, campElevation, poiMaxDistance, poiCategory, poiSpots, heading, camElevation, effectiveLandscape]);

  // Detect POI locked by Central Reticle
  const lockedPoi = useMemo(() => {
    if (arViewMode !== 'spots') return null;
    let closest = null;
    let minSep = 999;

    for (const p of computedPOIs) {
      const sep = getAngularSeparation(heading, camElevation, p.azimuth, p.apparentElevation);
      if (sep < minSep) {
        minSep = sep;
        closest = p;
      }
    }

    if (minSep <= 12) {
      return { ...closest, separation: Math.round(minSep * 10) / 10 };
    }
    return null;
  }, [arViewMode, computedPOIs, heading, camElevation]);

  // Reset dismissed POI when reticle locks onto another POI
  useEffect(() => {
    if (lockedPoi && lockedPoi.id !== dismissedPoiId) {
      if (effectiveLandscape) {
        setIsPoiDrawerCollapsed(true);
        if (!selectedPoi) {
          setDismissedPoiId(lockedPoi.id);
        }
      } else {
        setDismissedPoiId(null);
        setIsPoiDrawerCollapsed(false);
      }
    }
  }, [lockedPoi?.id, effectiveLandscape, selectedPoi]);

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
      // 1. 🧭 智慧辨識螢幕旋轉角度 (支援最新 screen.orientation.angle 與舊版 window.orientation 及視窗比例)
      let screenAngle = 0;
      if (typeof window !== 'undefined') {
        if (window.screen?.orientation?.angle !== undefined) {
          screenAngle = window.screen.orientation.angle;
        } else if (typeof window.orientation !== 'undefined') {
          const o = Number(window.orientation);
          screenAngle = o < 0 ? o + 360 : o;
        } else if (isDeviceLandscape || window.innerWidth > window.innerHeight) {
          screenAngle = 90;
        }
      }

      const rawBeta = e.beta !== null ? e.beta : 0;
      const rawGamma = e.gamma !== null ? e.gamma : 0;
      const rawAlpha = e.alpha !== null ? e.alpha : 0;

      // 2. 📐 鏡頭仰角 (camElevation) 嚴謹 3D 空間旋轉矩陣解算：
      // 手機後置鏡頭光軸在裝置本體座標系 (Device Body Frame) 固定為 -Z 軸 = [0, 0, -1]^T。
      // 依 W3C 規範之 Tait-Bryan Z-X-Y 旋轉矩陣 R = Rz(alpha) * Rx(beta) * Ry(gamma)，
      // 鏡頭光軸在地球坐標系 (Earth Frame) 之鉛直分量 vz 恆等於：-cos(beta) * cos(gamma)。
      // 鏡頭相對地平線之精確仰角為：camElevation = arcsin(clamp(vz, -1, 1)) * (180 / PI)。
      // 此解析封閉解在直立 0°、橫向 90°、橫向 270°、倒立 180° 及任意手持側傾角下皆具備 100% 幾何對稱與連續性，
      // 徹底根除分段啟發式估算在仰望星空時產生的正負反轉、數值跳變或萬向節鎖死 (Gimbal lock) 缺陷。
      const betaRad = (rawBeta * Math.PI) / 180;
      const gammaRad = (rawGamma * Math.PI) / 180;
      const vz = -Math.cos(betaRad) * Math.cos(gammaRad);
      const cameraElevation = (Math.asin(Math.max(-1, Math.min(1, vz))) * 180) / Math.PI;

      // 3. 🧭 方位角 (heading)：
      let currentHeading = 0;
      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        // iOS Safari: webkitCompassHeading 傳回手機本體頂部之磁北方位角 (0°~360° 順時針)。
        // 橫屏手持時，疊加螢幕旋轉角 (screenAngle) 補償，使鏡頭與螢幕正上方精準對齊真實北方：
        currentHeading = (e.webkitCompassHeading + screenAngle) % 360;
      } else if (e.alpha !== null) {
        // Android / W3C 標準：
        // 透過三維鏡頭向量在水平面之投影 (vx, vy) 計算光軸真北方位角：
        const alphaRad = (rawAlpha * Math.PI) / 180;
        const cA = Math.cos(alphaRad), sA = Math.sin(alphaRad);
        const cB = Math.cos(betaRad), sB = Math.sin(betaRad);
        const cG = Math.cos(gammaRad), sG = Math.sin(gammaRad);

        const vx = -(cA * sG + sA * sB * cG);
        const vy = -(sA * sG - cA * sB * cG);

        if (vx * vx + vy * vy > 1e-4) {
          const h = (Math.atan2(vx, vy) * 180) / Math.PI;
          currentHeading = (h + 360) % 360;
        } else {
          // 天頂或天底極點奇異點備援
          currentHeading = (360 - rawAlpha + screenAngle + 360) % 360;
        }
      }

      // 4. 🏕️ 營位地勢傾角 (Ground Pitch & Roll，平放地面水平儀)：
      let groundPitch = 0;
      let groundRoll = 0;
      if (screenAngle === 90) {
        groundPitch = Math.round(-rawGamma);
        groundRoll = Math.round(rawBeta);
      } else if (screenAngle === 270) {
        groundPitch = Math.round(rawGamma);
        groundRoll = Math.round(-rawBeta);
      } else if (screenAngle === 180) {
        groundPitch = Math.round(-rawBeta);
        groundRoll = Math.round(-rawGamma);
      } else {
        groundPitch = Math.round(rawBeta);
        groundRoll = Math.round(rawGamma);
      }

      const roundedElev = Math.round(cameraElevation) || 0;
      setHeading((Math.round(currentHeading) % 360 + 360) % 360);
      setPitch(groundPitch || 0);
      setRoll(groundRoll || 0);
      setCamElevation(Math.max(-90, Math.min(90, roundedElev)));
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
  }, [isOpen, isDeviceLandscape, permissionGranted]);

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

  // Angular difference between device heading and oncoming wind direction
  let windFrontalDiff = (windDir - heading + 540) % 360 - 180;
  const isFacingDirectWind = Math.abs(windFrontalDiff) <= 32;

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
    <div 
      ref={modalRef}
      className={`fixed inset-0 z-50 flex items-center justify-center p-0 ${effectiveLandscape ? 'sm:p-0' : 'sm:p-4'} bg-slate-950/80 backdrop-blur-md overflow-hidden select-none w-screen h-screen h-[100dvh] max-h-[100dvh]`}
    >
      <div className={`relative w-full h-full h-[100dvh] max-h-[100dvh] ${effectiveLandscape ? 'sm:max-w-none sm:max-h-none sm:rounded-none' : 'sm:max-w-5xl sm:max-h-[94vh] sm:rounded-3xl'} shadow-2xl flex flex-col overflow-hidden bg-slate-950 text-white border border-slate-700 animate-in fade-in zoom-in-95 duration-150`}>
        
        {/* Top Header Floating Glass Bar (現代化頂部控制中樞，排版俐落無折行) */}
        {!isHeaderCollapsed && (
          <div className="relative shrink-0 z-30 px-3.5 py-2.5 bg-slate-950/95 backdrop-blur-xl border-b border-white/10 shadow-2xl flex flex-col gap-2">
            
            {/* 第 1 列：功能標題與右側快捷控制 (收合選單、全螢幕、關閉) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {arViewMode === 'sun' ? '☀️' : arViewMode === 'mountain' ? '⛰️' : arViewMode === 'spots' ? '🧭' : '🌌'}
                </span>
                <h2 className="text-sm font-black text-white tracking-wide">
                  {arViewMode === 'sun'
                    ? 'AR 實境搭帳導引'
                    : arViewMode === 'mountain'
                    ? 'AR 遠山稜線導引'
                    : arViewMode === 'spots'
                    ? 'AR 營地周邊景點探索'
                    : 'AR 夜間星空導引'}
                </h2>
              </div>

              {/* 右側操作群 */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowFullscreenGuide(true)}
                  className="px-2 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-400/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                  title="查看 iPhone / Android 滿版全螢幕教學"
                >
                  <span>📱</span>
                  <span>滿版教學</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsHeaderCollapsed(true)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-white/15 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                  title="收合頂部選單，實景相機視野最大化"
                >
                  <span>▲</span>
                  <span>收合選單</span>
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all shadow-sm ${isFullscreen ? 'bg-amber-400 text-slate-950 font-black border-amber-300' : 'text-slate-300 hover:text-white bg-slate-800/80 border-white/15'}`}
                  title={isFullscreen ? '退出全螢幕' : '進入全螢幕沉浸模式（收起手機網址列）'}
                >
                  <span>{isFullscreen ? '⛶ 退出' : '⛶ 全螢幕'}</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg font-bold text-xs text-slate-300 hover:text-white transition-colors"
                  title="關閉 AR"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 第 2 列：四合一模式切換器 (4 等分完美網格，純行內保證手機絕對不落單成直行) */}
            <div 
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px' }}
              className="bg-slate-900/90 p-1 rounded-xl border border-white/10 text-xs shadow-inner"
            >
              <button
                type="button"
                onClick={() => setArViewMode('sun')}
                className={`py-1.5 rounded-lg font-black transition-all flex items-center justify-center gap-1 ${arViewMode === 'sun' ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-md ring-1 ring-amber-300/50' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                <span>☀️</span>
                <span>日照</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setArViewMode('mountain');
                  if (camElevation > 20 || camElevation < -5) setCamElevation(5);
                }}
                className={`py-1.5 rounded-lg font-black transition-all flex items-center justify-center gap-1 ${arViewMode === 'mountain' ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 shadow-md ring-1 ring-teal-300/50' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                <span>⛰️</span>
                <span>遠山</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setArViewMode('spots');
                  if (camElevation > 15 || camElevation < -10) setCamElevation(0);
                }}
                className={`py-1.5 rounded-lg font-black transition-all flex items-center justify-center gap-1 ${arViewMode === 'spots' ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-md ring-1 ring-cyan-300/50' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                <span>🧭</span>
                <span>景點</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setArViewMode('stars');
                  if (camElevation < 20) setCamElevation(40);
                }}
                className={`py-1.5 rounded-lg font-black transition-all flex items-center justify-center gap-1 ${arViewMode === 'stars' ? 'bg-gradient-to-r from-purple-400 to-indigo-500 text-white shadow-md ring-1 ring-purple-300/50' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                <span>🌌</span>
                <span>星空</span>
              </button>
            </div>

            {/* 第 3 列：次級設定欄（左側定位模式切換，右側模式專屬快捷按鈕） */}
            <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
              {/* 左側：營地 vs 目前 GPS 切換膠囊 */}
              <div className="inline-flex items-center bg-slate-900/90 p-0.5 rounded-lg border border-white/10 shadow-inner">
                <button
                  type="button"
                  onClick={() => setLocationMode('campsite')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${locationMode === 'campsite' ? 'bg-emerald-500 text-slate-950 shadow-sm font-black' : 'text-slate-300 hover:text-white'}`}
                >
                  <span>🏕️</span>
                  <span>{campsite?.name ? (campsite.name.length > 8 ? campsite.name.slice(0, 8) + '...' : campsite.name) : '營地'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSwitchToGPS}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${locationMode === 'current' ? 'bg-sky-500 text-slate-950 shadow-sm font-black' : 'text-slate-300 hover:text-white'}`}
                >
                  <span>📍 GPS</span>
                  {isLocating && <span className="animate-spin text-xs">⏳</span>}
                </button>
              </div>

              {/* 右側：模式專屬徽章或動作 */}
              <div className="flex items-center gap-1.5 shrink-0">
                {arViewMode === 'sun' && (
                  <button
                    type="button"
                    onClick={() => setShowWindSafetyModal(true)}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 font-bold transition-all flex items-center gap-1"
                  >
                    <span>💨</span>
                    <span>防風斷柱評估</span>
                  </button>
                )}
                {arViewMode === 'mountain' && (
                  <button
                    type="button"
                    onClick={() => setShowRidgeLines(v => !v)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 border ${showRidgeLines ? 'bg-teal-500/20 text-teal-300 border-teal-400/40' : 'bg-slate-800/80 text-slate-400 border-white/10'}`}
                  >
                    <span>✨</span>
                    <span>{showRidgeLines ? '稜線：開' : '稜線：關'}</span>
                  </button>
                )}
                {arViewMode === 'spots' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleRefreshSpots}
                      disabled={loadingSpots}
                      title={cooldownRemainingMin > 0 ? `原地冷卻保護中（尚餘 ${cooldownRemainingMin} 分鐘，位移滿 500m 自動解除）` : '立即以目前座標向 Google 探勘最新周邊景點'}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 border ${
                        cooldownRemainingMin > 0
                          ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-400/40'
                          : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/40'
                      }`}
                    >
                      <span className={loadingSpots ? 'animate-spin' : ''}>🔄</span>
                      <span>{loadingSpots ? '探勘中' : cooldownRemainingMin > 0 ? `即時查詢 (${cooldownRemainingMin}m)` : '即時查詢'}</span>
                    </button>
                  </div>
                )}
                {arViewMode === 'stars' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowConstellationLines(v => !v)}
                      className={`px-2 py-1 rounded-lg font-bold transition-all flex items-center gap-1 border ${showConstellationLines ? 'bg-purple-500/20 text-purple-300 border-purple-400/40' : 'bg-slate-800/80 text-slate-400 border-white/10'}`}
                    >
                      <span>✨ 連線</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowStargazingGuide(true)}
                      className="px-2 py-1 bg-gradient-to-r from-purple-600/80 to-indigo-600/80 hover:from-purple-600 hover:to-indigo-600 border border-purple-400/40 text-purple-100 hover:text-white rounded-lg text-xs font-black shadow-md transition-all flex items-center gap-1"
                    >
                      <span>📖 指南</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 📱 實景最大化浮動控制器 (當頂部選單收合時顯示：左右兩側彈性排列，中間完全留空，絕無橫向重疊) */}
        {isHeaderCollapsed && (
          <div 
            style={{ top: '10px', left: '12px', right: '12px', zIndex: 50 }}
            className="absolute flex items-center justify-between pointer-events-none animate-in fade-in duration-150"
          >
            {/* 左側：模式狀態膠囊（點擊也可快速展開選單） */}
            <button
              type="button"
              onClick={() => setIsHeaderCollapsed(false)}
              className="pointer-events-auto flex items-center gap-1.5 bg-slate-950/90 hover:bg-slate-900 backdrop-blur-md px-3 py-1.5 rounded-full border border-amber-400/50 shadow-2xl text-xs font-bold text-white active:scale-95 transition-all cursor-pointer group"
              title="點擊展開完整模式與定位選單"
            >
              <span>{arViewMode === 'sun' ? '☀️' : arViewMode === 'mountain' ? '⛰️' : arViewMode === 'spots' ? '🧭' : '🌌'}</span>
              <span className="text-amber-300 font-extrabold">{arViewMode === 'sun' ? '日照' : arViewMode === 'mountain' ? '遠山' : arViewMode === 'spots' ? '景點' : '星空'}</span>
              <span className="text-slate-600">|</span>
              <span className="text-sky-300 text-[11px]">{locationMode === 'current' ? 'GPS' : '營地'}</span>
              <span className="text-[10px] text-amber-400 group-hover:translate-y-0.5 transition-transform">▼</span>
            </button>

            {/* 右側：展開按鈕 + 全螢幕 + 關閉按鈕 */}
            <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={() => setShowFullscreenGuide(true)}
                className="px-2 sm:px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-teal-300 rounded-full text-xs font-bold border border-teal-400/40 transition-all shadow-md flex items-center gap-1"
                title="查看 iPhone / Android 滿版教學"
              >
                <span>📱</span>
                <span className="hidden sm:inline">滿版</span>
              </button>
              <button
                type="button"
                onClick={() => setIsHeaderCollapsed(false)}
                className="px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-full text-xs font-black flex items-center gap-1 transition-all shadow-xl active:scale-95 border border-amber-300"
                title="展開完整控制選單"
              >
                <span>▼</span>
                <span className="hidden sm:inline">選單</span>
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className={`px-2 sm:px-2.5 py-1.5 rounded-full text-xs font-bold border transition-all shadow-md ${
                  isFullscreen
                    ? 'bg-amber-400 text-slate-950 font-black border-amber-300'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-white/20'
                }`}
                title="切換全螢幕沉浸模式"
              >
                <span>{isFullscreen ? '⛶ 退出' : '⛶ 沉浸'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-full text-xs font-bold transition-colors border border-white/20 shadow-md"
                title="完成關閉 AR"
              >
                ✕
              </button>
            </div>
          </div>
        )}

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

        {/* Plan C: Realtime Google Places / Cloud Cache Notification Toast */}
        {spotToast && (
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-xs font-bold px-4 py-2 flex items-center justify-between shadow-lg transition-all z-40 border-b border-emerald-400 animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="flex items-center gap-1.5">
              <span className="text-sm">🌐</span>
              <span>{spotToast}</span>
            </span>
            <button onClick={() => setSpotToast(null)} className="text-emerald-100 hover:text-white font-black text-sm px-1.5">✕</button>
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

              {/* Discreet Simulator Controls (Positioned at bottom, clean & unobstructed) */}
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 bg-slate-900/85 border border-slate-700/80 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md flex items-center gap-1.5 text-xs">
                <span className="text-sm">{arViewMode === 'stars' ? '🌌' : arViewMode === 'mountain' ? '⛰️' : '🔭'}</span>
                <button
                  onClick={() => setHeading(h => (h + 315) % 360)}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded border border-slate-600 text-slate-200"
                  title="逆轉 45°"
                >
                  ↺ 45°
                </button>
                <button
                  onClick={() => setHeading(h => (h + 45) % 360)}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded border border-slate-600 text-slate-200"
                  title="順轉 45°"
                >
                  ↻ 45°
                </button>
                <button
                  onClick={() => setCamElevation(e => Math.min(85, e + 15))}
                  className="px-2 py-0.5 bg-indigo-900/60 hover:bg-indigo-800 text-xs font-bold rounded border border-indigo-500/40 text-indigo-200"
                  title="仰角 +15°"
                >
                  ▲ 仰角
                </button>
                <button
                  onClick={() => setCamElevation(e => Math.max(-10, e - 15))}
                  className="px-2 py-0.5 bg-indigo-900/60 hover:bg-indigo-800 text-xs font-bold rounded border border-indigo-500/40 text-indigo-200"
                  title="仰角 -15°"
                >
                  ▼ 仰角
                </button>
              </div>
            </div>
          )}

          {/* 2. Top Rolling Compass Ribbon & Guidance Banner (Unified Glassmorphic HUD) */}
          <div 
            style={{ 
              top: isHeaderCollapsed 
                ? (effectiveLandscape ? '8px' : '52px') 
                : '10px',
              zIndex: 35
            }}
            className="absolute left-0 right-0 flex flex-col items-center pointer-events-none px-3 transition-all duration-200"
          >
            {/* Unified Glassmorphic Compass Ribbon with Integrated Heading & Pitch (純透明玻璃羅盤) */}
            <div 
              style={{ 
                width: effectiveLandscape ? 'min(280px, 44vw)' : 'min(360px, 88vw)', 
                minWidth: effectiveLandscape ? '220px' : '280px' 
              }}
              className="relative h-8 sm:h-9 bg-black/25 backdrop-blur-md border border-white/20 rounded-full overflow-hidden shadow-xl flex items-center justify-center shrink-0"
            >
              <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 shadow-[0_0_8px_#f59e0b]"></div>
              
              {/* Integrated Center HUD Marker: 純透明微光琥珀指示標籤 (徹底消除純黑方塊，100% 透明透光) */}
              <div className="absolute z-10 px-2 sm:px-2.5 py-0.5 rounded-full bg-black/15 backdrop-blur-none border border-amber-400/40 text-[11px] sm:text-xs font-mono font-black text-amber-300 flex items-center gap-1 sm:gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)] pointer-events-none">
                <span className="text-amber-400 font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">▲ {heading}°</span>
                <span className="text-[10px] sm:text-[11px] font-sans font-bold text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{getHeadingDirectionName(heading)}</span>
                <span className="text-amber-400/40">|</span>
                <span className="text-[10px] sm:text-[11px] font-sans font-semibold text-sky-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">仰角 {camElevation}°</span>
              </div>

              <div
                className="absolute left-1/2 top-0 bottom-0 flex items-center pointer-events-none transition-transform ease-out duration-75"
                style={{ transform: `translateX(${-heading * 4}px)` }}
              >
                {[-360, 0, 360].map(offset => (
                  <div key={offset} className="absolute inset-y-0 flex items-center" style={{ left: `${offset * 4}px`, width: '1440px' }}>
                    {cardinalTicks.map(t => (
                      <div
                        key={t.deg}
                        className="absolute flex flex-col items-center -translate-x-1/2"
                        style={{ left: `${t.deg * 4}px` }}
                      >
                        <span className={`text-[11px] font-black whitespace-nowrap ${t.deg === 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                          {t.label}
                        </span>
                        <div className={`w-0.5 h-1.5 mt-0.5 ${t.deg === 0 ? 'bg-rose-400' : 'bg-slate-400/80'}`}></div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Dynamic Guidance Banner: Sun mode vs Stars mode */}
            {arViewMode === 'sun' ? (
              <div className="mt-2.5 px-3 py-1.5 rounded-2xl bg-black/45 border border-white/20 backdrop-blur-md text-center max-w-[92vw] sm:max-w-md shadow-2xl transition-all">
                {/* 🚨 迎風面警告：當帳門直接對著來風時 */}
                {isFacingDirectWind && windSpeed >= 20 && (
                  <div className="mb-1.5 px-2.5 py-1 rounded-xl bg-rose-950/95 border border-rose-500/80 text-rose-200 text-xs font-bold shadow-xl animate-pulse">
                    <span className="flex items-center justify-center gap-1.5">
                      <span>🛑 致命危險：帳門正對來風 ({windDir}° {getHeadingDirectionName(windDir)})！</span>
                    </span>
                    <p className="text-[11px] font-normal text-rose-300 mt-0.5 leading-snug">
                      風直接灌入帳內將產生「充氣氣球暴衝效應」，內部強壓會扯斷營柱與爆開拉鍊！請讓帳門朝向背風處（目標方位：{recommendedDoorAzimuth}°）。
                    </p>
                  </div>
                )}

                {/* 💨 蒲福風級強風安全警戒條 (當 6 級以上或風速 >= 39 km/h) */}
                {windSafety.riskLevel !== 'low' && (
                  <div 
                    onClick={() => setShowWindSafetyModal(true)}
                    className={`mb-1 px-2.5 py-0.5 rounded-lg border text-xs flex items-center justify-between gap-2 shadow-md backdrop-blur-md cursor-pointer hover:opacity-95 transition-all ${windSafety.bannerBg}`}
                  >
                    <div className="flex items-center gap-1.5 font-bold min-w-0">
                      <span>{windSafety.riskLevel === 'critical' ? '☠️' : windSafety.riskLevel === 'high' ? '🚨' : '⚠️'}</span>
                      <span className="truncate">{windSafety.riskTitle}</span>
                    </div>
                    <span className="text-[11px] underline text-amber-300 hover:text-white shrink-0 font-bold">
                      斷柱風險 ✕
                    </span>
                  </div>
                )}

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
            ) : arViewMode === 'spots' ? (
              !isSpotsBannerDismissed && !effectiveLandscape ? (
                <div className="mt-1 px-2.5 py-0.5 rounded-full bg-slate-950/75 border border-cyan-500/30 backdrop-blur-md text-center max-w-[94vw] shadow-lg flex items-center justify-center gap-1.5 whitespace-nowrap animate-in fade-in duration-150">
                  <span className="text-cyan-300 font-bold text-[11px] flex items-center gap-1">
                    <span>🧭</span>
                    <span>周邊景點</span>
                    <span className="text-[10px] text-cyan-400 font-mono">({computedPOIs.filter(p => p.inView).length} 處在視野)</span>
                  </span>
                  {spotSource && (
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[9px] font-bold">
                      {spotSource.includes('google_places') ? '🌐 實境' : '☁️ 快取'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleRefreshSpots}
                    disabled={loadingSpots}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-0.5 transition-all pointer-events-auto shadow-sm active:scale-95 border ${
                      cooldownRemainingMin > 0
                        ? 'bg-amber-950/80 hover:bg-amber-900 border-amber-400/40 text-amber-200'
                        : 'bg-cyan-950/90 hover:bg-cyan-900 border-cyan-400/40 text-cyan-200'
                    }`}
                    title={cooldownRemainingMin > 0 ? `原地冷卻中（尚餘 ${cooldownRemainingMin} 分鐘，位移滿 500m 自動解除）` : '立即以目前座標向 Google 探勘最新周邊景點'}
                  >
                    <span className={loadingSpots ? 'animate-spin' : ''}>🔄</span>
                    <span>{loadingSpots ? '查詢中' : cooldownRemainingMin > 0 ? `${cooldownRemainingMin}m` : '即時查詢'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSpotsBannerDismissed(true)}
                    className="ml-0.5 text-slate-400 hover:text-white px-1.5 py-0.2 rounded-full hover:bg-white/20 text-[10px] font-bold transition-all pointer-events-auto"
                    title="隱藏提示橫幅（下方工具列隨時可即時查詢）"
                  >
                    ✕ 隱藏
                  </button>
                </div>
              ) : null
            ) : arViewMode === 'mountain' ? null : (
              skyAimGuidance ? (
                <div 
                  onClick={() => setCamElevation(skyAimGuidance.target.elevation)}
                  className="mt-2.5 px-3.5 py-1 rounded-full bg-black/45 border border-amber-400/40 backdrop-blur-md text-center max-w-[92vw] sm:max-w-md shadow-xl transition-all cursor-pointer group pointer-events-auto"
                  title="點擊自動抬升鏡頭對齊天體仰角"
                >
                  <div className="text-xs flex items-center justify-center gap-1.5 flex-wrap">
                    <span className="text-amber-300 font-bold inline-flex items-center gap-1 animate-pulse">
                      <span>{skyAimGuidance.target.icon} 方位對齊：</span>
                      <strong className="text-white">{skyAimGuidance.target.name.split(' (')[0]}</strong>
                    </span>
                    <span className="text-amber-200 font-bold bg-amber-500/25 border border-amber-400/40 px-2 py-0.5 rounded-full text-[11px] font-mono group-hover:bg-amber-500/40 transition-colors">
                      {skyAimGuidance.message}
                    </span>
                  </div>
                </div>
              ) : activeConstellation ? (
                <div className="mt-2 px-3 py-0.5 rounded-full bg-black/35 border border-white/20 backdrop-blur-md text-center max-w-[92vw] shadow-md transition-all">
                  <div className="text-xs flex items-center justify-center gap-1.5 flex-wrap">
                    <span className="text-amber-300 font-bold inline-flex items-center gap-1">
                      <span>{activeConstellation.icon}</span>
                      <strong className="text-white">{activeConstellation.name}</strong>
                    </span>
                    <span className="text-indigo-200 text-[11px]">
                      （{activeConstellation.season} · {activeConstellation.visibleStars} 顆星在視野）
                    </span>
                  </div>
                </div>
              ) : null
            )}
          </div>

          {/* 3. AR HUD: Floating Markers in Sky Dome */}
          <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
            {/* 3A. SUN MODE: Sun Path Markers */}
            {arViewMode === 'sun' && sunMilestones.map(sun => {
              const sunFovH = effectiveLandscape ? 52.5 : 38;
              const sunFovV = effectiveLandscape ? 20 : 28;
              const azDiff = (sun.azimuth - heading + 540) % 360 - 180;
              const elDiff = sun.elevation - camElevation;
              const inFOV = Math.abs(azDiff) <= sunFovH && Math.abs(elDiff) <= sunFovV;
              const screenX = 50 + (azDiff / sunFovH) * 45;
              const screenY = 50 - (elDiff / sunFovV) * 40;

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

            {/* 3B. SKYVIEW CONSTELLATION LINES (SVG) */}
            {arViewMode === 'stars' && showConstellationLines && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-hidden">
                <defs>
                  <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {computedConstellations.map(c => {
                  const isHigh = activeConstellation?.id === c.id;
                  return (
                    <g key={c.id}>
                      {c.lines.map(([id1, id2], idx) => {
                        const s1 = c.starMap[id1];
                        const s2 = c.starMap[id2];
                        if (!s1 || !s2) return null;
                        const s1Near = s1.screenX >= -20 && s1.screenX <= 120 && s1.screenY >= -20 && s1.screenY <= 120 && s1.elevation > -8;
                        const s2Near = s2.screenX >= -20 && s2.screenX <= 120 && s2.screenY >= -20 && s2.screenY <= 120 && s2.elevation > -8;
                        if (!s1Near && !s2Near) return null;

                        return (
                          <line
                            key={`${c.id}-${idx}`}
                            x1={`${s1.screenX}%`}
                            y1={`${s1.screenY}%`}
                            x2={`${s2.screenX}%`}
                            y2={`${s2.screenY}%`}
                            stroke={c.color}
                            strokeWidth={isHigh ? 2.8 : (c.isAsterism ? 1.5 : 2.0)}
                            strokeDasharray={c.isAsterism ? '5,4' : 'none'}
                            strokeOpacity={isHigh ? 0.95 : 0.65}
                            filter="url(#neon-glow)"
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            )}

            {/* 3C. FLOATING CONSTELLATION LABELS (Centroid) */}
            {arViewMode === 'stars' && showConstellationLines && computedConstellations.map(c => {
              if (c.centerX === null || c.centerY === null || c.visibleStars < 2) return null;
              const isHigh = activeConstellation?.id === c.id;
              return (
                <div
                  key={`constell-label-${c.id}`}
                  style={{ left: `${c.centerX}%`, top: `${Math.max(10, c.centerY - 9)}%` }}
                  onClick={() => setSelectedConstellation(prev => (prev?.id === c.id ? null : c))}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full text-xs font-black shadow-xl backdrop-blur-md cursor-pointer pointer-events-auto transition-all duration-200 border flex items-center gap-1.5 ${
                    isHigh
                      ? 'bg-indigo-950/95 text-white border-amber-400 scale-110 shadow-[0_0_20px_rgba(245,158,11,0.6)] z-30 ring-2 ring-amber-400/50 animate-pulse'
                      : 'bg-slate-950/85 text-slate-200 border-white/30 hover:border-sky-400 hover:text-white z-20'
                  }`}
                >
                  <span>{c.icon}</span>
                  <span>{c.name.split(' (')[0]}</span>
                  {c.isAsterism ? (
                    <span className="text-amber-300 font-mono text-xs px-1 py-0.2 rounded bg-amber-400/20">大三角</span>
                  ) : (
                    <span className="text-sky-300 font-normal text-xs">{c.season.substring(0, 2)}</span>
                  )}
                </div>
              );
            })}

            {/* 3D. STARS MODE: Celestial Objects & Milky Way Core */}
            {arViewMode === 'stars' && computedStars.map(star => {
              const starFovH = effectiveLandscape ? 52.5 : 38;
              const starFovV = effectiveLandscape ? 20 : 28;
              const azDiff = (star.azimuth - heading + 540) % 360 - 180;
              const elDiff = star.elevation - camElevation;
              const inFOV = Math.abs(azDiff) <= starFovH && Math.abs(elDiff) <= starFovV;
              const screenX = 50 + (azDiff / starFovH) * 45;
              const screenY = 50 - (elDiff / starFovV) * 40;

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
                  {/* Special Rendering for Moon, Planets, Deep-Sky, and Stars */}
                  {star.type === 'moon' ? (
                    <div className="relative flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-amber-200/25 blur-md animate-pulse absolute"></div>
                      {isLocked && (
                        <div className="w-14 h-14 rounded-full bg-amber-300/40 animate-ping absolute"></div>
                      )}
                      <div className={`rounded-full flex items-center justify-center transition-all ${
                        isLocked
                          ? 'w-12 h-12 bg-amber-200 text-slate-950 font-black shadow-[0_0_30px_#fef08a] border-2 border-white scale-110'
                          : 'w-11 h-11 bg-gradient-to-tr from-slate-200 via-amber-100 to-yellow-50 text-slate-950 shadow-[0_0_20px_rgba(254,240,138,0.9)] border-2 border-amber-200/80'
                      }`}>
                        <span className="text-xl drop-shadow-md">{star.icon}</span>
                      </div>
                    </div>
                  ) : star.type === 'planet' ? (
                    <div className="relative flex items-center justify-center">
                      {isLocked && (
                        <div className="w-12 h-12 rounded-full bg-amber-400/30 animate-ping absolute"></div>
                      )}
                      <div className={`rounded-full flex items-center justify-center transition-all ${
                        isLocked
                          ? 'w-10 h-10 bg-amber-400 text-slate-950 font-black shadow-[0_0_25px_#f59e0b] scale-110'
                          : 'w-9 h-9 bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-100 text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.8)] border border-amber-300'
                      }`}>
                        <span className="text-base drop-shadow-md">{star.icon}</span>
                      </div>
                    </div>
                  ) : isDeepSky ? (
                    <div className="relative flex items-center justify-center">
                      <div className="w-32 h-16 rounded-full bg-gradient-to-r from-purple-600/30 via-pink-500/40 to-amber-400/30 blur-md animate-pulse absolute"></div>
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-700 via-pink-600 to-amber-400 border-2 border-purple-200 shadow-[0_0_25px_#ec4899] flex items-center justify-center text-2xl z-10">
                        {star.icon || '🌌'}
                      </div>
                    </div>
                  ) : star.type === 'galaxy' || star.type === 'nebula' || star.type === 'cluster' ? (
                    <div className="relative flex items-center justify-center">
                      {isLocked && (
                        <div className="w-10 h-10 rounded-full bg-indigo-400/30 animate-ping absolute"></div>
                      )}
                      <div className={`rounded-full flex items-center justify-center transition-all ${
                        isLocked
                          ? 'w-9 h-9 bg-indigo-400 text-slate-950 font-black shadow-[0_0_20px_#818cf8]'
                          : 'w-8 h-8 bg-gradient-to-tr from-indigo-500 via-purple-400 to-pink-300 text-white shadow-[0_0_14px_rgba(129,140,248,0.7)] border border-indigo-300/40'
                      }`}>
                        <span className="text-sm">{star.icon}</span>
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

                  {/* Star Badge Card: 精簡單行透明玻璃膠囊 (移除多餘的仰角/方位，避免星體重疊遮擋) */}
                  <div className={`px-2 py-0.5 rounded-full text-xs font-bold shadow-md backdrop-blur-md mt-1 text-center whitespace-nowrap border transition-all ${
                    isLocked 
                      ? 'bg-emerald-950/70 border-emerald-400 text-emerald-100 shadow-[0_0_12px_#10b981]' 
                      : 'bg-black/35 border-white/20 text-white hover:bg-black/55'
                  }`}>
                    <div className="flex items-center gap-1 justify-center">
                      <span className={isLocked ? 'text-emerald-300 font-black' : 'text-amber-200 font-bold'}>
                        {star.name.split(' (')[0]}
                      </span>
                      {star.badge && (
                        <span className="text-[10px] px-1 py-0.1 rounded bg-indigo-500/25 text-indigo-200 font-normal">
                          {star.badge}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 3D-B. SKY TARGET VERTICAL GUIDANCE INDICATOR (OFF-SCREEN RADAR) */}
            {arViewMode === 'stars' && skyAimGuidance && (
              <div 
                onClick={() => setCamElevation(skyAimGuidance.target.elevation)}
                className={`absolute left-1/2 -translate-x-1/2 z-30 pointer-events-auto cursor-pointer animate-bounce ${
                  skyAimGuidance.direction === 'up' ? 'top-2' : 'bottom-16'
                }`}
                title={`點擊視角自動對齊${skyAimGuidance.target.name}仰角`}
              >
                <div className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-black text-xs shadow-[0_0_25px_rgba(245,158,11,0.9)] flex items-center gap-1.5 border border-white/80 active:scale-95 transition-transform">
                  <span className="text-sm">{skyAimGuidance.target.icon}</span>
                  <span>{skyAimGuidance.target.name.split(' (')[0]} 在{skyAimGuidance.direction === 'up' ? '上方高空' : '下方低空'}（仰角 {skyAimGuidance.target.elevation}°）</span>
                  <span className="bg-slate-950/80 text-amber-300 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
                    {skyAimGuidance.direction === 'up' ? `👆 抬頭 +${skyAimGuidance.degreeDiff}°` : `👇 壓低 -${skyAimGuidance.degreeDiff}°`}
                  </span>
                </div>
              </div>
            )}

            {/* 3E. CONSTELLATION VERTEX STAR NODES (SkyView) */}
            {arViewMode === 'stars' && showConstellationLines && computedConstellations.map(c => (
              <React.Fragment key={`c-stars-${c.id}`}>
                {c.starsWithPos.map(star => {
                  if (!star.inFOV) return null;
                  const isMainTarget = computedStars.some(t => t.id === star.id);
                  if (isMainTarget) return null;

                  const isStarLocked = lockedStar?.id === star.id;

                  return (
                    <div
                      key={`c-star-dot-${c.id}-${star.id}`}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-auto cursor-pointer transition-all duration-150 animate-in fade-in"
                      style={{ left: `${star.screenX}%`, top: `${star.screenY}%` }}
                      onClick={() => setSelectedStarTarget({
                        ...star,
                        constellation: c.name,
                        icon: c.icon,
                        story: `${c.name}之代表星，視星等約 ${star.mag}。${c.story}`
                      })}
                    >
                      <div className="relative flex items-center justify-center">
                        {isStarLocked && (
                          <div className="w-8 h-8 rounded-full bg-emerald-400/30 animate-ping absolute"></div>
                        )}
                        <div
                          className={`rounded-full transition-all ${
                            isStarLocked
                              ? 'w-6 h-6 bg-emerald-400 shadow-[0_0_15px_#10b981]'
                              : star.mag < 2.0
                                ? 'w-4 h-4 bg-sky-200 shadow-[0_0_8px_#38bdf8]'
                                : 'w-3 h-3 bg-white/90 shadow-[0_0_5px_#fff]'
                          } flex items-center justify-center text-slate-950 font-bold`}
                        >
                          <div className="w-1 h-1 rounded-full bg-white"></div>
                        </div>
                      </div>
                      <span className="text-[11px] text-sky-200 font-mono mt-0.5 bg-black/35 backdrop-blur-md px-1.5 py-0.2 rounded-full border border-white/20 whitespace-nowrap">
                        {star.name.split(' (')[0]}
                      </span>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}

            {/* 3F. PEAKVISOR MOUNTAIN RIDGE LINES & CONTINUOUS SKYLINE (SVG) */}
            {arViewMode === 'mountain' && showRidgeLines && (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-hidden"
              >
                <defs>
                  <filter id="ridge-glow" x="-25%" y="-25%" width="150%" height="150%">
                    <feGaussianBlur stdDeviation="1.6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <linearGradient id="skyline-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* 1. Continuous Panorama Mountain Silhouette Contour */}
                {computedMountainSkyline && (
                  <g className="transition-all duration-300">
                    <path
                      d={computedMountainSkyline.fillPath}
                      fill="url(#skyline-grad)"
                    />
                    <path
                      d={computedMountainSkyline.path}
                      stroke="#38bdf8"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter="url(#ridge-glow)"
                      fill="none"
                      className="drop-shadow-[0_0_8px_rgba(56,189,248,0.85)]"
                    />
                    {/* Glowing Beacon Drops from Peak Summits */}
                    {computedMountainSkyline.peaks.map(p => (
                      <g key={`skyline-beacon-${p.id}`}>
                        <circle
                          cx={p.screenX}
                          cy={p.screenY}
                          r="1.2"
                          fill="#38bdf8"
                          filter="url(#ridge-glow)"
                        />
                        <circle
                          cx={p.screenX}
                          cy={p.screenY}
                          r="0.5"
                          fill="#ffffff"
                        />
                        <line
                          x1={p.screenX}
                          y1={p.screenY}
                          x2={p.screenX}
                          y2={Math.min(95, p.screenY + 10)}
                          stroke="#38bdf8"
                          strokeWidth="0.4"
                          strokeDasharray="1,1"
                          strokeOpacity="0.75"
                        />
                      </g>
                    ))}
                  </g>
                )}

                {/* 2. Connected Mountain Chain Segments */}
                {computedRidges.map(ridge => {
                  const isHigh = selectedPeak && ridge.peakIds.includes(selectedPeak.id);
                  return (
                    <g key={ridge.id} className="transition-opacity duration-300">
                      {ridge.segments.map((seg, idx) => (
                        <line
                          key={`${ridge.id}-${idx}`}
                          x1={seg.p1.screenX}
                          y1={seg.p1.screenY}
                          x2={seg.p2.screenX}
                          y2={seg.p2.screenY}
                          stroke={ridge.color || '#38bdf8'}
                          strokeWidth={isHigh ? 1.4 : 0.9}
                          strokeDasharray={ridge.lineStyle === 'dashed' ? '2,1.5' : 'none'}
                          strokeOpacity={isHigh ? 0.95 : 0.8}
                          filter="url(#ridge-glow)"
                        />
                      ))}
                    </g>
                  );
                })}
              </svg>
            )}

            {/* 3F.5 LANDSCAPE PANORAMA HORIZON REFERENCE */}
            {effectiveLandscape && arViewMode === 'mountain' && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center justify-between px-6 opacity-25">
                <div className="h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent flex-1"></div>
              </div>
            )}

            {/* 3G. MOUNTAIN PEAK PINS & BADGES */}
            {arViewMode === 'mountain' && computedPeaks.map(peak => {
              if (!peak.isVisible) return null;
              const isLocked = lockedPeak?.id === peak.id;
              const isSelected = selectedPeak?.id === peak.id;
              const isFocus = isLocked || isSelected;
              // 當山頂靠近螢幕上方時 (screenY < 28%)，標籤自動改為垂掛在山頂下方，避免頂部遮蔽
              const isFlipped = peak.screenY < 28;
              const needleHeight = peak.tier === 2 ? 'h-7' : peak.tier === 1 ? 'h-5' : 'h-2.5';

              return (
                <div
                  key={peak.id}
                  data-testid="peak-pin"
                  data-peak-id={peak.id}
                  style={{
                    left: `${peak.screenX}%`,
                    top: `${peak.screenY}%`,
                    transform: isFlipped ? 'translate(-50%, 0%)' : 'translate(-50%, -100%)'
                  }}
                  onClick={() => setSelectedPeak(prev => (prev?.id === peak.id ? null : peak))}
                  className={`absolute flex flex-col items-center pointer-events-auto cursor-pointer transition-all duration-200 z-20 ${
                    isFocus ? 'scale-110 z-30' : 'opacity-90 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  {/* 若山峰靠近頂部 (isFlipped)，先顯示山頂定錨點與針線，標籤垂掛下方 */}
                  {isFlipped && (
                    <>
                      <div className={`w-1.5 h-1.5 rounded-full ${isFocus ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-white'}`}></div>
                      <div className={`w-0.5 ${needleHeight} ${isFocus ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-slate-400/60'}`}></div>
                    </>
                  )}

                  {/* Peak Pin Badge (高對比度半透明防遮蔽膠囊) */}
                  {peak.isCompact && !isFocus ? (
                    <div className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-black/75 text-slate-200 border border-white/20 backdrop-blur-sm shadow-md flex items-center gap-1 hover:scale-110 hover:bg-emerald-950/80 hover:border-emerald-400 transition-all">
                      <span className="text-[9px]">{peak.icon || '⛰️'}</span>
                      <span className="max-w-[72px] truncate">{peak.name}</span>
                      <span className="font-mono text-emerald-300 text-[9px]">{peak.altitudeM}m</span>
                    </div>
                  ) : (
                    <>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-black shadow-xl backdrop-blur-md flex items-center gap-1.5 border transition-all ${
                        isFocus
                          ? 'bg-emerald-950/85 text-white border-emerald-400 ring-2 ring-emerald-400/50 shadow-[0_0_15px_#10b981]'
                          : 'bg-black/60 text-slate-100 border-white/25 hover:border-emerald-400/70 shadow-md'
                      }`}>
                        <span>{peak.icon || '⛰️'}</span>
                        <span>{peak.name}</span>
                        <span className="text-[10px] font-mono text-emerald-300 font-bold">{peak.altitudeM}m</span>
                      </div>

                      {/* Distance Sub-label */}
                      <div className="mt-0.5 px-1.5 py-0.2 rounded bg-black/50 backdrop-blur-sm border border-white/15 text-[10px] font-mono text-emerald-300 font-bold">
                        {peak.distanceKm} km · {peak.azimuth}°
                      </div>
                    </>
                  )}

                  {/* 若為標準山峰 (!isFlipped)，標籤在上方，針線向下延伸至山頂定錨點 */}
                  {!isFlipped && (
                    <>
                      <div className={`w-0.5 ${needleHeight} mt-0.5 ${isFocus ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-slate-400/60'}`}></div>
                      <div className={`w-1.5 h-1.5 rounded-full ${isFocus ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-white'}`}></div>
                    </>
                  )}
                </div>
              );
            })}

            {/* 3H. GOOGLE AI OVERVIEW POI PINS & BADGES */}
            {arViewMode === 'spots' && computedPOIs.map(poi => {
              if (!poi.isVisible) return null;
              const isLocked = lockedPoi?.id === poi.id;
              const isSelected = selectedPoi?.id === poi.id;
              const isFocus = isLocked || isSelected;

              return (
                <div
                  key={poi.id}
                  data-testid="poi-pin"
                  data-poi-id={poi.id}
                  style={{
                    left: `${poi.screenX}%`,
                    top: `${poi.screenY}%`,
                    transform: 'translate(-50%, -100%)'
                  }}
                  onClick={() => {
                    setSelectedPoi(prev => (prev?.id === poi.id ? null : poi));
                    setDismissedPoiId(null);
                    setIsPoiDrawerCollapsed(false);
                  }}
                  className={`absolute flex flex-col items-center pointer-events-auto cursor-pointer transition-all duration-200 z-20 ${
                    isFocus ? 'scale-115 z-30' : 'opacity-90 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  {/* POI Pin Badge */}
                  <div className={`px-2.5 py-1 rounded-full text-xs font-black shadow-2xl backdrop-blur-md flex items-center gap-1.5 border transition-all ${
                    isFocus
                      ? 'bg-cyan-950/95 text-white border-cyan-400 ring-2 ring-cyan-400/50 shadow-[0_0_15px_#06b6d4]'
                      : 'bg-slate-900/90 text-slate-200 border-slate-600 hover:border-cyan-400/70'
                  }`}>
                    <span>{poi.icon || '🌲'}</span>
                    <span>{poi.name}</span>
                    <span className="text-[10px] font-mono text-cyan-300 font-bold">{poi.distanceKm}km</span>
                  </div>

                  {/* Travel Mode & Azimuth Sub-label: Only show when focused/locked to keep screen clean */}
                  {isFocus && (
                    <div className="mt-0.5 px-1.5 py-0.2 rounded bg-slate-950/80 border border-white/10 text-[10px] font-mono text-cyan-300 flex items-center gap-1 shadow-md animate-in fade-in duration-150">
                      <span>{poi.travelTime}</span>
                      <span>·</span>
                      <span>{poi.azimuth}°</span>
                    </div>
                  )}

                  {/* Pin Needle Line */}
                  <div className={`w-0.5 h-3 ${isFocus ? 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]' : 'bg-slate-400/60'}`}></div>
                  <div className={`w-1.5 h-1.5 rounded-full ${isFocus ? 'bg-cyan-400' : 'bg-white'}`}></div>
                </div>
              );
            })}

            {/* 3I. Off-Screen Edge Indicators for POIs (Compact Sleek Radars) */}
            {arViewMode === 'spots' && computedPOIs.map(poi => {
              if (poi.isVisible || !poi.edgeIndicator) return null;
              return (
                <div
                  key={`edge-${poi.id}`}
                  onClick={() => {
                    setSelectedPoi(poi);
                    setDismissedPoiId(null);
                    setIsPoiDrawerCollapsed(false);
                  }}
                  style={{
                    top: '50%',
                    [poi.edgeIndicator === 'left' ? 'left' : 'right']: '10px',
                    transform: 'translateY(-50%)'
                  }}
                  className="absolute pointer-events-auto cursor-pointer z-20 flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-400/50 text-cyan-200 text-xs font-bold shadow-lg transition-transform hover:scale-105"
                  title={`${poi.name} (${poi.distanceKm}km · ${poi.travelTime})`}
                >
                  {poi.edgeIndicator === 'left' && <span className="text-[10px]">◀</span>}
                  <span>{poi.icon}</span>
                  <span className="text-[10px] font-mono font-bold text-cyan-300">{poi.distanceKm}km</span>
                  {poi.edgeIndicator === 'right' && <span className="text-[10px]">▶</span>}
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
            ) : arViewMode === 'mountain' ? (
              <div className={`relative transition-all duration-200 flex items-center justify-center pointer-events-none ${
                effectiveLandscape ? 'w-20 h-20' : 'w-28 h-28'
              }`}>
                {/* 專業相機觀景窗微準心外環 (高透明度，絕不阻擋山容) */}
                <div className={`absolute inset-0 rounded-full border transition-all ${
                  lockedPeak
                    ? 'border-emerald-400 border-2 shadow-[0_0_15px_rgba(16,185,129,0.5)] scale-105'
                    : 'border-emerald-400/35 border-dashed'
                }`} />

                {/* 邊緣微刻度 (取代表面大十字實線，中央視野 100% 留空) */}
                <div className="absolute top-0 w-0.5 h-1.5 bg-emerald-400/70" />
                <div className="absolute bottom-0 w-0.5 h-1.5 bg-emerald-400/70" />
                <div className="absolute left-0 h-0.5 w-1.5 bg-emerald-400/70" />
                <div className="absolute right-0 h-0.5 w-1.5 bg-emerald-400/70" />

                {/* 中央精準微點 */}
                <div className={`w-1.5 h-1.5 rounded-full transition-all ${
                  lockedPeak
                    ? 'bg-emerald-400 shadow-[0_0_8px_#10b981] scale-125'
                    : 'bg-emerald-400/40 border border-emerald-300/50'
                }`} />

                {/* 僅在底部山峰字卡被使用者手動「隱藏」時，才在準心上方顯示微型浮動膠囊，徹底避免雙重疊字遮蔽 */}
                {lockedPeak && dismissedPeakId === lockedPeak.id && (
                  <div className="absolute -top-8 px-2.5 py-0.5 bg-emerald-500/90 backdrop-blur-md text-slate-950 font-black text-xs rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap animate-in fade-in duration-150">
                    <span>⛰️ {lockedPeak.name}</span>
                    <span className="bg-slate-950 text-emerald-300 px-1 py-0.2 rounded font-mono text-[10px]">
                      {lockedPeak.altitudeM}m · {lockedPeak.distanceKm}km
                    </span>
                  </div>
                )}
              </div>
            ) : arViewMode === 'spots' ? (
              <div className={`relative w-44 h-44 sm:w-56 sm:h-56 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                lockedPoi
                  ? 'border-cyan-400 shadow-[0_0_35px_#06b6d4] scale-105 bg-cyan-500/15'
                  : 'border-cyan-400/40 border-dashed'
              }`}>
                {/* Crosshairs */}
                <div className="absolute w-full h-0.5 bg-cyan-400/30"></div>
                <div className="absolute h-full w-0.5 bg-cyan-400/30"></div>
                <div className={`w-5 h-5 rounded-full border-2 transition-all ${
                  lockedPoi
                    ? 'border-cyan-400 bg-cyan-400/60 scale-125 shadow-[0_0_15px_#06b6d4]'
                    : 'border-cyan-300/60'
                }`}></div>

                {/* Target Locked Floating Card */}
                {lockedPoi && (
                  <div className="absolute -top-12 px-3.5 py-1 bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-black text-xs rounded-full shadow-xl animate-bounce flex items-center gap-1.5 whitespace-nowrap">
                    <span>{lockedPoi.icon} 已鎖定：{lockedPoi.name}</span>
                    <span className="bg-slate-950 text-cyan-300 px-1.5 py-0.2 rounded-full text-xs font-mono">
                      {lockedPoi.distanceKm} km · {lockedPoi.travelTime}
                    </span>
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

          {/* 5. Bottom HUD Status Row (Leveler in Sun Mode + Wind / Moon side-by-side) */}
          <div className="absolute bottom-3 left-3 right-3 z-20 flex justify-between items-end gap-2 pointer-events-none">
            {/* Left Gyro Pitch/Roll Leveler: 僅在搭帳模式下顯示，用於評估營位平整度與睡墊方向 */}
            {arViewMode === 'sun' ? (
              <div className="bg-slate-950/85 backdrop-blur-md border border-white/20 p-2.5 sm:p-3 rounded-2xl text-xs space-y-1 shadow-lg max-w-[48%] pointer-events-auto">
                <span className="text-slate-400 font-bold block truncate">📐 營位地勢傾角</span>
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
                  {Math.abs(pitch) <= 2 ? '✅ 地面平整 適合搭帳' : '💡 睡墊頭朝上坡'}
                </p>
              </div>
            ) : (
              <div className="pointer-events-none"></div>
            )}

            {/* Right HUD: Live Wind in Sun mode VS Moon Phase Light Pollution in Star mode */}
            {arViewMode === 'sun' ? (
              <div 
                onClick={() => setShowWindSafetyModal(true)}
                className="bg-slate-950/85 backdrop-blur-md border border-white/20 hover:border-amber-400/60 p-2.5 sm:p-3 rounded-2xl text-xs space-y-1 shadow-lg max-w-[48%] text-right cursor-pointer pointer-events-auto transition-all hover:scale-105"
                title="點擊查看蒲福風力與帳篷斷柱風險評估"
              >
                <div className="flex items-center justify-end gap-1.5 truncate">
                  <span className={`w-1.5 h-1.5 rounded-full ${loadingWind ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
                  <span className="text-slate-300 font-bold truncate">💨 {windSafety.beaufortName} ({windSpeed} km/h)</span>
                </div>
                <div className="text-sky-300 font-extrabold font-mono text-xs sm:text-sm truncate">
                  來風 {windDir}° {getHeadingDirectionName(windDir)}
                </div>
                <div className="pt-0.5 border-t border-white/10 flex items-center justify-end gap-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${windSafety.badgeColor}`}>
                    {windSafety.statusTag}
                  </span>
                  <span className="text-[10px] text-amber-300 underline font-bold">斷柱評估 ❯</span>
                </div>
              </div>
            ) : arViewMode === 'spots' ? (
              <div 
                onClick={() => setPoiMaxDistance(d => d === 3 ? 5 : d === 5 ? 15 : d === 15 ? 25 : 3)}
                className="bg-slate-950/85 backdrop-blur-md border border-cyan-500/30 p-2.5 sm:p-3 rounded-2xl text-xs space-y-1 shadow-lg max-w-[50%] text-right cursor-pointer hover:border-cyan-400 transition-colors pointer-events-auto"
                title="點擊切換周邊探索半徑"
              >
                <div className="text-cyan-300 font-bold flex items-center justify-end gap-1.5 truncate">
                  <span>🧭</span>
                  <span>周邊景點雷達</span>
                </div>
                <div className="text-amber-300 font-black text-xs truncate">
                  視野內 {computedPOIs.filter(p => p.inView).length} / {computedPOIs.length} 處秘境
                </div>
                <div className="pt-0.5 border-t border-white/10 flex items-center justify-end gap-1.5 flex-wrap text-[10px]">
                  <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-bold">
                    半徑 {poiMaxDistance}km ❯
                  </span>
                  <span className="text-slate-400">{poiCategory === 'all' ? '全部' : poiCategory}</span>
                </div>
              </div>
            ) : arViewMode === 'mountain' ? (
              <div 
                onClick={() => setPeakMaxDistance(d => d === 25 ? 50 : d === 50 ? 80 : 25)}
                className="bg-black/35 backdrop-blur-md border border-white/20 p-2 sm:p-2.5 rounded-2xl text-xs space-y-0.5 shadow-lg max-w-[50%] text-right cursor-pointer hover:border-emerald-400 transition-all pointer-events-auto"
                title="點擊切換視野距離 (25km / 50km / 80km)"
              >
                <div className="text-emerald-300 font-bold flex items-center justify-end gap-1.5 truncate text-[11px]">
                  <span>⛰️</span>
                  <span>PeakVisor ({computedPeaks.filter(p => p.inView).length}/{computedPeaks.length})</span>
                </div>
                <div className="pt-0.5 border-t border-white/10 flex items-center justify-end gap-1 flex-wrap text-[10px]">
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold">
                    半徑 {peakMaxDistance}km ❯
                  </span>
                  <span className="text-slate-300">稜線:{showRidgeLines ? '開' : '關'}</span>
                </div>
              </div>
            ) : isMoonCardDismissed ? (
              // 📱 收合為極簡透明月相膠囊
              <button
                type="button"
                onClick={() => setIsMoonCardDismissed(false)}
                className="bg-black/35 backdrop-blur-md border border-white/20 px-2.5 py-1 rounded-full text-[11px] font-bold text-purple-200 flex items-center gap-1 shadow-lg hover:bg-black/50 pointer-events-auto transition-all active:scale-95"
                title="點擊展開月相與光害資訊"
              >
                <span>{moonInfo.icon}</span>
                <span>{moonInfo.phaseName} ({moonInfo.illumination}%)</span>
                <span className="text-slate-400 text-[10px]">▲</span>
              </button>
            ) : (
              // 📱 完整月相光害卡 (支援一鍵關閉隱藏)
              <div className="bg-black/35 backdrop-blur-md border border-white/20 p-2 sm:p-2.5 rounded-2xl text-xs space-y-1 shadow-lg max-w-[55%] text-right pointer-events-auto transition-all">
                <div className="flex items-center justify-between gap-1.5 border-b border-white/10 pb-0.5">
                  <button
                    type="button"
                    onClick={() => setIsMoonCardDismissed(true)}
                    className="text-slate-400 hover:text-white text-[11px] px-1 rounded hover:bg-white/10 font-bold transition-all"
                    title="隱藏月相資訊"
                  >
                    ✕ 隱藏
                  </button>
                  <span className="text-purple-300 font-bold flex items-center gap-1">
                    <span>{moonInfo.icon}</span>
                    <span>{moonInfo.phaseName} · 月相</span>
                  </span>
                </div>
                <div className="text-amber-300 font-black text-xs">
                  {moonInfo.rating.split(' ')[0]} ({moonInfo.illumination}% 照度)
                </div>
                <p className="text-[11px] text-slate-300 pt-0.5 leading-tight">
                  {moonInfo.phaseDays < 7 || moonInfo.phaseDays > 22 ? '🌌 最佳深空拍攝良夜' : '🌙 建議觀測明亮行星'}
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Selected Star or Constellation Details Bottom Drawer Overlay (Collapsible & Dismissible) */}
        {(selectedConstellation || selectedStarTarget) && arViewMode === 'stars' && (() => {
          const currentTarget = selectedStarTarget;
          if (!selectedConstellation && !currentTarget) return null;
          if (currentTarget && currentTarget.id === dismissedStarId) return null;

          return (
            <div 
              data-testid="star-drawer" 
              className={`z-30 transition-all animate-in slide-in-from-bottom duration-150 ${
                isBottomDeckCollapsed
                  ? 'absolute bottom-2.5 left-1/2 -translate-x-1/2 max-w-[92vw] pointer-events-auto'
                  : 'px-3.5 py-2 bg-black/45 backdrop-blur-xl border-t border-white/20 text-xs shadow-2xl'
              }`}
            >
              {isStarDrawerCollapsed ? (
                // Collapsed 1-line pill (當底列收合時，呈現為極簡透明懸浮膠囊)
                <div className={`flex items-center justify-between gap-2 ${
                  isBottomDeckCollapsed
                    ? 'px-3.5 py-1.5 rounded-full bg-slate-950/90 backdrop-blur-md border border-white/25 shadow-2xl text-xs'
                    : ''
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{selectedConstellation ? selectedConstellation.icon : currentTarget.icon}</span>
                    <strong className="text-white font-bold truncate">
                      {selectedConstellation ? selectedConstellation.name : currentTarget.name}
                    </strong>
                    {selectedConstellation ? (
                      <span className="text-sky-300 font-mono text-[11px]">{selectedConstellation.season} · {selectedConstellation.visibleStars} 顆星在視野</span>
                    ) : (
                      <span className="text-emerald-300 font-mono text-[11px]">仰角 {currentTarget.elevation}° / 方位 {currentTarget.azimuth}°</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsStarDrawerCollapsed(false)}
                      className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-[11px] font-bold transition-all hover:bg-indigo-500/30 active:scale-95"
                    >
                      ▲ 展開詳情
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentTarget) setDismissedStarId(currentTarget.id);
                        setSelectedConstellation(null);
                        setSelectedStarTarget(null);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white font-bold transition-all text-[11px]"
                      title="隱藏目前天體字卡"
                    >
                      ✕ 隱藏
                    </button>
                  </div>
                </div>
              ) : (
                // Full Expanded Glass Card
                <div className={`flex items-start justify-between gap-2.5 max-h-52 overflow-y-auto ${
                  isBottomDeckCollapsed
                    ? 'p-3 rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/25 shadow-2xl max-w-xl'
                    : ''
                }`}>
                  {selectedConstellation ? (
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-lg shrink-0 shadow-md border border-white/20 mt-0.5">
                        {selectedConstellation.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <strong className="text-sm font-black text-white">{selectedConstellation.name}</strong>
                          <span className="text-slate-400 font-mono italic text-[11px]">
                            {selectedConstellation.latin}
                          </span>
                          <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 font-bold border border-sky-400/30 text-[11px]">
                            {selectedConstellation.season}
                          </span>
                          <span className="text-emerald-400 font-mono font-bold text-[11px]">
                            {selectedConstellation.visibleStars} / {selectedConstellation.stars.length} 顆星在視野內
                          </span>
                        </div>
                        <p className="text-slate-200 text-xs mt-1 leading-relaxed break-words">
                          {selectedConstellation.story}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center text-lg shrink-0 shadow-md border border-white/20 mt-0.5">
                        {currentTarget.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <strong className="text-sm font-black text-white">{currentTarget.name}</strong>
                          <span className="px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-400/30 text-[11px]">
                            {currentTarget.constellation}
                          </span>
                          <span className="text-slate-300 font-mono text-[11px]">
                            視星等：{currentTarget.mag}
                          </span>
                          <span className="text-emerald-400 font-mono font-bold text-[11px]">
                            仰角 {currentTarget.elevation}° / 方位 {currentTarget.azimuth}°
                          </span>
                        </div>
                        <p className="text-slate-200 text-xs mt-1 leading-relaxed break-words">
                          {currentTarget.story}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    <button
                      type="button"
                      onClick={() => setIsStarDrawerCollapsed(true)}
                      className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white font-bold transition-all text-[11px]"
                      title="縮小為單行"
                    >
                      ▼ 縮小
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentTarget) setDismissedStarId(currentTarget.id);
                        setSelectedConstellation(null);
                        setSelectedStarTarget(null);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white font-bold transition-all text-[11px]"
                      title="隱藏天體說明字卡"
                    >
                      ✕ 隱藏
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Selected Mountain Peak Drawer Overlay (Collapsible & Dismissible) */}
        {arViewMode === 'mountain' && (() => {
          // 📱 在橫向遠山極致沉浸模式下，準心掠過山峰不自動彈出大字卡，維持 100% 開闊視野；
          // 只有當使用者在畫面上主動點選特定山峰 (selectedPeak) 時才顯示
          const currentPeak = effectiveLandscape ? selectedPeak : (selectedPeak || lockedPeak);
          if (!currentPeak) return null;
          if (currentPeak.id === dismissedPeakId) return null;

          return (
            <div 
              data-testid="mountain-drawer" 
              className={`z-30 transition-all animate-in slide-in-from-bottom duration-150 ${
                effectiveLandscape && isBottomDeckCollapsed
                  ? 'absolute bottom-2.5 left-1/2 -translate-x-1/2 max-w-[92vw] pointer-events-auto'
                  : 'px-3.5 py-2.5 bg-black/45 backdrop-blur-xl border-t border-white/20 text-xs shadow-2xl'
              }`}
            >
              {isPeakDrawerCollapsed ? (
                // Collapsed 1-line pill (在橫向底列隱藏時，呈現為極簡透明懸浮膠囊)
                <div className={`flex items-center justify-between gap-2 ${
                  effectiveLandscape && isBottomDeckCollapsed
                    ? 'px-3.5 py-1.5 rounded-full bg-slate-950/90 backdrop-blur-md border border-white/25 shadow-2xl text-xs'
                    : ''
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">⛰️</span>
                    <strong className="text-white font-bold truncate">{currentPeak.name}</strong>
                    <span className="text-emerald-300 font-mono text-[11px]">{currentPeak.altitudeM}m · {currentPeak.distKm}km</span>
                    <span className="text-slate-300 font-mono text-[11px] hidden sm:inline">方位 {currentPeak.azimuth}°</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsPeakDrawerCollapsed(false)}
                      className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[11px] font-bold transition-all hover:bg-emerald-500/30 active:scale-95"
                    >
                      ▲ 展開詳情
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedPeakId(currentPeak.id);
                        setSelectedPeak(null);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white font-bold transition-all text-[11px]"
                      title="隱藏目前山峰字卡"
                    >
                      ✕ 隱藏
                    </button>
                  </div>
                </div>
              ) : (
                // Expanded full details with transparent glass
                <div className={`flex items-start justify-between gap-2.5 ${
                  effectiveLandscape && isBottomDeckCollapsed
                    ? 'p-3 rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/25 shadow-2xl max-w-xl'
                    : ''
                }`}>
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600/80 to-teal-500/80 flex items-center justify-center text-lg shrink-0 shadow-md border border-white/20 mt-0.5">
                      {currentPeak.icon || '⛰️'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-sm font-black text-white">{currentPeak.name}</strong>
                        <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30 text-[11px]">
                          海拔 {currentPeak.altitudeM}m
                        </span>
                        <span className="text-amber-300 font-mono font-bold text-[11px]">
                          距此 {currentPeak.distKm} km
                        </span>
                        <span className="text-slate-200 font-mono text-[11px]">
                          方位 {currentPeak.azimuth}° ({currentPeak.azimuthDir})
                        </span>
                        <span className="text-sky-300 font-mono text-[11px]">
                          視線仰角 {currentPeak.apparentElevation > 0 ? `+${currentPeak.apparentElevation}°` : `${currentPeak.apparentElevation}°`}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-white/10 text-slate-200 text-[10px]">
                          {currentPeak.range}
                        </span>
                      </div>
                      <p className="text-slate-200 text-xs mt-1 leading-relaxed break-words opacity-95">
                        {currentPeak.desc}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button
                      type="button"
                      onClick={() => setIsPeakDrawerCollapsed(true)}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-bold transition-all"
                      title="縮小為單行"
                    >
                      ▼ 縮小
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedPeakId(currentPeak.id);
                        setSelectedPeak(null);
                      }}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white font-bold transition-all text-[11px]"
                      title="隱藏目前山峰字卡"
                    >
                      ✕ 隱藏
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Selected POI (Trail / Waterfall / Viewpoint) Drawer Overlay (Collapsible & Dismissible) */}
        {arViewMode === 'spots' && (() => {
          const currentPoi = effectiveLandscape ? selectedPoi : (selectedPoi || lockedPoi);
          if (!currentPoi) return null;
          if (currentPoi.id === dismissedPoiId) return null;

          const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${currentPoi.latitude},${currentPoi.longitude}`;

          return (
            <div 
              data-testid="poi-drawer" 
              className={`z-30 transition-all animate-in slide-in-from-bottom duration-150 ${
                effectiveLandscape && isBottomDeckCollapsed
                  ? 'absolute bottom-2.5 left-1/2 -translate-x-1/2 max-w-[92vw] pointer-events-auto'
                  : 'px-3.5 py-2.5 bg-black/55 backdrop-blur-xl border-t border-cyan-500/40 text-xs shadow-2xl'
              }`}
            >
              {isPoiDrawerCollapsed ? (
                // Collapsed 1-line pill
                <div className={`flex items-center justify-between gap-2 ${
                  effectiveLandscape && isBottomDeckCollapsed
                    ? 'px-3.5 py-1.5 rounded-full bg-slate-950/90 backdrop-blur-md border border-cyan-400/30 shadow-2xl text-xs'
                    : ''
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">{currentPoi.icon || '🌲'}</span>
                    <strong className="text-white font-bold truncate">{currentPoi.name}</strong>
                    <span className="text-cyan-300 font-mono text-[11px] shrink-0">
                      {currentPoi.type === 'waterfall' ? '💧 瀑布' : currentPoi.type === 'trail' ? '🥾 步道' : currentPoi.type === 'viewpoint' ? '🌅 展望' : '🌲 景點'}
                    </span>
                    <span className="text-amber-300 font-mono text-[11px] shrink-0">距此 {currentPoi.distanceKm}km</span>
                    <span className="text-slate-300 font-mono text-[11px] hidden sm:inline shrink-0">方位 {currentPoi.azimuth}°</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsPoiDrawerCollapsed(false)}
                      className="px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 text-[11px] font-bold transition-all hover:bg-cyan-500/30 active:scale-95"
                    >
                      ▲ 展開詳情
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedPoiId(currentPoi.id);
                        setSelectedPoi(null);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white font-bold transition-all text-[11px]"
                      title="隱藏目前景點字卡"
                    >
                      ✕ 隱藏
                    </button>
                  </div>
                </div>
              ) : (
                // Expanded full details with transparent glass
                <div className={`flex items-start justify-between gap-2.5 ${
                  effectiveLandscape && isBottomDeckCollapsed
                    ? 'p-3 rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-cyan-400/30 shadow-2xl max-w-xl'
                    : ''
                }`}>
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600/80 to-blue-600/80 flex items-center justify-center text-xl shrink-0 shadow-md border border-cyan-300/40 mt-0.5">
                      {currentPoi.icon || '🌲'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-sm font-black text-white">{currentPoi.name}</strong>
                        <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30 text-[11px]">
                          {currentPoi.type === 'waterfall' ? '💧 瀑布野溪' : currentPoi.type === 'trail' ? '🥾 健行步道' : currentPoi.type === 'viewpoint' ? '🌅 景觀展望' : '🌲 秘境景點'}
                        </span>
                        <span className="text-amber-300 font-mono font-bold text-[11px]">
                          距此 {currentPoi.distanceKm} km
                        </span>
                        <span className="text-slate-200 font-mono text-[11px]">
                          方位 {currentPoi.azimuth}° ({currentPoi.azimuthDir})
                        </span>
                        {currentPoi.travelTime && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-sky-300 font-semibold text-[10px]">
                            {currentPoi.travelTime}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-200 text-xs mt-1 leading-relaxed break-words opacity-95">
                        {currentPoi.highlights}
                      </p>
                      {currentPoi.safetyWarning && (
                        <p className="text-amber-300 text-[11px] mt-0.5 flex items-center gap-1">
                          <span>⚠️ 安全提示：</span>
                          <span>{currentPoi.safetyWarning}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    <a
                      href={gmapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black rounded-lg shadow-md transition-all flex items-center gap-1 text-[11px]"
                    >
                      <span>🧭</span>
                      <span>Google 導航</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setIsPoiDrawerCollapsed(true)}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-bold transition-all"
                      title="縮小為單行"
                    >
                      ▼ 縮小
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedPoiId(currentPoi.id);
                        setSelectedPoi(null);
                      }}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white font-bold transition-all text-[11px]"
                      title="隱藏目前景點字卡"
                    >
                      ✕ 隱藏
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 📱 橫向遠山/景點極致沉浸模式 或 星空沉浸模式：若工具列收合，僅在左下角保留微型展開膠囊 */}
        {(((effectiveLandscape && (arViewMode === 'mountain' || arViewMode === 'spots')) || arViewMode === 'stars') && isBottomDeckCollapsed) ? (
          <div 
            style={{ 
              bottom: 'max(12px, env(safe-area-inset-bottom))', 
              left: 'max(12px, env(safe-area-inset-left))', 
              zIndex: 40 
            }}
            className="absolute pointer-events-auto animate-in fade-in duration-150"
          >
            <button
              type="button"
              onClick={() => setIsBottomDeckCollapsed(false)}
              className={`px-3 py-1.5 bg-slate-950/85 hover:bg-slate-900 backdrop-blur-md rounded-full text-xs font-bold shadow-xl flex items-center gap-1.5 transition-all active:scale-95 border ${
                arViewMode === 'stars' 
                  ? 'text-indigo-300 border-indigo-400/40 hover:border-indigo-400' 
                  : arViewMode === 'spots'
                  ? 'text-cyan-300 border-cyan-400/40 hover:border-cyan-400'
                  : 'text-emerald-300 border-emerald-400/40 hover:border-emerald-400'
              }`}
              title={arViewMode === 'stars' ? "展開觀星控制工具列" : arViewMode === 'spots' ? "展開景點控制工具列" : "展開遠山控制工具列"}
            >
              <span>{arViewMode === 'stars' ? '🌌 觀星工具列 ▲' : arViewMode === 'spots' ? '🧭 景點工具列 ▲' : '⛰️ 工具列 ▲'}</span>
            </button>
          </div>
        ) : (
          /* Bottom Floating Control Deck (Glassmorphism & Collapsible) */
          <div className="z-30 px-3.5 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] bg-slate-950/75 backdrop-blur-xl border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-2 animate-in slide-in-from-bottom duration-150">
          
          {/* Left Controls: Season selector (Sun mode) VS Distance selector (Mountain mode) VS Spots selector VS Time simulator (Star mode) */}
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
          ) : arViewMode === 'spots' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-cyan-300">🧭 探索半徑：</span>
              <div className="bg-slate-800 p-1 rounded-xl flex gap-1 border border-cyan-500/30">
                {[
                  { dist: 3, label: '周邊 3km' },
                  { dist: 5, label: '近郊 5km' },
                  { dist: 15, label: '車程 15km' },
                  { dist: 25, label: '廣域 25km' }
                ].map(item => (
                  <button
                    key={item.dist}
                    onClick={() => setPoiMaxDistance(item.dist)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      poiMaxDistance === item.dist
                        ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-black shadow-md'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : arViewMode === 'mountain' ? (
            showPeakControls ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-emerald-300">⛰️ 辨識範圍半徑：</span>
                <div className="bg-black/50 backdrop-blur-md p-1 rounded-xl flex gap-1 border border-white/20">
                  {[
                    { dist: 25, label: '近景 25km' },
                    { dist: 50, label: '中景 50km' },
                    { dist: 80, label: '遠眺 80km' }
                  ].map(item => (
                    <button
                      key={item.dist}
                      onClick={() => setPeakMaxDistance(item.dist)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        peakMaxDistance === item.dist
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md font-black'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPeakControls(false)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold transition-all"
                  title="隱藏辨識半徑面板"
                >
                  ▼ 隱藏半徑
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPeakControls(true)}
                  className="px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 text-emerald-300 border border-white/20 backdrop-blur-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                  title="點擊展開辨識半徑與設定"
                >
                  <span>⛰️ 辨識半徑：{peakMaxDistance}km</span>
                  <span className="text-amber-400 text-[10px]">▲ 展開半徑設定</span>
                </button>
              </div>
            )
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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {arViewMode === 'mountain' && (
              <button
                type="button"
                onClick={() => setShowRidgeLines(v => !v)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs shadow transition-all flex items-center gap-1.5 border ${
                    showRidgeLines
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  <span>✨ 山稜天際線</span>
                  <span className="font-mono text-xs px-1.5 py-0.2 rounded-full bg-slate-950/60 text-amber-300">
                    {showRidgeLines ? 'ON' : 'OFF'}
                  </span>
                </button>
            )}
            {arViewMode === 'spots' && (
              <button
                type="button"
                onClick={handleRefreshSpots}
                disabled={loadingSpots}
                className={`px-3.5 py-1.5 border font-black text-xs rounded-xl shadow transition-all flex items-center gap-1.5 ${
                  cooldownRemainingMin > 0
                    ? 'bg-amber-950/80 hover:bg-amber-900 border-amber-400/40 text-amber-200'
                    : 'bg-cyan-950/80 hover:bg-cyan-900 border-cyan-400/40 text-cyan-200 hover:text-white'
                }`}
                title={cooldownRemainingMin > 0 ? `原地冷卻中（尚餘 ${cooldownRemainingMin} 分鐘，位移滿 500m 自動解除）` : '重新查詢最新營區周邊步道與瀑布秘境'}
              >
                <span className={loadingSpots ? 'animate-spin' : ''}>🔄</span>
                <span>{loadingSpots ? '查詢中...' : cooldownRemainingMin > 0 ? `即時查詢 (${cooldownRemainingMin}m)` : '即時查詢'}</span>
              </button>
            )}
            {arViewMode === 'stars' && (
              <button
                type="button"
                onClick={() => setShowConstellationLines(v => !v)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs shadow transition-all flex items-center gap-1.5 border ${
                  showConstellationLines
                    ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white border-sky-400/50 shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <span>✨ 星座連線</span>
                <span className="font-mono text-xs px-1.5 py-0.2 rounded-full bg-slate-950/60 text-amber-300">
                  {showConstellationLines ? 'ON' : 'OFF'}
                </span>
              </button>
            )}
            {!permissionGranted && typeof DeviceOrientationEvent !== 'undefined' && (
              <button
                onClick={handleRequestMotionPermission}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1"
              >
                🧭 啟動陀螺儀權限
              </button>
            )}
            {arViewMode === 'stars' && (
              <button
                type="button"
                onClick={() => setShowStargazingGuide(true)}
                className="px-3.5 py-1.5 bg-indigo-900/80 hover:bg-indigo-800 border border-indigo-400/40 text-indigo-100 hover:text-white font-black text-xs rounded-xl shadow transition-all flex items-center gap-1"
              >
                <span>📖 觀星指南</span>
              </button>
            )}
            {arViewMode === 'spots' && isSpotsBannerDismissed && !effectiveLandscape && (
              <button
                type="button"
                onClick={() => setIsSpotsBannerDismissed(false)}
                className="px-2.5 py-1.5 border border-white/20 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1"
                title="重新顯示頂部景點橫幅"
              >
                <span>🧭 顯示橫幅</span>
              </button>
            )}
            {(((effectiveLandscape && (arViewMode === 'mountain' || arViewMode === 'spots')) || arViewMode === 'stars')) && (
              <button
                type="button"
                onClick={() => setIsBottomDeckCollapsed(true)}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-slate-200 hover:text-white text-xs font-bold transition-all border border-white/20 active:scale-95"
                title="隱藏底部控制工具列以最大化視野"
              >
                ▼ 隱藏工具列
              </button>
            )}
            {isHeaderCollapsed && (
              <button
                type="button"
                onClick={() => setIsHeaderCollapsed(false)}
                className="px-3.5 sm:px-4 py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center gap-1 active:scale-95 border border-amber-300 cursor-pointer"
                title="展開頂部控制列"
              >
                <span>▲ 展開頂部選單</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 sm:px-5 py-1.5 bg-white text-slate-950 hover:bg-slate-200 font-black text-xs rounded-xl shadow transition-colors"
            >
              完成關閉
            </button>
          </div>

        </div>
        )}

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

        {/* 💨 Beaufort Wind & Structural Safety Alert Modal */}
        {showWindSafetyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-lg animate-in fade-in duration-150">
            <div className="relative w-full max-w-3xl max-h-[92vh] bg-slate-900 border border-amber-500/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
              
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-white/10 bg-slate-900/95 flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl sm:text-3xl">💨</span>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <span>露營帳篷防風與斷柱安全評估</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
                        蒲福風級 {windSafety.beaufort} 級
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      當前營地實測：<strong className="text-sky-300 font-mono">{windSpeed} km/h</strong> · 來風方位：<strong className="text-amber-300 font-mono">{windDir}° ({getHeadingDirectionName(windDir)})</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowWindSafetyModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all border border-slate-700"
                >
                  ✕ 關閉
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs sm:text-sm">
                
                {/* 1. Current Live Status Banner */}
                <div className={`p-4 rounded-2xl border ${windSafety.bannerBg} flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl">
                        {windSafety.riskLevel === 'critical' ? '☠️' : windSafety.riskLevel === 'high' ? '🚨' : windSafety.riskLevel === 'medium' ? '⚠️' : '🟢'}
                      </span>
                      <h4 className="font-black text-sm sm:text-base text-white">
                        {windSafety.riskTitle}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-black ${windSafety.badgeColor}`}>
                        {windSafety.statusTag}
                      </span>
                    </div>
                    <p className="text-xs opacity-90 leading-relaxed">
                      {windSafety.gearAdvice}
                    </p>
                  </div>
                  {windSafety.planB && (
                    <div className="shrink-0 bg-slate-950/80 px-3 py-2 rounded-xl border border-white/10 text-xs">
                      <strong className="text-amber-400 block mb-0.5">💡 應變建議：</strong>
                      <span className="text-slate-200">{windSafety.planB}</span>
                    </div>
                  )}
                </div>

                {/* 2. Specific Structural Consequences (Why tents collapse) */}
                <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 space-y-2.5">
                  <h4 className="font-black text-amber-300 flex items-center gap-2 text-xs sm:text-sm">
                    <span>💥 強風搭帳物理危機與毀損後果分析</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {windSafety.consequences.map((item, idx) => (
                      <div key={idx} className="bg-slate-900/80 p-3 rounded-xl border border-white/5 flex items-start gap-2">
                        <span className="text-amber-400 font-bold shrink-0">·</span>
                        <span className="text-slate-200 leading-relaxed">{item}</span>
                      </div>
                    ))}
                    <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 flex items-start gap-2">
                      <span className="text-rose-400 font-bold shrink-0">·</span>
                      <span className="text-slate-200 leading-relaxed">
                        <strong>天幕風箏危機</strong>：天幕受風面積大、重心高，達到 5 級風（&gt;30km/h）即需降至 1.8m 以下；6 級風必須果斷撤收，嚴防拔釘砸車傷人。
                      </span>
                    </div>
                    <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 flex items-start gap-2">
                      <span className="text-rose-400 font-bold shrink-0">·</span>
                      <span className="text-slate-200 leading-relaxed">
                        <strong>帳門面風暴衝</strong>：帳門若正對來風，氣流灌入底部形成巨大膨脹正壓，拉鍊爆開、骨架自內部被向外折斷、營釘被整顆拔起。
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Beaufort Wind Scale & Camping Feasibility Table (CWA Standard) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="font-black text-slate-200 flex items-center gap-2 text-xs sm:text-sm">
                      <span>📊 蒲福風級 ✕ 露營搭帳安全規範對照表</span>
                    </h4>
                    <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-700 text-[11px]">
                      <button
                        onClick={() => setWindTableTab('summary')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                          windTableTab === 'summary' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        4 階實戰指南
                      </button>
                      <button
                        onClick={() => setWindTableTab('full')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                          windTableTab === 'full' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        氣象署 0~12 級全量表
                      </button>
                    </div>
                  </div>

                  {windTableTab === 'summary' ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-700">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-800/90 text-slate-300 border-b border-slate-700 font-bold">
                          <tr>
                            <th className="p-2.5">蒲福風級</th>
                            <th className="p-2.5">時速 (km/h)</th>
                            <th className="p-2.5">搭帳可行性</th>
                            <th className="p-2.5">裝備極限與具體後果</th>
                            <th className="p-2.5">應變處置</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          <tr className="hover:bg-slate-800/40">
                            <td className="p-2.5 font-bold text-emerald-400">0 ~ 3 級微風</td>
                            <td className="p-2.5 font-mono">0 ~ 19</td>
                            <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold">🟢 安全無虞</span></td>
                            <td className="p-2.5">任何帳篷與大天幕皆無壓力，單人輕鬆搭設。</td>
                            <td className="p-2.5 text-slate-400">順應日照防曬搭設即可。</td>
                          </tr>
                          <tr className="hover:bg-slate-800/40">
                            <td className="p-2.5 font-bold text-amber-300">4 ~ 5 級和風/清風</td>
                            <td className="p-2.5 font-mono">20 ~ 38</td>
                            <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 font-bold">🟡 需加固防風</span></td>
                            <td className="p-2.5">天幕劇烈晃動，單人搭帳有困難；細鋁釘易鬆脫。</td>
                            <td className="p-2.5 text-amber-200">換 28~30cm 鍛造釘，營繩 45° 斜拉，天幕降至 180cm。</td>
                          </tr>
                          <tr className="hover:bg-slate-800/40 bg-orange-950/20">
                            <td className="p-2.5 font-bold text-orange-400">6 級強風 (臨界點)</td>
                            <td className="p-2.5 font-mono">39 ~ 49</td>
                            <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-orange-950 text-orange-300 font-bold">🟠 不建議搭帳</span></td>
                            <td className="p-2.5 text-orange-200"><strong>穿桿頂柱瞬間極易折斷營柱！</strong>天幕極易拔釘翻車，客廳帳側柱易被壓扁。</td>
                            <td className="p-2.5 text-orange-300">嚴禁搭天幕；建議改移入雨棚營位或車宿避風。</td>
                          </tr>
                          <tr className="hover:bg-slate-800/40 bg-rose-950/30">
                            <td className="p-2.5 font-bold text-rose-400">7 級以上疾風/烈風</td>
                            <td className="p-2.5 font-mono">≥ 50</td>
                            <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 font-black animate-pulse">🔴 嚴禁搭帳</span></td>
                            <td className="p-2.5 text-rose-200"><strong>物理上根本無法搭好！</strong>帳布撕裂、拉鍊爆開、骨架斷裂刺破帳布、營釘如砲彈飛射。</td>
                            <td className="p-2.5 text-rose-300 font-bold">立即延期、取消行程或就近實體建築避難！</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-700 max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-800/95 text-slate-300 border-b border-slate-700 font-bold sticky top-0 z-10 backdrop-blur-sm">
                          <tr>
                            <th className="p-2">級數</th>
                            <th className="p-2">氣象署標準名稱</th>
                            <th className="p-2">風速 (km/h)</th>
                            <th className="p-2">風速 (m/s)</th>
                            <th className="p-2">露營安全性評估</th>
                            <th className="p-2">物理徵兆與影響</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                          {BEAUFORT_SCALE_TABLE.map(row => (
                            <tr key={row.scale} className="hover:bg-slate-800/40 font-sans">
                              <td className="p-2 font-bold font-mono text-center text-amber-300">{row.scale}</td>
                              <td className="p-2 font-bold text-white">{row.name}</td>
                              <td className="p-2 font-mono text-sky-300">{row.kmhRange}</td>
                              <td className="p-2 font-mono text-slate-400">{row.msRange}</td>
                              <td className="p-2 font-semibold">{row.campRating}</td>
                              <td className="p-2 text-slate-400">{row.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 4. Golden Rules for Pitching in Wind */}
                <div className="bg-amber-950/30 p-4 rounded-2xl border border-amber-500/30 space-y-2">
                  <h4 className="font-bold text-amber-300 flex items-center gap-1.5 text-xs sm:text-sm">
                    <span>🧭 四大破風防倒致命心法（AR 智慧破風原則）</span>
                  </h4>
                  <ul className="list-disc pl-4 space-y-1.5 text-slate-300 leading-relaxed text-xs">
                    <li>
                      <strong>長軸平行破風（最關鍵）</strong>：隧道帳或一房一廳帳，務必讓「圓弧低矮臀部」迎向來風（即方位 {windDir}°），長軸順著氣流破風，嚴禁側身大面積受風。
                    </li>
                    <li>
                      <strong>帳門絕對背風</strong>：帳門開口務必朝向下風處（即方位 {recommendedDoorAzimuth}°），防止強陣風灌入帳內產生降落傘膨脹效應爆開拉鍊。
                    </li>
                    <li>
                      <strong>天幕降高破風</strong>：風大時主柱降低 30~50cm，兩側側翼斜拉貼近地面呈低風阻斜頂，讓風從斜面滑過。
                    </li>
                    <li>
                      <strong>30cm 鍛造釘 + 交叉反向打釘</strong>：營釘與地面呈 60° 斜角，與營繩成 90° 垂直拉力；土質鬆軟時使用雙釘交叉打入加倍抓地力。
                    </li>
                  </ul>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3 border-t border-white/10 bg-slate-900/95 flex justify-between items-center text-xs text-slate-400">
                <span>根據中央氣象署與國際戶外登山安全標準制定</span>
                <button
                  onClick={() => setShowWindSafetyModal(false)}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black rounded-xl shadow transition-all"
                >
                  我知道了 · 返回 AR
                </button>
              </div>

            </div>
          </div>
        )}

        {/* 📱 Mobile Fullscreen Immersive Guide Modal (iPhone & Android 滿版沉浸教學) */}
        {showFullscreenGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-lg animate-in fade-in duration-150">
            <div className="relative w-full max-w-xl max-h-[92vh] bg-slate-900 border border-teal-500/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
              
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-white/10 bg-slate-900/95 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl sm:text-3xl">📱</span>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <span>手機 100% 滿版全螢幕教學</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-400 text-slate-950 font-black">
                        iOS ✕ Android
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      徹底消除瀏覽器白色網址列，享受零黑邊、如原生 App 的沉浸 AR！
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFullscreenGuide(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all border border-slate-700"
                >
                  ✕ 關閉
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
                
                {/* 1. iPhone (iOS Safari) Section */}
                <div className="p-4 rounded-2xl bg-slate-800/80 border border-white/10 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-amber-300 flex items-center gap-2 text-sm sm:text-base">
                      <span>🍎 iPhone (iOS Safari) 專用教學</span>
                    </h4>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      最推薦 · 100% 消除網址列
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    因 Apple iOS 系統安全機制，一般網頁無法直接覆蓋瀏覽器網址列。只要使用系統內建的「加入主畫面」，即可啟動純原生 PWA 模式：
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
                      <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <p className="text-xs text-slate-200">
                        點擊 iPhone Safari 底部工具列正中央的 <strong>「分享按鈕（方形向上箭頭 ⎋）」</strong>。
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
                      <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <p className="text-xs text-slate-200">
                        在選單列表中往下滑動，點選 <strong>「加入主畫面 (Add to Home Screen)」</strong> 並按右上角「新增」。
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
                      <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <p className="text-xs text-slate-200">
                        回到手機桌面，點擊 <strong>「台灣露營 AR」</strong> 圖示開啟 ➜ <strong>底部的白色網址列與頂部全部徹底消失</strong>！相機實景 100% 滿版延伸至螢幕圓角，如同原生相機與 SkyView！
                      </p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-2">
                    <span>💡</span>
                    <span><strong>免加桌面的偷吃步：</strong>在 Safari 畫面中用手指<strong>向上輕輕滑動一下</strong>，底部的白色網址列也會自動最小化收縮。</span>
                  </div>
                </div>

                {/* 2. Android Section */}
                <div className="p-4 rounded-2xl bg-slate-800/80 border border-white/10 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-teal-300 flex items-center gap-2 text-sm sm:text-base">
                      <span>🤖 Android (Chrome / 瀏覽器) 專用教學</span>
                    </h4>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-400/20 text-teal-300 border border-teal-400/30">
                      一鍵全螢幕
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
                      <span className="w-5 h-5 rounded-full bg-teal-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">A</span>
                      <p className="text-xs text-slate-200">
                        <strong>一鍵切換：</strong>直接點擊頂部的 <strong>「⛶ 全螢幕」</strong> 按鈕，系統將自動將網址列與虛擬鍵隱藏。
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
                      <span className="w-5 h-5 rounded-full bg-teal-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">B</span>
                      <p className="text-xs text-slate-200">
                        <strong>加到桌面：</strong>點選 Chrome 右上角選單 <strong>「⋮」</strong> ➜ 選擇 <strong>「安裝應用程式」</strong> 或 <strong>「加到主螢幕」</strong>，隨開隨用零黑邊！
                      </p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3 border-t border-white/10 bg-slate-900/95 flex justify-end items-center">
                <button
                  onClick={() => setShowFullscreenGuide(false)}
                  className="px-5 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-black rounded-xl shadow-lg transition-all active:scale-95 text-xs sm:text-sm"
                >
                  我知道了 · 立即體驗
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
