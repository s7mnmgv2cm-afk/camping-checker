'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  generateGPXString,
  downloadGPXFile,
  calculateTrackStats,
  parseGPXString,
  PRESET_HIKING_TRAILS,
  generatePresetGPX
} from './gpx';
import { getDistanceMeters } from './peaks';

const STORAGE_ACTIVE_KEY = 'camping_checker_active_gpx_v2';
const STORAGE_SAVED_TRACKS_KEY = 'camping_checker_saved_tracks_v1';

// 交通工具物理極速上限 (km/h)，防止隧道出口或 GPS 飄移瞬間跳點污染最高時速
const MODE_MAX_SPEED_CAPS = {
  hike: 22,     // 🚶 徒步健行
  bike: 75,     // 🚴 單車騎行
  drive: 190,   // 🚗 汽車公路 (車載 HUD 預設上限)
  train: 350,   // 🚄 高鐵軌道
  plane: 1050,  // ✈️ 民航客機
  auto: 190     // ⚡ 自動模式預設上限 (除非持續高空/高速巡航才放寬)
};

// Calculate compass bearing between two points in degrees (0~360)
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// Helper: Resolve duplicate track names automatically so old saved tracks are never lost or overwritten
function getNextTrackTitle(baseTitle, existingTracks = []) {
  const fallback = `健行足跡_${new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }).replace('/', '月') + '日'}`;
  const raw = (baseTitle || fallback).trim();
  
  // Clean off existing (第 X 段)
  const cleanBase = raw.replace(/\s*\(第\s*\d+\s*段\)$/, '').trim();
  
  // Count how many tracks have this base name
  const matches = existingTracks.filter(t => t.name && (t.name === cleanBase || t.name.startsWith(`${cleanBase} (第`)));
  if (matches.length === 0) {
    return cleanBase;
  }
  return `${cleanBase} (第 ${matches.length + 1} 段)`;
}

// Helper: Normalize polling mode string for iOS Swift native bridge ('continuous_1s' -> 'watch_1s')
function toNativeBridgeMode(mode) {
  return mode === 'continuous_1s' ? 'watch_1s' : 'polling_20s';
}

// Helper: 從已淨化的軌跡點中計算經過物理濾波的真實最高時速 (km/h)，確保即時 HUD 與最終存檔 100% 一致
function computeVerifiedMaxSpeedKmh(points = [], speedCapKmh = 190) {
  if (!Array.isArray(points) || points.length === 0) return 0;
  let maxKmh = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    // 1. 優先採用該點已通過加速度與精度驗證的 calculatedSpeedKmh 或硬體都卜勒 speed
    let candidate = 0;
    if (typeof pt.calculatedSpeedKmh === 'number' && Number.isFinite(pt.calculatedSpeedKmh) && pt.calculatedSpeedKmh > 0) {
      candidate = pt.calculatedSpeedKmh;
    } else if (typeof pt.speed === 'number' && Number.isFinite(pt.speed) && pt.speed > 0) {
      candidate = pt.speed * 3.6;
    } else if (i > 0) {
      // 2. 若為外部匯入之純座標點 (無 speed 欄位)，則以相鄰點位計算並套用時間間隔與物理極速過濾
      const prev = points[i - 1];
      const dtSec = (new Date(pt.time).getTime() - new Date(prev.time).getTime()) / 1000;
      const distM = getDistanceMeters(prev.lat, prev.lng, pt.lat, pt.lng);
      if (dtSec >= 2.0 && dtSec <= 180 && distM >= 3.5) {
        candidate = (distM / dtSec) * 3.6;
      }
    }

    if (candidate > 0 && candidate <= speedCapKmh && candidate > maxKmh) {
      maxKmh = candidate;
    }
  }

  return Math.round(maxKmh * 10) / 10;
}

