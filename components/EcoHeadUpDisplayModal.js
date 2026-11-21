'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';

/**
 * ⚡ EcoHeadUpDisplayModal (極簡節能車載抬頭顯示器 - Eco HUD)
 *
 * 專為手機放置於汽車儀表板 / 前擋風玻璃設計的極致省電 HUD：
 * 1. 零 GPX 磁碟負擔：不寫入 IndexedDB / localStorage，純記憶體即時運算，極致省電與無發熱。
 * 2. OLED True Black 純黑背景 (#000000)：OLED 黑色像素完全斷電（0 功耗），發光面積 < 6%。
 * 3. 視覺極限最大化：中央為超大巨幅數位車速 (km/h)，無任何沉重指針或耗電 SVG 旋轉。
 * 4. 必備行車四指標：即時車速、路段坡度 (% / °)、縱向加速度 (G-Force)、當前海拔 (m)、累積里程 (km)。
 * 5. 🪞 擋風玻璃投影鏡像模式：一鍵左右反轉 (scaleX(-1))，手機平放儀表板反射在前擋風玻璃即為正像。
 * 6. ☀️ 螢幕常亮防休眠：整合 Screen Wake Lock API 與原生 WKWebView 橋接。
 */

// 輕量 Haversine 計算相鄰兩點球面距離（公尺）
function calcHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 地球半徑 (m)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 主題色彩配置 (皆基於 #000000 OLED 極致純黑，並提供擋風玻璃超亮高對比螢光色票)
const THEMES = {
  green: {
    id: 'green',
    name: '戰機綠',
    icon: '🟢',
    accent: '#22FF88',
    maxAccent: '#00FF66',
    maxCore: '#DCFFE8',
    dimAccent: '#065F46',
    subText: '#86EFAC',
    badgeBorder: '#10B981',
    badgeBg: '#022C22',
    maxGlow: '0 0 8px rgba(255,255,255,0.8), 0 0 22px #00FF66, 0 0 46px rgba(0,255,102,0.85)'
  },
  amber: {
    id: 'amber',
    name: '航空金',
    icon: '🟡',
    accent: '#FFBE0B',
    maxAccent: '#FFE600',
    maxCore: '#FFFAD1',
    dimAccent: '#78350F',
    subText: '#FDE047',
    badgeBorder: '#F59E0B',
    badgeBg: '#451A03',
    maxGlow: '0 0 8px rgba(255,255,255,0.8), 0 0 22px #FFE600, 0 0 46px rgba(255,230,0,0.85)'
  },
  cyan: {
    id: 'cyan',
    name: '冰川藍',
    icon: '🔵',
    accent: '#00E5FF',
    maxAccent: '#00FFFF',
    maxCore: '#E0FFFF',
    dimAccent: '#164E63',
    subText: '#67E8F9',
    badgeBorder: '#06B6D4',
    badgeBg: '#083344',
    maxGlow: '0 0 8px rgba(255,255,255,0.85), 0 0 22px #00FFFF, 0 0 46px rgba(0,255,255,0.85)'
  },
  white: {
    id: 'white',
    name: '極致白',
    icon: '⚪',
    accent: '#FFFFFF',
    maxAccent: '#FFFFFF',
    maxCore: '#FFFFFF',
    dimAccent: '#475569',
    subText: '#E2E8F0',
    badgeBorder: '#94A3B8',
    badgeBg: '#0F172A',
    maxGlow: '0 0 10px rgba(255,255,255,0.95), 0 0 26px rgba(255,255,255,0.9), 0 0 50px rgba(255,255,255,0.65)'
  }
};

export default function EcoHeadUpDisplayModal({ isOpen, onClose }) {
  // 🎨 HUD 主題 (預設綠光螢光管)
  const [themeKey, setThemeKey] = useState('green');
  const theme = THEMES[themeKey] || THEMES.green;

  // 🪞 擋風玻璃鏡像模式 ('off' | 'vertical' | 'horizontal')
  // 光學原理：手機螢幕面朝上平放於儀表板時，若螢幕頂端朝擋風玻璃，反射在傾斜擋風玻璃上的像是「上下顛倒」而非左右反轉，故最自然平放應使用 scaleY(-1)
  const [mirrorMode, setMirrorMode] = useState('off'); // 'off' | 'vertical' | 'horizontal'

  // 🔆 三段式玻璃投影亮度模式 ('max' 超亮投影 | 'high' 標準明亮 | 'night' 夜間柔光防眩)
  const [brightnessMode, setBrightnessMode] = useState('high');
  const [hudNotice, setHudNotice] = useState(null);
  const hudNoticeTimerRef = useRef(null);

  const showHudNotice = (msg) => {
    setHudNotice(msg);
    if (hudNoticeTimerRef.current) {
      clearTimeout(hudNoticeTimerRef.current);
    }
    hudNoticeTimerRef.current = setTimeout(() => {
      setHudNotice(null);
      hudNoticeTimerRef.current = null;
    }, 3500);
  };

  useEffect(() => {
    return () => {
      if (hudNoticeTimerRef.current) {
        clearTimeout(hudNoticeTimerRef.current);
      }
    };
  }, []);

  // 🏎️ 即時行車數據 (純記憶體暫存)
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [altitudeM, setAltitudeM] = useState(null);
  const [gradePercent, setGradePercent] = useState(0.0);
  const [accelG, setAccelG] = useState(0.0);
  const [tripDistanceM, setTripDistanceM] = useState(0);
  const [tripSeconds, setTripSeconds] = useState(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState(0);

  // 📱 橫向 Landscape 與 直向 Portrait 監聽 (用於 iOS 動態島 / 安全區域最佳避讓)
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia ? window.matchMedia('(orientation: landscape)') : null;
    const checkLandscape = () => {
      const mqlLand = mql ? mql.matches : false;
      const ratioLand = window.innerWidth > window.innerHeight;
      const winOrient =
        typeof window.orientation !== 'undefined'
          ? Math.abs(window.orientation) === 90 || Math.abs(window.orientation) === 270
          : false;
      const screenAngle = window.screen?.orientation?.angle;
      const angleLand = screenAngle === 90 || screenAngle === 270;
      setIsLandscape(Boolean(mqlLand || ratioLand || winOrient || angleLand));
    };
    checkLandscape();
    window.addEventListener('resize', checkLandscape);
    window.addEventListener('orientationchange', checkLandscape);
    if (mql?.addEventListener) mql.addEventListener('change', checkLandscape);
    if (window.screen?.orientation?.addEventListener) {
      window.screen.orientation.addEventListener('change', checkLandscape);
    }
    return () => {
      window.removeEventListener('resize', checkLandscape);
      window.removeEventListener('orientationchange', checkLandscape);
      if (mql?.removeEventListener) mql.removeEventListener('change', checkLandscape);
      if (window.screen?.orientation?.removeEventListener) {
        window.screen.orientation.removeEventListener('change', checkLandscape);
      }
    };
  }, []);

  // 🌙 iOS 頂部狀態列純黑化 (防止白底或色差與 HUD 衝突)
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const origBodyBg = document.body.style.backgroundColor;
    const origHtmlBg = document.documentElement.style.backgroundColor;
    const origColorScheme = document.documentElement.style.colorScheme;

    document.body.style.backgroundColor = '#000000';
    document.documentElement.style.backgroundColor = '#000000';
    document.documentElement.style.colorScheme = 'dark';

    const existingThemeMetas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
    const prevThemeContent = existingThemeMetas[0]?.getAttribute('content') || '#f8fafc';
    existingThemeMetas.forEach((m) => m.parentNode?.removeChild(m));
    const freshThemeMeta = document.createElement('meta');
    freshThemeMeta.name = 'theme-color';
    freshThemeMeta.content = '#000000';
    document.head.appendChild(freshThemeMeta);

    return () => {
      document.body.style.backgroundColor = origBodyBg;
      document.documentElement.style.backgroundColor = origHtmlBg;
      document.documentElement.style.colorScheme = origColorScheme;
      const currentMetas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
      currentMetas.forEach((m) => m.parentNode?.removeChild(m));
      const restoreMeta = document.createElement('meta');
      restoreMeta.name = 'theme-color';
      restoreMeta.content = prevThemeContent;
      document.head.appendChild(restoreMeta);
    };
  }, [isOpen]);

  // 🤖 Android / 跨平台 HTML5 Fullscreen API 支援（自動進入沉浸式滿版，自動隱藏 Android 系統狀態列與三鍵虛擬導航列）
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {}

    return () => {
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (e) {}
    };
  }, [isOpen]);

  // 內部運算與濾波 Refs
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const prevPointRef = useRef(null);
  const recentPointsRef = useRef([]); // 滾動保留最近 4-6 個點用於坡度平滑計算
  const prevSpeedRef = useRef({ speedKmh: 0, timestamp: 0 });
  const tripDistanceRef = useRef(0);
  const maxSpeedRef = useRef(0);
  const isTripRunningRef = useRef(false);

  // ⏱️ 計時器
  useEffect(() => {
    if (!isOpen) return;
    isTripRunningRef.current = true;
    const timer = setInterval(() => {
      setTripSeconds((s) => s + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
      isTripRunningRef.current = false;
    };
  }, [isOpen]);

  // ☀️ Screen Wake Lock API & iOS Native Keep-Awake 橋接（進入省電 HUD 時恆常防休眠）
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    let cancelled = false;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        try {
          const sentinel = await navigator.wakeLock.request('screen');
          if (cancelled) {
            sentinel.release().catch(() => {});
          } else {
            wakeLockRef.current = sentinel;
            sentinel.addEventListener('release', () => {
              wakeLockRef.current = null;
            });
          }
        } catch (e) {}
      }

      // iOS Native App 橋接
      try {
        window.webkit?.messageHandlers?.keepAwakeHandler?.postMessage(true);
      } catch (e) {}
    };

    requestWakeLock();

    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVis);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      try {
        window.webkit?.messageHandlers?.keepAwakeHandler?.postMessage(false);
      } catch (e) {}
    };
  }, [isOpen]);

  // 🔆 iOS Native 原生螢幕亮度增亮橋接 (max 模式自動將硬體背光拉滿 100%，離開時自動復原)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldBoost = isOpen && brightnessMode === 'max';
    try {
      window.webkit?.messageHandlers?.hudBrightnessHandler?.postMessage(
        shouldBoost ? { boost: true, level: 1.0 } : { boost: false }
      );
    } catch (e) {}

    return () => {
      try {
        window.webkit?.messageHandlers?.hudBrightnessHandler?.postMessage({ boost: false });
      } catch (e) {}
    };
  }, [isOpen, brightnessMode]);

  // 🧭 輕量 GPS Geolocation 監聽 (純記憶體累加，零硬碟 I/O)
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !('geolocation' in navigator)) return;

    const handlePosition = (pos) => {
      const { latitude, longitude, altitude, speed, accuracy } = pos.coords;
      const now = pos.timestamp || Date.now();

      // 1. 車速計算 (若原生 speed 存在且 >= 0 則使用；否則使用前後座標推算)
      let liveSpeedKmh = 0;
      if (speed !== null && speed !== undefined && speed >= 0) {
        liveSpeedKmh = speed * 3.6;
      } else if (prevPointRef.current) {
        const dtSec = Math.max(0.4, (now - prevPointRef.current.timestamp) / 1000);
        const dDist = calcHaversineMeters(
          prevPointRef.current.lat,
          prevPointRef.current.lon,
          latitude,
          longitude
        );
        liveSpeedKmh = (dDist / dtSec) * 3.6;
      }

      // 靜態飄移濾波：若車速小於 1.2 km/h 或精度太差，歸零防抖動
      if (liveSpeedKmh < 1.2 || (accuracy && accuracy > 55)) {
        liveSpeedKmh = 0;
      }

      setCurrentSpeedKmh(Math.round(liveSpeedKmh));

      // 紀錄極速
      if (liveSpeedKmh > maxSpeedRef.current) {
        maxSpeedRef.current = liveSpeedKmh;
        setMaxSpeedKmh(Math.round(liveSpeedKmh));
      }

      // 2. 海拔更新 (濾除無效值)
      if (altitude !== null && altitude !== undefined && Number.isFinite(altitude)) {
        setAltitudeM(Math.round(altitude));
      }

      // 3. 即時加速度運算 (Δv / Δt)
      if (prevSpeedRef.current.timestamp > 0) {
        const dtSec = (now - prevSpeedRef.current.timestamp) / 1000;
        if (dtSec >= 0.4 && dtSec <= 4.0) {
          const dvMs = (liveSpeedKmh - prevSpeedRef.current.speedKmh) / 3.6;
          const aMs2 = dvMs / dtSec;
          const gVal = aMs2 / 9.80665;
          // 平滑鉗制在 ±1.5G 合理車輛範圍內
          if (Math.abs(gVal) <= 1.5) {
            setAccelG(Number(gVal.toFixed(2)));
          }
        }
      }
      prevSpeedRef.current = { speedKmh: liveSpeedKmh, timestamp: now };

      // 4. 累積里程與坡度運算
      if (prevPointRef.current) {
        const segDistM = calcHaversineMeters(
          prevPointRef.current.lat,
          prevPointRef.current.lon,
          latitude,
          longitude
        );

        // 僅在車速非靜止且移動距離合理時累加里程 (防 GPS 漂移)
        if (liveSpeedKmh >= 1.5 && segDistM >= 1.0 && segDistM <= 150) {
          tripDistanceRef.current += segDistM;
          setTripDistanceM(tripDistanceRef.current);
        }

        // 坡度計算 (以最近 3~5 個點的滑動視窗計算 Δ海拔 / Δ水平距離)
        recentPointsRef.current.push({
          distM: tripDistanceRef.current,
          altM: altitude !== null && Number.isFinite(altitude) ? altitude : null,
          time: now
        });
        if (recentPointsRef.current.length > 5) {
          recentPointsRef.current.shift();
        }

        const pts = recentPointsRef.current.filter((p) => p.altM !== null);
        if (pts.length >= 2) {
          const first = pts[0];
          const last = pts[pts.length - 1];
          const dX = last.distM - first.distM;
          const dY = last.altM - first.altM;
          if (dX >= 12) {
            const rawGrade = (dY / dX) * 100;
            // 鉗制一般公路在 -25% ~ +25% 之間
            const clampedGrade = Math.max(-25, Math.min(25, rawGrade));
            setGradePercent(Number(clampedGrade.toFixed(1)));
          }
        }
      } else {
        recentPointsRef.current.push({
          distM: 0,
          altM: altitude !== null && Number.isFinite(altitude) ? altitude : null,
          time: now
        });
      }

      prevPointRef.current = { lat: latitude, lon: longitude, timestamp: now, altitude };
    };

    const handleError = () => {};

    const options = {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    };

    const id = navigator.geolocation.watchPosition(handlePosition, handleError, options);
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isOpen]);

  // ⌨️ ESC 鍵退出監聽
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 🔄 手動重設當前所有狀態 (All States Reset: 車速、極速、里程、計時、坡度、加速度全歸零)
  const [isResetting, setIsResetting] = useState(false);
  const handleResetAll = () => {
    tripDistanceRef.current = 0;
    maxSpeedRef.current = 0;
    prevPointRef.current = null;
    recentPointsRef.current = [];
    prevSpeedRef.current = { speedKmh: 0, timestamp: 0 };

    setCurrentSpeedKmh(0);
    setMaxSpeedKmh(0);
    setTripDistanceM(0);
    setTripSeconds(0);
    setGradePercent(0.0);
    setAccelG(0.0);

    setIsResetting(true);
    setTimeout(() => {
      setIsResetting(false);
    }, 1200);
  };

  // 格式化耗時
  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const isMax = brightnessMode === 'max';
  const isNight = brightnessMode === 'night';
  const activeAccent = isMax ? theme.maxAccent : theme.accent;
  const activeCore = isMax ? theme.maxCore : theme.accent;
  const activeSubText = isMax ? '#FFFFFF' : theme.subText;
  const activeUnitColor = isMax ? '#E4E4E7' : isNight ? '#52525B' : '#71717A';
  const cardBg = isMax ? '#000000' : '#090909';
  const cardBorder = isMax ? '#141414' : '#1E1E1E';
  const dataOpacity = isNight ? 0.52 : 1;

  const handleToggleMirror = () => {
    const nextMirror =
      mirrorMode === 'off' ? 'vertical' : mirrorMode === 'vertical' ? 'horizontal' : 'off';
    setMirrorMode(nextMirror);
    if (mirrorMode === 'off' && nextMirror === 'vertical') {
      setBrightnessMode('max');
    } else if (nextMirror === 'off') {
      setBrightnessMode('high');
    }
  };

  const handleCycleBrightness = () => {
    const order = ['max', 'high', 'night'];
    const nextMode = order[(order.indexOf(brightnessMode) + 1) % order.length];
    setBrightnessMode(nextMode);

    const hasNativeBrightness =
      typeof window !== 'undefined' &&
      Boolean(window.webkit?.messageHandlers?.hudBrightnessHandler);

    if (nextMode === 'max') {
      showHudNotice(
        hasNativeBrightness
          ? '🔆 超亮投影 · 螢幕亮度 100%'
          : '🔆 超亮投影 · 請同時將手機系統亮度調至最大'
      );
    } else if (nextMode === 'high') {
      showHudNotice('☀️ 標準明亮模式');
    } else {
      showHudNotice('🌙 夜間柔光防眩模式');
    }
  };

  const gradeColor =
    gradePercent > 1.5
      ? isMax
        ? '#FF5C7C'
        : '#F43F5E'
      : gradePercent < -1.5
      ? isMax
        ? '#22FF88'
        : '#10B981'
      : activeCore;

  const accelColor =
    accelG > 0.05
      ? activeCore
      : accelG < -0.05
      ? isMax
        ? '#FF6B8B'
        : '#FB7185'
      : isMax
      ? '#FFFFFF'
      : '#A1A1AA';

  const metricCards = [
    {
      id: 'grade',
      label: '📐 坡度',
      enLabel: ' (GRADE)',
      valueText: gradePercent > 0 ? `+${gradePercent.toFixed(1)}` : `${gradePercent.toFixed(1)}`,
      unit: '%',
      valueColor: gradeColor,
      strokeColor: gradePercent > 1.5 ? '#FF2E5B' : activeAccent,
      subLabel: gradePercent > 1.5 ? '▲ 爬坡' : gradePercent < -1.5 ? '▼ 下坡' : '━ 平路',
      subMono: false
    },
    {
      id: 'accel',
      label: '⚡ 加速度',
      enLabel: ' (G-FORCE)',
      valueText: accelG > 0 ? `+${accelG.toFixed(2)}` : `${accelG.toFixed(2)}`,
      unit: 'G',
      valueColor: accelColor,
      strokeColor: accelG < -0.05 ? '#FF4D79' : activeAccent,
      subLabel: accelG > 0.08 ? '🚀 加速' : accelG < -0.08 ? '🛑 減速' : '🏎️ 等速',
      subMono: false
    },
    {
      id: 'trip',
      label: '📏 里程',
      enLabel: ' (TRIP)',
      valueText: (tripDistanceM / 1000).toFixed(2),
      unit: 'KM',
      valueColor: activeCore,
      strokeColor: activeAccent,
      subLabel: `⏱️ ${formatTime(tripSeconds)}`,
      subMono: true
    }
  ];

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        zIndex: 999999,
        backgroundColor: '#000000', // 嚴格 0 功耗 OLED 純黑
        paddingTop: isLandscape
          ? 'max(calc(env(safe-area-inset-top, 0px) + 6px), 10px)'
          : 'max(calc(env(safe-area-inset-top, 0px) + 12px), 54px)',
        paddingBottom: isLandscape
          ? 'max(calc(env(safe-area-inset-bottom, 0px) + 6px), 10px)'
          : 'max(calc(env(safe-area-inset-bottom, 0px) + 12px), 20px)',
        paddingLeft: isLandscape
          ? 'max(calc(env(safe-area-inset-left, 0px) + 12px), 16px)'
          : 'max(calc(env(safe-area-inset-left, 0px) + 6px), 14px)',
        paddingRight: isLandscape
          ? 'max(calc(env(safe-area-inset-right, 0px) + 12px), 16px)'
          : 'max(calc(env(safe-area-inset-right, 0px) + 6px), 14px)',
        transform:
          mirrorMode === 'vertical'
            ? 'scaleY(-1)'
            : mirrorMode === 'horizontal'
            ? 'scaleX(-1)'
            : 'none',
        transition: 'transform 0.25s ease-in-out'
      }}
      className="fixed inset-0 w-screen h-[100dvh] overflow-hidden select-none flex flex-col justify-between font-sans text-white"
    >
      {/* 🌲 頂部列：左側海拔，右側精簡 5 顆快捷控制（零長字擠壓、ESC 永不截斷） */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 w-full shrink-0 z-20">
        {/* 左側：海拔高度 */}
        <div
          style={{
            borderColor: isMax ? theme.badgeBorder : theme.dimAccent,
            backgroundColor: isMax ? '#000000' : '#0A0A0A',
            opacity: dataOpacity
          }}
          className="px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 shadow-xs shrink-0"
        >
          <span className="text-sm">⛰️</span>
          <div className="flex flex-col text-left leading-none">
            <span
              style={{ color: activeSubText }}
              className="text-[10px] font-bold tracking-wider whitespace-nowrap"
            >
              ALTITUDE
            </span>
            <span
              style={{
                color: '#FFFFFF',
                textShadow: isMax ? `0 0 10px ${theme.maxAccent}` : 'none'
              }}
              className="font-michroma font-bold text-sm tracking-tight mt-0.5 whitespace-nowrap"
            >
              {altitudeM !== null ? `${altitudeM} m` : '-- m'}
            </span>
          </div>
        </div>

        {/* 右側：5 顆精巧快捷工具列 */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 🪞 鏡像切換按鈕 (支援自然平放 scaleY(-1) 與倒放 scaleX(-1)) */}
          <button
            type="button"
            onClick={handleToggleMirror}
            style={{
              backgroundColor: mirrorMode !== 'off' ? activeAccent : '#121212',
              borderColor: mirrorMode !== 'off' ? activeAccent : '#27272A',
              color: mirrorMode !== 'off' ? '#000000' : '#E4E4E7'
            }}
            className="px-2 sm:px-2.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
            title="點擊切換投影模式：[垂直翻轉 (手機頂部朝前擋平放)] ➔ [水平翻轉 (手機頂部朝駕駛平放)] ➔ [關閉投影 (正常觀看)]"
          >
            <span>🪞</span>
            <span className="hidden sm:inline">
              {mirrorMode === 'vertical'
                ? '垂直翻轉 (正放)'
                : mirrorMode === 'horizontal'
                ? '水平翻轉 (倒放)'
                : '投影: 關'}
            </span>
          </button>

          {/* 🎨 主題切換 */}
          <button
            type="button"
            onClick={() => {
              const keys = Object.keys(THEMES);
              const nextIdx = (keys.indexOf(themeKey) + 1) % keys.length;
              setThemeKey(keys[nextIdx]);
            }}
            style={{
              borderColor: isMax ? theme.badgeBorder : theme.dimAccent,
              backgroundColor: '#121212'
            }}
            className="px-2 sm:px-2.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
            title="切換 HUD 抬頭顯示器螢光色彩"
          >
            <span>{theme.icon}</span>
            <span className="hidden sm:inline">{theme.name}</span>
          </button>

          {/* 🔆 三段式亮度/玻璃反射增亮切換按鈕 (超亮 ➔ 標準 ➔ 夜間防眩) */}
          <button
            type="button"
            onClick={handleCycleBrightness}
            style={{
              borderColor: isMax ? theme.maxAccent : isNight ? '#27272A' : theme.dimAccent,
              backgroundColor: isMax ? theme.badgeBg : isNight ? '#0A0A0A' : '#121212',
              color: isMax ? theme.maxCore : isNight ? '#71717A' : activeAccent,
              boxShadow: isMax ? `0 0 12px ${theme.maxAccent}66` : 'none'
            }}
            className="px-2 sm:px-2.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
            title="切換玻璃投影亮度：[🔆 超亮投影] ➔ [☀️ 標準明亮] ➔ [🌙 夜間防眩]"
          >
            <span>{isMax ? '🔆' : isNight ? '🌙' : '☀️'}</span>
            <span className="hidden sm:inline">
              {isMax ? '超亮' : isNight ? '夜間' : '明亮'}
            </span>
          </button>

          {/* 🔄 重設所有狀態按鈕 */}
          <button
            type="button"
            onClick={handleResetAll}
            style={{
              borderColor: isResetting ? activeAccent : theme.dimAccent,
              backgroundColor: isResetting ? theme.badgeBg : '#121212',
              color: isResetting ? activeAccent : '#D4D4D8'
            }}
            className="px-2 sm:px-2.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
            title="一鍵重設當前所有行車狀態（車速、極速、里程、計時、坡度、加速度全歸零）"
          >
            <span className={isResetting ? 'animate-spin' : ''}>🔄</span>
            <span className="hidden sm:inline">{isResetting ? '已歸零' : '重設'}</span>
          </button>

          {/* ✕ 關閉 HUD (淡紅色低眩光，永遠完整保留在右上角) */}
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'rgba(225, 29, 72, 0.16)',
              borderColor: 'rgba(251, 113, 133, 0.35)',
              color: '#FDA4AF'
            }}
            className="px-2 sm:px-2.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1 hover:bg-rose-950/60 active:scale-95 transition-all cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
            title="退出抬頭顯示器 (ESC)"
          >
            <span className="opacity-80">✕</span>
            <span>ESC</span>
          </button>
        </div>
      </div>

      {/* 🚀 中央英雄區：超大純粹數位車速（支援白心加粗微描邊與高流明發光，玻璃反射極度清晰） */}
      <div
        style={{ opacity: dataOpacity }}
        className="flex-1 flex flex-col items-center justify-center min-h-0 w-full relative z-10 my-auto transition-opacity duration-200"
      >
        <div className="flex flex-col items-center justify-center text-center">
          {/* 巨幅車速數字 */}
          <span
            style={{
              color: activeCore,
              WebkitTextStroke: isMax ? `1.8px ${theme.maxAccent}` : 'none',
              textShadow: isMax
                ? theme.maxGlow
                : isNight
                ? 'none'
                : `0 0 28px ${theme.accent}45`,
              fontVariantNumeric: 'tabular-nums'
            }}
            className="font-michroma font-black text-[30vw] sm:text-[26vh] leading-none tracking-tighter select-none"
          >
            {currentSpeedKmh}
          </span>

          {/* 單位標籤與極速 */}
          <div className="flex items-center gap-3 mt-1 sm:mt-2">
            <span
              style={{
                borderColor: isMax ? theme.badgeBorder : theme.dimAccent,
                color: activeSubText,
                backgroundColor: isMax ? '#000000' : '#09090B',
                textShadow: isMax ? `0 0 8px ${theme.maxAccent}` : 'none'
              }}
              className="px-3 py-0.5 rounded-full border text-xs sm:text-sm font-michroma font-bold tracking-widest whitespace-nowrap"
            >
              KM / H
            </span>

            {maxSpeedKmh > 0 && (
              <span
                style={{ color: activeUnitColor }}
                className="text-[11px] font-mono whitespace-nowrap"
              >
                MAX:{' '}
                <strong
                  style={{
                    color: activeCore,
                    textShadow: isMax ? `0 0 8px ${theme.maxAccent}` : 'none'
                  }}
                >
                  {maxSpeedKmh}
                </strong>
              </span>
            )}
          </div>

          {/* 🪞 獨立置中單行狀態 / 亮度提示膠囊（絕不折行、不干擾頂部列） */}
          {(hudNotice || mirrorMode !== 'off') && (
            <div
              style={{
                borderColor: isMax ? theme.maxAccent : theme.badgeBorder,
                backgroundColor: isMax ? '#000000' : theme.badgeBg,
                color: activeCore,
                textShadow: isMax ? `0 0 8px ${theme.maxAccent}` : 'none'
              }}
              className="mt-2.5 sm:mt-3 px-3 py-1 rounded-full border text-[11px] font-bold tracking-wide whitespace-nowrap shadow-xs"
            >
              {hudNotice ||
                (mirrorMode === 'vertical'
                  ? '🪞 垂直翻轉 · 頂端朝前'
                  : '🪞 水平翻轉 · 頂端朝後')}
            </div>
          )}
        </div>
      </div>

      {/* 📊 底部極簡三欄狀態：坡度 (左)、加速度 (中)、累積里程 (右) */}
      <div
        style={{ opacity: dataOpacity }}
        className="grid grid-cols-3 gap-2 sm:gap-4 w-full shrink-0 z-20 items-stretch transition-opacity duration-200"
      >
        {metricCards.map((card) => (
          <div
            key={card.id}
            style={{
              borderColor: cardBorder,
              backgroundColor: cardBg
            }}
            className="rounded-2xl border px-2 sm:px-3 py-2 flex flex-col items-center justify-center text-center shadow-xs"
          >
            <span
              style={{
                color: activeSubText,
                textShadow: isMax ? `0 0 6px ${theme.maxAccent}88` : 'none'
              }}
              className="text-[10px] font-bold tracking-wide whitespace-nowrap"
            >
              {card.label}
              <span className="hidden sm:inline">{card.enLabel}</span>
            </span>
            <div className="flex items-baseline gap-1 my-1">
              <span
                style={{
                  color: card.valueColor,
                  WebkitTextStroke: isMax ? `0.6px ${card.strokeColor}` : 'none',
                  textShadow: isMax ? `0 0 12px ${card.valueColor}` : 'none'
                }}
                className="text-xl sm:text-2xl font-michroma font-bold tracking-tight whitespace-nowrap"
              >
                {card.valueText}
              </span>
              <span style={{ color: activeUnitColor }} className="text-[11px] font-bold">
                {card.unit}
              </span>
            </div>
            <span
              style={{ color: activeUnitColor }}
              className={`text-[9px] whitespace-nowrap ${
                card.subMono ? 'font-mono' : 'font-medium'
              }`}
            >
              {card.subLabel}
            </span>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
