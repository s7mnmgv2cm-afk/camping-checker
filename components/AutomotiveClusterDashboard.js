'use client';

import React, { useId, useState } from 'react';

/**
 * 🏎️ AutomotiveClusterDashboard
 * 頂級超跑數位儀表板 (Automotive Virtual Cockpit Cluster HUD)
 * Inspired by Porsche Taycan, Audi Sport Virtual Cockpit, McLaren AMR & Off-Road HUD
 */
export default function AutomotiveClusterDashboard({
  displayStats,
  isRecording = false,
  displayPointsCount = 0,
  displayTitle = ''
}) {
  const gradientId = useId();
  const [clusterTheme, setClusterTheme] = useState('obsidian'); // 'obsidian' (碳纖黑曜) | 'titanium' (鈦金奢華)

  // Current speed & telemetry metrics
  const currentSpeed = parseFloat(displayStats?.currentSpeedKmh || 0);
  const avgSpeed = parseFloat(displayStats?.avgSpeedKmh || 0);
  const movingAvgSpeed = parseFloat(displayStats?.movingAvgSpeedKmh || displayStats?.avgSpeedKmh || 0);
  const maxSpeed = parseFloat(displayStats?.maxSpeedKmh || 0);
  const minSpeed = parseFloat(displayStats?.minSpeedKmh || 0);

  // Dynamic dial scale: 0 to 12 km/h for hiking, expands to 24/36 if running or cycling
  const dialMax = Math.max(12, Math.ceil(Math.max(currentSpeed, maxSpeed) / 6) * 6);
  const speedRatio = Math.min(1, Math.max(0, currentSpeed / dialMax));
  
  // Needle & Arc geometry: 240-degree sweep from -120 deg (0) to +120 deg (max)
  const startAngleDeg = -120;
  const sweepAngleDeg = 240;
  const currentAngleDeg = startAngleDeg + (speedRatio * sweepAngleDeg);

  // Helper for polar to cartesian coordinates on radius r, center (100, 105)
  const cx = 100;
  const cy = 105;
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

  // Speedometer ticks
  const tickSteps = 6;
  const ticks = Array.from({ length: tickSteps + 1 }, (_, i) => {
    const val = Math.round((i / tickSteps) * dialMax);
    const angle = startAngleDeg + (i / tickSteps) * sweepAngleDeg;
    const outer = polarToCartesian(cx, cy, 78, angle);
    const inner = polarToCartesian(cx, cy, i % 2 === 0 ? 68 : 72, angle);
    const labelPos = polarToCartesian(cx, cy, 58, angle);
    return { val, outer, inner, labelPos, isMajor: i % 2 === 0 };
  });

  const isDark = clusterTheme === 'obsidian';

  return (
    <div 
      style={{
        background: isDark 
          ? 'radial-gradient(ellipse at 50% 0%, #172033 0%, #0A0E17 65%, #05070B 100%)' 
          : 'radial-gradient(ellipse at 50% 0%, #352B22 0%, #1D1713 65%, #0F0C0A 100%)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 0 rgba(0, 0, 0, 0.9)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(217, 180, 140, 0.3)'
      }}
      className="rounded-3xl border p-3.5 sm:p-5 text-white overflow-hidden relative select-none space-y-3"
    >
      {/* 🏁 Ambient Cockpit Top Bar / Status Annunciators */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
        <div className="flex items-center gap-2">
          {/* Engine / Recording Status Beacon */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-md">
            <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-ping' : 'bg-emerald-400'}`} />
            <span className="font-mono font-black text-[10px] tracking-wider uppercase text-gray-200">
              {isRecording ? 'SPORT REC • 航跡收集中' : 'COCKPIT • 待機'}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
            <span className="text-emerald-400 font-bold">● GPS 鎖定</span>
            <span className="text-gray-600">|</span>
            <span>{displayPointsCount} 點位</span>
          </div>
        </div>

        {/* Cockpit Mode Toggle (曜石賽道 vs 鈦金座艙) */}
        <button
          type="button"
          onClick={() => setClusterTheme(prev => prev === 'obsidian' ? 'titanium' : 'obsidian')}
          className="px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold border border-white/10 bg-white/5 hover:bg-white/15 transition-all text-amber-300/90 active:scale-95 flex items-center gap-1"
          title="切換儀表配色"
        >
          <span>{isDark ? '🏎️ 曜石賽道' : '🧭 鈦金越野'}</span>
        </button>
      </div>

      {/* 🏎️ SECTION 1: CENTRAL HIGH-TECH SPEEDOMETER GAUGE */}
      <div className="flex flex-col items-center justify-center relative pt-1 pb-2">
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
          {/* SVG Speed Dial */}
          <svg viewBox="0 0 200 210" className="w-full h-full overflow-visible">
            <defs>
              {/* Luminous Speed Gradient */}
              <linearGradient id={`${gradientId}-speed-grad`} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="60%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#EF4444" />
              </linearGradient>

              {/* Dial Center Radial Glow */}
              <radialGradient id={`${gradientId}-dial-glow`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(245, 158, 11, 0.22)" />
                <stop offset="70%" stopColor="rgba(245, 158, 11, 0.03)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>

              <filter id={`${gradientId}-glow-filter`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background Dial Glow */}
            <circle cx={cx} cy={cy} r="72" fill={`url(#${gradientId}-dial-glow)`} />

            {/* Outer Metallic Bezel Rings */}
            <circle 
              cx={cx} 
              cy={cy} 
              r="84" 
              fill="none" 
              stroke="rgba(255, 255, 255, 0.12)" 
              strokeWidth="1.5" 
            />
            <circle 
              cx={cx} 
              cy={cy} 
              r="82" 
              fill="none" 
              stroke="rgba(0, 0, 0, 0.6)" 
              strokeWidth="1" 
            />

            {/* Track Background Arc */}
            <path
              d={describeArc(cx, cy, 74, startAngleDeg, startAngleDeg + sweepAngleDeg)}
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="6"
              strokeLinecap="round"
            />

            {/* Active Luminous Progress Arc */}
            {speedRatio > 0.01 && (
              <path
                d={describeArc(cx, cy, 74, startAngleDeg, currentAngleDeg)}
                fill="none"
                stroke={`url(#${gradientId}-speed-grad)`}
                strokeWidth="6"
                strokeLinecap="round"
                filter={`url(#${gradientId}-glow-filter)`}
              />
            )}

            {/* Ticks and Scale Numbers */}
            {ticks.map((t, idx) => (
              <g key={idx}>
                <line
                  x1={t.inner.x}
                  y1={t.inner.y}
                  x2={t.outer.x}
                  y2={t.outer.y}
                  stroke={t.isMajor ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)'}
                  strokeWidth={t.isMajor ? 1.5 : 1}
                />
                {t.isMajor && (
                  <text
                    x={t.labelPos.x}
                    y={t.labelPos.y + 3}
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.7)"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {t.val}
                  </text>
                )}
              </g>
            ))}

            {/* Digital Speedometer Center HUD (Direct SVG rendering for razor-sharp alignment) */}
            <text 
              x={cx} 
              y={cy - 46} 
              textAnchor="middle" 
              fill="#F59E0B" 
              fontSize="7.5" 
              fontFamily="monospace" 
              fontWeight="bold" 
              letterSpacing="2"
            >
              LIVE SPEED
            </text>
            <text 
              x={cx} 
              y={cy - 20} 
              textAnchor="middle" 
              fill="#FFFFFF" 
              fontSize="30" 
              fontFamily="monospace" 
              fontWeight="900" 
              filter={`url(#${gradientId}-glow-filter)`}
            >
              {displayStats?.currentSpeedKmh || '0.0'}
            </text>
            <text 
              x={cx} 
              y={cy - 9} 
              textAnchor="middle" 
              fill="#94A3B8" 
              fontSize="8" 
              fontFamily="monospace" 
              fontWeight="bold" 
              letterSpacing="1.5"
            >
              KM / H
            </text>

            {/* Speed Needle Pointer */}
            <g transform={`rotate(${currentAngleDeg} ${cx} ${cy})`}>
              {/* Needle Blade */}
              <polygon
                points={`${cx - 1.5},${cy} ${cx},34 ${cx + 1.5},${cy}`}
                fill="#EF4444"
                filter={`url(#${gradientId}-glow-filter)`}
              />
              <line x1={cx} y1={cy} x2={cx} y2={32} stroke="#F87171" strokeWidth="1.5" />
              {/* Center Pivot Cap */}
              <circle cx={cx} cy={cy} r="7.5" fill="#111827" stroke="#EF4444" strokeWidth="1.5" />
              <circle cx={cx} cy={cy} r="2.5" fill="#FFFFFF" />
            </g>
          </svg>
        </div>

        {/* Speed Peak & Average Summary */}
        <div className="text-[11px] font-mono text-gray-400 flex items-center gap-2 -mt-2">
          <span>PEAK: <strong className="text-rose-400">{displayStats?.maxSpeedKmh || '0.0'} km/h</strong></span>
          <span className="text-gray-600">•</span>
          <span>AVG: <strong className="text-emerald-400">{displayStats?.avgSpeedKmh || '0.0'} km/h</strong></span>
        </div>
      </div>

      {/* 🏎️ SECTION 2: DUAL COCKPIT WINGS (CHRONO & ALTIMETER SIDE-BY-SIDE) */}
      <div className="grid grid-cols-2 gap-2.5">
        
        {/* ── LEFT WING: CHRONOGRAPH & TRIP (計時與里程) ── */}
        <div className="bg-white/[0.04] p-3 rounded-2xl border border-white/[0.08] backdrop-blur-sm flex flex-col justify-between space-y-2">
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 mb-0.5">
              <span className="flex items-center gap-1 font-bold">
                <span>⏱️</span>
                <span>CHRONO 總時間</span>
              </span>
            </div>
            <div 
              style={{ textShadow: '0 0 20px rgba(255, 255, 255, 0.25)' }}
              className="text-2xl sm:text-3xl font-mono font-black tracking-tight text-white leading-none my-1"
            >
              {displayStats?.durationFormatted || '00:00:00'}
            </div>
          </div>

          {/* Moving & Rest Breakdowns */}
          <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-white/[0.08] text-center">
            <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-lg p-1">
              <span className="text-[8px] font-mono text-emerald-400 font-bold block">移動時間</span>
              <strong className="text-[11px] font-mono font-black text-emerald-200 block truncate">
                {displayStats?.movingTimeFormatted || '--'}
              </strong>
            </div>

            <div className="bg-amber-950/40 border border-amber-500/20 rounded-lg p-1">
              <span className="text-[8px] font-mono text-amber-400 font-bold block">休息停頓</span>
              <strong className="text-[11px] font-mono font-black text-amber-200 block truncate">
                {displayStats?.stoppedTimeFormatted || '--'}
              </strong>
            </div>
          </div>

          {/* Trip Odometer */}
          <div className="pt-1.5 border-t border-white/[0.08] flex items-baseline justify-between">
            <span className="text-[9px] font-mono text-gray-400 tracking-wider">ODOMETER 里程</span>
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-xl sm:text-2xl font-black text-amber-400 tracking-tight">
                {displayStats?.totalDistanceKm || '0.00'}
              </span>
              <span className="text-[10px] font-bold text-gray-400">KM</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT WING: ALTIMETRY & INCLINE (高度與爬升) ── */}
        <div className="bg-white/[0.04] p-3 rounded-2xl border border-white/[0.08] backdrop-blur-sm flex flex-col justify-between space-y-2">
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 mb-0.5">
              <span className="flex items-center gap-1 font-bold">
                <span>⛰️</span>
                <span>ALTIMETER 海拔</span>
              </span>
            </div>
            <div 
              style={{ textShadow: '0 0 20px rgba(56, 189, 248, 0.25)' }}
              className="text-2xl sm:text-3xl font-mono font-black tracking-tight text-cyan-300 leading-none my-1 flex items-baseline gap-1"
            >
              <span>{displayStats?.currentElevation !== null ? `${displayStats.currentElevation}` : '--'}</span>
              <span className="text-sm text-gray-400 font-bold font-mono">M</span>
            </div>
          </div>

          {/* Vertical Gain & Loss Telemetry */}
          <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-white/[0.08] text-center">
            <div className="bg-sky-950/40 border border-sky-500/20 rounded-lg p-1">
              <span className="text-[8px] font-mono text-sky-400 font-bold block">▲ 爬升</span>
              <strong className="text-[11px] font-mono font-black text-sky-200 block truncate">
                +{displayStats?.totalAscentM || 0}m
              </strong>
            </div>

            <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-lg p-1">
              <span className="text-[8px] font-mono text-indigo-400 font-bold block">▼ 下降</span>
              <strong className="text-[11px] font-mono font-black text-indigo-200 block truncate">
                -{displayStats?.totalDescentM || 0}m
              </strong>
            </div>
          </div>

          {/* Min / Max Elevation Range */}
          <div className="pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-[9px] font-mono text-gray-400">
            <span>峰谷跨距</span>
            <span className="text-gray-300 truncate">
              <strong className="text-cyan-400">{displayStats?.minElevationM || '--'}m</strong> ~ <strong className="text-rose-400">{displayStats?.maxElevationM || '--'}m</strong>
            </span>
          </div>
        </div>

      </div>

      {/* 🏁 SECTION 3: 4-POD RACING AUXILIARY GAUGES (底層 4 聯賽車遙測輔助儀表) */}
      <div className="pt-2 border-t border-white/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-mono font-bold tracking-widest text-gray-400 uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            <span>4-CHANNEL SPEED TELEMETRY 速度遙測陣列</span>
          </span>
          <span className="text-[8px] font-mono text-gray-500">UNIT: KM/H</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Gauge 1: 平均時速 (Average Speed) */}
          <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/10 rounded-2xl p-2.5 flex flex-col justify-between shadow-inner">
            <div className="flex items-center justify-between text-[9px] font-mono text-gray-400 font-bold">
              <span>AVG SPEED</span>
              <span className="text-[8px] px-1 py-0.2 rounded bg-white/10 text-gray-300">全程均速</span>
            </div>
            <div className="text-xl sm:text-2xl font-mono font-black text-white tracking-tight my-0.5">
              {displayStats?.avgSpeedKmh || '0.0'}
            </div>
            {/* Mini Progress Indicator */}
            <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mt-1">
              <div 
                style={{ width: `${Math.min(100, (avgSpeed / (dialMax || 12)) * 100)}%` }} 
                className="h-full bg-gray-300 rounded-full"
              />
            </div>
          </div>

          {/* Gauge 2: 移動均速 (Moving Average) */}
          <div className="bg-gradient-to-b from-emerald-950/40 to-emerald-950/10 border border-emerald-500/30 rounded-2xl p-2.5 flex flex-col justify-between shadow-inner">
            <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 font-bold">
              <span>MOVING AVG</span>
              <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">巡航均速</span>
            </div>
            <div className="text-xl sm:text-2xl font-mono font-black text-emerald-400 tracking-tight my-0.5">
              {displayStats?.movingAvgSpeedKmh || displayStats?.avgSpeedKmh || '0.0'}
            </div>
            <div className="w-full bg-emerald-950 h-1 rounded-full overflow-hidden border border-emerald-500/30 mt-1">
              <div 
                style={{ width: `${Math.min(100, (movingAvgSpeed / (dialMax || 12)) * 100)}%` }} 
                className="h-full bg-emerald-400 rounded-full"
              />
            </div>
          </div>

          {/* Gauge 3: 最高時速 (Max Peak Speed) */}
          <div className="bg-gradient-to-b from-rose-950/40 to-rose-950/10 border border-rose-500/30 rounded-2xl p-2.5 flex flex-col justify-between shadow-inner">
            <div className="flex items-center justify-between text-[9px] font-mono text-rose-400 font-bold">
              <span>MAX PEAK</span>
              <span className="text-[8px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300">衝刺極速</span>
            </div>
            <div className="text-xl sm:text-2xl font-mono font-black text-rose-400 tracking-tight my-0.5">
              {displayStats?.maxSpeedKmh || '0.0'}
            </div>
            <div className="w-full bg-rose-950 h-1 rounded-full overflow-hidden border border-rose-500/30 mt-1">
              <div 
                style={{ width: `${Math.min(100, (maxSpeed / (dialMax || 12)) * 100)}%` }} 
                className="h-full bg-rose-500 rounded-full"
              />
            </div>
          </div>

          {/* Gauge 4: 最低時速 (Min Pace) */}
          <div className="bg-gradient-to-b from-cyan-950/40 to-cyan-950/10 border border-cyan-500/30 rounded-2xl p-2.5 flex flex-col justify-between shadow-inner">
            <div className="flex items-center justify-between text-[9px] font-mono text-cyan-400 font-bold">
              <span>MIN PACE</span>
              <span className="text-[8px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300">攀登基速</span>
            </div>
            <div className="text-xl sm:text-2xl font-mono font-black text-cyan-400 tracking-tight my-0.5">
              {displayStats?.minSpeedKmh || '0.0'}
            </div>
            <div className="w-full bg-cyan-950 h-1 rounded-full overflow-hidden border border-cyan-500/30 mt-1">
              <div 
                style={{ width: `${Math.min(100, (minSpeed / (dialMax || 12)) * 100)}%` }} 
                className="h-full bg-cyan-400 rounded-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
