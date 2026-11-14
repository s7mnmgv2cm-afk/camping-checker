'use client';

import React, { useId, useState, useMemo, useRef } from 'react';

function toSafeNum(val, fallback = 0) {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

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
  const gradId = useId();
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const isOled = theme === 'oled';

  const normalizedPoints = useMemo(() => {
    if (!Array.isArray(elevationProfile) || elevationProfile.length === 0) return [];
    const totalDist = Math.max(0.01, toSafeNum(totalDistanceKm, 0));
    const lastRawSteps = toSafeNum(elevationProfile[elevationProfile.length - 1]?.steps, 0);
    const estTotalSteps = lastRawSteps > 0 ? lastRawSteps : Math.round(totalDist * 1350);

    return elevationProfile.map((pt, idx) => {
      const ratio = elevationProfile.length > 1 ? idx / (elevationProfile.length - 1) : 0;
      const distKm = toSafeNum(pt?.distKm ?? pt?.distanceKm ?? pt?.distance, ratio * totalDist);
      const ele = toSafeNum(pt?.ele ?? pt?.elevation, 0);
      const steps = pt?.steps !== undefined && pt?.steps !== null && Number.isFinite(Number(pt.steps))
        ? Math.max(0, Math.round(Number(pt.steps)))
        : Math.round(ratio * estTotalSteps);
      const speed = pt?.speed !== undefined && pt?.speed !== null && Number.isFinite(Number(pt.speed))
        ? Math.max(0, Number(pt.speed))
        : (pt?.calculatedSpeedKmh !== undefined && pt?.calculatedSpeedKmh !== null
            ? Math.max(0, Number(pt.calculatedSpeedKmh))
            : 0);
      return { distKm, ele, steps, speed };
    });
  }, [elevationProfile, totalDistanceKm]);

  const activeIndex = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < normalizedPoints.length
    ? hoverIdx
    : (normalizedPoints.length > 0 ? normalizedPoints.length - 1 : -1);

  const activePoint = activeIndex >= 0 ? normalizedPoints[activeIndex] : null;

  const chartGeometry = useMemo(() => {
    if (normalizedPoints.length < 2) return null;

    const padLeft = 40;
    const padRight = 44;
    const padTop = 16;
    const padBottom = 24;
    const width = 560;
    const height = 210;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const eles = normalizedPoints.map((p) => p.ele);
    const rawMinEle = minElevationM !== null && minElevationM !== undefined && Number.isFinite(Number(minElevationM))
      ? Math.min(Number(minElevationM), ...eles)
      : Math.min(...eles);
    const rawMaxEle = maxElevationM !== null && maxElevationM !== undefined && Number.isFinite(Number(maxElevationM))
      ? Math.max(Number(maxElevationM), ...eles)
      : Math.max(...eles);

    const eleSpread = Math.max(10, rawMaxEle - rawMinEle);
    const minY = Math.floor(rawMinEle - eleSpread * 0.12);
    const maxY = Math.ceil(rawMaxEle + eleSpread * 0.12);
    const yRange = Math.max(1, maxY - minY);

    const maxSteps = Math.max(100, ...normalizedPoints.map((p) => p.steps));
    const maxDist = Math.max(0.01, normalizedPoints[normalizedPoints.length - 1].distKm);

    const coords = normalizedPoints.map((pt, idx) => {
      const xRatio = normalizedPoints.length > 1 ? idx / (normalizedPoints.length - 1) : 0;
      const x = padLeft + (maxDist > 0 ? (pt.distKm / maxDist) * plotW : xRatio * plotW);
      const yEle = padTop + plotH - ((pt.ele - minY) / yRange) * plotH;
      const ySteps = padTop + plotH - (pt.steps / maxSteps) * plotH;
      return { ...pt, x, yEle, ySteps };
    });

    const eleLinePath = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.yEle.toFixed(1)}`)
      .join(' ');
    const eleAreaPath = `${eleLinePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

    const stepsLinePath = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.ySteps.toFixed(1)}`)
      .join(' ');

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      minY,
      maxY,
      maxSteps,
      maxDist,
      coords,
      eleLinePath,
      eleAreaPath,
      stepsLinePath
    };
  }, [normalizedPoints, minElevationM, maxElevationM]);

  const handlePointerScrub = (clientX) => {
    if (!chartGeometry || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * chartGeometry.width;
    const clampedX = Math.max(chartGeometry.padLeft, Math.min(chartGeometry.padLeft + chartGeometry.plotW, svgX));
    const ratio = (clampedX - chartGeometry.padLeft) / chartGeometry.plotW;
    const idx = Math.max(0, Math.min(normalizedPoints.length - 1, Math.round(ratio * (normalizedPoints.length - 1))));
    setHoverIdx(idx);
    if (typeof onHoverPoint === 'function') {
      onHoverPoint(normalizedPoints[idx]);
    }
  };

  const handleLeaveScrub = () => {
    setHoverIdx(null);
    if (typeof onHoverPoint === 'function') {
      onHoverPoint(null);
    }
  };

  const activeCoord = chartGeometry && activeIndex >= 0 ? chartGeometry.coords[activeIndex] : null;

  return (
    <div
      style={{
        backgroundColor: isOled ? '#000000' : '#FFFFFF',
        borderColor: isOled ? '#27272A' : '#E2E8F0'
      }}
      className="rounded-3xl border-2 p-3.5 sm:p-4 space-y-2.5 select-none shadow-xs"
    >
      {/* 頂部置中標題與雙曲線圖例 */}
      <div className="flex flex-col items-center justify-center text-center gap-1">
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-base">📈</span>
          <strong className={`text-xs sm:text-sm font-black ${isOled ? 'text-white' : 'text-slate-900'}`}>
            高度與累積步數剖面觀測圖
          </strong>
        </div>
        <div className="flex items-center justify-center gap-4 text-[11px] font-bold">
          <span className="flex items-center justify-center gap-1.5 text-sky-500">
            <span className="w-3 h-0.5 bg-sky-400 inline-block rounded-full" />
            <span>海拔高度 (m)</span>
          </span>
          <span className="flex items-center justify-center gap-1.5 text-amber-500">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-amber-400 inline-block" />
            <span>累積行走步數 (步)</span>
          </span>
        </div>
      </div>

      {/* 互動游標 4 欄置中遙測數據條 */}
      <div
        style={{
          backgroundColor: isOled ? '#09090B' : '#F8FAFC',
          borderColor: isOled ? '#27272A' : '#E2E8F0'
        }}
        className="grid grid-cols-4 gap-1.5 p-2 rounded-2xl border text-center"
      >
        <div className="flex flex-col items-center justify-center text-center">
          <span className={`text-[10px] font-bold block ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>累計里程</span>
          <strong className="text-xs sm:text-sm font-michroma font-bold text-amber-500">
            {activePoint ? `${activePoint.distKm.toFixed(2)} km` : `${toSafeNum(totalDistanceKm, 0).toFixed(2)} km`}
          </strong>
        </div>

        <div className={`flex flex-col items-center justify-center text-center border-l ${isOled ? 'border-zinc-800' : 'border-slate-200'}`}>
          <span className={`text-[10px] font-bold block ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>海拔高度</span>
          <strong className="text-xs sm:text-sm font-michroma font-bold text-sky-400">
            {activePoint ? `${Math.round(activePoint.ele)} m` : '--'}
          </strong>
        </div>

        <div className={`flex flex-col items-center justify-center text-center border-l ${isOled ? 'border-zinc-800' : 'border-slate-200'}`}>
          <span className={`text-[10px] font-bold block ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>累積步數</span>
          <strong className="text-xs sm:text-sm font-michroma font-bold text-emerald-400">
            {activePoint ? `${activePoint.steps.toLocaleString()} 步` : '0 步'}
          </strong>
        </div>

        <div className={`flex flex-col items-center justify-center text-center border-l ${isOled ? 'border-zinc-800' : 'border-slate-200'}`}>
          <span className={`text-[10px] font-bold block ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>瞬間時速</span>
          <strong className="text-xs sm:text-sm font-michroma font-bold text-rose-400">
            {activePoint ? `${activePoint.speed.toFixed(1)} km/h` : '0.0 km/h'}
          </strong>
        </div>
      </div>

      {/* 雙軸高度 & 累積步數 SVG 曲線畫布 */}
      {chartGeometry ? (
        <div className="w-full overflow-hidden rounded-2xl">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
            onPointerMove={(e) => handlePointerScrub(e.clientX)}
            onPointerDown={(e) => handlePointerScrub(e.clientX)}
            onPointerLeave={handleLeaveScrub}
            className="w-full h-44 sm:h-48 touch-none cursor-crosshair block"
          >
            <defs>
              <linearGradient id={`${gradId}-ele-area`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* 水平網格線與左右雙軸刻度 */}
            {[0, 0.5, 1].map((t, idx) => {
              const y = chartGeometry.padTop + chartGeometry.plotH * (1 - t);
              const eleTick = Math.round(chartGeometry.minY + (chartGeometry.maxY - chartGeometry.minY) * t);
              const stepTick = Math.round(chartGeometry.maxSteps * t);
              return (
                <g key={idx}>
                  <line
                    x1={chartGeometry.padLeft}
                    y1={y}
                    x2={chartGeometry.padLeft + chartGeometry.plotW}
                    y2={y}
                    stroke={isOled ? '#18181B' : '#E2E8F0'}
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={chartGeometry.padLeft - 4}
                    y={y + 3}
                    textAnchor="end"
                    fill="#38BDF8"
                    fontSize="8.5"
                    fontFamily="'Michroma', sans-serif"
                    fontWeight="700"
                  >
                    {`${eleTick}m`}
                  </text>
                  <text
                    x={chartGeometry.padLeft + chartGeometry.plotW + 4}
                    y={y + 3}
                    textAnchor="start"
                    fill="#F59E0B"
                    fontSize="8.5"
                    fontFamily="'Michroma', sans-serif"
                    fontWeight="700"
                  >
                    {stepTick >= 1000 ? `${(stepTick / 1000).toFixed(1)}k` : `${stepTick}`}
                  </text>
                </g>
              );
            })}

            {/* 海拔面積與曲線 */}
            <path d={chartGeometry.eleAreaPath} fill={`url(#${gradId}-ele-area)`} />
            <path
              d={chartGeometry.eleLinePath}
              fill="none"
              stroke="#38BDF8"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 累積步數曲線 (琥珀金虛線) */}
            <path
              d={chartGeometry.stepsLinePath}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2.2"
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 互動定位垂直準星與雙圓點 */}
            {activeCoord && (
              <g>
                <line
                  x1={activeCoord.x}
                  y1={chartGeometry.padTop}
                  x2={activeCoord.x}
                  y2={chartGeometry.padTop + chartGeometry.plotH}
                  stroke={isOled ? '#52525B' : '#94A3B8'}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle cx={activeCoord.x} cy={activeCoord.yEle} r="4.2" fill="#38BDF8" stroke="#000000" strokeWidth="1.5" />
                <circle cx={activeCoord.x} cy={activeCoord.ySteps} r="4.2" fill="#F59E0B" stroke="#000000" strokeWidth="1.5" />
              </g>
            )}

            {/* 底部里程刻度 */}
            <text
              x={chartGeometry.padLeft}
              y={chartGeometry.height - 6}
              textAnchor="start"
              fill={isOled ? '#71717A' : '#64748B'}
              fontSize="8.5"
              fontFamily="'Michroma', sans-serif"
            >
              0.0 km
            </text>
            <text
              x={chartGeometry.padLeft + chartGeometry.plotW * 0.5}
              y={chartGeometry.height - 6}
              textAnchor="middle"
              fill={isOled ? '#71717A' : '#64748B'}
              fontSize="8.5"
              fontFamily="'Michroma', sans-serif"
            >
              {`${(chartGeometry.maxDist * 0.5).toFixed(2)} km`}
            </text>
            <text
              x={chartGeometry.padLeft + chartGeometry.plotW}
              y={chartGeometry.height - 6}
              textAnchor="end"
              fill={isOled ? '#71717A' : '#64748B'}
              fontSize="8.5"
              fontFamily="'Michroma', sans-serif"
            >
              {`${chartGeometry.maxDist.toFixed(2)} km`}
            </text>
          </svg>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: isOled ? '#09090B' : '#F8FAFC',
            borderColor: isOled ? '#27272A' : '#E2E8F0'
          }}
          className="h-32 rounded-2xl border border-dashed flex flex-col items-center justify-center text-center p-4"
        >
          <span className="text-xl mb-1">🥾</span>
          <p className={`text-xs font-bold ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>
            切換為 ON 並開始行走後，將即時繪製高度與累積步數雙曲線剖面圖
          </p>
        </div>
      )}

      {/* 底部總爬升 / 總下降置中摘要 */}
      <div className={`pt-1.5 border-t flex items-center justify-center gap-4 text-xs font-bold text-center ${isOled ? 'border-zinc-800 text-zinc-300' : 'border-slate-100 text-slate-600'}`}>
        <span>▲ 總爬升 <strong className="font-michroma text-rose-400">+{Number(totalAscentM || 0).toLocaleString()}m</strong></span>
        <span className="opacity-30">|</span>
        <span>▼ 總下降 <strong className="font-michroma text-emerald-400">-{Number(totalDescentM || 0).toLocaleString()}m</strong></span>
      </div>
    </div>
  );
}