export function useGPXTracker() {
  const [isRecording, setIsRecording] = useState(false);
  const [trackPoints, setTrackPoints] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [trackName, setTrackName] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [movingSec, setMovingSec] = useState(0);
  const [stoppedSec, setStoppedSec] = useState(0);
  const [isManuallyResting, setIsManuallyResting] = useState(false);
  const [lastFinishedTrack, setLastFinishedTrack] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null); // { lat, lng, ele, time, speed }

  // 🚗 偵測或手動指定之交通載具模式 ('auto' | 'hike' | 'bike' | 'drive' | 'train' | 'plane')
  const [vehicleMode, setVehicleMode] = useState('auto');
  const vehicleModeRef = useRef('auto');
  const verifiedMaxSpeedKmhRef = useRef(0);
  const lastValidSpeedRef = useRef({ speedKmh: 0, timeMs: 0 });
  const smoothedEleRef = useRef({ ele: null, vAcc: 999 });
  const altitudeOffsetMRef = useRef(0);

  useEffect(() => {
    try {
      const savedOffset = localStorage.getItem('camping_gpx_altitude_offset_v1');
      if (savedOffset !== null && Number.isFinite(Number(savedOffset))) {
        altitudeOffsetMRef.current = Number(savedOffset);
      }
    } catch (e) {}
  }, []);

  // Phone local storage library (離線存檔庫)
  const [savedTracks, setSavedTracks] = useState([]);

  // Active loaded reference route (別人或自己預載的軌跡，供飛航模式導航與防走錯)
  const [activeRoute, setActiveRoute] = useState(null);

  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const timerRef = useRef(null);
  const isMovingRef = useRef(false);
  const lastMoveTimeRef = useRef(0);
  const lastPosRef = useRef(null);
  const isManuallyRestingRef = useRef(false);

  // 🧭 陀螺儀 + 加速度計 (IMU DeviceMotion) 步態偵測：0.18 秒即時感應步行邁步、停步 5 秒即入休息
  const imuActiveRef = useRef(false);
  const lastImuStepTimeRef = useRef(0);
  const lastGpsHighSpeedTimeRef = useRef(0);

  // ⚡ 省電核心：以 useRef 在記憶體中靜默累積秒數與座標點，避免每秒觸發全頁 React 重繪與硬碟寫入
  const elapsedSecRef = useRef(0);
  const movingSecRef = useRef(0);
  const stoppedSecRef = useRef(0);
  const trackPointsRef = useRef([]);
  const currentCoordsRef = useRef(null);
  const lastDiskSaveMsRef = useRef(0);

  // 🌱 登山盲記省電模式
  const [isSilentHikingMode, setIsSilentHikingMode] = useState(false);
  const [isUiSuspended, setIsUiSuspended] = useState(false); // 當進入口袋純黑熄屏或關閉視窗時自動為 true
  const isSilentHikingModeRef = useRef(false);
  const isUiSuspendedRef = useRef(false);

  // 🛰️ GPS 取樣策略：預設採用「20 秒間歇性單點輪詢 (polling_20s)」，偵測到車載模式時自動升級為「1 秒連續都卜勒追蹤 (continuous_1s)」
  const [gpsPollingMode, setGpsPollingMode] = useState('polling_20s'); // 'polling_20s' | 'continuous_1s'
  const gpsPollingModeRef = useRef('polling_20s');
  const pollIntervalRef = useRef(null);
  const lastWallTickMsRef = useRef(0);
  const recordingStartMsRef = useRef(0);

  // 🍏 iOS 原生 CoreLocation 背景橋接狀態 (Xcode BackgroundLocationManager -> window.__nativeLocation / nativeLocationUpdate)
  const [isNativeBridgeActive, setIsNativeBridgeActive] = useState(false);
  const isNativeBridgeActiveRef = useRef(false);

  useEffect(() => {
    vehicleModeRef.current = vehicleMode;
    // 若已進入車載 HUD / 汽車 / 高鐵 / 單車模式且正在記錄中，自動切換為 1 秒連續高精都卜勒追蹤，避免 20 秒輪詢造成過彎切角與極速漏記
    if (isRecording && (vehicleMode === 'drive' || vehicleMode === 'train' || vehicleMode === 'plane' || vehicleMode === 'bike')) {
      if (gpsPollingModeRef.current !== 'continuous_1s') {
        setGpsPollingMode('continuous_1s');
      }
    }
  }, [vehicleMode, isRecording]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (
      window.__isCampingNativeApp ||
      window.__nativeLocation ||
      window.webkit?.messageHandlers?.themeHandler ||
      window.webkit?.messageHandlers?.gpsBridgeHandler
    ) {
      isNativeBridgeActiveRef.current = true;
      setIsNativeBridgeActive(true);
    }
  }, []);

  useEffect(() => {
    gpsPollingModeRef.current = gpsPollingMode;
    try {
      localStorage.setItem('camping_gpx_polling_mode_v1', toNativeBridgeMode(gpsPollingMode));
    } catch (e) {}
  }, [gpsPollingMode]);

  useEffect(() => {
    isSilentHikingModeRef.current = isSilentHikingMode;
  }, [isSilentHikingMode]);

  useEffect(() => {
    isUiSuspendedRef.current = isUiSuspended;
  }, [isUiSuspended]);

  // ⏱️ 絕對系統時鐘校準器：無論手機關螢幕多久、JS setInterval 是否被 iOS 凍結，永遠以 (Date.now() - recordingStartMs) 100% 精準結算 Total Time！
  const reconcileWallClockTime = useCallback((forceUiSync = false) => {
    const now = Date.now();
    if (recordingStartMsRef.current <= 0) {
      recordingStartMsRef.current = now - elapsedSecRef.current * 1000;
    }
    const targetElapsedSec = Math.max(
      elapsedSecRef.current,
      Math.floor((now - recordingStartMsRef.current) / 1000)
    );
    const accountedSec = movingSecRef.current + stoppedSecRef.current;
    const deltaSec = Math.max(0, targetElapsedSec - accountedSec);
    elapsedSecRef.current = targetElapsedSec;
    lastWallTickMsRef.current = now;

    if (deltaSec > 0) {
      const hasRecentStep = lastImuStepTimeRef.current > 0 && (now - lastImuStepTimeRef.current) <= 5000;
      const hasHighSpeedGps = lastGpsHighSpeedTimeRef.current > 0 && (now - lastGpsHighSpeedTimeRef.current) <= 12000;
      // 無論前景亮屏或背景關螢幕，只要 28 秒內有收到實質位移 >= 3.5m 的 GPS 座標點，皆判定為移動中
      const hasRecentGpsMove =
        lastMoveTimeRef.current > 0 &&
        (now - lastMoveTimeRef.current) <= 28000;

      const currentlyMoving =
        !isManuallyRestingRef.current &&
        (hasRecentStep || hasHighSpeedGps || hasRecentGpsMove);

      isMovingRef.current = currentlyMoving;

      if (currentlyMoving) {
        movingSecRef.current += deltaSec;
      } else {
        stoppedSecRef.current += deltaSec;
      }
    }

    if (forceUiSync || (!isUiSuspendedRef.current && !isSilentHikingModeRef.current)) {
      setElapsedSec(elapsedSecRef.current);
      setMovingSec(movingSecRef.current);
      setStoppedSec(stoppedSecRef.current);
    }
  }, []);

  // 立即將記憶體中的最新累積點位與秒數同步回畫面 State (於喚醒螢幕、打開視窗或按 OFF 時呼叫)
  const syncUiFromRefs = useCallback(() => {
    if (isRecording) {
      reconcileWallClockTime(true);
    } else {
      setElapsedSec(elapsedSecRef.current);
      setMovingSec(movingSecRef.current);
      setStoppedSec(stoppedSecRef.current);
    }
    if (trackPointsRef.current.length !== trackPoints.length) {
      setTrackPoints([...trackPointsRef.current]);
    }
    if (currentCoordsRef.current) {
      setCurrentCoords(currentCoordsRef.current);
    }
  }, [isRecording, reconcileWallClockTime, trackPoints.length]);

  // 當使用者解除靜默或喚醒畫面時，立即同步一次最新數據至螢幕
  useEffect(() => {
    if (!isSilentHikingMode && !isUiSuspended && isRecording) {
      syncUiFromRefs();
    }
  }, [isSilentHikingMode, isUiSuspended, isRecording, syncUiFromRefs]);

  // Sync ref with state
  useEffect(() => {
    isManuallyRestingRef.current = isManuallyResting;
  }, [isManuallyResting]);

  // 1. Restore active recording session & saved tracks library from localStorage on mount
  useEffect(() => {
    try {
      // Active track
      const savedActive = localStorage.getItem(STORAGE_ACTIVE_KEY);
      if (savedActive) {
        const data = JSON.parse(savedActive);
        if (data?.points && data.points.length > 0) {
          trackPointsRef.current = data.points;
          setTrackPoints(data.points);
          verifiedMaxSpeedKmhRef.current = computeVerifiedMaxSpeedKmh(
            data.points,
            MODE_MAX_SPEED_CAPS[vehicleModeRef.current] || 190
          );
          setWaypoints(data.waypoints || []);
          if (data.trackName) setTrackName(data.trackName);
          if (data.movingSec) {
            movingSecRef.current = data.movingSec;
            setMovingSec(data.movingSec);
          }
          if (data.stoppedSec) {
            stoppedSecRef.current = data.stoppedSec;
            setStoppedSec(data.stoppedSec);
          }
          if (data.isRecording) {
            setIsRecording(true);
            isMovingRef.current = false;
            const nowMs = Date.now();
            lastMoveTimeRef.current = 0;
            const startMs = data.recordingStartMs
              ? Number(data.recordingStartMs)
              : new Date(data.points[0]?.time || nowMs).getTime();
            recordingStartMsRef.current = startMs;
            const calcElapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));
            const restoredElapsed = Math.max(data.elapsedSec || 0, calcElapsed);
            elapsedSecRef.current = restoredElapsed;
            setElapsedSec(restoredElapsed);
            const accounted = (data.movingSec || 0) + (data.stoppedSec || 0);
            if (restoredElapsed > accounted) {
              const extraSec = restoredElapsed - accounted;
              stoppedSecRef.current = (data.stoppedSec || 0) + extraSec;
              setStoppedSec(stoppedSecRef.current);
            }
          } else if (data.lastFinished) {
            setLastFinishedTrack(data.lastFinished);
          }
        }
      }

      // Saved Tracks Library
      const savedList = localStorage.getItem(STORAGE_SAVED_TRACKS_KEY);
      if (savedList) {
        const list = JSON.parse(savedList);
        if (Array.isArray(list)) {
          setSavedTracks(list);
        }
      }
    } catch (e) {
      console.warn('Failed to restore GPX session or saved tracks:', e);
    }
  }, []);

  // 2. 智慧節流寫入硬碟 (消滅每秒寫硬碟風暴：僅在點位實際變動且間隔 >= 30 秒、或切換背景/停止時才寫入 Flash)
  const flushActiveSessionToDisk = useCallback((force = false, overrideRecording = isRecording, overrideFinished = lastFinishedTrack) => {
    try {
      const now = Date.now();
      if (!force && now - lastDiskSaveMsRef.current < 30000) {
        return; // 30 秒內不重複刷寫硬碟
      }
      const pts = trackPointsRef.current.length > 0 ? trackPointsRef.current : trackPoints;
      if (overrideRecording || pts.length > 0 || overrideFinished) {
        localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify({
          isRecording: overrideRecording,
          trackName,
          points: pts,
          waypoints,
          elapsedSec: elapsedSecRef.current,
          movingSec: movingSecRef.current,
          stoppedSec: stoppedSecRef.current,
          recordingStartMs: recordingStartMsRef.current || (now - elapsedSecRef.current * 1000),
          lastFinished: overrideFinished,
          updatedAt: now
        }));
        localStorage.setItem('camping_gpx_active_recording_v1', JSON.stringify({
          isRecording: overrideRecording,
          updatedAt: now
        }));
        lastDiskSaveMsRef.current = now;
      } else if (force) {
        localStorage.removeItem(STORAGE_ACTIVE_KEY);
        localStorage.removeItem('camping_gpx_active_recording_v1');
      }
    } catch (e) {
      console.warn('Failed to save active GPX session:', e);
    }
  }, [isRecording, trackPoints, waypoints, trackName, lastFinishedTrack]);

  const flushDiskRef = useRef(flushActiveSessionToDisk);
  flushDiskRef.current = flushActiveSessionToDisk;

  // 僅在關鍵狀態改變 (開關紀錄、新增打卡點、改標題) 時觸發寫入，絕不因每秒 elapsedSec 跳動而寫硬碟！
  useEffect(() => {
    flushActiveSessionToDisk(true);
  }, [isRecording, waypoints, trackName, lastFinishedTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // 當座標點增加時，依 30 秒節流規則低頻備份至硬碟
  useEffect(() => {
    if (isRecording && trackPoints.length > 0) {
      flushActiveSessionToDisk(false);
    }
  }, [isRecording, trackPoints.length, flushActiveSessionToDisk]);

  // 網頁退至背景或關閉前，強制立即寫入一次硬碟防遺失；從背景關螢幕喚醒時，0 延遲重算絕對系統時鐘並更新畫面！
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && isRecording) {
        reconcileWallClockTime(false);
        flushActiveSessionToDisk(true);
      } else if (document.visibilityState === 'visible' && isRecording) {
        reconcileWallClockTime(true);
        syncUiFromRefs();
      }
    };
    const handleWakeUp = () => {
      if (isRecording) {
        reconcileWallClockTime(true);
        syncUiFromRefs();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleVisibility);
    window.addEventListener('focus', handleWakeUp);
    window.addEventListener('pageshow', handleWakeUp);
    window.addEventListener('nativeAppWake', handleWakeUp);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleVisibility);
      window.removeEventListener('focus', handleWakeUp);
      window.removeEventListener('pageshow', handleWakeUp);
      window.removeEventListener('nativeAppWake', handleWakeUp);
    };
  }, [isRecording, flushActiveSessionToDisk, reconcileWallClockTime, syncUiFromRefs]);

  // 3. Persist saved tracks library to localStorage
  const persistSavedTracks = useCallback((updatedList) => {
    try {
      setSavedTracks(updatedList);
      localStorage.setItem(STORAGE_SAVED_TRACKS_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.warn('Failed to persist saved tracks to localStorage:', e);
    }
  }, []);

  // 4. 🧭 陀螺儀 + 加速度計 (IMU DeviceMotion) 步態偵測器：200ms 節流取樣 (5Hz)，極低 CPU 耗電即可精準判定「有邁步 = 移動、停步 5 秒 = 休息」
  useEffect(() => {
    if (!isRecording || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;

    let lastSampleMs = 0;
    const handleDeviceMotion = (e) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastSampleMs < 180) return;
      lastSampleMs = now;

      const acc = e.acceleration;
      const accG = e.accelerationIncludingGravity;
      const rot = e.rotationRate;

      let stepDetected = false;

      if (acc && (acc.x !== null || acc.y !== null || acc.z !== null)) {
        imuActiveRef.current = true;
        const linMag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
        if (linMag >= 1.05) stepDetected = true;
      } else if (accG && (accG.x !== null || accG.y !== null || accG.z !== null)) {
        imuActiveRef.current = true;
        const totMag = Math.hypot(accG.x || 0, accG.y || 0, accG.z || 0);
        if (Math.abs(totMag - 9.81) >= 1.25) stepDetected = true;
      }

      if (rot && (rot.alpha !== null || rot.beta !== null || rot.gamma !== null)) {
        imuActiveRef.current = true;
        const rotMag = Math.hypot(rot.alpha || 0, rot.beta || 0, rot.gamma || 0);
        if (rotMag >= 25) stepDetected = true;
      }

      if (stepDetected && !isManuallyRestingRef.current) {
        lastImuStepTimeRef.current = now;
        lastMoveTimeRef.current = now;
        isMovingRef.current = true;
      }
    };

    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
    };
  }, [isRecording]);

  // 4b. Elapsed time & live moving/stopped counter
  useEffect(() => {
    if (isRecording) {
      const initNow = Date.now();
      if (lastWallTickMsRef.current === 0) {
        lastWallTickMsRef.current = initNow;
      }
      if (recordingStartMsRef.current === 0) {
        recordingStartMsRef.current = initNow - elapsedSecRef.current * 1000;
      }
      timerRef.current = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        reconcileWallClockTime(false);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      lastWallTickMsRef.current = 0;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, reconcileWallClockTime]);

  // 5. Screen WakeLock (僅在純網頁瀏覽器啟用)
  useEffect(() => {
    if (typeof window !== 'undefined' && (window.__isCampingNativeApp || window.webkit?.messageHandlers?.gpsBridgeHandler)) {
      return;
    }
    let wakeLock = null;
    let isCancelled = false;

    const requestWakeLock = async () => {
      if (!isRecording || isCancelled) return;
      if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = wakeLock;
        wakeLock.addEventListener('release', () => {
          wakeLockRef.current = null;
          if (isRecording && !isCancelled && typeof document !== 'undefined' && document.visibilityState === 'visible') {
            setTimeout(requestWakeLock, 1000);
          }
        });
      } catch (err) {
        console.warn('WakeLock request notice:', err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRecording) {
        requestWakeLock();
      }
    };

    requestWakeLock();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isCancelled = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
      wakeLockRef.current = null;
    };
  }, [isRecording]);

  // 6. GPS 定位架構：含硬體都卜勒速度優先權、物理加速度濾波器與車載自動 1Hz 升級
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('此瀏覽器不支援 GPS 定位');
      return;
    }

    const shouldWatch = isRecording || activeRoute !== null;
    const bridgeMode = toNativeBridgeMode(gpsPollingMode);

    const cleanupGps = () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    if (!shouldWatch) {
      cleanupGps();
      try {
        window.webkit?.messageHandlers?.gpsBridgeHandler?.postMessage({ enabled: false, mode: bridgeMode });
      } catch (e) {}
      return;
    }

    try {
      window.webkit?.messageHandlers?.gpsBridgeHandler?.postMessage({ enabled: true, mode: bridgeMode });
    } catch (e) {}

    setGeoError(null);

    const handlePositionSuccess = (pos, isBatchPoint = false) => {
      const pointMs = pos.timestamp && Number.isFinite(Number(pos.timestamp))
        ? Number(pos.timestamp)
        : Date.now();

      const rawAccuracy = pos.coords.accuracy !== undefined && pos.coords.accuracy !== null ? Number(pos.coords.accuracy) : null;
      // 過濾精度過差 (> 35m) 的粗略基地台/Wi-Fi 定位點，避免瞬間位移跳點產生假極速
      if (rawAccuracy !== null && rawAccuracy > 35) {
        return;
      }

      // 注意：iOS CoreLocation 喚醒首點若無都卜勒數據會傳 0 或 -1；僅在 speed > 0 時視為有效硬體都卜勒速度
      const rawDopplerMs = pos.coords.speed !== undefined && pos.coords.speed !== null && Number(pos.coords.speed) > 0
        ? Number(pos.coords.speed)
        : null;

      const currentCapKmh = MODE_MAX_SPEED_CAPS[vehicleModeRef.current] || 190;
      let speedKmh = rawDopplerMs !== null ? rawDopplerMs * 3.6 : 0;
      let anchorDistM = 0;
      let isTeleportSpike = false;

      if (!lastPosRef.current) {
        lastPosRef.current = {
          lat: Number(pos.coords.latitude),
          lng: Number(pos.coords.longitude),
          time: new Date(pointMs).toISOString()
        };
      } else {
        const dM = getDistanceMeters(
          lastPosRef.current.lat,
          lastPosRef.current.lng,
          Number(pos.coords.latitude),
          Number(pos.coords.longitude)
        );
        const dtSec = (pointMs - new Date(lastPosRef.current.time).getTime()) / 1000;
        anchorDistM = dM;

        if (dtSec > 0 && dM >= 2.5) {
          const impliedKmh = (dM / dtSec) * 3.6;

          // 🚨 防 GPS 隧道/喚醒瞬間跳點：若無硬體都卜勒速度且兩點間隔 < 2.0 秒，或推算時速超過當前載具物理上限，判定為座標飄移跳點
          if (impliedKmh > currentCapKmh * 1.15) {
            isTeleportSpike = true;
          } else if (rawDopplerMs === null) {
            // 僅在無硬體都卜勒速度（例如 20 秒輪詢首點）且間隔 >= 2.0 秒時，才以兩點距離推算時速
            if (dtSec >= 2.0 && dtSec <= 180) {
              speedKmh = impliedKmh;
            }
          } else {
            // 有硬體都卜勒速度時，以硬體都卜勒為準，僅在兩點間距合理且高於都卜勒不超過 15% 時微幅校準
            if (dtSec >= 2.0 && impliedKmh <= currentCapKmh && impliedKmh > speedKmh && impliedKmh <= speedKmh * 1.15 + 5) {
              speedKmh = impliedKmh;
            }
          }

          if (!isTeleportSpike) {
            lastPosRef.current = {
              lat: Number(pos.coords.latitude),
              lng: Number(pos.coords.longitude),
              time: new Date(pointMs).toISOString()
            };
          }
        } else if (dtSec >= 10 && !isTeleportSpike) {
          lastPosRef.current = {
            lat: Number(pos.coords.latitude),
            lng: Number(pos.coords.longitude),
            time: new Date(pointMs).toISOString()
          };
        }
      }

      // 若偵測為瞬間座標瞬移跳點，直接丟棄該髒點，絕不寫入軌跡與最高時速
      if (isTeleportSpike) {
        return;
      }

      // 物理加速度合理性檢查 (一般汽車最大加減速不超過 12 m/s² ≈ 43.2 km/h per sec)
      if (lastValidSpeedRef.current.timeMs > 0) {
        const dtSpeedSec = (pointMs - lastValidSpeedRef.current.timeMs) / 1000;
        if (dtSpeedSec > 0 && dtSpeedSec <= 5) {
          const maxAllowedDeltaKmh = Math.max(25, dtSpeedSec * 43.2);
          if (speedKmh - lastValidSpeedRef.current.speedKmh > maxAllowedDeltaKmh) {
            speedKmh = lastValidSpeedRef.current.speedKmh + maxAllowedDeltaKmh;
          }
        }
      }

      // 最終速度上限鉗制
      speedKmh = Math.min(currentCapKmh, Math.max(0, speedKmh));
      lastValidSpeedRef.current = { speedKmh, timeMs: pointMs };

      // 🚗 若目前為 auto 模式且偵測到穩定行車速度 (>= 22 km/h)，自動升級為車載 1Hz 連續追蹤，確保高速巡航極速精準不漏抓
      if (
        isRecording &&
        vehicleModeRef.current === 'auto' &&
        speedKmh >= 22 &&
        gpsPollingModeRef.current === 'polling_20s'
      ) {
        vehicleModeRef.current = 'drive';
        setVehicleMode('drive');
        setGpsPollingMode('continuous_1s');
      }

      // ⛰️ 垂直海拔高度濾波：過濾 verticalAccuracy < 0 或 > 35m 的低精度高空漂移（如室內冷啟動誤跳 79m），並以 EMA 平滑 Z 軸雜訊
      const rawAlt = pos.coords.altitude !== undefined && pos.coords.altitude !== null ? Number(pos.coords.altitude) : null;
      const rawVAcc = pos.coords.altitudeAccuracy !== undefined && pos.coords.altitudeAccuracy !== null
        ? Number(pos.coords.altitudeAccuracy)
        : null;

      let filteredEle = smoothedEleRef.current.ele;
      if (rawAlt !== null && Number.isFinite(rawAlt)) {
        const calibratedAlt = rawAlt + altitudeOffsetMRef.current;
        const isVAccValid = rawVAcc === null || (rawVAcc >= 0 && rawVAcc <= 35);
        if (isVAccValid) {
          if (filteredEle === null || smoothedEleRef.current.vAcc > 35) {
            filteredEle = calibratedAlt;
          } else {
            // 垂直精度越佳（<=12m）權重越高，否則平滑過濾單點跳動
            const alpha = (rawVAcc !== null && rawVAcc <= 12) ? 0.65 : 0.35;
            filteredEle = filteredEle * (1 - alpha) + calibratedAlt * alpha;
          }
          smoothedEleRef.current = { ele: filteredEle, vAcc: rawVAcc !== null ? rawVAcc : 15 };
        } else if (filteredEle === null) {
          // 僅在完全尚無基準海拔時暫存，待 verticalAccuracy <= 35m 的精準衛星點進來後立即覆寫
          filteredEle = calibratedAlt;
          smoothedEleRef.current = { ele: filteredEle, vAcc: rawVAcc };
        }
      }

      const pt = {
        lat: Number(pos.coords.latitude),
        lng: Number(pos.coords.longitude),
        ele: filteredEle !== null ? Number(filteredEle.toFixed(1)) : null,
        speed: speedKmh > 0 ? Number((speedKmh / 3.6).toFixed(2)) : null,
        accuracy: rawAccuracy,
        altitudeAccuracy: rawVAcc,
        time: new Date(pointMs).toISOString(),
        calculatedSpeedKmh: Number(speedKmh.toFixed(1))
      };

      // 登山步行時速約 1.5~4 km/h，門檻設為 1.2 km/h 且位移 >= 3.5m 即認定為真實移動
      if (speedKmh >= 1.2 && anchorDistM >= 3.5 && !isManuallyRestingRef.current) {
        const nowMs = Date.now();
        lastGpsHighSpeedTimeRef.current = nowMs;
        lastMoveTimeRef.current = nowMs;
        isMovingRef.current = true;
      }

      currentCoordsRef.current = pt;
      const isHiddenBg = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const isSilent = isUiSuspendedRef.current || isSilentHikingModeRef.current || isHiddenBg;

      if (!isSilent || activeRoute !== null) {
        setCurrentCoords(pt);
      }

      if (isRecording) {
        const prev = trackPointsRef.current;
        if (prev.length === 0) {
          trackPointsRef.current = [pt];
          if (pt.calculatedSpeedKmh > verifiedMaxSpeedKmhRef.current) {
            verifiedMaxSpeedKmhRef.current = pt.calculatedSpeedKmh;
          }
          if (!isSilent) setTrackPoints([pt]);
          flushDiskRef.current(isHiddenBg || gpsPollingModeRef.current === 'polling_20s');
        } else {
          // 3.5m Jitter filter：濾除原地靜止時的 GPS 漂移
          const last = prev[prev.length - 1];
          const dist = getDistanceMeters(last.lat, last.lng, pt.lat, pt.lng);
          const segDtSec = (pointMs - new Date(last.time).getTime()) / 1000;
          const segImpliedKmh = segDtSec > 0 ? (dist / segDtSec) * 3.6 : 0;

          // 二次防護：確保寫入軌跡陣列的相鄰點位之間不會產生超越物理上限的假速度
          if (dist >= 3.5 && segImpliedKmh <= currentCapKmh * 1.15) {
            if (!isManuallyRestingRef.current) {
              lastMoveTimeRef.current = Date.now();
              isMovingRef.current = true;
              if (isHiddenBg || isBatchPoint || gpsPollingModeRef.current === 'polling_20s') {
                const segSec = Math.min(
                  25,
                  Math.max(1, Math.round(segDtSec))
                );
                const transferSec = Math.min(stoppedSecRef.current, segSec);
                if (transferSec > 0) {
                  stoppedSecRef.current -= transferSec;
                  movingSecRef.current += transferSec;
                }
              }
            }

            if (pt.calculatedSpeedKmh > verifiedMaxSpeedKmhRef.current) {
              verifiedMaxSpeedKmhRef.current = pt.calculatedSpeedKmh;
            }

            const nextPts = [...prev, pt];
            trackPointsRef.current = nextPts;
            if (!isSilent) {
              setTrackPoints(nextPts);
            }
            flushDiskRef.current(isHiddenBg || gpsPollingModeRef.current === 'polling_20s');
          }
        }
        reconcileWallClockTime(false);
      }
    };

    // 🍏 直接新增軌跡點並存入 localStorage (供 Swift CoreLocation 背景推播呼叫)
    const addTrackPoint = (lat, lng, alt = null, timestamp = null, acc = null, speed = null, isBatchPoint = false, vAcc = null) => {
      if (lat === undefined || lng === undefined || lat === null || lng === null) return;
      if (!isNativeBridgeActiveRef.current) {
        isNativeBridgeActiveRef.current = true;
        setIsNativeBridgeActive(true);
      }
      handlePositionSuccess({
        coords: {
          latitude: Number(lat),
          longitude: Number(lng),
          altitude: alt !== undefined && alt !== null ? Number(alt) : null,
          accuracy: acc !== undefined && acc !== null ? Number(acc) : null,
          altitudeAccuracy: vAcc !== undefined && vAcc !== null ? Number(vAcc) : null,
          speed: speed !== undefined && speed !== null ? Number(speed) : null
        },
        timestamp: timestamp || Date.now()
      }, isBatchPoint);
    };

    const handleNativeLocationUpdate = (e) => {
      const detail = e?.detail || (typeof window !== 'undefined' ? window.__nativeLocation : null);
      if (!detail) return;
      const { lat, lng, alt, timestamp, acc, vAcc, speed } = detail;
      addTrackPoint(lat, lng, alt, timestamp, acc, speed, false, vAcc);
    };

    const handleNativeLocationBatchUpdate = (e) => {
      const list = e?.detail;
      if (!Array.isArray(list)) return;
      reconcileWallClockTime(false);
      list.forEach((item) => {
        if (item && item.lat !== undefined && item.lng !== undefined) {
          addTrackPoint(item.lat, item.lng, item.alt, item.timestamp, item.acc, item.speed, true, item.vAcc);
        }
      });
      reconcileWallClockTime(true);
    };

    const isNativeApp = typeof window !== 'undefined' && Boolean(
      window.__isCampingNativeApp || window.webkit?.messageHandlers?.gpsBridgeHandler
    );

    if (typeof window !== 'undefined') {
      window.__addNativeTrackPoint = addTrackPoint;
      window.addEventListener('nativeLocationUpdate', handleNativeLocationUpdate);
      window.addEventListener('nativeLocationBatchUpdate', handleNativeLocationBatchUpdate);
    }

    const handlePositionError = (err) => {
      console.warn('GPX position error:', err);
      if (err.code === 1) setGeoError('未允許 GPS 定位權限');
      else if (err.code === 2) setGeoError('目前 GPS 衛星訊號搜尋中 (請移至開闊天空下)');
    };

    if (gpsPollingMode === 'polling_20s') {
      const pollGeoOptions = {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      };
      const pollOnce = () => {
        if (isNativeApp && window.webkit?.messageHandlers?.gpsBridgeHandler) {
          window.webkit.messageHandlers.gpsBridgeHandler.postMessage({
            action: 'requestSingleFix',
            mode: 'polling_20s'
          });
          return;
        }
        navigator.geolocation.getCurrentPosition(handlePositionSuccess, handlePositionError, pollGeoOptions);
      };
      pollOnce();
      pollIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const hasWalkedRecently = lastImuStepTimeRef.current > 0 && (now - lastImuStepTimeRef.current <= 20000);
        const hasDrivenRecently = lastGpsHighSpeedTimeRef.current > 0 && (now - lastGpsHighSpeedTimeRef.current <= 28000);
        if (
          imuActiveRef.current &&
          trackPointsRef.current.length > 0 &&
          activeRoute === null &&
          !hasWalkedRecently &&
          !hasDrivenRecently
        ) {
          return;
        }
        pollOnce();
      }, 20000);
    } else {
      if (!isNativeApp) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          handlePositionSuccess,
          handlePositionError,
          {
            enableHighAccuracy: true,
            maximumAge: 3000,
            timeout: 10000
          }
        );
      }
    }

    return () => {
      cleanupGps();
      if (typeof window !== 'undefined') {
        window.removeEventListener('nativeLocationUpdate', handleNativeLocationUpdate);
        window.removeEventListener('nativeLocationBatchUpdate', handleNativeLocationBatchUpdate);
      }
    };
  }, [isRecording, activeRoute, gpsPollingMode, reconcileWallClockTime]);

  // 7. Turn ON: Start new recording track
  const turnOn = useCallback((defaultName = '') => {
    if (typeof window !== 'undefined' && typeof window.DeviceMotionEvent !== 'undefined' && typeof window.DeviceMotionEvent.requestPermission === 'function') {
      window.DeviceMotionEvent.requestPermission().catch(() => {});
    }
    const defaultTitle = getNextTrackTitle(defaultName || trackName, savedTracks);
    setTrackName(defaultTitle);
    trackPointsRef.current = [];
    verifiedMaxSpeedKmhRef.current = 0;
    lastValidSpeedRef.current = { speedKmh: 0, timeMs: 0 };
    smoothedEleRef.current = { ele: null, vAcc: 999 };
    setTrackPoints([]);
    setWaypoints([]);
    elapsedSecRef.current = 0;
    movingSecRef.current = 0;
    stoppedSecRef.current = 0;
    setElapsedSec(0);
    setMovingSec(0);
    setStoppedSec(0);
    setIsManuallyResting(false);
    isManuallyRestingRef.current = false;
    isMovingRef.current = false;
    const now = Date.now();
    recordingStartMsRef.current = now;
    lastWallTickMsRef.current = now;
    lastMoveTimeRef.current = 0;
    lastImuStepTimeRef.current = 0;
    lastGpsHighSpeedTimeRef.current = 0;
    lastPosRef.current = null;
    setLastFinishedTrack(null);
    setIsRecording(true);
    try {
      window.webkit?.messageHandlers?.gpsBridgeHandler?.postMessage({
        enabled: true,
        mode: toNativeBridgeMode(gpsPollingModeRef.current)
      });
    } catch (e) {}
  }, [trackName, savedTracks]);

  // 8. Turn OFF: Finish recording track and package the path between ON and OFF
  const turnOff = useCallback(() => {
    reconcileWallClockTime(true);
    setIsRecording(false);
    try {
      window.webkit?.messageHandlers?.gpsBridgeHandler?.postMessage({
        enabled: false,
        mode: toNativeBridgeMode(gpsPollingModeRef.current)
      });
    } catch (e) {}

    const finalPoints = trackPointsRef.current.length > 0 ? [...trackPointsRef.current] : [...trackPoints];
    const finalElapsed = Math.max(elapsedSecRef.current, elapsedSec);
    const finalMoving = Math.max(movingSecRef.current, movingSec);
    const finalStopped = Math.max(stoppedSecRef.current, stoppedSec);

    setTrackPoints(finalPoints);
    setElapsedSec(finalElapsed);
    setMovingSec(finalMoving);
    setStoppedSec(finalStopped);

    if (finalPoints.length > 0 || finalElapsed > 0) {
      const stats = calculateTrackStats(finalPoints);
      const formatSec = (sec) => {
        const s = Math.max(0, Math.floor(sec));
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      };

      // ✅ 確保最終結算的最高時速與即時車載 HUD 記錄的已過濾極速完全一致，不被 raw 跳點覆蓋
      const currentCapKmh = MODE_MAX_SPEED_CAPS[vehicleModeRef.current] || 190;
      const computedPeakKmh = computeVerifiedMaxSpeedKmh(finalPoints, currentCapKmh);
      const finalMaxSpeedKmh = Math.max(verifiedMaxSpeedKmhRef.current, computedPeakKmh);

      const mergedStats = {
        ...stats,
        maxSpeedKmh: finalMaxSpeedKmh.toFixed(1),
        durationMs: finalElapsed * 1000,
        durationFormatted: formatSec(finalElapsed),
        movingTimeSec: finalMoving,
        movingTimeFormatted: formatSec(finalMoving),
        stoppedTimeSec: finalStopped,
        stoppedTimeFormatted: formatSec(finalStopped)
      };

      const finalTitle = trackName || getNextTrackTitle('健行軌跡記錄', savedTracks);
      const xml = generateGPXString({
        trackName: finalTitle,
        description: `CampingChecker 健行足跡 (ON/OFF 區間) - 總里程: ${mergedStats.totalDistanceKm}km, 最高時速: ${mergedStats.maxSpeedKmh}km/h, 歷時: ${mergedStats.durationFormatted}, 休息: ${mergedStats.stoppedTimeFormatted}`,
        author: 'CampingChecker',
        points: finalPoints,
        waypoints
      });

      const finished = {
        id: `track_${Date.now()}`,
        name: finalTitle,
        points: finalPoints,
        waypoints: [...waypoints],
        stats: mergedStats,
        gpxXml: xml,
        finishedAt: new Date().toISOString()
      };

      setLastFinishedTrack(finished);
      flushActiveSessionToDisk(true, false, finished);

      persistSavedTracks([finished, ...savedTracks.filter(t => t.id !== finished.id)]);
      return finished;
    }
    return null;
  }, [trackPoints, waypoints, trackName, savedTracks, elapsedSec, movingSec, stoppedSec, persistSavedTracks, flushActiveSessionToDisk, reconcileWallClockTime]);

  // Manual Toggle Rest
  const toggleManualRest = useCallback(() => {
    setIsManuallyResting(prev => {
      const next = !prev;
      isManuallyRestingRef.current = next;
      if (next) {
        isMovingRef.current = false;
      } else {
        isMovingRef.current = true;
        const now = Date.now();
        lastMoveTimeRef.current = now;
        lastImuStepTimeRef.current = now;
      }
      return next;
    });
  }, []);

  // 9. Toggle switch: ON <-> OFF
  const toggleRecording = useCallback((defaultName = '') => {
    if (isRecording) {
      return turnOff();
    } else {
      turnOn(defaultName);
      return null;
    }
  }, [isRecording, turnOn, turnOff]);

  // 10. Add a landmark waypoint
  const addWaypoint = useCallback((name, category = '景點') => {
    const coord = currentCoords || (trackPoints.length > 0 ? trackPoints[trackPoints.length - 1] : null);
    if (!coord) return false;

    const wpt = {
      lat: coord.lat,
      lng: coord.lng,
      ele: coord.ele || null,
      time: new Date().toISOString(),
      name: name.trim() || `${category} #${waypoints.length + 1}`,
      sym: category === '營地' ? 'Campground' : category === '步道' ? 'Trailhead' : category === '水源' ? 'Water Source' : 'Flag, Blue'
    };
    setWaypoints(prev => [...prev, wpt]);
    return true;
  }, [currentCoords, trackPoints, waypoints.length]);

  // 11. Save current or finished track explicitly to Phone Library
  const saveTrackToHistory = useCallback((customTitle = '') => {
    const currentCapKmh = MODE_MAX_SPEED_CAPS[vehicleModeRef.current] || 190;
    const source = lastFinishedTrack || (trackPoints.length > 0 ? (() => {
      const rawStats = calculateTrackStats(trackPoints);
      const cleanMax = Math.max(verifiedMaxSpeedKmhRef.current, computeVerifiedMaxSpeedKmh(trackPoints, currentCapKmh));
      return {
        name: customTitle || trackName || '健行軌跡記錄',
        points: trackPoints,
        waypoints,
        stats: { ...rawStats, maxSpeedKmh: cleanMax.toFixed(1) },
        gpxXml: generateGPXString({
          trackName: customTitle || trackName || '健行軌跡記錄',
          points: trackPoints,
          waypoints
        }),
        finishedAt: new Date().toISOString()
      };
    })() : null);

    if (!source) return false;

    const baseName = customTitle || source.name;
    const sameNameCount = savedTracks.filter(t => t.name === baseName && t.id !== source.id).length;
    const finalName = sameNameCount > 0 ? `${baseName} (第 ${sameNameCount + 1} 段)` : baseName;

    const newRecord = {
      ...source,
      id: source.id || `track_${Date.now()}`,
      name: finalName
    };

    persistSavedTracks([newRecord, ...savedTracks.filter(t => t.id !== newRecord.id)]);
    return true;
  }, [lastFinishedTrack, trackPoints, waypoints, trackName, savedTracks, persistSavedTracks]);

  // 12. Rename a saved track in Phone Library
  const renameSavedTrack = useCallback((trackId, newName) => {
    if (!newName || !newName.trim()) return false;
    const trimmed = newName.trim();
    const updated = savedTracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          name: trimmed,
          gpxXml: t.gpxXml ? t.gpxXml.replace(/<name>.*?<\/name>/i, `<name>${trimmed}</name>`) : t.gpxXml
        };
      }
      return t;
    });
    persistSavedTracks(updated);
    if (activeRoute?.id === trackId) {
      setActiveRoute(prev => prev ? { ...prev, name: trimmed } : null);
    }
    return true;
  }, [savedTracks, activeRoute, persistSavedTracks]);

  // 12b. Delete saved track from Phone Library
  const deleteSavedTrack = useCallback((trackId) => {
    const updated = savedTracks.filter(t => t.id !== trackId);
    persistSavedTracks(updated);
    if (activeRoute?.id === trackId) {
      setActiveRoute(null);
    }
  }, [savedTracks, activeRoute, persistSavedTracks]);

  // 13. Load a track as the Active Reference Route
  const loadTrackAsActiveRoute = useCallback((track) => {
    if (!track || !track.points || track.points.length === 0) return false;
    setActiveRoute(track);
    return true;
  }, []);

  const clearActiveRoute = useCallback(() => {
    setActiveRoute(null);
  }, []);

  // 14. Import external GPX file
  const importGPXFile = useCallback(async (file) => {
    if (!file) return null;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const xml = e.target.result;
          const parsed = parseGPXString(xml);
          const cleanMax = computeVerifiedMaxSpeedKmh(parsed.points, 350);
          const newRecord = {
            id: `imported_${Date.now()}`,
            name: parsed.name || file.name.replace(/\.gpx$/i, ''),
            points: parsed.points,
            waypoints: parsed.waypoints,
            stats: cleanMax > 0 ? { ...parsed.stats, maxSpeedKmh: cleanMax.toFixed(1) } : parsed.stats,
            gpxXml: xml,
            source: 'imported',
            fileName: file.name,
            finishedAt: new Date().toISOString()
          };

          persistSavedTracks([newRecord, ...savedTracks]);
          setActiveRoute(newRecord);
          resolve(newRecord);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('讀取檔案失敗'));
      reader.readAsText(file);
    });
  }, [savedTracks, persistSavedTracks]);

  // 15. Load a built-in Preset Trail
  const loadPresetTrail = useCallback((trailId) => {
    const trail = PRESET_HIKING_TRAILS.find(t => t.id === trailId);
    if (!trail) return null;

    const xml = generatePresetGPX(trailId);
    const parsed = parseGPXString(xml);
    const newRecord = {
      id: `preset_${trail.id}_${Date.now()}`,
      name: trail.name,
      points: parsed.points,
      waypoints: parsed.waypoints,
      stats: parsed.stats,
      gpxXml: xml,
      source: 'preset',
      trailInfo: trail,
      finishedAt: new Date().toISOString()
    };

    persistSavedTracks([newRecord, ...savedTracks.filter(t => t.name !== trail.name)]);
    setActiveRoute(newRecord);
    return newRecord;
  }, [savedTracks, persistSavedTracks]);

  // 16. Download GPX file
  const downloadGPX = useCallback((trackOrFilename = '') => {
    let xml = '';
    let fname = '';

    if (typeof trackOrFilename === 'object' && trackOrFilename?.gpxXml) {
      xml = trackOrFilename.gpxXml;
      fname = trackOrFilename.name;
    } else {
      xml = lastFinishedTrack?.gpxXml || generateGPXString({
        trackName: trackName || '健行軌跡記錄',
        points: trackPoints,
        waypoints
      });
      fname = (typeof trackOrFilename === 'string' && trackOrFilename) ? trackOrFilename : (trackName || '健行軌跡記錄');
    }

    const cleanName = fname.replace(/[/\\?%*:|"<>]/g, '_');
    downloadGPXFile(`${cleanName}.gpx`, xml);
  }, [lastFinishedTrack, trackName, trackPoints, waypoints]);

  // 17. Export to Google My Maps
  const exportToGoogleMyMaps = useCallback((trackOrFilename = '') => {
    downloadGPX(trackOrFilename);
    if (typeof window !== 'undefined') {
      window.open('https://mymaps.google.com/', '_blank');
    }
  }, [downloadGPX]);

  // 17.5. One-click Open in gpx.studio
  const openInGPXStudio = useCallback(async (trackOrFilename = '') => {
    let xml = '';
    let fname = '';

    if (typeof trackOrFilename === 'object' && trackOrFilename?.gpxXml) {
      xml = trackOrFilename.gpxXml;
      fname = trackOrFilename.name;
    } else if (lastFinishedTrack?.gpxXml) {
      xml = lastFinishedTrack.gpxXml;
      fname = lastFinishedTrack.name;
    } else if (trackPoints.length > 0) {
      fname = trackName || '健行軌跡記錄';
      xml = generateGPXString({
        trackName: fname,
        points: trackPoints,
        waypoints
      });
    }

    if (!xml) return null;

    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    try {
      const res = await fetch('/api/gpx/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fname, gpxXml: xml })
      });
      const data = await res.json();

      if (data?.shareUrl && !isLocalhost) {
        if (typeof window !== 'undefined') {
          window.open(data.gpxStudioUrl, '_blank');
        }
        return { success: true, mode: 'auto', url: data.gpxStudioUrl, shareUrl: data.shareUrl };
      } else {
        downloadGPX(trackOrFilename);
        if (typeof window !== 'undefined') {
          window.open('https://gpx.studio/', '_blank');
        }
        return { success: true, mode: 'local', fileName: `${fname}.gpx`, url: 'https://gpx.studio/' };
      }
    } catch (e) {
      downloadGPX(trackOrFilename);
      if (typeof window !== 'undefined') {
        window.open('https://gpx.studio/', '_blank');
      }
      return { success: true, mode: 'fallback', url: 'https://gpx.studio/' };
    }
  }, [downloadGPX, lastFinishedTrack, trackName, trackPoints, waypoints]);

  // 18. Clear active recording
  const resetTrack = useCallback(() => {
    setIsRecording(false);
    trackPointsRef.current = [];
    verifiedMaxSpeedKmhRef.current = 0;
    lastValidSpeedRef.current = { speedKmh: 0, timeMs: 0 };
    smoothedEleRef.current = { ele: null, vAcc: 999 };
    elapsedSecRef.current = 0;
    movingSecRef.current = 0;
    stoppedSecRef.current = 0;
    setTrackPoints([]);
    setWaypoints([]);
    setElapsedSec(0);
    setMovingSec(0);
    setStoppedSec(0);
    setLastFinishedTrack(null);
    try {
      localStorage.removeItem(STORAGE_ACTIVE_KEY);
      localStorage.removeItem('camping_gpx_active_recording_v1');
      window.webkit?.messageHandlers?.gpsBridgeHandler?.postMessage({
        enabled: false,
        mode: toNativeBridgeMode(gpsPollingModeRef.current)
      });
    } catch (e) {}
  }, []);

  // 19. Real-time Route Adherence Calculation
  const routeAdherence = useMemo(() => {
    if (!activeRoute || !activeRoute.points || activeRoute.points.length === 0 || !currentCoords) {
      return null;
    }

    let minDistanceM = 999999;
    let closestIndex = 0;

    for (let i = 0; i < activeRoute.points.length; i++) {
      const pt = activeRoute.points[i];
      const dist = getDistanceMeters(currentCoords.lat, currentCoords.lng, pt.lat, pt.lng);
      if (dist < minDistanceM) {
        minDistanceM = dist;
        closestIndex = i;
      }
    }

    const nextPt = activeRoute.points[Math.min(activeRoute.points.length - 1, closestIndex + 1)];
    const bearingToNext = nextPt ? calculateBearing(currentCoords.lat, currentCoords.lng, nextPt.lat, nextPt.lng) : null;

    let nearestWaypoint = null;
    let minWptDistM = 999999;
    if (activeRoute.waypoints && activeRoute.waypoints.length > 0) {
      for (const wpt of activeRoute.waypoints) {
        const d = getDistanceMeters(currentCoords.lat, currentCoords.lng, wpt.lat, wpt.lng);
        if (d < minWptDistM) {
          minWptDistM = d;
          nearestWaypoint = { ...wpt, distanceM: Math.round(d) };
        }
      }
    }

    const isOffTrack = minDistanceM > 35;

    return {
      routeName: activeRoute.name,
      distanceToRouteM: Math.round(minDistanceM),
      isOffTrack,
      closestIndex,
      bearingToNext: bearingToNext !== null ? Math.round(bearingToNext) : null,
      nearestWaypoint,
      totalRouteKm: activeRoute.stats?.totalDistanceKm || '0'
    };
  }, [activeRoute, currentCoords]);

  const formatDurationStr = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // ⚡ 使用 useMemo 快取球面幾何統計，並同步採用已過濾的真實極速
  const baseStats = useMemo(() => {
    const raw = calculateTrackStats(trackPoints);
    const cap = MODE_MAX_SPEED_CAPS[vehicleMode] || 190;
    const cleanMax = Math.max(verifiedMaxSpeedKmhRef.current, computeVerifiedMaxSpeedKmh(trackPoints, cap));
    return {
      ...raw,
      maxSpeedKmh: cleanMax.toFixed(1)
    };
  }, [trackPoints, vehicleMode]);

  const isStationary = !isMovingRef.current || isManuallyResting;

  const currentStats = isRecording ? {
    ...baseStats,
    durationMs: elapsedSec * 1000,
    durationFormatted: formatDurationStr(elapsedSec),
    movingTimeSec: movingSec,
    movingTimeFormatted: formatDurationStr(movingSec),
    stoppedTimeSec: stoppedSec,
    stoppedTimeFormatted: formatDurationStr(stoppedSec),
    isStationary,
    isManuallyResting,
    currentSpeedKmh: isStationary ? '0.0' : (
      currentCoords?.calculatedSpeedKmh !== undefined ? currentCoords.calculatedSpeedKmh.toFixed(1) : (
        currentCoords?.speed ? (currentCoords.speed * 3.6).toFixed(1) : baseStats.currentSpeedKmh
      )
    )
  } : {
    ...baseStats,
    isStationary: false,
    isManuallyResting: false
  };

  return {
    isRecording,
    turnOn,
    turnOff,
    toggleRecording,
    trackPoints,
    waypoints,
    addWaypoint,
    trackName,
    setTrackName,
    elapsedSec,
    movingSec,
    stoppedSec,
    isManuallyResting,
    toggleManualRest,
    currentStats,
    lastFinishedTrack,
    downloadGPX,
    exportToGoogleMyMaps,
    openInGPXStudio,
    resetTrack,
    geoError,
    currentCoords,
    isSilentHikingMode,
    setIsSilentHikingMode,
    isUiSuspended,
    setIsUiSuspended,
    syncUiFromRefs,
    calibrateElevation: (knownElevationM) => {
      const target = Number(knownElevationM);
      if (!Number.isFinite(target)) return false;
      const rawCurrent = smoothedEleRef.current.ele !== null
        ? (smoothedEleRef.current.ele - altitudeOffsetMRef.current)
        : (currentCoordsRef.current?.ele !== null && currentCoordsRef.current?.ele !== undefined
            ? (currentCoordsRef.current.ele - altitudeOffsetMRef.current)
            : null);
      if (rawCurrent !== null) {
        const newOffset = target - rawCurrent;
        altitudeOffsetMRef.current = newOffset;
        smoothedEleRef.current = { ele: target, vAcc: 5 };
        try { localStorage.setItem('camping_gpx_altitude_offset_v1', String(newOffset)); } catch (e) {}
        if (currentCoordsRef.current) {
          const updated = { ...currentCoordsRef.current, ele: Number(target.toFixed(1)) };
          currentCoordsRef.current = updated;
          setCurrentCoords(updated);
        }
        return true;
      }
      return false;
    },
    gpsPollingMode,
    setGpsPollingMode,
    vehicleMode,
    setVehicleMode,
    isNativeBridgeActive,
    savedTracks,
    saveTrackToHistory,
    deleteSavedTrack,
    renameSavedTrack,
    activeRoute,
    loadTrackAsActiveRoute,
    clearActiveRoute,
    importGPXFile,
    loadPresetTrail,
    routeAdherence
  };
}
