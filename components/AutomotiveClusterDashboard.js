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
  displayTitle = ''
}) {
  const gradientId = useId();
  // 預設為米色護眼模式 ('beige')，亦支援點擊切換為黑曜賽道 ('obsidian')
  const [clusterTheme, setClusterTheme] = useState('beige');
  const [speedMode, setSpeedMode] = useState('auto'); // 'auto' | 'hike' | 'bike' | 'drive' | 'train' | 'plane'

  // Current speed & telemetry metrics
  const currentSpeed = parseFloat(displayStats?.currentSpeedKmh || 0);
  const avgSpeed = parseFloat(displayStats?.avgSpeedKmh || 0);
  const movingAvgSpeed = parseFloat(displayStats?.movingAvgSpeedKmh || displayStats?.avgSpeedKmh || 0);
  const maxSpeed = parseFloat(displayStats?.maxSpeedKmh || 0);
  const minSpeed = parseFloat(displayStats?.minSpeedKmh || 0);

  // Dynamic dial scale based on selected mode or automatic detection
  const selectedConfig = SPEED_MODES.find(m => m.id === speedMode);
  const dialMax = selectedConfig?.max || getAutoDialMax(currentSpeed, maxSpeed);
  const modeInfo = getModeTitle(dialMax);

  const speedRatio = Math.min(1, Math.max(0, currentSpeed / dialMax));
  
  // Needle & Arc geometry: 240-degree sweep from -120 deg (0) to +120 deg (max)
  const startAngleDeg = -120;
  const sweepAngleDeg = 240;
  const currentAngleDeg = startAngleDeg + (speedRatio * sweepAngleDeg);

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
    let majorFreq = 2;
    if (dialMax >= 1000) {
      step = 200; // 0, 200, 400, 600, 800, 1000
      majorFreq = 1;
    } else if (dialMax >= 300) {
      step = 50; // 0, 50, 100, 150, 200, 250, 300, 350
      majorFreq = 1;
    } else if (dialMax >= 150) {
      step = 40; // 0, 40, 80, 120, 160
      majorFreq = 1;
    } else if (dialMax >= 50) {
      step = 10; // 0, 10, 20, 30, 40, 50, 60
      majorFreq = 1;
    } else if (dialMax >= 25) {
      step = 5; // 0, 5, 10, 15, 20, 25, 30
      majorFreq = 1;
    } else {
      step = 2; // 0, 2, 4, 6, 8, 10, 12
      majorFreq = 2; // labels on 0, 4, 8, 12
    }

    const count = Math.round(dialMax / step);
    const arr = [];
    for (let i = 0; i <= count; i++) {
      const val = Math.min(dialMax, i * step);
      const ratio = val / dialMax;
      const angle = startAngleDeg + (ratio * sweepAngleDeg);
      const isMajor = (i % majorFreq === 0) || i === count || i === 0;
      const outer = polarToCartesian(cx, cy, 96, angle);
      const inner = polarToCartesian(cx, cy, isMajor ? 84 : 88, angle);
      const labelPos = polarToCartesian(cx, cy, 68, angle);
      arr.push({ val, outer, inner, labelPos, isMajor });
    }
    return arr;
  })();

  const isBeige = clusterTheme === 'beige';

  // Palette definitions
  const themeStyles = isBeige ? {
    // 🧭 米色護眼奢華經典風格 (Default)
    wrapperBg: 'linear-gradient(165deg, #FAF7F2 0%, #F5ECE1 50%, #ECE0D0 100%)',
    wrapperBorder: '#DECDB9',
    wrapperShadow: '0 20px 40px -15px rgba(140, 83, 43, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
    cardBg: '#FFFFFF',
    cardBorder: '#E6D7C5',
    cardShadow: '0 2px 6px rgba(107, 92, 79, 0.05)',
    topBarBorder: '#DECDB9',
    textColorPrimary: '#261E18',
    textColorSecondary: '#706254',
    textColorMuted: '#8C7E72',
    accentColor: '#8C532B',
    gaugeBezelOuter: '#D9C4AB',
    gaugeBezelInner: '#FFFFFF',
    gaugeDialFace: '#FBF8F3',
    gaugeTrack: '#EADBC8',
    gaugeTickMajor: '#4A3C30',
    gaugeTickMinor: '#A89988',
    gaugeTickText: '#261E18',
    gaugeCenterCap: '#8C532B',
    gaugeCenterCapBorder: '#DECDB9'
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
    gaugeCenterCapBorder: '#EF4444'
  };

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
              backgroundColor: isBeige ? '#EFE7DC' : 'rgba(0,0,0,0.6)',
              borderColor: isBeige ? '#DECDB9' : 'rgba(255,255,255,0.1)'
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-xs"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-600 animate-ping' : 'bg-emerald-600'}`} />
            <span 
              style={{ color: themeStyles.textColorPrimary }}
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
          onClick={() => setClusterTheme(prev => prev === 'beige' ? 'obsidian' : 'beige')}
          style={{
            backgroundColor: isBeige ? '#FFFFFF' : 'rgba(255,255,255,0.1)',
            borderColor: isBeige ? '#D4C0A8' : 'rgba(255,255,255,0.15)',
            color: themeStyles.textColorPrimary
          }}
          className="px-3 py-1 rounded-xl text-xs font-bold border shadow-xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          title="切換儀表配色"
        >
          <span>{isBeige ? '🧭 米色護眼 (預設)' : '🏎️ 黑曜賽道'}</span>
          <span className="text-[10px] opacity-70">切換 ↗</span>
        </button>
      </div>

      {/* 🚀 速度情境量程快速切換 (支援徒步、單車、開車、高鐵、飛機 1000 km/h) */}
      <div 
        style={{
          backgroundColor: isBeige ? '#FAF7F2' : 'rgba(255,255,255,0.04)',
          borderColor: isBeige ? '#E2D5C3' : 'rgba(255,255,255,0.08)'
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
                onClick={() => setSpeedMode(mode.id)}
                style={{
                  backgroundColor: isSelected 
                    ? (isBeige ? '#8C532B' : '#F59E0B') 
                    : (isBeige ? '#FFFFFF' : 'transparent'),
                  color: isSelected 
                    ? '#FFFFFF' 
                    : (isBeige ? '#4A3C30' : '#94A3B8'),
                  borderColor: isSelected 
                    ? (isBeige ? '#8C532B' : '#F59E0B') 
                    : (isBeige ? '#DECDB9' : 'rgba(255,255,255,0.1)')
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
        <div className="flex items-center justify-between w-full px-2 pb-1 border-b border-[#F4EDE2] text-xs">
          <span style={{ color: themeStyles.accentColor }} className="font-bold flex items-center gap-1">
            <span>{modeInfo.title}</span>
          </span>
          <span style={{ color: themeStyles.textColorMuted }} className="font-mono text-[11px]">
            刻度上限: <strong>{dialMax}</strong> km/h
          </span>
        </div>

        <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center">
          {/* SVG Speed Dial */}
          <svg viewBox="0 0 240 240" className="w-full h-full overflow-visible">
            <defs>
              {/* Luminous Speed Gradient */}
              <linearGradient id={`${gradientId}-speed-grad`} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="55%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#DC2626" />
              </linearGradient>

              {/* Dial Face Inner Shadow / Glow */}
              <radialGradient id={`${gradientId}-dial-glow`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={isBeige ? 'rgba(255, 255, 255, 0.95)' : 'rgba(245, 158, 11, 0.15)'} />
                <stop offset="75%" stopColor={isBeige ? '#F4EDE2' : 'rgba(15, 23, 42, 0.5)'} />
                <stop offset="100%" stopColor={isBeige ? '#EBE0D0' : '#0B0F17'} />
              </radialGradient>

              <filter id={`${gradientId}-needle-shadow`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.25)" />
              </filter>
            </defs>

            {/* Dial Face Background */}
            <circle cx={cx} cy={cy} r="95" fill={`url(#${gradientId}-dial-glow)`} />

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
                stroke={`url(#${gradientId}-speed-grad)`}
                strokeWidth="8"
                strokeLinecap="round"
              />
            )}

            {/* Ticks and Scale Numbers (Large and High Contrast) */}
            {ticks.map((t, idx) => (
              <g key={idx}>
                <line
                  x1={t.inner.x}
                  y1={t.inner.y}
                  x2={t.outer.x}
                  y2={t.outer.y}
                  stroke={t.isMajor ? themeStyles.gaugeTickMajor : themeStyles.gaugeTickMinor}
                  strokeWidth={t.isMajor ? 2.5 : 1.5}
                />
                {t.isMajor && (
                  <text
                    x={t.labelPos.x}
                    y={t.labelPos.y + 4}
                    textAnchor="middle"
                    fill={themeStyles.gaugeTickText}
                    fontSize={dialMax >= 1000 ? "11" : "13"}
                    fontFamily="monospace"
                    fontWeight="900"
                  >
                    {t.val}
                  </text>
                )}
              </g>
            ))}

            {/* Speed Digital Readout (Clean layout: label at y=46, big speed at y=88, KM/H at y=156) */}
            <text 
              x={cx} 
              y={cy - 48} 
              textAnchor="middle" 
              fill={themeStyles.accentColor} 
              fontSize="12" 
              fontFamily="sans-serif" 
              fontWeight="900" 
              letterSpacing="1"
            >
              即時時速
            </text>
            <text 
              x={cx} 
              y={cy - 12} 
              textAnchor="middle" 
              fill={themeStyles.textColorPrimary} 
              fontSize={currentSpeed >= 100 ? "38" : "44"} 
              fontFamily="monospace" 
              fontWeight="900" 
            >
              {displayStats?.currentSpeedKmh || '0.0'}
            </text>
            <text 
              x={cx} 
              y={cy + 28} 
              textAnchor="middle" 
              fill={themeStyles.textColorSecondary} 
              fontSize="13" 
              fontFamily="monospace" 
              fontWeight="900" 
              letterSpacing="1.5"
            >
              KM / H
            </text>

            {/* Speed Needle Pointer (Classic Rally Red) */}
            <g transform={`rotate(${currentAngleDeg} ${cx} ${cy})`} filter={`url(#${gradientId}-needle-shadow)`}>
              {/* Needle Blade */}
              <polygon
                points={`${cx - 2.5},${cy} ${cx},42 ${cx + 2.5},${cy}`}
                fill="#DC2626"
              />
              <line x1={cx} y1={cy} x2={cx} y2={40} stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
              {/* Center Pivot Cap */}
              <circle cx={cx} cy={cy} r="10" fill={themeStyles.gaugeCenterCap} stroke={themeStyles.gaugeCenterCapBorder} strokeWidth="2" />
              <circle cx={cx} cy={cy} r="3.5" fill="#FFFFFF" />
            </g>
          </svg>
        </div>

        {/* Speed Peak & Average Summary Banner */}
        <div 
          style={{ color: themeStyles.textColorSecondary }}
          className="text-xs sm:text-sm font-mono font-bold flex items-center justify-center gap-3 pt-1.5 border-t border-[#EFE7DC] w-full"
        >
          <span>衝刺極速: <strong className="text-rose-600 text-sm sm:text-base font-black">{displayStats?.maxSpeedKmh || '0.0'}</strong> km/h</span>
          <span className="opacity-40">|</span>
          <span>全程均速: <strong className="text-emerald-700 text-sm sm:text-base font-black">{displayStats?.avgSpeedKmh || '0.0'}</strong> km/h</span>
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
              <span style={{ color: themeStyles.accentColor }} className="font-mono text-[11px] font-bold">
                CHRONO
              </span>
            </div>
            
            {/* GIANT DURATION DISPLAY (人眼秒看) */}
            <div 
              style={{ color: themeStyles.textColorPrimary }}
              className="text-3xl sm:text-4xl font-mono font-black tracking-tight leading-none my-1"
            >
              {displayStats?.durationFormatted || '00:00:00'}
            </div>
          </div>

          {/* Moving & Rest Breakdowns */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EFE7DC]">
            <div 
              style={{ backgroundColor: isBeige ? '#ECFDF5' : 'rgba(6, 78, 59, 0.4)', borderColor: isBeige ? '#A7F3D0' : 'rgba(16, 185, 129, 0.3)' }}
              className="border rounded-xl p-2 text-center"
            >
              <span className="text-xs text-emerald-800 font-bold block mb-0.5">🟢 移動時間</span>
              <strong className="text-sm sm:text-base font-mono font-black text-emerald-900 block truncate">
                {displayStats?.movingTimeFormatted || '--'}
              </strong>
            </div>

            <div 
              style={{ backgroundColor: isBeige ? '#FFFBEB' : 'rgba(120, 53, 15, 0.4)', borderColor: isBeige ? '#FDE68A' : 'rgba(245, 158, 11, 0.3)' }}
              className="border rounded-xl p-2 text-center"
            >
              <span className="text-xs text-amber-800 font-bold block mb-0.5">⏸️ 休息停頓</span>
              <strong className="text-sm sm:text-base font-mono font-black text-amber-900 block truncate">
                {displayStats?.stoppedTimeFormatted || '--'}
              </strong>
            </div>
          </div>

          {/* Trip Odometer */}
          <div className="pt-2 border-t border-[#EFE7DC] flex items-baseline justify-between">
            <span style={{ color: themeStyles.textColorSecondary }} className="text-xs font-bold">
              📏 累計路徑里程
            </span>
            <div className="flex items-baseline gap-1 font-mono">
              <span style={{ color: themeStyles.accentColor }} className="text-2xl sm:text-3xl font-black tracking-tight">
                {displayStats?.totalDistanceKm || '0.00'}
              </span>
              <span style={{ color: themeStyles.accentColor }} className="text-sm font-black">KM</span>
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
              <span style={{ color: '#1D4ED8' }} className="font-mono text-[11px] font-bold">
                ALTIMETER
              </span>
            </div>

            {/* GIANT ALTITUDE DISPLAY (人眼秒看 - 支援飛機萬米高空) */}
            <div className="text-3xl sm:text-4xl font-mono font-black tracking-tight leading-none text-blue-900 my-1 flex items-baseline gap-1">
              <span>{displayStats?.currentElevation !== null ? Number(displayStats.currentElevation).toLocaleString() : '--'}</span>
              <span style={{ color: themeStyles.textColorSecondary }} className="text-base font-bold font-mono">公尺 (m)</span>
            </div>
          </div>

          {/* Vertical Gain & Loss Telemetry */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EFE7DC]">
            <div 
              style={{ backgroundColor: isBeige ? '#EFF6FF' : 'rgba(30, 58, 138, 0.4)', borderColor: isBeige ? '#BFDBFE' : 'rgba(59, 130, 246, 0.3)' }}
              className="border rounded-xl p-2 text-center"
            >
              <span className="text-xs text-blue-800 font-bold block mb-0.5">▲ 總爬升</span>
              <strong className="text-sm sm:text-base font-mono font-black text-blue-900 block truncate">
                +{Number(displayStats?.totalAscentM || 0).toLocaleString()} m
              </strong>
            </div>

            <div 
              style={{ backgroundColor: isBeige ? '#F8FAFC' : 'rgba(30, 41, 59, 0.4)', borderColor: isBeige ? '#E2E8F0' : 'rgba(148, 163, 184, 0.3)' }}
              className="border rounded-xl p-2 text-center"
            >
              <span className="text-xs text-slate-700 font-bold block mb-0.5">▼ 總下降</span>
              <strong className="text-sm sm:text-base font-mono font-black text-slate-900 block truncate">
                -{Number(displayStats?.totalDescentM || 0).toLocaleString()} m
              </strong>
            </div>
          </div>

          {/* Min / Max Elevation Range */}
          <div className="pt-2 border-t border-[#EFE7DC] flex items-center justify-between text-xs font-mono">
            <span style={{ color: themeStyles.textColorSecondary }} className="font-bold">峰谷跨距:</span>
            <span style={{ color: themeStyles.textColorPrimary }} className="font-bold">
              最低 <strong className="text-blue-700">{displayStats?.minElevationM ? `${Number(displayStats.minElevationM).toLocaleString()}m` : '--'}</strong> ~ 最高 <strong className="text-rose-700">{displayStats?.maxElevationM ? `${Number(displayStats.maxElevationM).toLocaleString()}m` : '--'}</strong>
            </span>
          </div>
        </div>

      </div>

      {/* 🏁 SECTION 3: 4-POD RACING AUXILIARY GAUGES (底層 4 聯大字體速度分析儀表) */}
      <div 
        style={{
          backgroundColor: themeStyles.cardBg,
          borderColor: themeStyles.cardBorder,
          boxShadow: themeStyles.cardShadow
        }}
        className="p-3 sm:p-3.5 rounded-2xl border space-y-2.5"
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
          {/* Gauge 1: 平均時速 (Average Speed) */}
          <div 
            style={{ backgroundColor: isBeige ? '#FAF7F2' : 'rgba(255,255,255,0.06)', borderColor: isBeige ? '#E8DFD1' : 'rgba(255,255,255,0.1)' }}
            className="border rounded-2xl p-2.5 flex flex-col justify-between text-center shadow-xs"
          >
            <span style={{ color: themeStyles.textColorSecondary }} className="text-xs font-bold block mb-1">
              平均時速
            </span>
            <div 
              style={{ color: themeStyles.textColorPrimary }}
              className="text-2xl sm:text-3xl font-mono font-black tracking-tight leading-none my-1"
            >
              {displayStats?.avgSpeedKmh || '0.0'}
            </div>
            <span style={{ color: themeStyles.textColorMuted }} className="text-[11px] font-mono font-bold block">
              km/h (全程)
            </span>
          </div>

          {/* Gauge 2: 移動均速 (Moving Average) */}
          <div 
            style={{ backgroundColor: isBeige ? '#ECFDF5' : 'rgba(6, 78, 59, 0.4)', borderColor: isBeige ? '#A7F3D0' : 'rgba(16, 185, 129, 0.3)' }}
            className="border rounded-2xl p-2.5 flex flex-col justify-between text-center shadow-xs"
          >
            <span className="text-xs text-emerald-800 font-bold block mb-1">
              移動均速
            </span>
            <div className="text-2xl sm:text-3xl font-mono font-black text-emerald-700 tracking-tight leading-none my-1">
              {displayStats?.movingAvgSpeedKmh || displayStats?.avgSpeedKmh || '0.0'}
            </div>
            <span className="text-[11px] text-emerald-600 font-mono font-bold block">
              km/h (巡航)
            </span>
          </div>

          {/* Gauge 3: 最高時速 (Max Peak Speed) */}
          <div 
            style={{ backgroundColor: isBeige ? '#FFF1F2' : 'rgba(136, 19, 55, 0.4)', borderColor: isBeige ? '#FECDD3' : 'rgba(244, 63, 94, 0.3)' }}
            className="border rounded-2xl p-2.5 flex flex-col justify-between text-center shadow-xs"
          >
            <span className="text-xs text-rose-800 font-bold block mb-1">
              最高時速
            </span>
            <div className="text-2xl sm:text-3xl font-mono font-black text-rose-600 tracking-tight leading-none my-1">
              {displayStats?.maxSpeedKmh || '0.0'}
            </div>
            <span className="text-[11px] text-rose-500 font-mono font-bold block">
              km/h (極速)
            </span>
          </div>

          {/* Gauge 4: 最低時速 (Min Climb Pace) */}
          <div 
            style={{ backgroundColor: isBeige ? '#EFF6FF' : 'rgba(30, 58, 138, 0.4)', borderColor: isBeige ? '#BFDBFE' : 'rgba(59, 130, 246, 0.3)' }}
            className="border rounded-2xl p-2.5 flex flex-col justify-between text-center shadow-xs"
          >
            <span className="text-xs text-blue-800 font-bold block mb-1">
              最低時速
            </span>
            <div className="text-2xl sm:text-3xl font-mono font-black text-blue-600 tracking-tight leading-none my-1">
              {displayStats?.minSpeedKmh || '0.0'}
            </div>
            <span className="text-[11px] text-blue-500 font-mono font-bold block">
              km/h (爬坡)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
