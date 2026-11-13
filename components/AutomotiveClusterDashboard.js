'use client';

import React, { useId, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * 🏎️ AutomotiveClusterDashboard (v4 - Dual Coaxial Speed + Acceleration G-Force Needle Edition)
 * 頂級車廠護眼數位儀表板 (Luxury Classic Automotive Cluster)
 * 支援全域動態量程：徒步 (12) → 單車 (60) → 汽車 (160) → 高鐵 (350) → 飛機 (1000 km/h)
 * 新增同軸雙指針設計：紅色主指針（即時時速 km/h）＋ 亮青/琥珀副指針（即時縱向加速度 G 值 / m/s²）
 */
const SPEED_MODES = [
  { id: 'auto', label: '⚡ 自動', max: null, icon: '⚡' },
  { id: 'hike', label: '🚶 健行 12', max: 12, icon: '🚶' },
  { id: 'bike', label: '🚴 單車 60', max: 60, icon: '🚴' },
  { id: 'drive', label: '🚗 汽車 160', max: 160, icon: '🚗' },
  { id: 'train', label: '🚄 高鐵 350', max: 350, icon: '🚄' },
  { id: 'plane', label: '✈️ 飛機 1000', max: 1000, icon: '✈️' }
];

function getAutoDialMax(speed, maxRecordedSpeed) {
  // 限制自動量程在未手動切換高鐵/飛機模式時，最高鎖定至 180 km/h (汽車巡航)，避免單一 GPS 飄移跳點把車載 HUD 誤切成高鐵或飛機
  const rawPeak = Math.max(speed, maxRecordedSpeed);
  const peak = Math.min(rawPeak, 180);
  if (peak <= 10) return 12;      // 🚶 健行 (高解析度)
  if (peak <= 25) return 30;      // 🏃 慢跑衝刺
  if (peak <= 55) return 60;      // 🚴 單車騎行
  if (peak <= 100) return 120;    // 🛵 機車公路
  return 180;                     // 🚗 汽車巡航 (車載 HUD)
}

function getModeTitle(dialMax) {
  if (dialMax >= 800) return { title: '✈️ 航空巡航模式 (Aviation HUD)', desc: '民航客機高空巡航時速 800~1000 km/h' };
  if (dialMax >= 300) return { title: '🚄 軌道極速模式 (Rail Express)', desc: '台灣高鐵巡航時速 300 km/h' };
  if (dialMax >= 120) return { title: '🚗 汽車公路模式 (Highway Cruise)', desc: '一般道路與高速公路行駛' };
  if (dialMax >= 50) return { title: '🚴 單車騎行模式 (Cycling / MTB)', desc: '自行車、越野單車巡航' };
  if (dialMax >= 25) return { title: '🏃 越野路跑模式 (Trail Running)', desc: '跑步與快走下坡衝刺' };
  return { title: '🚶 徒步漫行模式 (Hiking & Trekking)', desc: '深山步道高精度慢速遙測' };
}

export default function AutomotiveClusterDashboard({
  displayStats,
  isRecording = false,
  displayPointsCount = 0,
  displayTitle = '',
  isManuallyResting = false,
  toggleManualRest = null,
  scrubbedSpeed = null,
  theme = null,
  onThemeChange = null,
  onVehicleModeChange = null,
  onCalibrateElevation = null
}) {
  const gradientId = useId();
  const handleCalibrateElevationClick = (e) => {
    e?.stopPropagation?.();
    if (typeof onCalibrateElevation !== 'function' || typeof window === 'undefined') return;
    const currVal = displayStats?.currentElevation ?? '';
    const input = window.prompt(
      '⛰️ 海拔基準校正（消除室內冷啟動或氣壓偏移）\n請輸入您目前所在位置的已知真實海拔高度（公尺）：',
      currVal !== null && currVal !== undefined ? String(currVal) : '42'
    );
    if (input !== null && input.trim() !== '') {
      const num = Number(input.trim());
      if (Number.isFinite(num) && num >= -500 && num <= 9000) {
        onCalibrateElevation(num);
      }
    }
  };
  // 支援三種主題：'white' (首頁純白) | 'oled' (OLED 極黑 0 耗電) | 'obsidian' (曜石賽道)
  const [clusterTheme, setClusterTheme] = useState(theme || 'white');
  const [speedMode, setSpeedMode] = useState('auto'); // 'auto' | 'hike' | 'bike' | 'drive' | 'train' | 'plane'

  // 同步外部傳入之 theme
  useEffect(() => {
    if (theme && (theme === 'white' || theme === 'oled' || theme === 'obsidian')) {
      setClusterTheme(theme);
    }
  }, [theme]);

  // Interactive Speed Simulation & Self-check Needle Sweep
  const [testSpeed, setTestSpeed] = useState(null);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepAngle, setSweepAngle] = useState(null);
  const [sweepAccelAngle, setSweepAccelAngle] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false); // ⛶ 全螢幕車載 HUD 儀表盤模式

  // ⚡ 同軸加速度副指針狀態 (縱向加速度 m/s² 與 G 值)
  const [accelMs2, setAccelMs2] = useState(0);
  const [peakAccelG, setPeakAccelG] = useState(0);
  const [peakBrakeG, setPeakBrakeG] = useState(0);
  const prevSpeedSampleRef = useRef({ speedKmh: null, timeMs: 0 });
  const accelDecayIntervalRef = useRef(null);

  // 📱 橫向模式 (Landscape) 偵測與車載 HUD 防休眠常亮開關
  const [isLandscape, setIsLandscape] = useState(false);
  const [keepScreenAwake, setKeepScreenAwake] = useState(false); // 使用者可自由選擇是否保持螢幕常亮不休眠
  const wakeLockSentinelRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia ? window.matchMedia('(orientation: landscape)') : null;
    const checkLandscape = () => {
      const mqlLand = mql ? mql.matches : false;
      const ratioLand = window.innerWidth > window.innerHeight;
      setIsLandscape(Boolean(mqlLand || ratioLand));
    };
    checkLandscape();
    window.addEventListener('resize', checkLandscape);
    window.addEventListener('orientationchange', checkLandscape);
    if (mql?.addEventListener) mql.addEventListener('change', checkLandscape);
    return () => {
      window.removeEventListener('resize', checkLandscape);
      window.removeEventListener('orientationchange', checkLandscape);
      if (mql?.removeEventListener) mql.removeEventListener('change', checkLandscape);
    };
  }, []);

  // ☀️ 螢幕防休眠控制：僅在「全螢幕車載 HUD + 橫向 Landscape 模式 + 使用者開啟常亮」時生效；離開全螢幕或轉直向立即恢復正常休眠省電
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldStayAwake = isFullscreen && isLandscape && keepScreenAwake;

    // 1. iOS 原生 App 橋接 (UIApplication.shared.isIdleTimerDisabled)
    try {
      window.webkit?.messageHandlers?.keepAwakeHandler?.postMessage(shouldStayAwake);
    } catch (e) {}

    // 2. 純網頁瀏覽器 Screen Wake Lock API 備援
    let cancelled = false;
    const syncWebWakeLock = async () => {
      if (shouldStayAwake) {
        if ('wakeLock' in navigator && !wakeLockSentinelRef.current) {
          try {
            window.__allowWebWakeLock = true;
            const sentinel = await navigator.wakeLock.request('screen');
            if (cancelled) {
              sentinel.release().catch(() => {});
            } else {
              wakeLockSentinelRef.current = sentinel;
              sentinel.addEventListener('release', () => {
                wakeLockSentinelRef.current = null;
              });
            }
          } catch (err) {}
        }
      } else {
        window.__allowWebWakeLock = false;
        if (wakeLockSentinelRef.current) {
          wakeLockSentinelRef.current.release().catch(() => {});
          wakeLockSentinelRef.current = null;
        }
      }
    };

    syncWebWakeLock();

    const handleVis = () => {
      if (document.visibilityState === 'visible' && shouldStayAwake) {
        syncWebWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVis);
      window.__allowWebWakeLock = false;
      if (wakeLockSentinelRef.current) {
        wakeLockSentinelRef.current.release().catch(() => {});
        wakeLockSentinelRef.current = null;
      }
      try {
        window.webkit?.messageHandlers?.keepAwakeHandler?.postMessage(false);
      } catch (e) {}
    };
  }, [isFullscreen, isLandscape, keepScreenAwake]);

  // Keyboard shortcut: ESC to exit fullscreen & Sync iOS Status Bar / Theme Color in Fullscreen HUD
  useEffect(() => {
    if (!isFullscreen || typeof window === 'undefined') return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const fsHex = clusterTheme === 'white' ? '#F8FAFC' : clusterTheme === 'obsidian' ? '#0A0E17' : '#000000';
    const fsColorScheme = clusterTheme === 'white' ? 'light' : 'dark';
    const origBodyBg = document.body.style.backgroundColor;
    const origHtmlBg = document.documentElement.style.backgroundColor;
    const origColorScheme = document.documentElement.style.colorScheme;
    const mainEl = document.querySelector('main');
    const origMainVis = mainEl ? mainEl.style.visibility : '';
    const origMainBg = mainEl ? mainEl.style.backgroundColor : '';
    const savedScrollY = window.scrollY;

    document.body.style.backgroundColor = fsHex;
    document.documentElement.style.backgroundColor = fsHex;
    document.documentElement.style.colorScheme = fsColorScheme;
    if (mainEl) {
      mainEl.style.backgroundColor = fsHex;
      mainEl.style.visibility = 'hidden';
    }
    window.scrollTo(0, 0);

    const existingThemeMetas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
    const prevThemeContent = existingThemeMetas[0]?.getAttribute('content') || '#f8fafc';
    existingThemeMetas.forEach((m) => m.parentNode?.removeChild(m));
    const freshThemeMeta = document.createElement('meta');
    freshThemeMeta.name = 'theme-color';
    freshThemeMeta.content = fsHex;
    document.head.appendChild(freshThemeMeta);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.backgroundColor = origBodyBg;
      document.documentElement.style.backgroundColor = origHtmlBg;
      document.documentElement.style.colorScheme = origColorScheme;
      if (mainEl) {
        mainEl.style.visibility = origMainVis;
        mainEl.style.backgroundColor = origMainBg;
      }
      window.scrollTo(0, savedScrollY);
      const currentMetas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
      currentMetas.forEach((m) => m.parentNode?.removeChild(m));
      const restoreMeta = document.createElement('meta');
      restoreMeta.name = 'theme-color';
      restoreMeta.content = prevThemeContent;
      document.head.appendChild(restoreMeta);
    };
  }, [isFullscreen, clusterTheme]);

  // Trigger Gauge Sweep (超跑發動雙指針自檢全幅掃描：時速針 + 加速度針同步掃描歸位)
  const triggerNeedleSweep = () => {
    if (isSweeping) return;
    setIsSweeping(true);
    setSweepAngle(120);
    setSweepAccelAngle(110);
    setTimeout(() => {
      setSweepAngle(-120);
      setSweepAccelAngle(-110);
      setTimeout(() => {
        setSweepAngle(null);
        setSweepAccelAngle(null);
        setIsSweeping(false);
      }, 550);
    }, 600);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      triggerNeedleSweep();
    }, 400);
    return () => clearTimeout(t);
  }, []);

  // Current speed & telemetry metrics
  const baseCurrentSpeed = parseFloat(displayStats?.currentSpeedKmh || 0);
  const effectiveSpeed = (() => {
    if (testSpeed !== null) return testSpeed;
    if (scrubbedSpeed !== null && scrubbedSpeed !== undefined && scrubbedSpeed >= 0) return scrubbedSpeed;
    if (isRecording) return baseCurrentSpeed;
    if (baseCurrentSpeed > 0) return baseCurrentSpeed;
    const mAvg = parseFloat(displayStats?.movingAvgSpeedKmh || 0);
    if (mAvg > 0) return mAvg;
    const avg = parseFloat(displayStats?.avgSpeedKmh || 0);
    if (avg > 0) return avg;
    return 0;
  })();

  // ⚡ 即時計算縱向加速度 (a = Δv / Δt)，支援 GPS 實測、試跑模擬與定速自動歸零阻尼
  useEffect(() => {
    if (isSweeping) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const prev = prevSpeedSampleRef.current;

    if (prev.speedKmh !== null && prev.timeMs > 0) {
      const dtSec = (now - prev.timeMs) / 1000;
      if (dtSec >= 0.12 && dtSec <= 15) {
        const dvMs = (effectiveSpeed - prev.speedKmh) / 3.6;
        // 限制單次計算加速度於 [-7.5, +7.5] m/s² (約 ±0.76 G)
        const rawAccel = Math.max(-7.5, Math.min(7.5, dvMs / dtSec));
        setAccelMs2((oldVal) => {
          const smoothed = oldVal * 0.4 + rawAccel * 0.6;
          const gVal = smoothed / 9.80665;
          if (gVal > 0.01) {
            setPeakAccelG((p) => Math.max(p, Math.round(gVal * 100) / 100));
          } else if (gVal < -0.01) {
            setPeakBrakeG((p) => Math.max(p, Math.round(Math.abs(gVal) * 100) / 100));
          }
          return smoothed;
        });
      }
    }

    prevSpeedSampleRef.current = { speedKmh: effectiveSpeed, timeMs: now };

    // 若速度維持恆定（定速巡航或停止），1.1 秒後讓加速度指針平滑阻尼回彈至 0.00 G（12 點鐘正上方）
    if (accelDecayIntervalRef.current) {
      clearInterval(accelDecayIntervalRef.current);
      accelDecayIntervalRef.current = null;
    }
    const decayStartTimeout = setTimeout(() => {
      accelDecayIntervalRef.current = setInterval(() => {
        setAccelMs2((curr) => {
          if (Math.abs(curr) < 0.04) {
            if (accelDecayIntervalRef.current) {
              clearInterval(accelDecayIntervalRef.current);
              accelDecayIntervalRef.current = null;
            }
            return 0;
          }
          return curr * 0.55;
        });
      }, 120);
    }, 1100);

    return () => {
      clearTimeout(decayStartTimeout);
    };
  }, [effectiveSpeed, isSweeping]);

  // Cleanup decay interval on unmount
  useEffect(() => {
    return () => {
      if (accelDecayIntervalRef.current) {
        clearInterval(accelDecayIntervalRef.current);
      }
    };
  }, []);

  const maxSpeed = parseFloat(displayStats?.maxSpeedKmh || 0);

  // Dynamic dial scale based on selected mode or automatic detection
  const selectedConfig = SPEED_MODES.find(m => m.id === speedMode);
  const dialMax = selectedConfig?.max || getAutoDialMax(effectiveSpeed, maxSpeed);
  const modeInfo = getModeTitle(dialMax);

  // 🚗 當偵測到車載 HUD 模式 (dialMax >= 120 或開啟全螢幕 HUD) 時，同步通知定位引擎升級為 1Hz 連續都卜勒追蹤並鎖定汽車極速上限
  useEffect(() => {
    if (typeof onVehicleModeChange !== 'function') return;
    if (speedMode !== 'auto') {
      onVehicleModeChange(speedMode);
    } else if (dialMax >= 120 || isFullscreen) {
      onVehicleModeChange('drive');
    } else if (dialMax >= 50) {
      onVehicleModeChange('bike');
    }
  }, [speedMode, dialMax, isFullscreen, onVehicleModeChange]);

  const speedRatio = Math.min(1, Math.max(0, effectiveSpeed / dialMax));
  
  // Primary Speed Needle geometry: 240-degree sweep from -120 deg (0) to +120 deg (max)
  const startAngleDeg = -120;
  const sweepAngleDeg = 240;
  const targetAngleDeg = startAngleDeg + (speedRatio * sweepAngleDeg);
  const currentAngleDeg = sweepAngle !== null ? sweepAngle : targetAngleDeg;

  // Coaxial Acceleration Needle geometry: 0° = 12 o'clock top dead center (0.00 G)
  // Left (-110° to 0°) = Deceleration / Braking (-G); Right (0° to +110°) = Acceleration (+G)
  const accelG = accelMs2 / 9.80665;
  const maxDialG = dialMax <= 30 ? 0.25 : dialMax <= 60 ? 0.35 : 0.50;
  const clampedAccelG = Math.max(-maxDialG, Math.min(maxDialG, accelG));
  const targetAccelAngleDeg = (clampedAccelG / maxDialG) * 110;
  const currentAccelAngleDeg = sweepAccelAngle !== null ? sweepAccelAngle : targetAccelAngleDeg;
  const isBraking = accelMs2 < -0.08;

  const cx = 120;
  const cy = 116;
  const polarToCartesian = (centerX, centerY, r, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians)
    };
  };

  const describeArc = (centerX, centerY, r, startAngle, endAngle) => {
    const start = polarToCartesian(centerX, centerY, r, endAngle);
    const end = polarToCartesian(centerX, centerY, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return [
      'M', start.x, start.y,
      'A', r, r, 0, largeArcFlag, 0, end.x, end.y
    ].join(' ');
  };

  const ticks = (() => {
    let step = 2;
    let majorFreq = 1;
    let minorStep = 1;
    if (dialMax >= 1000) {
      step = 200;
      majorFreq = 1;
      minorStep = 100;
    } else if (dialMax >= 300) {
      step = 50;
      majorFreq = 1;
      minorStep = 25;
    } else if (dialMax >= 150) {
      step = 20;
      majorFreq = 2;
      minorStep = 10;
    } else if (dialMax >= 50) {
      step = 10;
      majorFreq = 1;
      minorStep = 5;
    } else if (dialMax >= 25) {
      step = 5;
      majorFreq = 1;
      minorStep = 2.5;
    } else {
      step = 2;
      majorFreq = 1;
      minorStep = 1;
    }

    const arr = [];
    const totalSteps = Math.round(dialMax / minorStep);
    for (let i = 0; i <= totalSteps; i++) {
      const val = Math.min(dialMax, i * minorStep);
      const ratio = val / dialMax;
      const angle = startAngleDeg + (ratio * sweepAngleDeg);
      const isMajor = Math.abs((val % step)) < 0.001 || i === totalSteps || i === 0;
      const isLabeled = isMajor && (Math.round(val / step) % majorFreq === 0 || i === totalSteps || i === 0);
      
      const outer = polarToCartesian(cx, cy, 96, angle);
      const inner = polarToCartesian(cx, cy, isMajor ? 84 : 89, angle);
      const labelPos = polarToCartesian(cx, cy, 73, angle);
      arr.push({ val: Math.round(val), outer, inner, labelPos, isMajor, isLabeled });
    }
    return arr;
  })();

  // Inner G-Force Acceleration Scale Ticks (-110°, -55°, 0°, +55°, +110°)
  const accelTicks = [
    { angle: -110, label: `-${maxDialG}G`, isCenter: false },
    { angle: -55, label: '', isCenter: false },
    { angle: 0, label: '0G', isCenter: true },
    { angle: 55, label: '', isCenter: false },
    { angle: 110, label: `+${maxDialG}G`, isCenter: false }
  ].map((t) => ({
    ...t,
    outer: polarToCartesian(cx, cy, 64, t.angle),
    inner: polarToCartesian(cx, cy, t.isCenter ? 58 : 60, t.angle),
    labelPos: polarToCartesian(cx, cy, 52, t.angle)
  }));

  const isWhite = clusterTheme === 'white';
  const isOLED = clusterTheme === 'oled';

  const themeStyles = isWhite ? {
    wrapperBg: '#FFFFFF',
    wrapperBorder: '#E2E8F0',
    wrapperShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 1)',
    cardBg: '#F8FAFC',
    cardBorder: '#E2E8F0',
    cardShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
    topBarBorder: '#F1F5F9',
    textColorPrimary: '#0F172A',
    textColorSecondary: '#475569',
    textColorMuted: '#64748B',
    accentColor: '#059669',
    gaugeBezelOuter: '#E2E8F0',
    gaugeBezelInner: '#F8FAFC',
    gaugeDialFace: '#FFFFFF',
    gaugeTrack: '#E2E8F0',
    gaugeTickMajor: '#0F172A',
    gaugeTickMinor: '#94A3B8',
    gaugeTickText: '#0F172A',
    gaugeCenterCap: '#059669',
    gaugeCenterCapBorder: '#CBD5E1',
    speedColor: '#0F172A',
    chronoColor: '#0F172A',
    distanceColor: '#059669',
    altitudeColor: '#1E3A8A',
    accelPositiveColor: '#0284C7',
    accelBrakeColor: '#D97706'
  } : isOLED ? {
    wrapperBg: '#000000',
    wrapperBorder: '#27272A',
    wrapperShadow: '0 0 0 1px #18181B',
    cardBg: '#000000',
    cardBorder: '#27272A',
    cardShadow: 'none',
    topBarBorder: '#18181B',
    textColorPrimary: '#F4F4F5',
    textColorSecondary: '#A1A1AA',
    textColorMuted: '#71717A',
    accentColor: '#10B981',
    gaugeBezelOuter: '#18181B',
    gaugeBezelInner: '#000000',
    gaugeDialFace: '#000000',
    gaugeTrack: '#27272A',
    gaugeTickMajor: '#F4F4F5',
    gaugeTickMinor: '#52525B',
    gaugeTickText: '#A1A1AA',
    gaugeCenterCap: '#10B981',
    gaugeCenterCapBorder: '#059669',
    speedColor: '#10B981',
    chronoColor: '#FFFFFF',
    distanceColor: '#F59E0B',
    altitudeColor: '#38BDF8',
    accelPositiveColor: '#38BDF8',
    accelBrakeColor: '#FBBF24'
  } : {
    wrapperBg: 'radial-gradient(ellipse at 50% 0%, #172033 0%, #0A0E17 65%, #05070B 100%)',
    wrapperBorder: 'rgba(255, 255, 255, 0.12)',
    wrapperShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
    cardBg: 'rgba(255, 255, 255, 0.04)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    cardShadow: 'none',
    topBarBorder: 'rgba(255, 255, 255, 0.1)',
    textColorPrimary: '#FFFFFF',
    textColorSecondary: '#94A3B8',
    textColorMuted: '#64748B',
    accentColor: '#F59E0B',
    gaugeBezelOuter: 'rgba(255, 255, 255, 0.12)',
    gaugeBezelInner: 'rgba(0, 0, 0, 0.6)',
    gaugeDialFace: '#0B0F17',
    gaugeTrack: 'rgba(255, 255, 255, 0.12)',
    gaugeTickMajor: 'rgba(255, 255, 255, 0.85)',
    gaugeTickMinor: 'rgba(255, 255, 255, 0.35)',
    gaugeTickText: 'rgba(255, 255, 255, 0.85)',
    gaugeCenterCap: '#1E293B',
    gaugeCenterCapBorder: '#EF4444',
    speedColor: '#FFFFFF',
    chronoColor: '#FFFFFF',
    distanceColor: '#F59E0B',
    altitudeColor: '#60A5FA',
    accelPositiveColor: '#38BDF8',
    accelBrakeColor: '#FBBF24'
  };

  const activeAccelNeedleColor = isBraking ? themeStyles.accelBrakeColor : themeStyles.accelPositiveColor;
  const formattedAccelG = `${accelG >= 0 ? '+' : ''}${accelG.toFixed(2)}G`;
  const formattedAccelMs2 = `${accelMs2 >= 0 ? '+' : ''}${accelMs2.toFixed(1)} m/s²`;

  const renderSpeedDialSVG = (svgId = gradientId) => (
    <svg viewBox="8 5 224 176" className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id={`${svgId}-speed-grad`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="55%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#DC2626" />
        </linearGradient>

        <radialGradient id={`${svgId}-dial-glow`} cx="50%" cy="62%" r="58%">
          <stop offset="0%" stopColor={isWhite ? '#FFFFFF' : 'rgba(245, 158, 11, 0.15)'} />
          <stop offset="75%" stopColor={isWhite ? '#F8FAFC' : 'rgba(15, 23, 42, 0.5)'} />
          <stop offset="100%" stopColor={isWhite ? '#F1F5F9' : '#0B0F17'} />
        </radialGradient>

        <filter id={`${svgId}-needle-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.22)" />
        </filter>
      </defs>

      {/* 252° 超跑扇形儀表罩底色（裁切無用的下半圓，讓可用顯示面積最大化） */}
      <path
        d={`${describeArc(cx, cy, 103, -126, 126)} Z`}
        fill={`url(#${svgId}-dial-glow)`}
      />

      {/* 上半部 252° 金屬外框弧線（不畫多餘下半圓） */}
      <path
        d={describeArc(cx, cy, 108, -126, 126)}
        fill="none"
        stroke={themeStyles.gaugeBezelOuter}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d={`${describeArc(cx, cy, 105, -126, 126)} Z`}
        fill="none"
        stroke={themeStyles.gaugeBezelInner}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Outer Speedometer Track */}
      <path
        d={describeArc(cx, cy, 94, startAngleDeg, startAngleDeg + sweepAngleDeg)}
        fill="none"
        stroke={themeStyles.gaugeTrack}
        strokeWidth="8"
        strokeLinecap="round"
      />

      {speedRatio > 0.005 && (
        <path
          d={describeArc(cx, cy, 94, startAngleDeg, currentAngleDeg)}
          fill="none"
          stroke={`url(#${svgId}-speed-grad)`}
          strokeWidth="8"
          strokeLinecap="round"
        />
      )}

      {/* ⚡ Inner Coaxial Acceleration G-Force Track (-110° Brake <-> 0° Neutral <-> +110° Accel) */}
      <path
        d={describeArc(cx, cy, 62, -110, 110)}
        fill="none"
        stroke={isWhite ? 'rgba(14, 165, 233, 0.18)' : 'rgba(56, 189, 248, 0.18)'}
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Active G-Force Arc from 0° (Top Dead Center) */}
      {Math.abs(currentAccelAngleDeg) > 1.5 && (
        <path
          d={
            currentAccelAngleDeg >= 0
              ? describeArc(cx, cy, 62, 0, currentAccelAngleDeg)
              : describeArc(cx, cy, 62, currentAccelAngleDeg, 0)
          }
          fill="none"
          stroke={activeAccelNeedleColor}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      )}

      {/* Inner G-Force Scale Ticks & Labels */}
      {accelTicks.map((t, idx) => (
        <g key={`accel-tick-${idx}`}>
          <line
            x1={t.inner.x}
            y1={t.inner.y}
            x2={t.outer.x}
            y2={t.outer.y}
            stroke={t.isCenter ? themeStyles.accelPositiveColor : themeStyles.gaugeTickMinor}
            strokeWidth={t.isCenter ? 1.8 : 1.1}
          />
          {t.label && (
            <text
              x={t.labelPos.x}
              y={t.labelPos.y + 2.5}
              textAnchor="middle"
              fill={t.isCenter ? themeStyles.accelPositiveColor : themeStyles.textColorMuted}
              fontSize="7.5"
              fontFamily="monospace"
              fontWeight="800"
            >
              {t.label}
            </text>
          )}
        </g>
      ))}

      {/* Outer Speedometer Ticks */}
      {ticks.map((t, idx) => (
        <g key={idx}>
          <line
            x1={t.inner.x}
            y1={t.inner.y}
            x2={t.outer.x}
            y2={t.outer.y}
            stroke={t.isMajor ? themeStyles.gaugeTickMajor : themeStyles.gaugeTickMinor}
            strokeWidth={t.isMajor ? 2.5 : 1.2}
          />
          {t.isLabeled && (
            <text
              x={t.labelPos.x}
              y={t.labelPos.y + 4}
              textAnchor="middle"
              fill={themeStyles.gaugeTickText}
              fontSize={dialMax >= 1000 ? "9" : "11"}
              fontFamily="'Michroma', 'Eurostile Extended', 'Microgramma', sans-serif"
              fontWeight="900"
            >
              {t.val}
            </text>
          )}
        </g>
      ))}

      {/* Digital Speed Readout */}
      <text 
        x={cx} 
        y={cy - 14} 
        textAnchor="middle" 
        fill={isOLED ? '#10B981' : themeStyles.textColorPrimary} 
        fontSize={effectiveSpeed >= 100 ? "32" : "38"} 
        fontFamily="'Michroma', 'Eurostile Extended', 'Microgramma', sans-serif" 
        fontWeight="900" 
      >
        {effectiveSpeed.toFixed(1)}
      </text>
      <text 
        x={cx} 
        y={cy + 24} 
        textAnchor="middle" 
        fill={isOLED ? '#34D399' : themeStyles.textColorSecondary} 
        fontSize="11" 
        fontFamily="'Michroma', 'Eurostile Extended', 'Microgramma', sans-serif" 
        fontWeight="900" 
        letterSpacing="2"
      >
        KM / H
      </text>
      <text 
        x={cx} 
        y={cy + 39} 
        textAnchor="middle" 
        fill={isOLED ? '#F59E0B' : themeStyles.accentColor} 
        fontSize="10.5" 
        fontFamily="sans-serif" 
        fontWeight="900" 
        letterSpacing="0.5"
      >
        {testSpeed !== null ? '⚡ 模擬試跑' : (scrubbedSpeed !== null && scrubbedSpeed !== undefined ? '📍 剖面點時速' : (!isRecording && effectiveSpeed > 0 ? '🚶 L: average' : '即時行進速度'))}
      </text>

      {/* ⚡ Coaxial Acceleration Digital Telemetry Readout inside Dial */}
      <text
        x={cx}
        y={cy + 53}
        textAnchor="middle"
        fill={activeAccelNeedleColor}
        fontSize="9.5"
        fontFamily="monospace"
        fontWeight="900"
      >
        {`G: ${formattedAccelG} (${formattedAccelMs2})`}
      </text>

      {/* ⚡ Secondary Coaxial Needle: Acceleration G-Force Pointer (青藍色加速 / 琥珀色減速煞車) */}
      <g
        style={{
          transform: `rotate(${currentAccelAngleDeg}deg)`,
          transformOrigin: `${cx}px ${cy}px`,
          transition: isSweeping
            ? 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)'
        }}
        filter={`url(#${svgId}-needle-shadow)`}
      >
        <polygon
          points={`${cx - 1.8},${cy} ${cx},${cy - 63} ${cx + 1.8},${cy}`}
          fill={activeAccelNeedleColor}
        />
        <circle cx={cx} cy={cy - 63} r="2.2" fill={activeAccelNeedleColor} />
        <polygon
          points={`${cx - 1.5},${cy} ${cx},${cy + 11} ${cx + 1.5},${cy}`}
          fill={activeAccelNeedleColor}
          opacity="0.75"
        />
      </g>

      {/* 🏎️ Primary Needle: Speed Pointer (紅色主指針) */}
      <g 
        style={{
          transform: `rotate(${currentAngleDeg}deg)`,
          transformOrigin: `${cx}px ${cy}px`,
          transition: isSweeping 
            ? 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)' 
            : 'transform 0.42s cubic-bezier(0.34, 1.35, 0.64, 1)'
        }}
        filter={`url(#${svgId}-needle-shadow)`}
      >
        <polygon
          points={`${cx - 2.5},${cy} ${cx},42 ${cx + 2.5},${cy}`}
          fill="#DC2626"
        />
        <line x1={cx} y1={cy} x2={cx} y2={42} stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
        <polygon
          points={`${cx - 2},${cy} ${cx},${cy + 16} ${cx + 2},${cy}`}
          fill="#991B1B"
        />
        <circle cx={cx} cy={cy} r="10" fill={themeStyles.gaugeCenterCap} stroke={themeStyles.gaugeCenterCapBorder} strokeWidth="2" />
        <circle cx={cx} cy={cy} r="3.5" fill="#FFFFFF" />
      </g>
    </svg>
  );

  const renderFourPodSpeedMatrix = (isFs = false, isCompact = false) => (
    <div 
      style={{
        backgroundColor: themeStyles.cardBg,
        borderColor: themeStyles.cardBorder,
        boxShadow: themeStyles.cardShadow
      }}
      className={`${isCompact ? 'p-2 rounded-2xl space-y-1.5' : 'p-3 sm:p-3.5 rounded-2xl space-y-2.5'} border ${isFs ? 'w-full' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span style={{ color: themeStyles.textColorPrimary }} className={`${isCompact ? 'text-[11px]' : 'text-xs sm:text-sm'} font-bold flex items-center gap-1`}>
          <span className={isCompact ? 'text-xs' : 'text-base'}>⚡</span>
          <span>4 聯速度與加速度遙測陣列</span>
        </span>
        <span style={{ color: themeStyles.textColorMuted }} className="text-[10px] font-mono font-bold">
          km/h · G
        </span>
      </div>

      <div className={`grid ${isCompact && isLandscape ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'} ${isCompact ? 'gap-1.5' : 'gap-2'}`}>
        <div 
          style={{ 
            backgroundColor: isWhite ? '#FFFFFF' : '#000000', 
            borderColor: isWhite ? '#E2E8F0' : '#27272A' 
          }}
          className={`border-2 rounded-xl ${isCompact ? 'p-1.5' : 'p-2.5 rounded-2xl'} flex flex-col justify-between text-center shadow-xs`}
          title="全程平均時速：總里程 ÷ 總耗時（包含所有休息停頓與拍照時間）"
        >
          <span style={{ color: themeStyles.textColorSecondary }} className={`${isCompact ? 'text-[10px]' : 'text-xs mb-1'} font-bold block`}>
            平均時速
          </span>
          <div 
            style={{ color: isWhite ? themeStyles.textColorPrimary : '#FFFFFF' }}
            className={`${isCompact ? 'text-lg sm:text-xl my-0.5' : 'text-2xl sm:text-3xl my-1'} font-michroma font-bold tracking-tight leading-none`}
          >
            {displayStats?.avgSpeedKmh || '0.0'}
          </div>
          <span style={{ color: themeStyles.textColorMuted }} className="text-[10px] font-mono font-bold block">
            km/h
          </span>
        </div>

        <div 
          style={{ 
            backgroundColor: isWhite ? '#F0FDF4' : '#000000', 
            borderColor: isWhite ? '#BBF7D0' : '#059669' 
          }}
          className={`border-2 rounded-xl ${isCompact ? 'p-1.5' : 'p-2.5 rounded-2xl'} flex flex-col justify-between text-center shadow-xs`}
          title="純移動平均時速：移動距離 ÷ 移動時間（已自動扣除所有中途休息停頓）"
        >
          <span style={{ color: isWhite ? '#15803D' : '#34D399' }} className={`${isCompact ? 'text-[10px]' : 'text-xs mb-1'} font-bold block`}>
            移動均速
          </span>
          <div 
            style={{ color: isWhite ? '#166534' : '#34D399' }}
            className={`${isCompact ? 'text-lg sm:text-xl my-0.5' : 'text-2xl sm:text-3xl my-1'} font-michroma font-bold tracking-tight leading-none`}
          >
            {displayStats?.movingAvgSpeedKmh || displayStats?.avgSpeedKmh || '0.0'}
          </div>
          <span style={{ color: isWhite ? '#16A34A' : '#10B981' }} className="text-[10px] font-mono font-bold block">
            km/h
          </span>
        </div>

        <div 
          style={{ 
            backgroundColor: isWhite ? '#FFF1F2' : '#000000', 
            borderColor: isWhite ? '#FECDD3' : '#E11D48' 
          }}
          className={`border-2 rounded-xl ${isCompact ? 'p-1.5' : 'p-2.5 rounded-2xl'} flex flex-col justify-between text-center shadow-xs`}
          title="行進過程中的最高瞬間極速（已濾除 GPS 飄移跳點）"
        >
          <span style={{ color: isWhite ? '#BE123C' : '#FB7185' }} className={`${isCompact ? 'text-[10px]' : 'text-xs mb-1'} font-bold block`}>
            最高時速
          </span>
          <div 
            style={{ color: isWhite ? '#9F1239' : '#FB7185' }}
            className={`${isCompact ? 'text-lg sm:text-xl my-0.5' : 'text-2xl sm:text-3xl my-1'} font-michroma font-bold tracking-tight leading-none`}
          >
            {displayStats?.maxSpeedKmh || '0.0'}
          </div>
          <span style={{ color: isWhite ? '#E11D48' : '#F43F5E' }} className="text-[10px] font-mono font-bold block">
            km/h
          </span>
        </div>

        <div 
          style={{ 
            backgroundColor: isWhite ? (isBraking ? '#FFFBEB' : '#EFF6FF') : '#000000', 
            borderColor: isWhite ? (isBraking ? '#FDE68A' : '#BFDBFE') : (isBraking ? '#D97706' : '#0284C7')
          }}
          className={`border-2 rounded-xl ${isCompact ? 'p-1.5' : 'p-2.5 rounded-2xl'} flex flex-col justify-between text-center shadow-xs transition-colors`}
          title="即時縱向加速度（正值 +G 為加速推背，負值 -G 為減速煞車）"
        >
          <span style={{ color: isWhite ? (isBraking ? '#B45309' : '#1D4ED8') : (isBraking ? '#FBBF24' : '#38BDF8') }} className={`${isCompact ? 'text-[10px]' : 'text-xs mb-1'} font-bold block`}>
            即時加速度
          </span>
          <div 
            style={{ color: isWhite ? (isBraking ? '#92400E' : '#1E40AF') : (isBraking ? '#FBBF24' : '#38BDF8') }}
            className={`${isCompact ? 'text-sm sm:text-base my-0.5' : 'text-lg sm:text-xl my-1'} font-michroma font-bold tracking-tight leading-none`}
          >
            {formattedAccelG}
          </div>
          <span style={{ color: isWhite ? (isBraking ? '#D97706' : '#2563EB') : (isBraking ? '#F59E0B' : '#0284C7') }} className="text-[10px] font-mono font-bold block">
            {formattedAccelMs2}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div 
      style={{
        background: themeStyles.wrapperBg,
        borderColor: themeStyles.wrapperBorder,
        boxShadow: themeStyles.wrapperShadow
      }}
      className="rounded-3xl border-2 p-3.5 sm:p-5 overflow-hidden relative select-none space-y-3.5 transition-all duration-300"
    >
      <div 
        style={{ borderColor: themeStyles.topBarBorder }}
        className="flex items-center justify-between pb-2.5 border-b"
      >
        <div className="flex items-center gap-2">
          <div 
            style={{ 
              backgroundColor: isWhite ? (isRecording ? '#FEF2F2' : '#F0FDF4') : 'rgba(0,0,0,0.6)',
              borderColor: isWhite ? (isRecording ? '#FECACA' : '#BBF7D0') : 'rgba(255,255,255,0.1)'
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-xs"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-600 animate-ping' : 'bg-emerald-600'}`} />
            <span 
              style={{ color: isWhite ? (isRecording ? '#DC2626' : '#15803D') : themeStyles.textColorPrimary }}
              className="font-mono font-black text-xs tracking-wider uppercase"
            >
              {isRecording ? 'GPS Tracking' : 'Standby'}
            </span>
          </div>

          <div 
            style={{ color: themeStyles.textColorSecondary }}
            className="hidden sm:flex items-center gap-1.5 text-xs font-mono font-bold"
          >
            <span className="text-emerald-700">🛰️ 衛星高精定位</span>
            <span>•</span>
            <span>{displayPointsCount} 點位</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const next = clusterTheme === 'white' ? 'oled' : clusterTheme === 'oled' ? 'obsidian' : 'white';
            setClusterTheme(next);
            if (typeof onThemeChange === 'function') onThemeChange(next);
          }}
          style={{
            backgroundColor: isWhite ? '#FFFFFF' : isOLED ? '#18181B' : 'rgba(255,255,255,0.1)',
            borderColor: isWhite ? '#CBD5E1' : isOLED ? '#3F3F46' : 'rgba(255,255,255,0.15)',
            color: isOLED ? '#34D399' : themeStyles.textColorPrimary
          }}
          className="px-3 py-1 rounded-xl text-xs font-bold border shadow-xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          title="切換儀表配色：首頁純白 ⇄ OLED 極黑 (0 耗電) ⇄ 曜石賽道"
        >
          <span>{isWhite ? '⚪ 首頁純白' : isOLED ? '🌙 OLED 極黑 (0 耗電)' : '🏎️ 曜石賽道'}</span>
          <span className="text-[10px] opacity-70">切換 ↗</span>
        </button>
      </div>

      <div 
        style={{
          backgroundColor: isWhite ? '#F8FAFC' : isOLED ? '#09090B' : 'rgba(255,255,255,0.04)',
          borderColor: isWhite ? '#E2E8F0' : isOLED ? '#18181B' : 'rgba(255,255,255,0.08)'
        }}
        className="p-2 rounded-2xl border flex items-center justify-between gap-1 overflow-x-auto text-xs"
      >
        <span 
          style={{ color: themeStyles.textColorSecondary }}
          className="text-xs font-bold shrink-0 pl-1 hidden sm:inline"
        >
          速度量程：
        </span>

        <div className="flex items-center gap-1 w-full sm:w-auto justify-between sm:justify-start">
          {SPEED_MODES.map((mode) => {
            const isSelected = speedMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setSpeedMode(mode.id);
                  triggerNeedleSweep();
                }}
                style={{
                  backgroundColor: isSelected 
                    ? (isWhite ? '#059669' : '#F59E0B') 
                    : (isWhite ? '#FFFFFF' : 'transparent'),
                  color: isSelected 
                    ? '#FFFFFF' 
                    : (isWhite ? '#334155' : '#94A3B8'),
                  borderColor: isSelected 
                    ? (isWhite ? '#059669' : '#F59E0B') 
                    : (isWhite ? '#E2E8F0' : 'rgba(255,255,255,0.1)')
                }}
                className="px-2.5 py-1 rounded-xl font-bold border text-[11px] sm:text-xs transition-all active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer shadow-xs"
              >
                <span>{mode.icon}</span>
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div 
        style={{
          backgroundColor: isWhite ? '#F8FAFC' : 'rgba(255,255,255,0.04)',
          borderColor: isWhite ? '#E2E8F0' : 'rgba(255,255,255,0.08)'
        }}
        className="px-2.5 py-1.5 rounded-2xl border flex items-center justify-between gap-1 overflow-x-auto text-xs"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={triggerNeedleSweep}
            disabled={isSweeping}
            style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
            className="px-2.5 py-1 rounded-xl text-[11px] font-black shadow-sm hover:bg-red-700 active:scale-95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="像超跑啟動一樣雙指針全幅掃描自檢"
          >
            <span>🏎️</span>
            <span>雙針自檢 (Sweep)</span>
          </button>
          <span style={{ color: themeStyles.textColorSecondary }} className="text-[11px] font-bold hidden sm:inline">
            快速試跑：
          </span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { label: '🚶 3.8', speed: 3.8 },
            { label: '🏃 10.5', speed: 10.5 },
            { label: '🚴 28', speed: 28 },
            { label: '🚗 95', speed: 95 },
            { label: '✈️ 850', speed: 850 }
          ].map((sim) => (
            <button
              key={sim.speed}
              type="button"
              onClick={() => {
                setTestSpeed(sim.speed);
                if (sim.speed > 500 && speedMode !== 'plane') setSpeedMode('plane');
                else if (sim.speed > 80 && speedMode === 'hike') setSpeedMode('drive');
                else if (sim.speed > 15 && speedMode === 'hike') setSpeedMode('bike');
              }}
              style={{
                backgroundColor: testSpeed === sim.speed ? '#059669' : (isWhite ? '#FFFFFF' : 'rgba(255,255,255,0.08)'),
                borderColor: testSpeed === sim.speed ? '#059669' : (isWhite ? '#CBD5E1' : 'rgba(255,255,255,0.15)'),
                color: testSpeed === sim.speed ? '#FFFFFF' : themeStyles.textColorPrimary
              }}
              className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-all active:scale-95 cursor-pointer shrink-0"
            >
              {sim.label}
            </button>
          ))}

          {testSpeed !== null && (
            <button
              type="button"
              onClick={() => setTestSpeed(null)}
              style={{ backgroundColor: '#E2E8F0', color: '#1E293B' }}
              className="px-2 py-0.5 rounded-lg text-[10px] font-bold hover:bg-slate-300 transition-all cursor-pointer shrink-0"
              title="清除模擬速度，回歸 GPS 實測"
            >
              ✕ 恢復 GPS
            </button>
          )}
        </div>
      </div>

      <div 
        style={{
          backgroundColor: themeStyles.cardBg,
          borderColor: themeStyles.cardBorder,
          boxShadow: themeStyles.cardShadow
        }}
        className="rounded-2xl border p-3 flex flex-col items-center justify-center relative"
      >
        <div className="flex items-center justify-between w-full px-2 pb-1 border-b border-slate-100 text-xs">
          <span style={{ color: themeStyles.accentColor }} className="font-bold flex items-center gap-1">
            <span>{modeInfo.title}</span>
          </span>
          <div className="flex items-center gap-2">
            <span style={{ color: themeStyles.textColorMuted }} className="font-mono text-[11px]">
              刻度上限: <strong className="font-michroma">{dialMax}</strong> km/h
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen(true);
              }}
              style={{
                backgroundColor: isWhite ? '#F1F5F9' : isOLED ? '#18181B' : 'rgba(255,255,255,0.1)',
                borderColor: isWhite ? '#CBD5E1' : isOLED ? '#27272A' : 'rgba(255,255,255,0.15)',
                color: isWhite ? '#334155' : isOLED ? '#34D399' : '#FFFFFF'
              }}
              className="px-2 py-0.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 hover:opacity-80 active:scale-95 transition-all cursor-pointer shadow-xs"
              title="放大為全螢幕 HUD 儀表盤與 4 聯速度監測"
            >
              <span>⛶ 全螢幕 HUD</span>
            </button>
          </div>
        </div>

        {/* Needle Legend Pill (紅針時速 / 青藍針加速度) */}
        <div className="flex items-center justify-center gap-3 text-[10px] font-bold pt-1.5 opacity-90">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-1 rounded-full bg-red-600 inline-block" />
            <span style={{ color: themeStyles.textColorSecondary }}>紅針：即時時速</span>
          </span>
          <span className="opacity-30">|</span>
          <span className="flex items-center gap-1">
            <span style={{ backgroundColor: themeStyles.accelPositiveColor }} className="w-2.5 h-1 rounded-full inline-block" />
            <span style={{ color: themeStyles.textColorSecondary }}>青針：縱向加速度 (±{maxDialG}G)</span>
          </span>
        </div>

        <div 
          onClick={() => setIsFullscreen(true)}
          style={{ aspectRatio: '224 / 176' }}
          className="relative w-64 sm:w-72 flex items-center justify-center cursor-pointer group my-1"
          title="點擊儀表盤放大為全螢幕 HUD 模式"
        >
          {renderSpeedDialSVG(gradientId)}
        </div>

        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          style={{ color: themeStyles.textColorMuted }}
          className="text-[10px] font-medium opacity-70 hover:opacity-100 transition-opacity cursor-pointer flex items-center gap-1 mt-0.5"
        >
          <span>🔍</span>
          <span> 全螢幕 HUD mode </span>
        </button>

        <div 
          style={{ color: themeStyles.textColorSecondary }}
          className={`text-xs font-bold flex items-center justify-center gap-2.5 flex-wrap pt-1.5 border-t ${isOLED ? 'border-zinc-800' : 'border-slate-100'} w-full`}
        >
          <span>衝刺極速: <strong className={`${isOLED ? 'text-rose-400' : 'text-rose-600'} font-michroma font-bold`}>{displayStats?.maxSpeedKmh || '0.0'}</strong> km/h</span>
          <span className="opacity-40">|</span>
          <span>全程均速: <strong className={`${isOLED ? 'text-emerald-400' : 'text-emerald-700'} font-michroma font-bold`}>{displayStats?.avgSpeedKmh || '0.0'}</strong> km/h</span>
          <span className="opacity-40">|</span>
          <span>峰值加/減速: <strong style={{ color: themeStyles.accelPositiveColor }} className="font-mono font-bold">+{peakAccelG.toFixed(2)}G</strong> / <strong style={{ color: themeStyles.accelBrakeColor }} className="font-mono font-bold">-{peakBrakeG.toFixed(2)}G</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div 
          style={{
            backgroundColor: themeStyles.cardBg,
            borderColor: themeStyles.cardBorder,
            boxShadow: themeStyles.cardShadow
          }}
          className="p-3.5 sm:p-4 rounded-2xl border flex flex-col justify-between space-y-2.5"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span style={{ color: themeStyles.textColorSecondary }} className="flex items-center gap-1.5">
                <span className="text-base">⏱️</span>
                <span>活動總耗時</span>
              </span>
              <span style={{ color: isOLED ? '#F4F4F5' : themeStyles.accentColor }} className="font-mono text-[11px] font-bold">
                CHRONO
              </span>
            </div>
            
            <div 
              style={{ color: isOLED ? '#FFFFFF' : themeStyles.textColorPrimary }}
              className="text-3xl sm:text-4xl font-michroma font-bold tracking-tight leading-none my-2 text-center"
            >
              {displayStats?.durationFormatted || '00:00:00'}
            </div>
          </div>

          <div className={`grid grid-cols-2 gap-2 pt-2 border-t ${isWhite ? 'border-slate-100' : 'border-zinc-800'}`}>
            <div 
              style={{
                backgroundColor: isWhite 
                  ? (isRecording && !displayStats?.isStationary ? '#DCFCE7' : '#F0FDF4') 
                  : '#000000',
                borderColor: isWhite 
                  ? (isRecording && !displayStats?.isStationary ? '#22C55E' : '#BBF7D0') 
                  : (isRecording && !displayStats?.isStationary ? '#10B981' : '#059669')
              }}
              className="border-2 rounded-xl p-2.5 text-center transition-all shadow-xs"
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span 
                  style={{ color: isWhite ? '#15803D' : '#34D399' }} 
                  className="text-xs font-black"
                >
                  🟢 移動時間
                </span>
                {isRecording && !displayStats?.isStationary && (
                  <span className="px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] font-mono rounded font-black animate-pulse flex items-center gap-1 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    <span>計秒中</span>
                  </span>
                )}
              </div>
              <strong 
                style={{ color: isWhite ? '#14532D' : '#FFFFFF' }}
                className="text-base sm:text-lg font-michroma font-bold block truncate tracking-tight mt-0.5"
              >
                {displayStats?.movingTimeFormatted || '00:00:00'}
              </strong>
            </div>

            <div 
              style={{ 
                backgroundColor: isWhite 
                  ? (isRecording && displayStats?.isStationary ? '#FEF3C7' : '#FFFBEB') 
                  : '#000000', 
                borderColor: isWhite 
                  ? (isRecording && displayStats?.isStationary ? '#F59E0B' : '#FDE68A') 
                  : (isRecording && displayStats?.isStationary ? '#F59E0B' : '#D97706')
              }}
              className="border-2 rounded-xl p-2.5 text-center transition-all shadow-xs"
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span 
                  style={{ color: isWhite ? '#B45309' : '#FBBF24' }} 
                  className="text-xs font-black"
                >
                  ⏸️ 休息停頓
                </span>
                {isRecording && displayStats?.isStationary && (
                  <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-mono rounded font-black animate-pulse flex items-center gap-1 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    <span>計秒中</span>
                  </span>
                )}
              </div>
              <strong 
                style={{ color: isWhite ? '#78350F' : '#FDE68A' }}
                className="text-base sm:text-lg font-michroma font-bold block truncate tracking-tight mt-0.5"
              >
                {displayStats?.stoppedTimeFormatted || '00:00:00'}
              </strong>
            </div>
          </div>

          {isRecording && (
            <div 
              style={{ backgroundColor: isWhite ? '#F8FAFC' : isOLED ? '#09090B' : 'rgba(255,255,255,0.05)', borderColor: isWhite ? '#E2E8F0' : isOLED ? '#27272A' : 'rgba(255,255,255,0.1)' }}
              className="px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${displayStats?.isStationary ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
                <span style={{ color: themeStyles.textColorPrimary }} className="text-[11px] font-bold truncate">
                  {displayStats?.isStationary ? '休息停頓計秒中 (時速 ≤ 1.2)' : '移動計秒中'}
                </span>
              </div>
              {typeof toggleManualRest === 'function' && (
                <button
                  type="button"
                  onClick={toggleManualRest}
                  style={{
                    backgroundColor: displayStats?.isManuallyResting ? '#059669' : isOLED ? '#18181B' : '#FFFFFF',
                    borderColor: displayStats?.isManuallyResting ? '#047857' : isOLED ? '#3F3F46' : '#CBD5E1',
                    color: displayStats?.isManuallyResting ? '#FFFFFF' : isOLED ? '#F4F4F5' : '#334155'
                  }}
                  className="px-2 py-0.5 rounded-lg border text-[10px] font-bold shadow-sm transition-all active:scale-95 shrink-0 cursor-pointer"
                >
                  {displayStats?.isManuallyResting ? '🚶 結束手動休息' : '☕ 坐下休息打卡'}
                </button>
              )}
            </div>
          )}

          <div className={`pt-2 border-t ${isOLED ? 'border-zinc-800' : 'border-slate-100'} flex items-baseline justify-between`}>
            <span style={{ color: themeStyles.textColorSecondary }} className="text-xs font-bold">
              📏 累計路徑里程
            </span>
            <div className="flex items-baseline gap-1">
              <span style={{ color: isOLED ? '#F59E0B' : themeStyles.accentColor }} className="text-2xl sm:text-3xl font-michroma font-bold tracking-tight">
                {displayStats?.totalDistanceKm || '0.00'}
              </span>
              <span style={{ color: isOLED ? '#F59E0B' : themeStyles.accentColor }} className="text-xs font-michroma font-bold">KM</span>
            </div>
          </div>
        </div>

        <div 
          style={{
            backgroundColor: themeStyles.cardBg,
            borderColor: themeStyles.cardBorder,
            boxShadow: themeStyles.cardShadow
          }}
          className="p-3.5 sm:p-4 rounded-2xl border flex flex-col justify-between space-y-2.5"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span style={{ color: themeStyles.textColorSecondary }} className="flex items-center gap-1.5">
                <span className="text-base">⛰️</span>
                <span>當前海拔高度</span>
              </span>
              <div className="flex items-center gap-1.5">
                {displayStats?.elevationAccuracyM !== null && displayStats?.elevationAccuracyM !== undefined && (
                  <span
                    style={{
                      backgroundColor: displayStats.elevationAccuracyM <= 25 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                      color: displayStats.elevationAccuracyM <= 25 ? '#10B981' : '#F59E0B'
                    }}
                    className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold"
                    title="垂直 Z 軸衛星精度誤差（<= 25m 代表 3D 高度已收斂）"
                  >
                    ±{displayStats.elevationAccuracyM}m
                  </span>
                )}
                {typeof onCalibrateElevation === 'function' && (
                  <button
                    type="button"
                    onClick={handleCalibrateElevationClick}
                    style={{
                      backgroundColor: isWhite ? '#EFF6FF' : '#18181B',
                      borderColor: isWhite ? '#BFDBFE' : '#27272A',
                      color: isWhite ? '#1D4ED8' : '#38BDF8'
                    }}
                    className="px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer hover:opacity-85 active:scale-95"
                    title="點擊輸入已知真實海拔進行基準校正"
                  >
                    🎯 校正
                  </button>
                )}
              </div>
            </div>

            <div 
              onClick={typeof onCalibrateElevation === 'function' ? handleCalibrateElevationClick : undefined}
              style={{ color: isWhite ? '#1E40AF' : '#38BDF8' }}
              className={`text-3xl sm:text-4xl font-michroma font-bold tracking-normal leading-none my-2 flex items-baseline justify-center gap-2 text-center ${typeof onCalibrateElevation === 'function' ? 'cursor-pointer' : ''}`}
              title={typeof onCalibrateElevation === 'function' ? '點擊可手動輸入基準海拔進行校正' : undefined}
            >
              <span>{displayStats?.currentElevation !== null ? Number(displayStats.currentElevation).toLocaleString() : '--'}</span>
              <span style={{ color: themeStyles.textColorSecondary }} className="text-xs sm:text-sm font-bold font-michroma">公尺 (m)</span>
            </div>
          </div>

          <div className={`grid grid-cols-2 gap-2 pt-2 border-t ${isWhite ? 'border-slate-100' : 'border-zinc-800'}`}>
            <div 
              style={{ 
                backgroundColor: isWhite ? '#FFF1F2' : '#000000', 
                borderColor: isWhite ? '#FECDD3' : '#E11D48' 
              }}
              className="border-2 rounded-xl p-2.5 text-center shadow-xs"
            >
              <span 
                style={{ color: isWhite ? '#BE123C' : '#FB7185' }} 
                className="text-xs font-black block mb-0.5"
              >
                ▲ 總爬升
              </span>
              <strong 
                style={{ color: isWhite ? '#9F1239' : '#FDA4AF' }}
                className="text-base sm:text-lg font-michroma font-bold block truncate tracking-tight mt-0.5"
              >
                +{Number(displayStats?.totalAscentM || 0).toLocaleString()} m
              </strong>
            </div>

            <div 
              style={{ 
                backgroundColor: isWhite ? '#F0FDFA' : '#000000', 
                borderColor: isWhite ? '#CCFBF1' : '#0D9488' 
              }}
              className="border-2 rounded-xl p-2.5 text-center shadow-xs"
            >
              <span 
                style={{ color: isWhite ? '#0F766E' : '#2DD4BF' }} 
                className="text-xs font-black block mb-0.5"
              >
                ▼ 總下降
              </span>
              <strong 
                style={{ color: isWhite ? '#115E59' : '#5EEAD4' }}
                className="text-base sm:text-lg font-michroma font-bold block truncate tracking-tight mt-0.5"
              >
                -{Number(displayStats?.totalDescentM || 0).toLocaleString()} m
              </strong>
            </div>
          </div>

          <div className={`pt-2 border-t ${isWhite ? 'border-slate-100' : 'border-zinc-800'} flex items-center justify-between text-xs`}>
            <span style={{ color: themeStyles.textColorSecondary }} className="font-bold">峰谷跨距:</span>
            <span style={{ color: themeStyles.textColorPrimary }} className="font-bold">
              最低 <strong style={{ color: isWhite ? '#0284C7' : '#38BDF8' }} className="font-michroma font-bold">{displayStats?.minElevationM ? `${Number(displayStats.minElevationM).toLocaleString()}m` : '--'}</strong> ~ 最高 <strong style={{ color: isWhite ? '#E11D48' : '#FB7185' }} className="font-michroma font-bold">{displayStats?.maxElevationM ? `${Number(displayStats.maxElevationM).toLocaleString()}m` : '--'}</strong>
            </span>
          </div>
        </div>
      </div>

      {renderFourPodSpeedMatrix(false)}

      {isFullscreen && typeof document !== 'undefined' && createPortal(
        <div 
          style={{
            zIndex: 99999,
            background: themeStyles.wrapperBg,
            backgroundColor: isWhite ? '#F8FAFC' : isOLED ? '#000000' : '#0A0E17',
            color: isWhite ? '#0F172A' : '#FFFFFF',
            paddingTop: 'max(env(safe-area-inset-top), 4px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 4px)',
            paddingLeft: 'max(env(safe-area-inset-left), 10px)',
            paddingRight: 'max(env(safe-area-inset-right), 10px)'
          }}
          className="fixed inset-0 h-[100dvh] w-screen overflow-hidden flex flex-col justify-between select-none font-sans"
        >
          {/* 單行極簡頂部列：高度與「縮小 (ESC)」按鈕一致，「縮小 (ESC)」緊靠螢幕最右側 */}
          <div 
            style={{ borderColor: isWhite ? '#E2E8F0' : '#27272A' }}
            className="flex items-center justify-between w-full pb-1 border-b shrink-0 flex-nowrap gap-1.5"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isRecording ? "bg-red-500 animate-ping" : "bg-emerald-500"}`} />
              <span className="text-xs font-black tracking-tight truncate">
                🧭 車載 HUD
              </span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border font-mono shrink-0 ${
                isRecording 
                  ? "border-red-500/40 bg-red-500/10 text-red-400" 
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              }`}>
                {isRecording ? "REC" : "STANDBY"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {/* ☀️ 橫向車載 HUD 專用：螢幕不休眠常亮開關 */}
              {isLandscape && (
                <button
                  type="button"
                  data-testid="fs-keep-awake-btn"
                  onClick={() => setKeepScreenAwake(prev => !prev)}
                  style={{
                    backgroundColor: keepScreenAwake
                      ? '#059669'
                      : (isWhite ? '#FFFFFF' : isOLED ? '#18181B' : 'rgba(255,255,255,0.1)'),
                    borderColor: keepScreenAwake
                      ? '#10B981'
                      : (isWhite ? '#CBD5E1' : isOLED ? '#3F3F46' : 'rgba(255,255,255,0.15)'),
                    color: keepScreenAwake ? '#FFFFFF' : themeStyles.textColorPrimary
                  }}
                  className="px-2 py-0.5 rounded-lg text-[11px] font-bold border shadow-xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                  title="橫向車載 HUD 模式下，可自由切換是否保持螢幕常亮不休眠"
                >
                  <span>{keepScreenAwake ? '☀️ 常亮：開' : '💤 常亮：關'}</span>
                </button>
              )}

              <button
                type="button"
                data-testid="fs-theme-btn"
                title="切換全螢幕主題"
                onClick={() => {
                  const next = clusterTheme === "white" ? "oled" : clusterTheme === "oled" ? "obsidian" : "white";
                  setClusterTheme(next);
                  if (typeof onThemeChange === "function") onThemeChange(next);
                }}
                style={{
                  backgroundColor: isWhite ? "#FFFFFF" : isOLED ? "#18181B" : "rgba(255,255,255,0.1)",
                  borderColor: isWhite ? "#CBD5E1" : isOLED ? "#3F3F46" : "rgba(255,255,255,0.15)",
                  color: isOLED ? "#34D399" : themeStyles.textColorPrimary
                }}
                className="px-2 py-0.5 rounded-lg text-[11px] font-bold border shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer shrink-0"
              >
                {isWhite ? "⚪ 純白" : isOLED ? "🌙 極黑" : "🏎️ 曜石"}
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="px-2.5 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer shrink-0"
                title="離開全螢幕 (ESC)"
              >
                <span>✕</span>
                <span>縮小 (ESC)</span>
              </button>
            </div>
          </div>

          {/* 橫向 Landscape 模式：僅保留「儀表板、最高時速、最高加速度、累積里程、當前海拔」，上下零留黑、儀表板最大化 */}
          {isLandscape ? (
            <div 
              style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.72fr) minmax(0, 2.6fr) minmax(120px, 0.72fr)' }}
              className="flex-1 min-h-0 w-full items-stretch gap-2 pt-1"
            >
              {/* 左側極簡雙卡：最高時速 + 最高加速度 */}
              <div className="h-full flex flex-col justify-center gap-2 min-w-0">
                <div
                  style={{
                    backgroundColor: isWhite ? "#FFF1F2" : "#000000",
                    borderColor: isWhite ? "#FECDD3" : "#E11D48"
                  }}
                  className="flex-1 rounded-2xl border-2 p-2.5 flex flex-col items-center justify-center text-center shadow-xs"
                >
                  <span style={{ color: isWhite ? "#BE123C" : "#FB7185" }} className="text-xs font-black tracking-wide">
                    🚀 最高時速
                  </span>
                  <div
                    style={{ color: isWhite ? "#9F1239" : "#FB7185" }}
                    className="text-2xl sm:text-3xl font-michroma font-bold tracking-tight leading-none my-1.5"
                  >
                    {displayStats?.maxSpeedKmh || "0.0"}
                  </div>
                  <span style={{ color: isWhite ? "#E11D48" : "#F43F5E" }} className="text-[11px] font-mono font-bold">
                    km/h
                  </span>
                </div>

                <div
                  style={{
                    backgroundColor: isWhite ? "#EFF6FF" : "#000000",
                    borderColor: isWhite ? "#BFDBFE" : "#0284C7"
                  }}
                  className="flex-1 rounded-2xl border-2 p-2.5 flex flex-col items-center justify-center text-center shadow-xs"
                >
                  <span style={{ color: isWhite ? "#1D4ED8" : "#38BDF8" }} className="text-xs font-black tracking-wide">
                    ⚡ 最高加速度
                  </span>
                  <div
                    style={{ color: isWhite ? "#1E40AF" : "#38BDF8" }}
                    className="text-xl sm:text-2xl font-michroma font-bold tracking-tight leading-none my-1.5"
                  >
                    +{peakAccelG.toFixed(2)}G
                  </div>
                  <span style={{ color: isWhite ? "#2563EB" : "#0284C7" }} className="text-[11px] font-mono font-bold">
                    +{(peakAccelG * 9.80665).toFixed(1)} m/s²
                  </span>
                </div>
              </div>

              {/* 正中央：滿版撐滿上下高度的 252° 扇形雙針儀表盤（零上下留黑） */}
              <div className="h-full flex items-center justify-center min-w-0 overflow-hidden">
                <div 
                  onClick={() => setIsFullscreen(false)}
                  style={{
                    height: 'calc(100dvh - 42px)',
                    maxWidth: '100%',
                    aspectRatio: '224 / 176'
                  }}
                  className="relative flex items-center justify-center cursor-pointer"
                  title="點擊儀表盤縮小離開全螢幕"
                >
                  {renderSpeedDialSVG(`${gradientId}-fs-land`)}
                </div>
              </div>

              {/* 右側極簡雙卡：累積里程 + 當前海拔 */}
              <div className="h-full flex flex-col justify-center gap-2 min-w-0">
                <div
                  style={{
                    backgroundColor: isWhite ? "#FFFBEB" : "#000000",
                    borderColor: isWhite ? "#FDE68A" : "#D97706"
                  }}
                  className="flex-1 rounded-2xl border-2 p-2.5 flex flex-col items-center justify-center text-center shadow-xs"
                >
                  <span style={{ color: isWhite ? "#B45309" : "#FBBF24" }} className="text-xs font-black tracking-wide">
                    📏 累積里程
                  </span>
                  <div
                    style={{ color: isWhite ? "#92400E" : "#F59E0B" }}
                    className="text-2xl sm:text-3xl font-michroma font-bold tracking-tight leading-none my-1.5"
                  >
                    {displayStats?.totalDistanceKm || "0.00"}
                  </div>
                  <span style={{ color: isWhite ? "#D97706" : "#F59E0B" }} className="text-[11px] font-mono font-bold">
                    KM
                  </span>
                </div>

                <div
                  onClick={typeof onCalibrateElevation === 'function' ? handleCalibrateElevationClick : undefined}
                  style={{
                    backgroundColor: isWhite ? "#F0F9FF" : "#000000",
                    borderColor: isWhite ? "#BAE6FD" : "#0284C7"
                  }}
                  className={`flex-1 rounded-2xl border-2 p-2.5 flex flex-col items-center justify-center text-center shadow-xs ${typeof onCalibrateElevation === 'function' ? 'cursor-pointer active:scale-98' : ''}`}
                  title="點擊可輸入已知真實海拔高度進行校正"
                >
                  <span style={{ color: isWhite ? "#0369A1" : "#38BDF8" }} className="text-xs font-black tracking-wide">
                    ⛰️ 當前海拔 {typeof onCalibrateElevation === 'function' ? '🎯' : ''}
                  </span>
                  <div
                    style={{ color: isWhite ? "#0C4A6E" : "#38BDF8" }}
                    className="text-2xl sm:text-3xl font-michroma font-bold tracking-tight leading-none my-1.5"
                  >
                    {displayStats?.currentElevation !== null && displayStats?.currentElevation !== undefined
                      ? `${Number(displayStats.currentElevation).toLocaleString()}m`
                      : (displayStats?.maxElevationM ? `${Number(displayStats.maxElevationM).toLocaleString()}m` : "--")}
                  </div>
                  <span style={{ color: isWhite ? "#0284C7" : "#38BDF8" }} className="text-[11px] font-mono font-bold">
                    {displayStats?.elevationAccuracyM !== null && displayStats?.elevationAccuracyM !== undefined
                      ? `±${displayStats.elevationAccuracyM}m · 點擊校正`
                      : 'MSL 海拔'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 直向全螢幕模式：252° 扇形儀表板橫向撐滿視覺最大化 */}
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-1">
                <div 
                  onClick={() => setIsFullscreen(false)}
                  style={{ width: 'min(95vw, 64dvh)', aspectRatio: '224 / 176' }}
                  className="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-102"
                  title="點擊儀表盤縮小離開全螢幕"
                >
                  {renderSpeedDialSVG(`${gradientId}-fs`)}
                </div>

                <div 
                  style={{ color: themeStyles.textColorSecondary }}
                  className="text-xs font-bold flex items-center justify-center gap-2.5 flex-wrap mt-1"
                >
                  <span>極速: <strong className={`${isOLED ? "text-rose-400" : "text-rose-600"} font-michroma font-bold`}>{displayStats?.maxSpeedKmh || "0.0"}</strong> km/h</span>
                  <span className="opacity-40">|</span>
                  <span>均速: <strong className={`${isOLED ? "text-emerald-400" : "text-emerald-700"} font-michroma font-bold`}>{displayStats?.avgSpeedKmh || "0.0"}</strong> km/h</span>
                  <span className="opacity-40">|</span>
                  <span>加速度: <strong style={{ color: activeAccelNeedleColor }} className="font-mono font-bold">{formattedAccelG}</strong></span>
                </div>
              </div>

              <div className="w-full max-w-4xl mx-auto space-y-1.5 shrink-0">
                {renderFourPodSpeedMatrix(true, true)}

                <div 
                  style={{
                    backgroundColor: isWhite ? "#FFFFFF" : isOLED ? "#09090B" : "rgba(255,255,255,0.06)",
                    borderColor: isWhite ? "#E2E8F0" : isOLED ? "#27272A" : "rgba(255,255,255,0.1)"
                  }}
                  className="p-2 rounded-xl border flex items-center justify-around gap-1.5 text-center text-xs"
                >
                  <div>
                    <span style={{ color: themeStyles.textColorMuted }} className="text-[10px] block">📏 累計里程</span>
                    <strong style={{ color: isOLED ? "#F59E0B" : themeStyles.distanceColor }} className="text-sm font-michroma font-bold">
                      {displayStats?.totalDistanceKm || "0.00"} <span className="text-[10px] font-normal">km</span>
                    </strong>
                  </div>
                  <div className="opacity-20">|</div>
                  <div>
                    <span style={{ color: themeStyles.textColorMuted }} className="text-[10px] block">⚡ 縱向 G 值</span>
                    <strong style={{ color: activeAccelNeedleColor }} className="text-sm font-mono font-bold">
                      {formattedAccelG}
                    </strong>
                  </div>
                  <div className="opacity-20">|</div>
                  <div>
                    <span style={{ color: themeStyles.textColorMuted }} className="text-[10px] block">⛰️ 當前海拔</span>
                    <strong style={{ color: isOLED ? "#38BDF8" : themeStyles.altitudeColor }} className="text-sm font-michroma font-bold">
                      {displayStats?.currentElevation !== null && displayStats?.currentElevation !== undefined ? `${displayStats.currentElevation}m` : (displayStats?.maxElevationM ? `${displayStats.maxElevationM}m` : "--")}
                    </strong>
                  </div>
                  <div className="opacity-20">|</div>
                  <div>
                    <span style={{ color: themeStyles.textColorMuted }} className="text-[10px] block">⏱️ 活動耗時</span>
                    <strong style={{ color: isOLED ? "#FFFFFF" : themeStyles.chronoColor }} className="text-sm font-michroma font-bold">
                      {displayStats?.durationFormatted || "00:00:00"}
                    </strong>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
