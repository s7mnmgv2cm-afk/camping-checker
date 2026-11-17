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

// 主題色彩配置 (皆基於 #000000 OLED 極致純黑)
const THEMES = {
  green: {
    id: 'green',
    name: '戰機綠',
    icon: '🟢',
    accent: '#10B981', // 經典螢光綠
    dimAccent: '#065F46',
    subText: '#6EE7B7',
    badgeBorder: '#059669',
    badgeBg: '#022C22'
  },
  amber: {
    id: 'amber',
    name: '航空金',
    icon: '🟡',
    accent: '#F59E0B', // 航空琥珀橘
    dimAccent: '#78350F',
    subText: '#FCD34D',
    badgeBorder: '#D97706',
    badgeBg: '#451A03'
  },
  cyan: {
    id: 'cyan',
    name: '冰川藍',
    icon: '🔵',
    accent: '#06B6D4', // 霓虹冰川藍
    dimAccent: '#164E63',
    subText: '#67E8F9',
    badgeBorder: '#0891B2',
    badgeBg: '#083344'
  },
  white: {
    id: 'white',
    name: '極致白',
    icon: '⚪',
    accent: '#F8FAFC', // 高對比冷白
    dimAccent: '#334155',
    subText: '#94A3B8',
    badgeBorder: '#64748B',
    badgeBg: '#0F172A'
  }
};

