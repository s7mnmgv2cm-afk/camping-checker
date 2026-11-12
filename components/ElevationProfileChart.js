'use client';

import React, { useState, useRef, useMemo } from 'react';

/**
 * Elevation Profile Chart (高度剖面圖)
 * Exactly reproduces the user's uploaded elevation chart with:
 * - Left Y-Axis elevation labels & horizontal grid lines
 * - Bottom X-Axis distance labels & vertical grid lines
 * - Smooth filled salmon/coral area under the curve
 * - Interactive scrubber tracking touch/mouse with live distance, elevation & speed
 */
export default function ElevationProfileChart({
  elevationProfile = [],
  totalDistanceKm = '0.00',
  maxElevationM = null,
  minElevationM = null,
  totalAscentM = 0,
  totalDescentM = 0,
  onHoverPoint = null,
  theme = 'white'
}) {
  const isOLED = theme === 'oled';
  const [hoverIndex, setHoverIndex] = useState(null);
  const containerRef = useRef(null);

  // Filter & validate points
  const points = useMemo(() => {
    if (!elevationProfile || elevationProfile.length < 2) return [];
    return elevationProfile;
  }, [elevationProfile]);

  // Compute elevation bounds with nice round steps (e.g. step of 50m or 100m)
  const { minEle, maxEle, yTicks, xTicks, maxDist } = useMemo(() => {
    if (points.length < 2) {
      return { minEle: 0, maxEle: 1000, yTicks: [0, 500, 1000], xTicks: [0, 1], maxDist: 1 };
    }

    let min = minElevationM !== null ? minElevationM : 99999;
    let max = maxElevationM !== null ? maxElevationM : -99999;
    let dist = parseFloat(totalDistanceKm) || 0;

    points.forEach(p => {
      if (p.ele < min) min = p.ele;
      if (p.ele > max) max = p.ele;
      if (p.distKm > dist) dist = p.distKm;
    });

    if (min >= max) {
      min = Math.max(0, min - 50);
      max = max + 50;
    }

    // Round min down and max up to nice 50m / 100m grid boundaries
    const range = max - min;
    const step = range <= 200 ? 50 : range <= 600 ? 100 : range <= 1500 ? 200 : 500;
    const roundedMin = Math.max(0, Math.floor(min / step) * step);
    const roundedMax = Math.ceil(max / step) * step;

    // Y Ticks
    const yArr = [];
    for (let v = roundedMin; v <= roundedMax; v += step) {
      yArr.push(v);
    }
    if (yArr.length > 7) {
      // If too many ticks, filter every other
      const filtered = yArr.filter((_, idx) => idx % 2 === 0);
      if (filtered[filtered.length - 1] !== yArr[yArr.length - 1]) filtered.push(yArr[yArr.length - 1]);
      return { minEle: roundedMin, maxEle: roundedMax, yTicks: filtered, xTicks: [], maxDist: Math.max(0.5, dist) };
    }

    // X Ticks (e.g. 0km, 2km, 4km, 6km, 8km)
    const xStep = dist <= 3 ? 0.5 : dist <= 6 ? 1 : dist <= 12 ? 2 : dist <= 25 ? 5 : 10;
    const xArr = [];
    for (let x = 0; x <= dist + 0.01; x += xStep) {
      xArr.push(Number(x.toFixed(1)));
    }
    if (xArr[xArr.length - 1] < dist) {
      xArr.push(Number(dist.toFixed(1)));
    }

    return {
      minEle: roundedMin,
      maxEle: roundedMax,
      yTicks: yArr,
      xTicks: xArr,
      maxDist: Math.max(0.1, dist)
    };
  }, [points, minElevationM, maxElevationM, totalDistanceKm]);

  // Chart dimensions in SVG viewBox
  const vbWidth = 720;
  const vbHeight = 220;
  const padLeft = 56;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 28;

  const plotW = vbWidth - padLeft - padRight;
  const plotH = vbHeight - padTop - padBottom;

  // Coordinate transforms
  const getX = (distKm) => padLeft + (distKm / maxDist) * plotW;
  const getY = (ele) => padTop + plotH - ((ele - minEle) / (maxEle - minEle || 1)) * plotH;

  // Generate SVG Path
  const { pathD, areaD } = useMemo(() => {
    if (points.length < 2) return { pathD: '', areaD: '' };

    let pStr = '';
    points.forEach((pt, idx) => {
      const x = getX(pt.distKm).toFixed(1);
      const y = getY(pt.ele).toFixed(1);
      if (idx === 0) pStr += `M ${x} ${y}`;
      else pStr += ` L ${x} ${y}`;
    });

    const firstX = getX(points[0].distKm).toFixed(1);
    const lastX = getX(points[points.length - 1].distKm).toFixed(1);
    const bottomY = (padTop + plotH).toFixed(1);
    const aStr = `${pStr} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    return { pathD: pStr, areaD: aStr };
  }, [points, minEle, maxEle, maxDist]);

  // Touch / Mouse Move Handlers for interactive scrubber
  const handlePointerMove = (e) => {
    if (!containerRef.current || points.length < 2) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
    if (!clientX) return;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - (padLeft / vbWidth * rect.width)) / ((plotW / vbWidth) * rect.width)));
    const targetDist = ratio * maxDist;

    // Find closest point
    let closestIdx = 0;
    let minDiff = 99999;
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i].distKm - targetDist);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
    if (typeof onHoverPoint === 'function' && points[closestIdx]) {
      onHoverPoint(points[closestIdx]);
    }
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
    if (typeof onHoverPoint === 'function') {
      onHoverPoint(null);
    }
  };

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  if (points.length < 2) {
    return (
      <div 
        className={`p-6 rounded-2xl border text-center space-y-1.5 font-sans ${
          isOLED ? 'bg-black border-zinc-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <span className="text-2xl block">📈</span>
        <strong className={`text-xs font-bold block ${isOLED ? 'text-zinc-100' : 'text-slate-800'}`}>
          暫無足夠的高度剖面數據
        </strong>
        <p className={`text-[11px] ${isOLED ? 'text-zinc-500' : 'text-slate-500'}`}>
          在切換為 ON 記錄一段路徑，或載入步道範本後，即可自動繪製高度變化曲線圖。
        </p>
      </div>
    );
  }

  return (
    <div 
      className={`p-3.5 sm:p-4 rounded-2xl border shadow-xs space-y-2.5 font-sans ${
        isOLED ? 'bg-black border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📈</span>
          <strong className={`text-xs font-black tracking-tight ${isOLED ? 'text-white' : 'text-slate-900'}`}>
            高度剖面圖 (Elevation Profile)
          </strong>
        </div>

        {/* Live Scrubber Badge or Peak/Valley Stat Badges */}
        {activePoint ? (
          <div 
            className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-michroma font-bold flex items-center gap-2 animate-in fade-in ${
              isOLED 
                ? 'bg-zinc-900 border-zinc-700 text-zinc-100 shadow-sm' 
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            <span className={isOLED ? 'text-amber-400' : ''}>📍 {activePoint.distKm} km</span>
            <span className={isOLED ? 'text-sky-400' : ''}>⛰️ {activePoint.ele} m</span>
            {activePoint.speed > 0 && <span className={isOLED ? 'text-emerald-400' : ''}>⚡ {activePoint.speed} km/h</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[10px] font-michroma">
            <span className={`${isOLED ? 'text-rose-400' : 'text-rose-600'} font-bold`}>▲ 最高 {maxElevationM || maxEle}m</span>
            <span className={isOLED ? 'text-zinc-600' : 'text-slate-400'}>·</span>
            <span className={`${isOLED ? 'text-emerald-400' : 'text-emerald-600'} font-bold`}>▼ 最低 {minElevationM || minEle}m</span>
            <span className={isOLED ? 'text-zinc-600' : 'text-slate-400'}>·</span>
            <span className={`${isOLED ? 'text-sky-400' : 'text-sky-600'} font-bold`}>↗ 爬升 +{totalAscentM}m</span>
          </div>
        )}
      </div>

      {/* SVG Chart Container */}
      <div 
        ref={containerRef}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerLeave}
        className="relative w-full cursor-crosshair select-none touch-none"
      >
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          className="w-full h-auto overflow-visible block"
          style={{ maxHeight: '220px' }}
        >
          <defs>
            {/* Soft Coral/Red Gradient fill matching user's uploaded image */}
            <linearGradient id="elevationRedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isOLED ? '#FB7185' : '#F87171'} stopOpacity={isOLED ? '0.45' : '0.45'} />
              <stop offset="60%" stopColor={isOLED ? '#9F1239' : '#FCA5A5'} stopOpacity={isOLED ? '0.2' : '0.25'} />
              <stop offset="100%" stopColor={isOLED ? '#000000' : '#FEE2E2'} stopOpacity={isOLED ? '0' : '0.08'} />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {yTicks.map((yVal) => {
            const y = getY(yVal);
            return (
              <g key={`y-${yVal}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={vbWidth - padRight}
                  y2={y}
                  stroke={isOLED ? '#18181B' : '#E5E7EB'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={isOLED ? '#71717A' : '#6B7280'}
                  fontSize="12"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {yVal}m
                </text>
              </g>
            );
          })}

          {/* Vertical Gridlines & X-Axis Labels */}
          {xTicks.map((xVal) => {
            const x = getX(xVal);
            return (
              <g key={`x-${xVal}`}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke={isOLED ? '#18181B' : '#E5E7EB'}
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padTop + plotH + 18}
                  textAnchor="middle"
                  fill={isOLED ? '#71717A' : '#6B7280'}
                  fontSize="12"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {xVal}km
                </text>
              </g>
            );
          })}

          {/* Baseline bottom axis line */}
          <line
            x1={padLeft}
            y1={padTop + plotH}
            x2={vbWidth - padRight}
            y2={padTop + plotH}
            stroke={isOLED ? '#27272A' : '#D1D5DB'}
            strokeWidth="1.2"
          />

          {/* Filled Elevation Area */}
          <path
            d={areaD}
            fill="url(#elevationRedGradient)"
          />

          {/* Primary Top Line (Salmon Red #F87171 / #EF4444) */}
          <path
            d={pathD}
            fill="none"
            stroke={isOLED ? '#FB7185' : '#EF4444'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Scrubber Guide Line & Point */}
          {activePoint && (
            <g>
              <line
                x1={getX(activePoint.distKm)}
                y1={padTop}
                x2={getX(activePoint.distKm)}
                y2={padTop + plotH}
                stroke={isOLED ? '#F43F5E' : '#DC2626'}
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <circle
                cx={getX(activePoint.distKm)}
                cy={getY(activePoint.ele)}
                r="4.5"
                fill={isOLED ? '#FB7185' : '#DC2626'}
                stroke={isOLED ? '#000000' : '#FFFFFF'}
                strokeWidth="2"
                className="shadow-md"
              />
            </g>
          )}
        </svg>
      </div>

      <div className={`flex items-center justify-between text-[10px] font-mono pt-1 border-t ${
        isOLED ? 'border-zinc-800 text-zinc-500' : 'border-slate-100 text-slate-500'
      }`}>
        <span>起點: 0km ({points[0]?.ele || minEle}m)</span>
        <span className={`${isOLED ? 'text-amber-400' : 'text-emerald-700'} font-bold`}>滑動/觸控圖表可查看各點里程、高度與即時時速</span>
        <span>終點: {totalDistanceKm}km ({points[points.length - 1]?.ele || minEle}m)</span>
      </div>
    </div>
  );
}
