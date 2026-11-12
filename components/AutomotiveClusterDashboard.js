'use client';

import React, { useId, useState } from 'react';

/**
 * 🏎️ AutomotiveClusterDashboard
 * 頂級車廠米色護眼數位儀表板 (Luxury Classic Automotive Cluster - Beige Eye-Protection Edition)
 * 支援全域動態量程：徒步 (12) → 單車 (60) → 汽車 (160) → 高鐵 (350) → 飛機 (1000 km/h)
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
  const peak = Math.max(speed, maxRecordedSpeed);
  if (peak <= 10) return 12;      // 🚶 健行 (高解析度)
  if (peak <= 25) return 30;      // 🏃 慢跑衝刺
  if (peak <= 55) return 60;      // 🚴 單車騎行
  if (peak <= 100) return 120;    // 🛵 機車公路
  if (peak <= 160) return 180;    // 🚗 汽車巡航
  if (peak <= 320) return 350;    // 🚄 高鐵特快
  return 1000;                    // ✈️ 飛機民航巡航 (800~1000 km/h)
}

function getModeTitle(dialMax) {
  if (dialMax >= 800) return { title: '✈️ 航空巡航模式 (Aviation HUD)', desc: '民航客機高空巡航時速 800~1000 km/h' };
  if (dialMax >= 300) return { title: '🚄 軌道極速模式 (Rail Express)', desc: '台灣高鐵巡航時速 300 km/h' };
  if (dialMax >= 150) return { title: '🚗 汽車公路模式 (Highway Cruise)', desc: '一般道路與高速公路行駛' };
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
  onThemeChange = null
}) {
  const gradientId = useId();
  // 支援三種主題：'white' (首頁純白) | 'oled' (OLED 極黑 0 耗電) | 'obsidian' (曜石賽道)
  const [clusterTheme, setClusterTheme] = useState(theme || 'white');
  const [speedMode, setSpeedMode] = useState('auto'); // 'auto' | 'hike' | 'bike' | 'drive' | 'train' | 'plane'

  // 同步外部傳入之 theme
  React.useEffect(() => {
    if (theme && (theme === 'white' || theme === 'oled' || theme === 'obsidian')) {
      setClusterTheme(theme);
    }
  }, [theme]);

  // Interactive Speed Simulation & Self-check Needle Sweep
  const [testSpeed, setTestSpeed] = useState(null);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepAngle, setSweepAngle] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false); // ⛶ 全螢幕 HUD 儀表盤模式

  // Keyboard shortcut: ESC to exit fullscreen
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isFullscreen]);

  // Trigger Gauge Sweep (超跑發動指針自檢全幅掃描 0 -> MAX -> Settle)
  const triggerNeedleSweep = () => {
    if (isSweeping) return;
    setIsSweeping(true);
    setSweepAngle(120); // Sweep to max scale (+120 deg)
    setTimeout(() => {
      setSweepAngle(-120); // Sweep back to zero (-120 deg)
      setTimeout(() => {
        setSweepAngle(null); // Settle smoothly at actual speed
        setIsSweeping(false);
      }, 550);
    }, 600);
  };

  // Run ignition sweep once upon opening/mounting so needle moves immediately
  React.useEffect(() => {
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
    // When reviewing past tracks/presets, show cruising moving average speed rather than sitting frozen at 0
    if (baseCurrentSpeed > 0) return baseCurrentSpeed;
    const mAvg = parseFloat(displayStats?.movingAvgSpeedKmh || 0);
    if (mAvg > 0) return mAvg;
    const avg = parseFloat(displayStats?.avgSpeedKmh || 0);
    if (avg > 0) return avg;
    return 0;
  })();

  const avgSpeed = parseFloat(displayStats?.avgSpeedKmh || 0);
  const movingAvgSpeed = parseFloat(displayStats?.movingAvgSpeedKmh || displayStats?.avgSpeedKmh || 0);
  const maxSpeed = parseFloat(displayStats?.maxSpeedKmh || 0);
  const minSpeed = parseFloat(displayStats?.minSpeedKmh || 0);

  // Dynamic dial scale based on selected mode or automatic detection
  const selectedConfig = SPEED_MODES.find(m => m.id === speedMode);
  const dialMax = selectedConfig?.max || getAutoDialMax(effectiveSpeed, maxSpeed);
  const modeInfo = getModeTitle(dialMax);

  const speedRatio = Math.min(1, Math.max(0, effectiveSpeed / dialMax));
  
  // Needle & Arc geometry: 240-degree sweep from -120 deg (0) to +120 deg (max)
  const startAngleDeg = -120;
  const sweepAngleDeg = 240;
  const targetAngleDeg = startAngleDeg + (speedRatio * sweepAngleDeg);
  const currentAngleDeg = sweepAngle !== null ? sweepAngle : targetAngleDeg;

  // Center (cx, cy) and radius for larger 240x240 SVG gauge
  const cx = 120;
  const cy = 128;
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

  // Speedometer ticks with human-friendly intervals (0, 200, 400, 600, 800, 1000 for plane; 0, 40, 80, 120, 160 for car, etc.)
  const ticks = (() => {
    let step = 2;
    let majorFreq = 1;
    let minorStep = 1;
    if (dialMax >= 1000) {
      step = 200; // 0, 200, 400, 600, 800, 1000
      majorFreq = 1;
      minorStep = 100;
    } else if (dialMax >= 300) {
      step = 50; // 0, 50, 100, 150, 200, 250, 300, 350
      majorFreq = 1;
      minorStep = 25;
    } else if (dialMax >= 150) {
      step = 20; // 0, 20, 40, 60, 80, 100, 120, 140, 160
      majorFreq = 2; // labels on 0, 40, 80, 120, 160
      minorStep = 10;
    } else if (dialMax >= 50) {
      step = 10; // 0, 10, 20, 30, 40, 50, 60
      majorFreq = 1;
      minorStep = 5;
    } else if (dialMax >= 25) {
      step = 5; // 0, 5, 10, 15, 20, 25, 30
      majorFreq = 1;
      minorStep = 2.5;
    } else {
      // 徒步健行 12 km/h: 完美對稱 0, 2, 4, 6(頂峰), 8, 10, 12
      step = 2;
      majorFreq = 1; // 每一格都有主刻度數字，頂峰剛好是 6
      minorStep = 1; // 1, 3, 5, 7, 9, 11 為副刻度線
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
      // 將標籤位置推近外環 (r=73)，徹底遠離中心文字，杜絕重疊碰撞
      const labelPos = polarToCartesian(cx, cy, 73, angle);
      arr.push({ val: Math.round(val), outer, inner, labelPos, isMajor, isLabeled });
    }
    return arr;
  })();

  const isWhite = clusterTheme === 'white';
  const isOLED = clusterTheme === 'oled';

  // Palette definitions: 與首頁同步之純白風格 (Default) ✕ OLED 極黑 (0 耗電) ✕ 曜石賽道
  const themeStyles = isWhite ? {
    // ⚪ 與首頁台灣露營地研究中心 100% 同步之雪白現代風格 (Default)
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
    altitudeColor: '#1E3A8A'
  } : isOLED ? {
    // 🌙 OLED 極黑 0 耗電色彩編碼高對比方案 (True OLED #000000 Pixel-Off)
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
    speedColor: '#10B981',        // ⚡ 鮮明翡翠綠
    chronoColor: '#FFFFFF',       // ⏱️ 高對比冷白
    distanceColor: '#F59E0B',     // 📏 活力琥珀橘
    altitudeColor: '#38BDF8'      // ⛰️ 冰川天藍
  } : {
    // 🏎️ 曜石賽道夜間模式
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
    altitudeColor: '#60A5FA'
  };

  // 🏎️ Reusable Speedometer Dial SVG
  const renderSpeedDialSVG = (svgId = gradientId) => (
    <svg viewBox="0 0 240 240" className="w-full h-full overflow-visible">
      <defs>
        {/* Luminous Speed Gradient */}
        <linearGradient id={`${svgId}-speed-grad`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="55%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#DC2626" />
        </linearGradient>

        {/* Dial Face Inner Shadow / Glow */}
        <radialGradient id={`${svgId}-dial-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={isWhite ? '#FFFFFF' : 'rgba(245, 158, 11, 0.15)'} />
          <stop offset="75%" stopColor={isWhite ? '#F8FAFC' : 'rgba(15, 23, 42, 0.5)'} />
          <stop offset="100%" stopColor={isWhite ? '#F1F5F9' : '#0B0F17'} />
        </radialGradient>

        <filter id={`${svgId}-needle-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.18)" />
        </filter>
      </defs>

      {/* Dial Face Background */}
      <circle cx={cx} cy={cy} r="95" fill={`url(#${svgId}-dial-glow)`} />

      {/* Outer Metallic Bezel Rings */}
      <circle 
        cx={cx} 
        cy={cy} 
        r="108" 
        fill="none" 
        stroke={themeStyles.gaugeBezelOuter} 
        strokeWidth="2.5" 
      />
      <circle 
        cx={cx} 
        cy={cy} 
        r="105" 
        fill="none" 
        stroke={themeStyles.gaugeBezelInner} 
        strokeWidth="1.5" 
      />

      {/* Gauge Background Track Arc */}
      <path
        d={describeArc(cx, cy, 94, startAngleDeg, startAngleDeg + sweepAngleDeg)}
        fill="none"
        stroke={themeStyles.gaugeTrack}
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* Active Luminous Progress Arc */}
      {speedRatio > 0.005 && (
        <path
          d={describeArc(cx, cy, 94, startAngleDeg, currentAngleDeg)}
          fill="none"
          stroke={`url(#${svgId}-speed-grad)`}
          strokeWidth="8"
          strokeLinecap="round"
        />
      )}

      {/* Ticks and Scale Numbers (Large and High Contrast, Outer Rim Alignment) */}
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
              fontSize={dialMax >= 1000 ? "10" : "12"}
              fontFamily="monospace"
              fontWeight="900"
            >
              {t.val}
            </text>
          )}
        </g>
      ))}

      {/* Speed Digital Readout */}
      <text 
        x={cx} 
        y={cy - 14} 
        textAnchor="middle" 
        fill={isOLED ? '#10B981' : themeStyles.textColorPrimary} 
        fontSize={effectiveSpeed >= 100 ? "38" : "44"} 
        fontFamily="monospace" 
        fontWeight="900" 
      >
        {effectiveSpeed.toFixed(1)}
      </text>
      <text 
        x={cx} 
        y={cy + 26} 
        textAnchor="middle" 
        fill={isOLED ? '#34D399' : themeStyles.textColorSecondary} 
        fontSize="12" 
        fontFamily="monospace" 
        fontWeight="900" 
        letterSpacing="2"
      >
        KM / H
      </text>
      <text 
        x={cx} 
        y={cy + 42} 
        textAnchor="middle" 
        fill={isOLED ? '#F59E0B' : themeStyles.accentColor} 
        fontSize="11" 
        fontFamily="sans-serif" 
        fontWeight="900" 
        letterSpacing="0.5"
      >
        {testSpeed !== null ? '⚡ 模擬試跑' : (scrubbedSpeed !== null && scrubbedSpeed !== undefined ? '📍 剖面點時速' : (!isRecording && effectiveSpeed > 0 ? '🚶 步道巡航均速' : '即時行走速度'))}
      </text>

      {/* Speed Needle Pointer */}
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
        {/* Needle Blade */}
        <polygon
          points={`${cx - 2.5},${cy} ${cx},42 ${cx + 2.5},${cy}`}
          fill="#DC2626"
        />
        <line x1={cx} y1={cy} x2={40} stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
        {/* Counterweight Tail */}
        <polygon
          points={`${cx - 2},${cy} ${cx},${cy + 16} ${cx + 2},${cy}`}
          fill="#991B1B"
        />
        {/* Center Pivot Cap */}
        <circle cx={cx} cy={cy} r="10" fill={themeStyles.gaugeCenterCap} stroke={themeStyles.gaugeCenterCapBorder} strokeWidth="2" />
        <circle cx={cx} cy={cy} r="3.5" fill="#FFFFFF" />
      </g>
    </svg>
  );

  {/* ⚡ Reusable 4-Pod Speed Matrix (四聯速度監測遙測陣列) */}
  const renderFourPodSpeedMatrix = (isFs = false) => (
    <div 
      style={{
        backgroundColor: themeStyles.cardBg,
        borderColor: themeStyles.cardBorder,
        boxShadow: themeStyles.cardShadow
      }}
      className={`p-3 sm:p-3.5 rounded-2xl border space-y-2.5 ${isFs ? 'w-full' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span style={{ color: themeStyles.textColorPrimary }} className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
          <span className="text-base">⚡</span>
          <span>4 聯速度監測遙測陣列 (一眼確認)</span>
        </span>
        <span style={{ color: themeStyles.textColorMuted }} className="text-xs font-mono font-bold">
          單位：公里/小時 (km/h)
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Gauge 1: 平均時速 (全程含休息停頓) */}
        <div 
          style={{ 
            backgroundColor: isWhite ? '#FFFFFF' : '#000000', 
            borderColor: isWhite ? '#E2E8F0' : '#27272A' 
          }}
          className="border-2 rounded-2xl p-2.5 flex flex-col justify-between text-center shadow-xs"
          title="全程平均時速：總里程 ÷ 總耗時（包含所有休息停頓與拍照時間）"
        >
          <span style={{ color: themeStyles.textColorSecondary }} className="text-xs font-bold block mb-1">
            平均時速
          </span>
          <div 
            style={{ color: isWhite ? themeStyles.textColorPrimary : '#FFFFFF' }}
            className="text-2xl sm:text-3xl font-mono font-black tracking-tight leading-none my-1"
          >
            {displayStats?.avgSpeedKmh || '0.0'}
          </div>
          <span style={{ color: themeStyles.textColorMuted }} className="text-[11px] font-mono font-bold block">
            km/h (全程含停頓)
          </span>
        </div>

        {/* Gauge 2: 移動均速 (純移動巡航·已扣除休息) */}
        <div 
          style={{ 
            backgroundColor: isWhite ? '#F0FDF4' : '#000000', 
            borderColor: isWhite ? '#BBF7D0' : '#059669' 
          }}
          className="border-2 rounded-2xl p-2.5 flex flex-col justify-between text-center shadow-xs"
          title="純移動平均時速：移動距離 ÷ 移動時間（已自動扣除所有中途休息停頓）"
        >
          <span style={{ color: isWhite ? '#15803D' : '#34D399' }} className="text-xs font-bold block mb-1">
            移動均速
          </span>
          <div 
            style={{ color: isWhite ? '#166534' : '#34D399' }}
            className="text-2xl sm:text-3xl font-mono font-black tracking-tight leading-none my-1"
          >
            {displayStats?.movingAvgSpeedKmh || displayStats?.avgSpeedKmh || '0.0'}
          </div>
          <span style={{ color: isWhite ? '#16A34A' : '#10B981' }} className="text-[11px] font-mono font-bold block">
            km/h (純移動·已扣休息)
          </span>
        </div>

        {/* Gauge 3: 最高時速 (Max Peak Speed - 衝刺極速) */}
        <div 
          style={{ 
            backgroundColor: isWhite ? '#FFF1F2' : '#000000', 
            borderColor: isWhite ? '#FECDD3' : '#E11D48' 
          }}
          className="border-2 rounded-2xl p-2.5 flex flex-col justify-between text-center shadow-xs"
          title="行進過程中的最高瞬間極速"
        >
          <span style={{ color: isWhite ? '#BE123C' : '#FB7185' }} className="text-xs font-bold block mb-1">
            最高時速
          </span>
          <div 
            style={{ color: isWhite ? '#9F1239' : '#FB7185' }}
            className="text-2xl sm:text-3xl font-mono font-black tracking-tight leading-none my-1"
          >
            {displayStats?.maxSpeedKmh || '0.0'}
          </div>
          <span style={{ color: isWhite ? '#E11D48' : '#F43F5E' }} className="text-[11px] font-mono font-bold block">
            km/h (極速峰值)
          </span>
        </div>

        {/* Gauge 4: 最低時速 (Min Climb Pace - 爬坡慢速) */}
        <div 
          style={{ 
            backgroundColor: isWhite ? '#EFF6FF' : '#000000', 
            borderColor: isWhite ? '#BFDBFE' : '#0284C7' 
          }}
          className="border-2 rounded-2xl p-2.5 flex flex-col justify-between text-center shadow-xs"
          title="移動中的最慢步速（通常為吃力上坡攀爬時）"
        >
          <span style={{ color: isWhite ? '#1D4ED8' : '#38BDF8' }} className="text-xs font-bold block mb-1">
            最低時速
          </span>
          <div 
            style={{ color: isWhite ? '#1E40AF' : '#38BDF8' }}
            className="text-2xl sm:text-3xl font-mono font-black tracking-tight leading-none my-1"
          >
            {displayStats?.minSpeedKmh || '0.0'}
          </div>
          <span style={{ color: isWhite ? '#2563EB' : '#0284C7' }} className="text-[11px] font-mono font-bold block">
            km/h (爬坡慢速)
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
      {/* 🏁 Header Bar: 儀表連線狀態與風格切換 */}
      <div 
        style={{ borderColor: themeStyles.topBarBorder }}
        className="flex items-center justify-between pb-2.5 border-b"
      >
        <div className="flex items-center gap-2">
          {/* Active Status Beacon */}
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
              {isRecording ? 'GPS 記錄中 (REC)' : '儀表待機中 (READY)'}
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

        {/* Theme Switcher Button */}
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

      {/* 🚀 速度情境量程快速切換 (支援徒步、單車、開車、高鐵、飛機 1000 km/h) */}
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

      {/* ⚡ 指針動態自檢與速度模擬試跑列 (點擊看紅針滑動旋轉) */}
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
            title="像超跑啟動一樣指針全幅掃描自檢"
          >
            <span>🏎️</span>
            <span>指針自檢 (Sweep)</span>
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

      {/* 🏎️ SECTION 1: CENTRAL SPEEDOMETER GAUGE (超大清晰車廠指針儀) */}
      <div 
        style={{
          backgroundColor: themeStyles.cardBg,
          borderColor: themeStyles.cardBorder,
          boxShadow: themeStyles.cardShadow
        }}
        className="rounded-2xl border p-3 flex flex-col items-center justify-center relative"
      >
        {/* Dynamic Mode Annunciator Banner */}
        <div className="flex items-center justify-between w-full px-2 pb-1 border-b border-slate-100 text-xs">
          <span style={{ color: themeStyles.accentColor }} className="font-bold flex items-center gap-1">
            <span>{modeInfo.title}</span>
          </span>
          <div className="flex items-center gap-2">
            <span style={{ color: themeStyles.textColorMuted }} className="font-mono text-[11px]">
              刻度上限: <strong>{dialMax}</strong> km/h
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

        {/* Speedometer Dial (Clickable to enter fullscreen) */}
        <div 
          onClick={() => setIsFullscreen(true)}
          className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center cursor-pointer group"
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
          <span>點擊儀表盤可放大為全螢幕 HUD 模式</span>
        </button>

        {/* Speed Peak & Average Summary Banner */}
        <div 
          style={{ color: themeStyles.textColorSecondary }}
          className={`text-xs sm:text-sm font-mono font-bold flex items-center justify-center gap-3 pt-1.5 border-t ${isOLED ? 'border-zinc-800' : 'border-slate-100'} w-full`}
        >
          <span>衝刺極速: <strong className={`${isOLED ? 'text-rose-400' : 'text-rose-600'} text-sm sm:text-base font-black`}>{displayStats?.maxSpeedKmh || '0.0'}</strong> km/h</span>
          <span className="opacity-40">|</span>
          <span>全程均速: <strong className={`${isOLED ? 'text-emerald-400' : 'text-emerald-700'} text-sm sm:text-base font-black`}>{displayStats?.avgSpeedKmh || '0.0'}</strong> km/h</span>
        </div>
      </div>

      {/* 🏎️ SECTION 2: DUAL COCKPIT WINGS (時間與海拔雙翼 - 大字體排版) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        
        {/* ── LEFT WING: CHRONOGRAPH & TRIP (計時與里程) ── */}
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
            
            {/* GIANT DURATION DISPLAY (人眼秒看) */}
            <div 
              style={{ color: isOLED ? '#FFFFFF' : themeStyles.textColorPrimary }}
              className="text-3xl sm:text-4xl font-mono font-black tracking-tight leading-none my-1"
            >
              {displayStats?.durationFormatted || '00:00:00'}
            </div>
          </div>

          {/* Moving & Rest Breakdowns */}
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
                className="text-base sm:text-lg font-mono font-black block truncate tracking-tight"
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
                className="text-base sm:text-lg font-mono font-black block truncate tracking-tight"
              >
                {displayStats?.stoppedTimeFormatted || '00:00:00'}
              </strong>
            </div>
          </div>

          {/* Live Motion/Rest Status Banner & Manual Rest Switch */}
          {isRecording && (
            <div 
              style={{ backgroundColor: isWhite ? '#F8FAFC' : isOLED ? '#09090B' : 'rgba(255,255,255,0.05)', borderColor: isWhite ? '#E2E8F0' : isOLED ? '#27272A' : 'rgba(255,255,255,0.1)' }}
              className="px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${displayStats?.isStationary ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
                <span style={{ color: themeStyles.textColorPrimary }} className="text-[11px] font-bold truncate">
                  {displayStats?.isStationary ? '休息停頓計秒中 (時速 ≤ 0.8)' : '健行移動計秒中'}
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

          {/* Trip Odometer */}
          <div className={`pt-2 border-t ${isOLED ? 'border-zinc-800' : 'border-slate-100'} flex items-baseline justify-between`}>
            <span style={{ color: themeStyles.textColorSecondary }} className="text-xs font-bold">
              📏 累計路徑里程
            </span>
            <div className="flex items-baseline gap-1 font-mono">
              <span style={{ color: isOLED ? '#F59E0B' : themeStyles.accentColor }} className="text-2xl sm:text-3xl font-black tracking-tight">
                {displayStats?.totalDistanceKm || '0.00'}
              </span>
              <span style={{ color: isOLED ? '#F59E0B' : themeStyles.accentColor }} className="text-sm font-black">KM</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT WING: ALTIMETRY & INCLINE (高度與爬升) ── */}
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
              <span 
                style={{ color: isWhite ? '#1D4ED8' : '#38BDF8' }} 
                className="font-mono text-[11px] font-bold"
              >
                ALTIMETER
              </span>
            </div>

            {/* GIANT ALTITUDE DISPLAY (人眼秒看 - 支援飛機萬米高空) */}
            <div 
              style={{ color: isWhite ? '#1E40AF' : '#38BDF8' }}
              className="text-3xl sm:text-4xl font-mono font-black tracking-tight leading-none my-1 flex items-baseline gap-1.5"
            >
              <span>{displayStats?.currentElevation !== null ? Number(displayStats.currentElevation).toLocaleString() : '--'}</span>
              <span style={{ color: themeStyles.textColorSecondary }} className="text-sm sm:text-base font-bold font-mono">公尺 (m)</span>
            </div>
          </div>

          {/* Vertical Gain & Loss Telemetry */}
          <div className={`grid grid-cols-2 gap-2 pt-2 border-t ${isWhite ? 'border-slate-100' : 'border-zinc-800'}`}>
            {/* 總爬升 (Ascent) */}
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
                className="text-base sm:text-lg font-mono font-black block truncate tracking-tight"
              >
                +{Number(displayStats?.totalAscentM || 0).toLocaleString()} m
              </strong>
            </div>

            {/* 總下降 (Descent) */}
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
                className="text-base sm:text-lg font-mono font-black block truncate tracking-tight"
              >
                -{Number(displayStats?.totalDescentM || 0).toLocaleString()} m
              </strong>
            </div>
          </div>

          {/* Min / Max Elevation Range */}
          <div className={`pt-2 border-t ${isWhite ? 'border-slate-100' : 'border-zinc-800'} flex items-center justify-between text-xs font-mono`}>
            <span style={{ color: themeStyles.textColorSecondary }} className="font-bold">峰谷跨距:</span>
            <span style={{ color: themeStyles.textColorPrimary }} className="font-bold">
              最低 <strong style={{ color: isWhite ? '#0284C7' : '#38BDF8' }} className="font-black">{displayStats?.minElevationM ? `${Number(displayStats.minElevationM).toLocaleString()}m` : '--'}</strong> ~ 最高 <strong style={{ color: isWhite ? '#E11D48' : '#FB7185' }} className="font-black">{displayStats?.maxElevationM ? `${Number(displayStats.maxElevationM).toLocaleString()}m` : '--'}</strong>
            </span>
          </div>
        </div>

      </div>

      {/* 🏁 SECTION 3: 4-POD RACING AUXILIARY GAUGES (底層 4 聯大字體速度分析儀表) */}
      {renderFourPodSpeedMatrix(false)}

      {/* ⛶ 全螢幕車載 HUD 儀表盤 & 4 聯速度遙測模式 */}
      {isFullscreen && (
        <div 
          style={{
            backgroundColor: isWhite ? '#F8FAFC' : '#000000',
            color: isWhite ? '#0F172A' : '#FFFFFF'
          }}
          className="fixed inset-0 z-[100] flex flex-col justify-between p-3.5 sm:p-6 overflow-y-auto animate-in fade-in duration-200 select-none font-sans"
        >
          {/* Top Bar */}
          <div 
            style={{ borderColor: isWhite ? '#E2E8F0' : '#27272A' }}
            className="flex items-center justify-between w-full pb-3 border-b shrink-0 flex-wrap gap-2"
          >
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isRecording ? "bg-red-500 animate-ping" : "bg-emerald-500"}`} />
              <div>
                <h2 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-2">
                  <span>🧭 車載 HUD 儀表盤 · 4 聯速度遙測</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border font-mono ${
                    isRecording 
                      ? "border-red-500/40 bg-red-500/10 text-red-400" 
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  }`}>
                    {isRecording ? "REC 記錄中" : "STANDBY 待機"}
                  </span>
                </h2>
                <p className={`text-[11px] ${isOLED ? "text-zinc-400" : "text-slate-500"}`}>
                  {displayTitle || "全螢幕即時遙測 HUD"} · 刻度上限 {dialMax} km/h
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Theme toggle */}
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
                className="px-2.5 py-1 rounded-xl text-xs font-bold border shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                {isWhite ? "⚪ 純白" : isOLED ? "🌙 極黑" : "🏎️ 曜石"}
              </button>

              {/* Close / Exit Fullscreen */}
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                title="離開全螢幕 (ESC)"
              >
                <span>✕</span>
                <span>縮小 (ESC)</span>
              </button>
            </div>
          </div>

          {/* Central Main Area: Massive Gauge Dial */}
          <div className="flex-1 flex flex-col items-center justify-center my-3 sm:my-5">
            <div 
              onClick={() => setIsFullscreen(false)}
              className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 flex items-center justify-center cursor-pointer transition-transform hover:scale-102"
              title="點擊儀表盤縮小離開全螢幕"
            >
              {renderSpeedDialSVG(`${gradientId}-fs`)}
            </div>

            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              style={{ color: themeStyles.textColorMuted }}
              className="text-[11px] font-medium opacity-70 hover:opacity-100 transition-opacity cursor-pointer flex items-center gap-1 mt-1"
            >
              <span>✕</span>
              <span>點擊儀表盤或按 ESC 即可離開全螢幕</span>
            </button>

            {/* Peak & Average Summary Banner */}
            <div 
              style={{ color: themeStyles.textColorSecondary }}
              className="text-xs sm:text-base font-mono font-bold flex items-center justify-center gap-4 mt-2"
            >
              <span>衝刺極速: <strong className={`${isOLED ? "text-rose-400" : "text-rose-600"} text-base sm:text-lg font-black`}>{displayStats?.maxSpeedKmh || "0.0"}</strong> km/h</span>
              <span className="opacity-40">|</span>
              <span>全程均速: <strong className={`${isOLED ? "text-emerald-400" : "text-emerald-700"} text-base sm:text-lg font-black`}>{displayStats?.avgSpeedKmh || "0.0"}</strong> km/h</span>
            </div>
          </div>

          {/* Bottom Area: 4-Pod Speed Matrix + Telemetry Strip */}
          <div className="w-full max-w-4xl mx-auto space-y-3 shrink-0">
            {/* 4 聯速度監測遙測陣列 */}
            {renderFourPodSpeedMatrix(true)}

            {/* Bottom 3-Pod Telemetry Strip: 里程 · 海拔 · 總計時 */}
            <div 
              style={{
                backgroundColor: isWhite ? "#FFFFFF" : isOLED ? "#09090B" : "rgba(255,255,255,0.06)",
                borderColor: isWhite ? "#E2E8F0" : isOLED ? "#27272A" : "rgba(255,255,255,0.1)"
              }}
              className="p-2.5 sm:p-3 rounded-2xl border flex items-center justify-around gap-2 text-center text-xs font-mono"
            >
              <div>
                <span style={{ color: themeStyles.textColorMuted }} className="text-[10px] block">📏 累計里程</span>
                <strong style={{ color: isOLED ? "#F59E0B" : themeStyles.distanceColor }} className="text-sm sm:text-base font-black">
                  {displayStats?.totalDistanceKm || "0.00"} <span className="text-xs font-normal">km</span>
                </strong>
              </div>
              <div className="opacity-20">|</div>
              <div>
                <span style={{ color: themeStyles.textColorMuted }} className="text-[10px] block">⛰️ 當前海拔</span>
                <strong style={{ color: isOLED ? "#38BDF8" : themeStyles.altitudeColor }} className="text-sm sm:text-base font-black">
                  {displayStats?.currentElevation !== null && displayStats?.currentElevation !== undefined ? `${displayStats.currentElevation}m` : (displayStats?.maxElevationM ? `${displayStats.maxElevationM}m` : "--")}
                </strong>
              </div>
              <div className="opacity-20">|</div>
              <div>
                <span style={{ color: themeStyles.textColorMuted }} className="text-[10px] block">⏱️ 活動耗時</span>
                <strong style={{ color: isOLED ? "#FFFFFF" : themeStyles.chronoColor }} className="text-sm sm:text-base font-black">
                  {displayStats?.durationFormatted || "00:00:00"}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
