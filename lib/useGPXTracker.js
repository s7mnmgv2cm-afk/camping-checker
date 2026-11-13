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

  // 🧭 陀螺儀 + 加速度計 (IMU DeviceMotion) 步態偵測：0.1 秒即時感應步行邁步、停步 5 秒即入休息，且靜止時免喚醒 GPS
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

  // 🌱 登山盲記省電模式 (預設開啟：爬山過程不每秒刷螢幕儀表，僅在喚醒或按 OFF 時一次性結算更新)
  const [isSilentHikingMode, setIsSilentHikingMode] = useState(false);
  const [isUiSuspended, setIsUiSuspended] = useState(false); // 當進入口袋純黑熄屏或關閉視窗時自動為 true
  const isSilentHikingModeRef = useRef(false);
  const isUiSuspendedRef = useRef(false);

  // 🛰️ GPS 取樣策略：預設採用「20 秒間歇性單點輪詢 (polling_20s)」取代連續 1Hz watchPosition，讓 GPS 晶片在空檔進入休眠省電
  const [gpsPollingMode, setGpsPollingMode] = useState('polling_20s'); // 'polling_20s' | 'continuous_1s'
  const gpsPollingModeRef = useRef('polling_20s');
  const pollIntervalRef = useRef(null);
  const lastWallTickMsRef = useRef(0);
  const recordingStartMsRef = useRef(0);

  // 🍏 iOS 原生 CoreLocation 背景橋接狀態 (Xcode BackgroundLocationManager -> window.__nativeLocation / nativeLocationUpdate)
  const [isNativeBridgeActive, setIsNativeBridgeActive] = useState(false);
  const isNativeBridgeActiveRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.__isCampingNativeApp || window.__nativeLocation || window.webkit?.messageHandlers?.themeHandler) {
      isNativeBridgeActiveRef.current = true;
      setIsNativeBridgeActive(true);
    }
  }, []);

  useEffect(() => {
    gpsPollingModeRef.current = gpsPollingMode;
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
      // 關螢幕期間若有收到實際位移 >= 4m 之背景座標點，lastMoveTimeRef 會在 28 秒內刷新
      const hasRecentBgGpsMove =
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden' &&
        lastMoveTimeRef.current > 0 &&
        (now - lastMoveTimeRef.current) <= 28000;

      const currentlyMoving =
        !isManuallyRestingRef.current &&
        (hasRecentStep || hasHighSpeedGps || hasRecentBgGpsMove);

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
        lastDiskSaveMsRef.current = now;
      } else if (force) {
        localStorage.removeItem(STORAGE_ACTIVE_KEY);
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

  // 網頁退至背景或關閉前，強制立即寫入一次硬碟防遺失；從背景關螢幕喚醒 (visibilitychange / focus / pageshow / nativeAppWake) 時，0 延遲重算絕對系統時鐘並更新畫面！
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

      // 1. 線性加速度偵測 (扣除重力後之步伐衝擊 >= 1.05 m/s²)
      if (acc && (acc.x !== null || acc.y !== null || acc.z !== null)) {
        imuActiveRef.current = true;
        const linMag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
        if (linMag >= 1.05) stepDetected = true;
      } else if (accG && (accG.x !== null || accG.y !== null || accG.z !== null)) {
        // 2. 含重力總加速度偵測 (偏離 9.81 m/s² 達 1.25 m/s²)
        imuActiveRef.current = true;
        const totMag = Math.hypot(accG.x || 0, accG.y || 0, accG.z || 0);
        if (Math.abs(totMag - 9.81) >= 1.25) stepDetected = true;
      }

      // 3. 陀螺儀角速度偵測 (大腿口袋或手部隨步伐擺動 >= 25 deg/s)
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

  // 4b. Elapsed time & live moving/stopped counter (融合絕對起始時鐘 recordingStartMs、IMU 步態與 GPS 速度，靜止放桌上時 100% 計入休息時間)
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

  // 5. Screen WakeLock (僅在純網頁瀏覽器啟用；在 iOS 原生 App 內不鎖定螢幕電源 assertion，大幅降低 Display 與系統能耗)
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

  // 6. GPS 定位架構：支援「20 秒間歇性單點輪詢」讓 GPS 晶片在空檔休眠省電，亦可切換連續 watchPosition
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('此瀏覽器不支援 GPS 定位');
      return;
    }

    const shouldWatch = isRecording || activeRoute !== null;

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
        window.webkit?.messageHandlers?.gpsBridgeHandler?.postMessage({ enabled: false, mode: gpsPollingMode });
      } catch (e) {}
      return;
    }

    try {
      window.webkit?.messageHandlers?.gpsBridgeHandler?.postMessage({ enabled: true, mode: gpsPollingMode });
    } catch (e) {}

    setGeoError(null);

    const handlePositionSuccess = (pos, isBatchPoint = false) => {
      const pointMs = pos.timestamp && Number.isFinite(Number(pos.timestamp))
        ? Number(pos.timestamp)
        : Date.now();

      const pt = {
        lat: Number(pos.coords.latitude),
        lng: Number(pos.coords.longitude),
        ele: pos.coords.altitude !== undefined && pos.coords.altitude !== null ? Number(pos.coords.altitude) : null,
        speed: pos.coords.speed !== undefined && pos.coords.speed !== null && Number(pos.coords.speed) >= 0 ? Number(pos.coords.speed) : null,
        accuracy: pos.coords.accuracy !== undefined && pos.coords.accuracy !== null ? Number(pos.coords.accuracy) : null,
        time: new Date(pointMs).toISOString()
      };

      let speedKmh = pt.speed !== null && pt.speed > 0 ? pt.speed * 3.6 : 0;
      let anchorDistM = 0;

      if (!lastPosRef.current) {
        lastPosRef.current = pt;
      } else {
        const dM = getDistanceMeters(lastPosRef.current.lat, lastPosRef.current.lng, pt.lat, pt.lng);
        const dtSec = (new Date(pt.time).getTime() - new Date(lastPosRef.current.time).getTime()) / 1000;
        anchorDistM = dM;

        // 累積位移達 2.5m 才計算時速，避免放桌上 1~2m 室內 GPS 漂移產生假時速
        if (dtSec > 0.4 && dtSec <= 180 && dM >= 2.5) {
          const calculated = (dM / dtSec) * 3.6;
          if (calculated < 1200 && calculated > speedKmh) {
            speedKmh = calculated;
          }
          lastPosRef.current = pt;
        } else if (dtSec >= 10) {
          lastPosRef.current = pt;
        }
      }
      pt.calculatedSpeedKmh = speedKmh;

      // 僅當真實高速移動 (時速 >= 3.5 km/h 且位移 >= 4.0m) 時，才標記為 GPS 高速移動 (開車/騎車)，絕不因桌面 GPS 微幅漂移誤判為移動！
      if (speedKmh >= 3.5 && anchorDistM >= 4.0 && !isManuallyRestingRef.current) {
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
          if (!isSilent) setTrackPoints([pt]);
          flushDiskRef.current(isHiddenBg || gpsPollingModeRef.current === 'polling_20s');
        } else {
          // 3.5m Jitter filter：濾除原地靜止時的 GPS 漂移
          const last = prev[prev.length - 1];
          const dist = getDistanceMeters(last.lat, last.lng, pt.lat, pt.lng);
          if (dist >= 3.5) {
            if (!isManuallyRestingRef.current) {
              lastMoveTimeRef.current = Date.now();
              isMovingRef.current = true;
              // 若在關螢幕背景或批次補點時發生 >= 3.5m 實質位移，將該段時間 (上限 25 秒) 歸入移動時間
              if (isHiddenBg || isBatchPoint) {
                const segSec = Math.min(
                  25,
                  Math.max(1, Math.round((new Date(pt.time).getTime() - new Date(last.time).getTime()) / 1000))
                );
                const transferSec = Math.min(stoppedSecRef.current, segSec);
                if (transferSec > 0) {
                  stoppedSecRef.current -= transferSec;
                  movingSecRef.current += transferSec;
                }
              }
            }
            const nextPts = [...prev, pt];
            trackPointsRef.current = nextPts;
            // 若在靜默省電或黑屏/關屏背景模式，僅更新記憶體陣列，完全不觸發 React 畫面重繪！
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
    const addTrackPoint = (lat, lng, alt = null, timestamp = null, acc = null, speed = null, isBatchPoint = false) => {
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
          speed: speed !== undefined && speed !== null ? Number(speed) : null
        },
        timestamp: timestamp || Date.now()
      }, isBatchPoint);
    };

    // 當包在原生 App 內且螢幕關閉時，會持續收到來自 Swift 背景引擎的座標推播
    const handleNativeLocationUpdate = (e) => {
      const detail = e?.detail || (typeof window !== 'undefined' ? window.__nativeLocation : null);
      if (!detail) return;
      const { lat, lng, alt, timestamp, acc, speed } = detail;
      addTrackPoint(lat, lng, alt, timestamp, acc, speed, false);
    };

    // 支援批次補齊：若關螢幕期間在原生佇列累積了座標點，喚醒時一次性補入並結算移動秒數
    const handleNativeLocationBatchUpdate = (e) => {
      const list = e?.detail;
      if (!Array.isArray(list)) return;
      reconcileWallClockTime(false);
      list.forEach((item) => {
        if (item && item.lat !== undefined && item.lng !== undefined) {
          addTrackPoint(item.lat, item.lng, item.alt, item.timestamp, item.acc, item.speed, true);
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
      // 🚶 登山步速間歇性輪詢架構：每 20 秒單點取樣一次，取樣完立即關閉 GPS 晶片休眠 19 秒！
      const pollGeoOptions = {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      };
      const pollOnce = () => {
        if (isNativeApp && window.webkit?.messageHandlers?.gpsBridgeHandler) {
          // 在 iOS 原生 App 內，通知 Swift 啟動單點取樣 (抓到 1 點即立刻 stopUpdatingLocation 關閉 GPS 19 秒)
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
        // 🧭 智慧靜止免喚醒：若已取得起點座標，且過去 20 秒內完全沒有任何步伐震動與高速位移（放桌上或原地休息），100% 跳過本次 GPS 喚醒！
        const now = Date.now();
        const hasWalkedRecently = lastImuStepTimeRef.current > 0 && (now - lastImuStepTimeRef.current <= 20000);
        const hasDrivenRecently = lastGpsHighSpeedTimeRef.current > 0 && (now - lastGpsHighSpeedTimeRef.current <= 28000);
        if (
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
      // ⚡ 連續高頻追蹤架構 (每秒 1 次，適合單車/開車或即時觀看指針時速表)
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

  // 7. Turn ON: Start new recording track (Smart duplicate handling: automatically sequence so A is never overwritten)
  const turnOn = useCallback((defaultName = '') => {
    // 在使用者點擊 ON 的手勢中順便請求 iOS 陀螺儀/加速度計步態權限 (DeviceMotionEvent)
    if (typeof window !== 'undefined' && typeof window.DeviceMotionEvent !== 'undefined' && typeof window.DeviceMotionEvent.requestPermission === 'function') {
      window.DeviceMotionEvent.requestPermission().catch(() => {});
    }
    const defaultTitle = getNextTrackTitle(defaultName || trackName, savedTracks);
    setTrackName(defaultTitle);
    trackPointsRef.current = [];
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
    // 預設以靜止/準備狀態啟動：放桌上不會誤算移動時間，一旦邁步或移動才開始累加移動時間
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
      window.webkit?.messageHandlers?.gpsBridgeHandler?.postMessage({ enabled: true, mode: gpsPollingModeRef.current });
    } catch (e) {}
  }, [trackName, savedTracks]);

  // 8. Turn OFF: Finish recording track and package the path between ON and OFF
  const turnOff = useCallback(() => {
    reconcileWallClockTime(true);
    setIsRecording(false);
    try {
      window.webkit?.messageHandlers?.gpsBridgeHandler?.postMessage({ enabled: false, mode: gpsPollingModeRef.current });
    } catch (e) {}

    // 結算時從記憶體 Ref 取出完整點位與秒數，確保「盲記省電模式」下按 OFF 100% 精準結算！
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

      const mergedStats = {
        ...stats,
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
        description: `CampingChecker 健行足跡 (ON/OFF 區間) - 總里程: ${mergedStats.totalDistanceKm}km, 歷時: ${mergedStats.durationFormatted}, 休息: ${mergedStats.stoppedTimeFormatted}`,
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

      // Auto save to local phone library (Never overwrites, uniquely stored by unique id)
      persistSavedTracks([finished, ...savedTracks.filter(t => t.id !== finished.id)]);
      return finished;
    }
    return null;
  }, [trackPoints, waypoints, trackName, savedTracks, elapsedSec, movingSec, stoppedSec, persistSavedTracks, flushActiveSessionToDisk]);

  // Manual Toggle Rest (提供使用者手動一鍵切換休息停頓模式)
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

  // 11. Save current or finished track explicitly to Phone Library (Smart duplicate check)
  const saveTrackToHistory = useCallback((customTitle = '') => {
    const source = lastFinishedTrack || (trackPoints.length > 0 ? {
      name: customTitle || trackName || '健行軌跡記錄',
      points: trackPoints,
      waypoints,
      stats: calculateTrackStats(trackPoints),
      gpxXml: generateGPXString({
        trackName: customTitle || trackName || '健行軌跡記錄',
        points: trackPoints,
        waypoints
      }),
      finishedAt: new Date().toISOString()
    } : null);

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

  // 12. Delete saved track from Phone Library
  const deleteSavedTrack = useCallback((trackId) => {
    const updated = savedTracks.filter(t => t.id !== trackId);
    persistSavedTracks(updated);
    if (activeRoute?.id === trackId) {
      setActiveRoute(null);
    }
  }, [savedTracks, activeRoute, persistSavedTracks]);

  // 13. Load a track as the Active Reference Route (供跟隨導航與偏離警告)
  const loadTrackAsActiveRoute = useCallback((track) => {
    if (!track || !track.points || track.points.length === 0) return false;
    setActiveRoute(track);
    return true;
  }, []);

  const clearActiveRoute = useCallback(() => {
    setActiveRoute(null);
  }, []);

  // 14. Import external GPX file (從手機檔案選取，如健行筆記下載的 GPX)
  const importGPXFile = useCallback(async (file) => {
    if (!file) return null;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const xml = e.target.result;
          const parsed = parseGPXString(xml);
          const newRecord = {
            id: `imported_${Date.now()}`,
            name: parsed.name || file.name.replace(/\.gpx$/i, ''),
            points: parsed.points,
            waypoints: parsed.waypoints,
            stats: parsed.stats,
            gpxXml: xml,
            source: 'imported',
            fileName: file.name,
            finishedAt: new Date().toISOString()
          };

          // Save to phone library and set as active reference route
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

  // 15. Load a built-in Preset Trail (如司馬庫斯、霞喀羅等)
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

  // 17.5. One-click Open in gpx.studio (跨平台最強免裝 App 線上 GPX 地圖檢視器)
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
    } catch (e) {}
  }, []);

  // 19. Real-time Route Adherence Calculation (防走錯路 / 偏離軌道警報)
  // 即使在飛航模式下，手機衛星 GPS 也能即時比對與 activeRoute 的最短距離 (useMemo 避免每秒重算)
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

    // Next point / waypoint along route
    const nextPt = activeRoute.points[Math.min(activeRoute.points.length - 1, closestIndex + 1)];
    const bearingToNext = nextPt ? calculateBearing(currentCoords.lat, currentCoords.lng, nextPt.lat, nextPt.lng) : null;

    // Nearest waypoint if any
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

    const isOffTrack = minDistanceM > 35; // 偏離超過 35 公尺警示

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

  // ⚡ 使用 useMemo 快取球面幾何統計，僅在實際新增軌跡點時計算一次，避免每秒重算消耗 CPU
  const baseStats = useMemo(() => calculateTrackStats(trackPoints), [trackPoints]);
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
    // 🌱 省電靜默控制 (0 螢幕刷新 / 僅按 OFF 結算 / 20 秒間歇輪詢)
    isSilentHikingMode,
    setIsSilentHikingMode,
    isUiSuspended,
    setIsUiSuspended,
    syncUiFromRefs,
    gpsPollingMode,
    setGpsPollingMode,
    isNativeBridgeActive,
    // Phone storage library & External GPX imports
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
