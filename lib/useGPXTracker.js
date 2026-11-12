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

  useEffect(() => {
    gpsPollingModeRef.current = gpsPollingMode;
  }, [gpsPollingMode]);

  useEffect(() => {
    isSilentHikingModeRef.current = isSilentHikingMode;
  }, [isSilentHikingMode]);

  useEffect(() => {
    isUiSuspendedRef.current = isUiSuspended;
  }, [isUiSuspended]);

  // 立即將記憶體中的最新累積點位與秒數同步回畫面 State (於喚醒螢幕、打開視窗或按 OFF 時呼叫)
  const syncUiFromRefs = useCallback(() => {
    setElapsedSec(elapsedSecRef.current);
    setMovingSec(movingSecRef.current);
    setStoppedSec(stoppedSecRef.current);
    if (trackPointsRef.current.length !== trackPoints.length) {
      setTrackPoints([...trackPointsRef.current]);
    }
    if (currentCoordsRef.current) {
      setCurrentCoords(currentCoordsRef.current);
    }
  }, [trackPoints.length]);

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
            isMovingRef.current = true;
            lastMoveTimeRef.current = Date.now();
            const startMs = new Date(data.points[0]?.time || Date.now()).getTime();
            const calcElapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
            const restoredElapsed = data.elapsedSec || calcElapsed;
            elapsedSecRef.current = restoredElapsed;
            setElapsedSec(restoredElapsed);
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

  // 網頁退至背景或關閉前，強制立即寫入一次硬碟防遺失
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleHide = () => {
      if (document.visibilityState === 'hidden' && isRecording) {
        flushActiveSessionToDisk(true);
      }
    };
    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('pagehide', handleHide);
    return () => {
      document.removeEventListener('visibilitychange', handleHide);
      window.removeEventListener('pagehide', handleHide);
    };
  }, [isRecording, flushActiveSessionToDisk]);

  // 3. Persist saved tracks library to localStorage
  const persistSavedTracks = useCallback((updatedList) => {
    try {
      setSavedTracks(updatedList);
      localStorage.setItem(STORAGE_SAVED_TRACKS_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.warn('Failed to persist saved tracks to localStorage:', e);
    }
  }, []);

  // 4. Elapsed time & live moving/stopped counter (支援靜默省電：不看螢幕時 0 React 重繪)
  useEffect(() => {
    if (isRecording) {
      if (lastMoveTimeRef.current === 0) {
        lastMoveTimeRef.current = Date.now();
      }
      if (!isManuallyRestingRef.current) {
        isMovingRef.current = true;
      }
      timerRef.current = setInterval(() => {
        elapsedSecRef.current += 1;

        // 在 20 秒間歇輪詢模式下，兩次單點定位間隔 20 秒，因此靜止判定視窗設為 28 秒；1 秒連續追蹤模式則設為 12 秒（容許慢步累積位移）
        const stationaryThresholdMs = gpsPollingModeRef.current === 'polling_20s' ? 28000 : 12000;
        if (Date.now() - lastMoveTimeRef.current > stationaryThresholdMs) {
          isMovingRef.current = false;
        }

        const currentlyMoving = isMovingRef.current && !isManuallyRestingRef.current;
        if (currentlyMoving) {
          movingSecRef.current += 1;
        } else {
          stoppedSecRef.current += 1;
        }

        // ⚡ 只有當「使用者正在看儀表板」(!isUiSuspended && !isSilentHikingMode) 時才更新 React State 刷新螢幕！
        // 當處於口袋暗屏、關閉視窗、或開啟「登山盲記模式」時，完全不觸發 React 重繪 (0% DOM/GPU 負載)
        if (!isUiSuspendedRef.current && !isSilentHikingModeRef.current) {
          setElapsedSec(elapsedSecRef.current);
          if (currentlyMoving) {
            setMovingSec(movingSecRef.current);
          } else {
            setStoppedSec(stoppedSecRef.current);
          }
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // 5. Screen WakeLock (僅保留硬體級省電鎖定，移除會造成每秒數千次音訊中斷的 1-sample WAV 迴圈)
  useEffect(() => {
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

  // 6. GPS 定位架構：支援「20 秒間歇性單點輪詢 (setInterval + getCurrentPosition)」讓 GPS 晶片在空檔休眠省電，亦可切換連續 watchPosition
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
      return;
    }

    setGeoError(null);
    // 切換定位頻率或啟動時，重設移動計時基準，避免等待第一次 GPS 收斂期間被誤判為休息停頓
    if (isRecording && !isManuallyRestingRef.current) {
      isMovingRef.current = true;
      lastMoveTimeRef.current = Date.now();
    }

    const handlePositionSuccess = (pos) => {
      const pt = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        ele: pos.coords.altitude || null,
        speed: pos.coords.speed || null,
        accuracy: pos.coords.accuracy || null,
        time: new Date().toISOString()
      };

      let speedKmh = pt.speed !== null && pt.speed !== undefined && pt.speed > 0 ? pt.speed * 3.6 : 0;
      let anchorDistM = 0;

      if (!lastPosRef.current) {
        lastPosRef.current = pt;
      } else {
        const dM = getDistanceMeters(lastPosRef.current.lat, lastPosRef.current.lng, pt.lat, pt.lng);
        const dtSec = (new Date(pt.time).getTime() - new Date(lastPosRef.current.time).getTime()) / 1000;
        anchorDistM = dM;

        // 累積位移達 1.2m 即可計算步行時速；若在 1s 模式下單秒僅移動 0.6m (<1.2m)，暫不覆蓋 lastPosRef 讓它跨 2~3 秒累積達 1.2m！
        if (dtSec > 0.4 && dtSec <= 90 && dM >= 1.2) {
          const calculated = (dM / dtSec) * 3.6;
          if (calculated < 1200 && calculated > speedKmh) {
            speedKmh = calculated;
          }
          lastPosRef.current = pt;
        } else if (dtSec >= 6) {
          // 超過 6 秒仍未移動達 1.2m，更新時間錨點
          lastPosRef.current = pt;
        }
      }
      pt.calculatedSpeedKmh = speedKmh;

      // 只要原生速度或累積位移時速 >= 0.6 km/h (或位移 >= 1.2m)，即刷新移動狀態與最後移動時間戳
      // 注意：絕不在單次 callback 中強制把 isMovingRef 設為 false，避免快取點 (dM=0) 誤殺移動狀態！統一交由上方 stationaryThresholdMs 逾時判定
      if ((speedKmh >= 0.6 || anchorDistM >= 1.2) && !isManuallyRestingRef.current) {
        isMovingRef.current = true;
        lastMoveTimeRef.current = Date.now();
      }

      currentCoordsRef.current = pt;
      const isSilent = isUiSuspendedRef.current || isSilentHikingModeRef.current;

      if (!isSilent || activeRoute !== null) {
        setCurrentCoords(pt);
      }

      if (isRecording) {
        const prev = trackPointsRef.current;
        if (prev.length === 0) {
          trackPointsRef.current = [pt];
          if (!isSilent) setTrackPoints([pt]);
          flushDiskRef.current(gpsPollingModeRef.current === 'polling_20s');
        } else {
          // 2.5m Jitter filter
          const last = prev[prev.length - 1];
          const dist = getDistanceMeters(last.lat, last.lng, pt.lat, pt.lng);
          if (dist >= 2.5) {
            if (!isManuallyRestingRef.current) {
              isMovingRef.current = true;
              lastMoveTimeRef.current = Date.now();
            }
            const nextPts = [...prev, pt];
            trackPointsRef.current = nextPts;
            // 若在靜默省電或黑屏模式，僅更新記憶體陣列，完全不觸發 React 畫面重繪！
            if (!isSilent) {
              setTrackPoints(nextPts);
            }
            flushDiskRef.current(gpsPollingModeRef.current === 'polling_20s');
          }
        }
      }
    };

    const handlePositionError = (err) => {
      console.warn('GPX position error:', err);
      if (err.code === 1) setGeoError('未允許 GPS 定位權限');
      else if (err.code === 2) setGeoError('目前 GPS 衛星訊號搜尋中 (請移至開闊天空下)');
    };

    if (gpsPollingMode === 'polling_20s') {
      // 🚶 登山步速間歇性輪詢架構：每 20 秒呼叫一次單點 getCurrentPosition，讓 GPS 晶片在空檔進入休眠省電
      const pollGeoOptions = {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      };
      navigator.geolocation.getCurrentPosition(handlePositionSuccess, handlePositionError, pollGeoOptions);
      pollIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(handlePositionSuccess, handlePositionError, pollGeoOptions);
      }, 20000);
    } else {
      // ⚡ 連續高頻追蹤架構 (每秒 1 次，適合單車/開車或即時觀看指針時速表)
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

    return cleanupGps;
  }, [isRecording, activeRoute, gpsPollingMode]);

  // 7. Turn ON: Start new recording track (Smart duplicate handling: automatically sequence so A is never overwritten)
  const turnOn = useCallback((defaultName = '') => {
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
    isMovingRef.current = true;
    lastMoveTimeRef.current = Date.now();
    lastPosRef.current = null;
    setLastFinishedTrack(null);
    setIsRecording(true);
  }, [trackName, savedTracks]);

  // 8. Turn OFF: Finish recording track and package the path between ON and OFF
  const turnOff = useCallback(() => {
    setIsRecording(false);

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
        lastMoveTimeRef.current = Date.now();
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