export default function EcoHeadUpDisplayModal({ isOpen, onClose }) {
  // 🎨 HUD 主題 (預設綠光螢光管)
  const [themeKey, setThemeKey] = useState('green');
  const theme = THEMES[themeKey] || THEMES.green;

  // 🪞 擋風玻璃鏡像模式 (Mirror Flip)
  const [isMirror, setIsMirror] = useState(false);

  // ☀️ 螢幕常亮狀態
  const [keepAwake, setKeepAwake] = useState(true);

  // 🏎️ 即時行車數據 (純記憶體暫存)
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [altitudeM, setAltitudeM] = useState(null);
  const [gradePercent, setGradePercent] = useState(0.0);
  const [accelG, setAccelG] = useState(0.0);
  const [tripDistanceM, setTripDistanceM] = useState(0);
  const [tripSeconds, setTripSeconds] = useState(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState(0);

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

  // ☀️ Screen Wake Lock API & iOS Native Keep-Awake 橋接
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    let cancelled = false;
    const requestWakeLock = async () => {
      if (keepAwake && 'wakeLock' in navigator && !wakeLockRef.current) {
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
      } else if (!keepAwake && wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }

      // iOS Native App 橋接
      try {
        window.webkit?.messageHandlers?.keepAwakeHandler?.postMessage(keepAwake);
      } catch (e) {}
    };

    requestWakeLock();

    const handleVis = () => {
      if (document.visibilityState === 'visible' && keepAwake) {
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
  }, [isOpen, keepAwake]);

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

  // 🔄 里程與計時手動重設
  const handleResetTrip = () => {
    tripDistanceRef.current = 0;
    maxSpeedRef.current = 0;
    setTripDistanceM(0);
    setTripSeconds(0);
    setMaxSpeedKmh(0);
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

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        zIndex: 999999,
        backgroundColor: '#000000', // 嚴格 0 功耗 OLED 純黑
        transform: isMirror ? 'scaleX(-1)' : 'none',
        transition: 'transform 0.25s ease-in-out'
      }}
      className="fixed inset-0 w-screen h-[100dvh] overflow-hidden select-none flex flex-col justify-between p-4 sm:p-6 font-sans text-white"
    >
      {/* 🌲 頂部列：左側海拔，右側快捷控制（鏡像、色彩、常亮、關閉） */}
      <div className="flex items-center justify-between w-full shrink-0 z-20">
        {/* 左側：海拔高度 */}
        <div className="flex items-center gap-2">
          <div
            style={{
              borderColor: theme.dimAccent,
              backgroundColor: '#0A0A0A'
            }}
            className="px-3 py-1.5 rounded-xl border flex items-center gap-2 shadow-xs"
          >
            <span className="text-sm">⛰️</span>
            <div className="flex flex-col text-left leading-none">
              <span style={{ color: theme.subText }} className="text-[10px] font-bold tracking-wider">
                ALTITUDE
              </span>
              <span className="font-michroma font-bold text-sm tracking-tight text-white mt-0.5">
                {altitudeM !== null ? `${altitudeM} m` : '-- m'}
              </span>
            </div>
          </div>

          {/* 鏡像模式啟用提醒膠囊 */}
          {isMirror && (
            <span
              style={{
                borderColor: theme.badgeBorder,
                backgroundColor: theme.badgeBg,
                color: theme.accent
              }}
              className="px-2 py-1 rounded-lg text-[10px] font-black tracking-wide border flex items-center gap-1 animate-pulse"
            >
              <span>🪞 擋風玻璃投影中</span>
            </span>
          )}
        </div>

        {/* 右側：快捷工具列 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 🪞 鏡像切換按鈕 */}
          <button
            type="button"
            onClick={() => setIsMirror((prev) => !prev)}
            style={{
              backgroundColor: isMirror ? theme.accent : '#121212',
              borderColor: isMirror ? theme.accent : '#27272A',
              color: isMirror ? '#000000' : '#E4E4E7'
            }}
            className="px-2.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm"
            title="擋風玻璃投影鏡像模式：將手機平放儀表板反射時，可左右鏡像反轉使駕駛看到正像"
          >
            <span>🪞</span>
            <span className="hidden sm:inline">{isMirror ? '鏡像開' : '鏡像關'}</span>
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
              borderColor: theme.dimAccent,
              backgroundColor: '#121212'
            }}
            className="px-2.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm"
            title="切換 HUD 抬頭顯示器螢光色彩"
          >
            <span>{theme.icon}</span>
            <span className="hidden sm:inline">{theme.name}</span>
          </button>

          {/* ☀️ 螢幕常亮開關 */}
          <button
            type="button"
            onClick={() => setKeepAwake((prev) => !prev)}
            style={{
              borderColor: keepAwake ? theme.dimAccent : '#27272A',
              backgroundColor: keepAwake ? '#121212' : '#0A0A0A',
              color: keepAwake ? theme.accent : '#71717A'
            }}
            className="px-2.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm"
            title="保持螢幕常亮不休眠"
          >
            <span>{keepAwake ? '☀️' : '💤'}</span>
          </button>

          {/* ✕ 關閉 HUD */}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-md"
            title="退出抬頭顯示器 (ESC)"
          >
            <span>✕</span>
            <span>ESC</span>
          </button>
        </div>
      </div>

      {/* 🚀 中央英雄區：超大純粹數位車速（全黑 OLED 零負擔、視覺最大化） */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full relative z-10 my-auto">
        <div className="flex flex-col items-center justify-center text-center">
          {/* 巨幅車速數字 */}
          <span
            style={{
              color: theme.accent,
              textShadow: `0 0 28px ${theme.accent}40`,
              fontVariantNumeric: 'tabular-nums'
            }}
            className="font-michroma font-black text-[30vw] sm:text-[26vh] leading-none tracking-tighter select-none"
          >
            {currentSpeedKmh}
          </span>

          {/* 單位標籤 */}
          <div className="flex items-center gap-3 mt-1 sm:mt-2">
            <span
              style={{
                borderColor: theme.dimAccent,
                color: theme.subText,
                backgroundColor: '#09090B'
              }}
              className="px-3 py-0.5 rounded-full border text-xs sm:text-sm font-michroma font-bold tracking-widest"
            >
              KM / H
            </span>

            {/* 極速標示 */}
            {maxSpeedKmh > 0 && (
              <span style={{ color: '#71717A' }} className="text-[11px] font-mono">
                MAX: <strong style={{ color: theme.accent }}>{maxSpeedKmh}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 📊 底部極簡三欄狀態：坡度 (左)、加速度 (中)、累積里程 (右) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full shrink-0 z-20 items-stretch">
        {/* 左側：坡度 (Grade) */}
        <div
          style={{
            borderColor: '#1E1E1E',
            backgroundColor: '#090909'
          }}
          className="rounded-2xl border px-3 py-2 flex flex-col items-center justify-center text-center shadow-xs"
        >
          <span style={{ color: theme.subText }} className="text-[10px] font-bold tracking-wide">
            📐 坡度 (GRADE)
          </span>
          <div className="flex items-baseline gap-1 my-1">
            <span
              style={{
                color:
                  gradePercent > 1.5
                    ? '#F43F5E' // 陡上坡 (紅粉)
                    : gradePercent < -1.5
                    ? '#10B981' // 陡下坡 (綠)
                    : theme.accent
              }}
              className="text-xl sm:text-2xl font-michroma font-bold tracking-tight"
            >
              {gradePercent > 0 ? `+${gradePercent.toFixed(1)}` : `${gradePercent.toFixed(1)}`}
            </span>
            <span style={{ color: '#71717A' }} className="text-[11px] font-bold">
              %
            </span>
          </div>
          <span style={{ color: '#71717A' }} className="text-[9px] font-medium truncate">
            {gradePercent > 1.5 ? '▲ 爬坡' : gradePercent < -1.5 ? '▼ 下坡' : '━ 平路'}
          </span>
        </div>

        {/* 正中：即時加速度 (G-Force) */}
        <div
          style={{
            borderColor: '#1E1E1E',
            backgroundColor: '#090909'
          }}
          className="rounded-2xl border px-3 py-2 flex flex-col items-center justify-center text-center shadow-xs"
        >
          <span style={{ color: theme.subText }} className="text-[10px] font-bold tracking-wide">
            ⚡ 加速度 (G-FORCE)
          </span>
          <div className="flex items-baseline gap-1 my-1">
            <span
              style={{
                color:
                  accelG > 0.05
                    ? theme.accent
                    : accelG < -0.05
                    ? '#FB7185' // 減速 / 煞車亮粉紅
                    : '#A1A1AA'
              }}
              className="text-xl sm:text-2xl font-michroma font-bold tracking-tight"
            >
              {accelG > 0 ? `+${accelG.toFixed(2)}` : `${accelG.toFixed(2)}`}
            </span>
            <span style={{ color: '#71717A' }} className="text-[11px] font-bold">
              G
            </span>
          </div>
          <span style={{ color: '#71717A' }} className="text-[9px] font-medium truncate">
            {accelG > 0.08 ? '🚀 加速' : accelG < -0.08 ? '🛑 減速' : '🏎️ 等速'}
          </span>
        </div>

        {/* 右側：累積里程 (Trip Distance & Time) */}
        <div
          style={{
            borderColor: '#1E1E1E',
            backgroundColor: '#090909'
          }}
          className="rounded-2xl border px-3 py-2 flex flex-col items-center justify-center text-center shadow-xs relative group"
        >
          <div className="flex items-center justify-center gap-1.5 w-full">
            <span style={{ color: theme.subText }} className="text-[10px] font-bold tracking-wide">
              📏 里程 (TRIP)
            </span>
            <button
              type="button"
              onClick={handleResetTrip}
              className="text-[9px] text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
              title="里程與計時歸零"
            >
              🔄
            </button>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span
              style={{ color: theme.accent }}
              className="text-xl sm:text-2xl font-michroma font-bold tracking-tight"
            >
              {(tripDistanceM / 1000).toFixed(2)}
            </span>
            <span style={{ color: '#71717A' }} className="text-[11px] font-bold">
              KM
            </span>
          </div>
          <span style={{ color: '#71717A' }} className="text-[9px] font-mono">
            ⏱️ {formatTime(tripSeconds)}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
