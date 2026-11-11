'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
          setTrackPoints(data.points);
          setWaypoints(data.waypoints || []);
          if (data.trackName) setTrackName(data.trackName);
          if (data.movingSec) setMovingSec(data.movingSec);
          if (data.stoppedSec) setStoppedSec(data.stoppedSec);
          if (data.isRecording) {
            setIsRecording(true);
            const startMs = new Date(data.points[0]?.time || Date.now()).getTime();
            const calcElapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
            setElapsedSec(data.elapsedSec || calcElapsed);
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

  // 2. Persist active recording session
  useEffect(() => {
    try {
      if (isRecording || trackPoints.length > 0 || lastFinishedTrack) {
        localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify({
          isRecording,
          trackName,
          points: trackPoints,
          waypoints,
          elapsedSec,
          movingSec,
          stoppedSec,
          lastFinished: lastFinishedTrack,
          updatedAt: Date.now()
        }));
      } else {
        localStorage.removeItem(STORAGE_ACTIVE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save active GPX session:', e);
    }
  }, [isRecording, trackPoints, waypoints, trackName, elapsedSec, movingSec, stoppedSec, lastFinishedTrack]);

  // 3. Persist saved tracks library to localStorage
  const persistSavedTracks = useCallback((updatedList) => {
    try {
      setSavedTracks(updatedList);
      localStorage.setItem(STORAGE_SAVED_TRACKS_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.warn('Failed to persist saved tracks to localStorage:', e);
    }
  }, []);

  // 4. Elapsed time & live moving/stopped counter (即時每秒跳動計數)
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setElapsedSec(prev => prev + 1);

        // If no GPS motion registered in the last 4 seconds, mark as stationary/rest
        if (Date.now() - lastMoveTimeRef.current > 4000) {
          isMovingRef.current = false;
        }

        const currentlyMoving = isMovingRef.current && !isManuallyRestingRef.current;
        if (currentlyMoving) {
          setMovingSec(prev => prev + 1);
        } else {
          // Stationary or resting: actively increment stoppedSec every second
          setStoppedSec(prev => prev + 1);
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // 5. Screen WakeLock & Background Keep-Alive (防止手機在爬山健行中熄滅螢幕或遭 AOD 休眠凍結)
  const audioKeepAliveRef = useRef(null);

  useEffect(() => {
    let wakeLock = null;
    let isCancelled = false;

    // 5A. 申請 Screen WakeLock，並在釋放或回到前景時自動重新續約
    const requestWakeLock = async () => {
      if (!isRecording || isCancelled) return;
      if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = wakeLock;
        wakeLock.addEventListener('release', () => {
          wakeLockRef.current = null;
          // 若仍在記錄且網頁在前景，1 秒後自動重新續約鎖定
          if (isRecording && !isCancelled && typeof document !== 'undefined' && document.visibilityState === 'visible') {
            setTimeout(requestWakeLock, 1000);
          }
        });
      } catch (err) {
        console.warn('WakeLock request notice:', err);
      }
    };

    // 5B. iOS Safari / Android 背景音訊保活引擎 (Silent Audio Keep-Alive)
    // 依據 Apple WebKit 規範，背景播放極低音量音訊可取得 OS Media 狀態，防止手機進入 AOD 或暗屏時將 JS 計時器與 GPS 執行緒深度凍結
    try {
      if (isRecording && typeof Audio !== 'undefined' && !audioKeepAliveRef.current) {
        // 1-sample 44.1kHz 極簡無聲 WAV 循環音訊 (完全無雜音，0 耗電)
        const silentWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        const audio = new Audio(silentWav);
        audio.loop = true;
        audio.volume = 0.001;
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.play().catch(() => {});
        audioKeepAliveRef.current = audio;
      }
    } catch (e) {
      console.warn('Audio keep-alive notice:', e);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRecording) {
        requestWakeLock();
      }
    };

    requestWakeLock();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // 每 15 秒主動心跳檢測 WakeLock 是否被 OS 暗中撤銷
    const heartbeat = setInterval(() => {
      if (isRecording && !wakeLockRef.current && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    }, 15000);

    return () => {
      isCancelled = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      clearInterval(heartbeat);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
      wakeLockRef.current = null;
      if (audioKeepAliveRef.current) {
        audioKeepAliveRef.current.pause();
        audioKeepAliveRef.current = null;
      }
    };
  }, [isRecording]);

  // 6. GPS WatchPosition management (即使開飛航模式，手機硬體衛星接收晶片仍 100% 正常運作)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('此瀏覽器不支援 GPS 定位');
      return;
    }

    // Always watch position if recording OR an activeRoute is loaded (for route deviation checking)
    const shouldWatch = isRecording || activeRoute !== null;

    if (!shouldWatch) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    setGeoError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ele: pos.coords.altitude || null,
          speed: pos.coords.speed || null,
          accuracy: pos.coords.accuracy || null,
          time: new Date().toISOString()
        };

        let speedKmh = pt.speed !== null && pt.speed !== undefined && pt.speed > 0 ? pt.speed * 3.6 : 0;
        if (speedKmh <= 0.2 && lastPosRef.current) {
          const dM = getDistanceMeters(lastPosRef.current.lat, lastPosRef.current.lng, pt.lat, pt.lng);
          const dtSec = (new Date(pt.time).getTime() - new Date(lastPosRef.current.time).getTime()) / 1000;
          if (dtSec > 0.8 && dtSec < 15 && dM >= 1.5) {
            const calculated = (dM / dtSec) * 3.6;
            if (calculated < 1200) speedKmh = calculated;
          }
        }
        lastPosRef.current = pt;
        pt.calculatedSpeedKmh = speedKmh;

        if (speedKmh > 0.8 && !isManuallyRestingRef.current) {
          isMovingRef.current = true;
          lastMoveTimeRef.current = Date.now();
        } else if (speedKmh <= 0.5) {
          isMovingRef.current = false;
        }

        setCurrentCoords(pt);

        if (isRecording) {
          setTrackPoints(prev => {
            if (prev.length === 0) return [pt];

            // 2.5m Jitter filter
            const last = prev[prev.length - 1];
            const dist = getDistanceMeters(last.lat, last.lng, pt.lat, pt.lng);
            if (dist >= 2.5) {
              if (!isManuallyRestingRef.current) {
                isMovingRef.current = true;
                lastMoveTimeRef.current = Date.now();
              }
              return [...prev, pt];
            }
            return prev;
          });
        }
      },
      (err) => {
        console.warn('GPX watch error:', err);
        if (err.code === 1) setGeoError('未允許 GPS 定位權限');
        else if (err.code === 2) setGeoError('目前 GPS 衛星訊號搜尋中 (請移至開闊天空下)');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1500,
        timeout: 10000
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isRecording, activeRoute]);

  // 7. Turn ON: Start new recording track (Smart duplicate handling: automatically sequence so A is never overwritten)
  const turnOn = useCallback((defaultName = '') => {
    const defaultTitle = getNextTrackTitle(defaultName || trackName, savedTracks);
    setTrackName(defaultTitle);
    setTrackPoints([]);
    setWaypoints([]);
    setElapsedSec(0);
    setMovingSec(0);
    setStoppedSec(0);
    setIsManuallyResting(false);
    isManuallyRestingRef.current = false;
    isMovingRef.current = false;
    lastMoveTimeRef.current = 0;
    setLastFinishedTrack(null);
    setIsRecording(true);
  }, [trackName, savedTracks]);

  // 8. Turn OFF: Finish recording track and package the path between ON and OFF
  const turnOff = useCallback(() => {
    setIsRecording(false);

    if (trackPoints.length > 0 || elapsedSec > 0) {
      const stats = calculateTrackStats(trackPoints);
      const formatSec = (sec) => {
        const s = Math.max(0, Math.floor(sec));
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      };

      const mergedStats = {
        ...stats,
        durationMs: elapsedSec * 1000,
        durationFormatted: formatSec(elapsedSec),
        movingTimeSec: movingSec,
        movingTimeFormatted: formatSec(movingSec),
        stoppedTimeSec: stoppedSec,
        stoppedTimeFormatted: formatSec(stoppedSec)
      };

      const finalTitle = trackName || getNextTrackTitle('健行軌跡記錄', savedTracks);
      const xml = generateGPXString({
        trackName: finalTitle,
        description: `CampingChecker 健行足跡 (ON/OFF 區間) - 總里程: ${mergedStats.totalDistanceKm}km, 歷時: ${mergedStats.durationFormatted}, 休息: ${mergedStats.stoppedTimeFormatted}`,
        author: 'CampingChecker',
        points: trackPoints,
        waypoints
      });

      const finished = {
        id: `track_${Date.now()}`,
        name: finalTitle,
        points: [...trackPoints],
        waypoints: [...waypoints],
        stats: mergedStats,
        gpxXml: xml,
        finishedAt: new Date().toISOString()
      };

      setLastFinishedTrack(finished);

      // Auto save to local phone library (Never overwrites, uniquely stored by unique id)
      persistSavedTracks([finished, ...savedTracks.filter(t => t.id !== finished.id)]);
      return finished;
    }
    return null;
  }, [trackPoints, waypoints, trackName, savedTracks, elapsedSec, movingSec, stoppedSec, persistSavedTracks]);

  // Manual Toggle Rest (提供使用者手動一鍵切換休息停頓模式)
  const toggleManualRest = useCallback(() => {
    setIsManuallyResting(prev => {
      const next = !prev;
      isManuallyRestingRef.current = next;
      if (next) {
        isMovingRef.current = false;
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
    setTrackPoints([]);
    setWaypoints([]);
    setElapsedSec(0);
    setLastFinishedTrack(null);
    try {
      localStorage.removeItem(STORAGE_ACTIVE_KEY);
    } catch (e) {}
  }, []);

  // 19. Real-time Route Adherence Calculation (防走錯路 / 偏離軌道警報)
  // 即使在飛航模式下，手機衛星 GPS 也能即時比對與 activeRoute 的最短距離
  const routeAdherence = (() => {
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
  })();

  const formatDurationStr = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const baseStats = calculateTrackStats(trackPoints);
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
