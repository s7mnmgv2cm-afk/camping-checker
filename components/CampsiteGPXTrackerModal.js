'use client';

import React, { useState, useRef, useEffect } from 'react';
import { PRESET_HIKING_TRAILS, generatePresetGPX, downloadGPXFile } from '../lib/gpx';
import ElevationProfileChart from './ElevationProfileChart';
import AutomotiveClusterDashboard from './AutomotiveClusterDashboard';

export default function CampsiteGPXTrackerModal({
  campsite,
  isOpen,
  onClose,
  gpxTracker
}) {
  const {
    isRecording,
    turnOn,
    turnOff,
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
    savedTracks = [],
    saveTrackToHistory,
    deleteSavedTrack,
    renameSavedTrack,
    activeRoute,
    loadTrackAsActiveRoute,
    clearActiveRoute,
    importGPXFile,
    loadPresetTrail,
    routeAdherence
  } = gpxTracker || {};

  const [activeTab, setActiveTab] = useState('record'); // 'record' | 'history' | 'import'
  const [showWaypointDialog, setShowWaypointDialog] = useState(false);
  const [waypointName, setWaypointName] = useState('');
  const [waypointType, setWaypointType] = useState('景點');
  const [showGoogleGuide, setShowGoogleGuide] = useState(false);
  const [showAirplaneModeModal, setShowAirplaneModeModal] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);
  const [importError, setImportError] = useState(null);
  const [expandedHistoryTrackId, setExpandedHistoryTrackId] = useState(null);
  const [editingTrack, setEditingTrack] = useState(null); // { id, name } for inline renaming
  const [editTrackNameInput, setEditTrackNameInput] = useState('');
  const [scrubbedPoint, setScrubbedPoint] = useState(null); // 聯動高度圖與時速表紅針
  const [isPocketMode, setIsPocketMode] = useState(false); // 🌙 OLED 口袋暗屏省電防休眠模式
  const [isPocketAwake, setIsPocketAwake] = useState(false); // 輕碰喚醒 6 秒微光 HUD，其餘時間 100% 全黑熄屏 (0 像素發光)
  const [pocketAlwaysDim, setPocketAlwaysDim] = useState(false); // 是否切換為常駐微光
  const pocketAwakeTimeoutRef = useRef(null);

  // 🌙 OLED 0 耗電純黑 ⇄ ☀️ 首頁純白主題切換
  const [displayTheme, setDisplayTheme] = useState('white'); // 'white' | 'oled'
  useEffect(() => {
    try {
      const saved = localStorage.getItem('camping_gpx_display_theme');
      if (saved === 'oled' || saved === 'white') {
        setDisplayTheme(saved);
      }
    } catch (e) {}
  }, []);
  const isOled = displayTheme === 'oled';

  // 🌙 口袋省電黑化原生系統狀態列 (消滅 iOS Safari 頂部白條，鎖定 True OLED Black)
  useEffect(() => {
    if (!isPocketMode) return;
    const origBodyBg = document.body.style.backgroundColor;
    const origHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = '#000000';
    document.documentElement.style.backgroundColor = '#000000';

    let themeMeta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = themeMeta ? themeMeta.getAttribute('content') : null;
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', '#000000');

    let statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    const prevStatusBarStyle = statusBarMeta ? statusBarMeta.getAttribute('content') : null;
    if (!statusBarMeta) {
      statusBarMeta = document.createElement('meta');
      statusBarMeta.name = 'apple-mobile-web-app-status-bar-style';
      statusBarMeta.content = 'black-translucent';
      document.head.appendChild(statusBarMeta);
    } else {
      statusBarMeta.setAttribute('content', 'black-translucent');
    }

    // 剛進入口袋模式時短暫喚醒 3 秒讓使用者確認，隨後沉入 100% 全黑熄屏
    setIsPocketAwake(true);
    if (pocketAwakeTimeoutRef.current) clearTimeout(pocketAwakeTimeoutRef.current);
    pocketAwakeTimeoutRef.current = setTimeout(() => {
      setIsPocketAwake(false);
    }, 3000);

    return () => {
      document.body.style.backgroundColor = origBodyBg;
      document.documentElement.style.backgroundColor = origHtmlBg;
      if (prevTheme && themeMeta) themeMeta.setAttribute('content', prevTheme);
      if (prevStatusBarStyle && statusBarMeta) statusBarMeta.setAttribute('content', prevStatusBarStyle);
      if (pocketAwakeTimeoutRef.current) clearTimeout(pocketAwakeTimeoutRef.current);
    };
  }, [isPocketMode]);

  // 🔒 口袋防誤觸雙重機制狀態 (滑軌滑動解鎖 + 2 秒長按緊急解鎖)
  const [sliderPosition, setSliderPosition] = useState(0);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [showTouchHint, setShowTouchHint] = useState(false);
  const sliderTrackRef = useRef(null);
  const longPressIntervalRef = useRef(null);
  const touchHintTimeoutRef = useRef(null);

  // 1. 滑動解鎖處理函式 (Touch & Pointer Events)
  const handleSliderPointerDown = (e) => {
    e.stopPropagation();
    setIsDraggingSlider(true);
    if (pocketAwakeTimeoutRef.current) clearTimeout(pocketAwakeTimeoutRef.current);
    try {
      e.target.setPointerCapture?.(e.pointerId);
    } catch (err) {}
  };

  const handleSliderPointerMove = (e) => {
    if (!isDraggingSlider || !sliderTrackRef.current) return;
    const trackRect = sliderTrackRef.current.getBoundingClientRect();
    const handleWidth = 48;
    const maxDrag = Math.max(50, trackRect.width - handleWidth - 8);
    const currentX = e.clientX - trackRect.left - handleWidth / 2;
    const clampedX = Math.max(0, Math.min(maxDrag, currentX));
    setSliderPosition(clampedX);

    // 拖曳超過 80% 門檻即確認為使用者意圖解鎖，杜絕口袋布料摩擦
    if (clampedX >= maxDrag * 0.8) {
      setIsDraggingSlider(false);
      setIsPocketMode(false);
      setSliderPosition(0);
      try { navigator.vibrate?.([30, 60, 30]); } catch (err) {}
    }
  };

  const handleSliderPointerUp = (e) => {
    if (!isDraggingSlider) return;
    setIsDraggingSlider(false);
    setSliderPosition(0); // 未拉滿則立即彈回原點
    if (!pocketAlwaysDim) {
      if (pocketAwakeTimeoutRef.current) clearTimeout(pocketAwakeTimeoutRef.current);
      pocketAwakeTimeoutRef.current = setTimeout(() => {
        setIsPocketAwake(false);
      }, 4000);
    }
  };

  // 2. 長按 2 秒解鎖處理函式 (手套或雨中情境)
  const startLongPress = (e) => {
    e.stopPropagation();
    if (pocketAwakeTimeoutRef.current) clearTimeout(pocketAwakeTimeoutRef.current);
    const startTime = Date.now();
    const duration = 2000;

    if (longPressIntervalRef.current) clearInterval(longPressIntervalRef.current);
    longPressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.round((elapsed / duration) * 100));
      setLongPressProgress(progress);
      if (elapsed >= duration) {
        clearInterval(longPressIntervalRef.current);
        longPressIntervalRef.current = null;
        setIsPocketMode(false);
        setLongPressProgress(0);
        try { navigator.vibrate?.(60); } catch (err) {}
      }
    }, 40);
  };

  const cancelLongPress = (e) => {
    if (e) e.stopPropagation();
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
    setLongPressProgress(0);
    if (!pocketAlwaysDim) {
      if (pocketAwakeTimeoutRef.current) clearTimeout(pocketAwakeTimeoutRef.current);
      pocketAwakeTimeoutRef.current = setTimeout(() => {
        setIsPocketAwake(false);
      }, 4000);
    }
  };

  // 3. 口袋碰觸偵測（喚出 6 秒微光 HUD 預覽時間與滑軌，隨後自動回歸 100% 全黑暗屏）
  const handlePocketScreenTap = () => {
    setIsPocketAwake(true);
    setShowTouchHint(true);
    if (touchHintTimeoutRef.current) clearTimeout(touchHintTimeoutRef.current);
    touchHintTimeoutRef.current = setTimeout(() => {
      setShowTouchHint(false);
    }, 2500);

    if (!pocketAlwaysDim) {
      if (pocketAwakeTimeoutRef.current) clearTimeout(pocketAwakeTimeoutRef.current);
      pocketAwakeTimeoutRef.current = setTimeout(() => {
        setIsPocketAwake(false);
      }, 6000);
    }
  };

  const fileInputRef = useRef(null);

  // Toggle handler for the ON/OFF switch
  const handleToggleSwitch = () => {
    if (isRecording) {
      turnOff();
    } else {
      const campName = campsite?.name || '露營步道';
      const dateStr = new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }).replace('/', '月') + '日';
      turnOn(`${campName}_健行路徑_${dateStr}`);
    }
  };

  const handleConfirmWaypoint = () => {
    if (addWaypoint(waypointName, waypointType)) {
      setWaypointName('');
      setShowWaypointDialog(false);
    }
  };

  const handleSaveToPhone = (name) => {
    if (saveTrackToHistory(name)) {
      setSaveSuccessMsg('✅ 已成功將航跡存檔至手機記憶體！離線與飛航模式皆可隨時讀取。');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  };

  const handleOpenGPXStudio = async (targetTrack = null) => {
    try {
      const res = await openInGPXStudio(targetTrack);
      if (res?.mode === 'auto') {
        setSaveSuccessMsg('🚀 已在 gpx.studio 全自動展開航跡與 3D/等高線分析！');
      } else if (res?.mode === 'local') {
        setSaveSuccessMsg('✨ 已下載 GPX 檔案並為您開啟 gpx.studio，直接將檔案拖入或點「載入」即可 0 秒檢視！');
      }
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    } catch (e) {
      console.error('Failed to open in gpx.studio:', e);
    }
  };

  const handleOpenPresetInGPXStudio = (presetId) => {
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
    if (!isLocalhost && typeof window !== 'undefined') {
      const shareUrl = `${window.location.origin}/api/gpx/share/${presetId}.gpx`;
      // 依據 gpx.studio 官方 Integration 規範：使用 ?files=["..."] 達成 0 秒全自動載入
      const url = `https://gpx.studio/app?files=${encodeURIComponent(JSON.stringify([shareUrl]))}`;
      window.open(url, '_blank');
      setSaveSuccessMsg(`🚀 已在 gpx.studio 自動載入【${presetId}】官方航跡！`);
    } else {
      const xml = generatePresetGPX(presetId);
      const trail = PRESET_HIKING_TRAILS.find(t => t.id === presetId);
      downloadGPXFile(`${trail?.name || presetId}.gpx`, xml);
      if (typeof window !== 'undefined') {
        window.open('https://gpx.studio/app', '_blank');
      }
      setSaveSuccessMsg(`✨ 已下載【${trail?.name || presetId}】GPX 並開啟 gpx.studio，直接拖入即可 0 秒預覽！`);
    }
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const record = await importGPXFile(file);
      if (record) {
        setSaveSuccessMsg(`✅ 成功匯入【${record.name}】！已設為導航參考航線。`);
        setActiveTab('record');
        setTimeout(() => setSaveSuccessMsg(null), 4000);
      }
    } catch (err) {
      setImportError(err.message || '匯入 GPX 檔案失敗，請確認檔案格式是否正確。');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLoadPreset = (presetId) => {
    const record = loadPresetTrail(presetId);
    if (record) {
      setSaveSuccessMsg(`✅ 已成功載入【${record.name}】官方航跡！可供離線對照防走錯。`);
      setActiveTab('record');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  };

  const displaySource = isRecording 
    ? { stats: currentStats, pointsCount: trackPoints?.length || 0, waypoints: waypoints || [], title: trackName || '本次健行航跡' }
    : (lastFinishedTrack 
      ? { stats: lastFinishedTrack.stats, pointsCount: lastFinishedTrack.points?.length || 0, waypoints: lastFinishedTrack.waypoints || [], title: lastFinishedTrack.name }
      : (activeRoute 
        ? { stats: activeRoute.stats, pointsCount: activeRoute.points?.length || 0, waypoints: activeRoute.waypoints || [], title: activeRoute.name }
        : { stats: currentStats, pointsCount: 0, waypoints: [], title: trackName || '健行航跡' }));

  const displayStats = displaySource.stats || currentStats;
  const displayPointsCount = displaySource.pointsCount || 0;
  const displayWaypoints = displaySource.waypoints || [];
  const displayTitle = displaySource.title;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/65 backdrop-blur-md animate-in fade-in duration-150">
        <div 
          style={{
            backgroundColor: isOled ? '#000000' : '#F8FAFC',
            borderColor: isOled ? '#27272A' : '#E2E8F0',
            color: isOled ? '#F4F4F5' : '#0F172A'
          }}
          className="relative w-full max-w-xl max-h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden font-sans border transition-colors duration-200"
        >
          {/* Header */}
          <div 
            style={{
              backgroundColor: isOled ? '#000000' : '#FFFFFF',
              borderColor: isOled ? '#18181B' : '#E2E8F0'
            }}
            className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2.5 shrink-0"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-2xl sm:text-3xl shrink-0">🧭</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`text-base sm:text-lg font-black tracking-tight leading-tight ${
                    isOled ? 'text-white' : 'text-slate-900'
                  }`}>
                    GPX 戶外路徑記錄器
                  </h3>
                  <span 
                    style={{
                      backgroundColor: isRecording 
                        ? (isOled ? '#450A0A' : '#FEE2E2') 
                        : (isOled ? '#18181B' : '#F1F5F9'),
                      color: isRecording 
                        ? (isOled ? '#F87171' : '#DC2626') 
                        : (isOled ? '#A1A1AA' : '#475569'),
                      borderColor: isRecording 
                        ? (isOled ? '#7F1D1D' : '#FCA5A5') 
                        : (isOled ? '#27272A' : '#CBD5E1')
                    }}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border flex items-center gap-1"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} />
                    <span>{isRecording ? 'ON 記錄中' : 'OFF 已停止'}</span>
                  </span>
                </div>
                <p className={`text-xs mt-0.5 font-mono ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>
                  精確記錄 ON/OFF 航線 · 離線手機存檔 · 支援別人的 GPX
                </p>
              </div>
            </div>

            {/* Header Right Actions: OLED Theme Toggle + Close Button */}
            <div className="flex items-center gap-2 shrink-0">
              {/* 🌙 OLED 0 耗電純黑 ⇄ ☀️ 首頁純白快速切換鈕 */}
              <button
                type="button"
                onClick={() => {
                  const next = displayTheme === 'white' ? 'oled' : 'white';
                  setDisplayTheme(next);
                  try { localStorage.setItem('camping_gpx_display_theme', next); } catch (e) {}
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                  isOled
                    ? 'bg-zinc-900 text-emerald-400 border-emerald-500/50 shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
                title="切換首頁純白 ⇄ OLED 極黑 (0 耗電)"
              >
                <span>{isOled ? '🌙 OLED 極黑' : '☀️ 首頁純白'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors shrink-0 cursor-pointer ${
                  isOled 
                    ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                }`}
                title="關閉視窗 (背景仍會持續記錄)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* ✈️ 飛航模式無網路·安全導航與防走錯提示條 (點擊看科學原理) */}
          <div 
            onClick={() => setShowAirplaneModeModal(true)}
            style={{
              backgroundColor: isOled ? '#1C1917' : '#FEF3C7',
              borderColor: isOled ? '#292524' : '#FDE68A',
              color: isOled ? '#FBBF24' : '#92400E'
            }}
            className="px-3.5 py-1.5 border-b text-xs flex items-center justify-between gap-2 cursor-pointer hover:opacity-90 transition-opacity shrink-0"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm shrink-0">✈️</span>
              <span className="font-bold truncate">開飛航模式也能定位防走錯！手機硬體 GPS 純被動接收不耗電</span>
            </div>
            <span className="font-bold text-[11px] underline shrink-0">原理與防迷機制 ↗</span>
          </div>

          {/* Navigation Tabs: 1. 路徑記錄 | 2. 手機存檔庫 | 3. 匯入/別人紀錄 */}
          <div 
            style={{
              backgroundColor: isOled ? '#09090B' : '#F1F5F9',
              borderColor: isOled ? '#18181B' : '#E2E8F0'
            }}
            className="flex items-center border-b p-1.5 gap-1.5 text-xs font-bold shrink-0"
          >
            <button
              type="button"
              onClick={() => setActiveTab('record')}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'record' 
                  ? (isOled ? 'bg-zinc-900 text-emerald-400 border border-zinc-700 shadow-sm font-black' : 'bg-white text-slate-900 shadow-xs font-black')
                  : (isOled ? 'text-zinc-500 hover:text-zinc-300 font-medium' : 'text-slate-600 hover:text-slate-900 font-medium')
              }`}
            >
              <span>⏺️</span>
              <span>路徑記錄 (ON/OFF)</span>
              {isRecording && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'history' 
                  ? (isOled ? 'bg-zinc-900 text-emerald-400 border border-zinc-700 shadow-sm font-black' : 'bg-white text-slate-900 shadow-xs font-black')
                  : (isOled ? 'text-zinc-500 hover:text-zinc-300 font-medium' : 'text-slate-600 hover:text-slate-900 font-medium')
              }`}
            >
              <span>📱</span>
              <span>手機存檔庫 ({savedTracks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'import' 
                  ? (isOled ? 'bg-zinc-900 text-emerald-400 border border-zinc-700 shadow-sm font-black' : 'bg-white text-slate-900 shadow-xs font-black')
                  : (isOled ? 'text-zinc-500 hover:text-zinc-300 font-medium' : 'text-slate-600 hover:text-slate-900 font-medium')
              }`}
            >
              <span>📥</span>
              <span>匯入 / 別人紀錄</span>
            </button>
          </div>

          {/* Geo Error Warning */}
          {geoError && (
            <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{geoError}</span>
            </div>
          )}

          {/* Success Notification */}
          {saveSuccessMsg && (
            <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in">
              <span>{saveSuccessMsg}</span>
              <button onClick={() => setSaveSuccessMsg(null)} className="text-emerald-900 font-bold">✕</button>
            </div>
          )}

          {/* Modal Body */}
          <div 
            style={{
              backgroundColor: isOled ? '#000000' : '#F8FAFC',
              color: isOled ? '#F4F4F5' : '#0F172A'
            }}
            className="p-3.5 sm:p-5 space-y-3.5 overflow-y-auto flex-1 max-h-[75vh] font-sans"
          >
            {/* ── TAB 1: 即時路徑記錄 (ON / OFF) ── */}
            {activeTab === 'record' && (
              <>
                {/* 🛡️ 參考航跡與偏離警告卡 (若已載入別人或預載步道) */}
                {activeRoute && (
                  <div 
                    style={{
                      backgroundColor: routeAdherence?.isOffTrack 
                        ? (isOled ? '#450A0A' : '#FEF2F2') 
                        : (isOled ? '#022C22' : '#F0FDF4'),
                      borderColor: routeAdherence?.isOffTrack 
                        ? (isOled ? '#991B1B' : '#F87171') 
                        : (isOled ? '#065F46' : '#86EFAC')
                    }}
                    className="p-3 rounded-2xl border shadow-sm flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{routeAdherence?.isOffTrack ? '⚠️' : '🧭'}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <strong style={{ color: routeAdherence?.isOffTrack ? '#F87171' : '#34D399' }} className="text-xs font-black truncate">
                            跟隨航跡：{activeRoute.name}
                          </strong>
                        </div>
                        <p style={{ color: routeAdherence?.isOffTrack ? '#FCA5A5' : '#6EE7B7' }} className="text-[11px] font-mono">
                          {routeAdherence ? (
                            routeAdherence.isOffTrack 
                              ? `⚠️ 偏離軌跡 ${routeAdherence.distanceToRouteM}m！建議回頭確認叉路口`
                              : `✅ 在正確路徑上 (距航線 ${routeAdherence.distanceToRouteM}m)`
                          ) : '正在接收手機衛星 GPS 計算與航線距離...'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={clearActiveRoute}
                      style={{ 
                        backgroundColor: isOled ? '#18181B' : '#E2E8F0', 
                        color: isOled ? '#A1A1AA' : '#475569' 
                      }}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 hover:opacity-80 cursor-pointer"
                    >
                      解除跟隨
                    </button>
                  </div>
                )}

                {/* 🔴 ON / OFF Main Master Switch Card */}
                <div 
                  style={{
                    backgroundColor: isOled ? '#09090B' : (isRecording ? '#FFF1F2' : '#FFFFFF'),
                    borderColor: isOled ? (isRecording ? '#991B1B' : '#27272A') : (isRecording ? '#FECDD3' : '#E2E8F0')
                  }}
                  className="p-4 rounded-2xl border shadow-xs transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{isRecording ? '🔴' : '⚪'}</span>
                        <strong className={`text-[15px] font-black tracking-tight whitespace-nowrap ${
                          isRecording 
                            ? (isOled ? 'text-rose-400' : 'text-rose-600') 
                            : (isOled ? 'text-white' : 'text-slate-900')
                        }`}>
                          {isRecording ? '路徑記錄：ON (持續記錄中)' : '路徑記錄：OFF (待機狀態)'}
                        </strong>
                      </div>
                      <p className={`text-xs ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>
                        {isRecording 
                          ? '已啟動高精度 GPS 航跡收錄。放口袋健行時可點「🌙 口袋省電」享 0 耗電與防休眠！'
                          : '切換為 ON 即可隨身記錄您在步道、營地周邊的實際行走足跡。'}
                      </p>
                    </div>

                    {/* Action Buttons: Pocket Mode + ON/OFF Master Switch */}
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      {isRecording && (
                        <button
                          type="button"
                          onClick={() => setIsPocketMode(true)}
                          style={{
                            backgroundColor: isOled ? '#18181B' : '#1E293B',
                            color: '#F8FAFC',
                            borderColor: isOled ? '#3F3F46' : '#334155'
                          }}
                          className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-2xl font-bold text-xs border shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90"
                          title="關閉彩色螢幕改為純黑底，省電防誤觸，維持 100% GPS 連續記錄"
                        >
                          <span>🌙</span>
                          <span>口袋省電 (防休眠)</span>
                        </button>
                      )}

                      {/* Tactile Big ON/OFF Switch Button */}
                      <button
                        type="button"
                        onClick={handleToggleSwitch}
                        style={{
                          backgroundColor: isRecording ? '#DC2626' : (isOled ? '#27272A' : '#E2E8F0'),
                          color: isRecording ? '#FFFFFF' : (isOled ? '#F4F4F5' : '#334155')
                        }}
                        className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl font-black text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                      >
                        <span className={`w-3 h-3 rounded-full ${isRecording ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
                        <span>{isRecording ? '切換為 OFF' : '切換為 ON'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Track Name Customization */}
                  <div className={`mt-3 pt-3 border-t space-y-1.5 ${isOled ? 'border-zinc-800' : 'border-slate-100'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold shrink-0 ${isOled ? 'text-zinc-300' : 'text-slate-700'}`}>
                        🏷️ 航跡標題：
                      </span>
                      <input
                        type="text"
                        value={trackName}
                        onChange={(e) => setTrackName(e.target.value)}
                        placeholder="例如: 微光露營區_蝙蝠洞步道健行"
                        style={{
                          backgroundColor: isOled ? '#000000' : '#F8FAFC',
                          borderColor: isOled ? '#27272A' : '#CBD5E1',
                          color: isOled ? '#F4F4F5' : '#0F172A'
                        }}
                        className="flex-1 px-3 py-1.5 text-xs font-bold rounded-xl border focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                    <div className={`flex items-center gap-1 text-[11px] ${isOled ? 'text-zinc-500' : 'text-slate-500'}`}>
                      <span>💡</span>
                      <span>存檔於手機本機離線空間；若標題重複將自動編為「<strong>{trackName ? `${trackName.replace(/\s*\(第\s*\d+\s*段\)$/, '')} (第 2 段)` : '同名 (第 2 段)'}</strong>」，絕不覆蓋舊檔案！</span>
                    </div>
                  </div>
                </div>

                {/* 🏎️ 頂級車廠數位儀表板 (Automotive Virtual Cockpit Cluster HUD) */}
                <AutomotiveClusterDashboard
                  displayStats={displayStats}
                  isRecording={isRecording}
                  displayPointsCount={displayPointsCount}
                  displayTitle={displayTitle}
                  isManuallyResting={isManuallyResting}
                  toggleManualRest={toggleManualRest}
                  scrubbedSpeed={scrubbedPoint?.speed ?? null}
                  theme={displayTheme}
                  onThemeChange={(newTheme) => setDisplayTheme(newTheme === 'obsidian' ? 'oled' : newTheme)}
                />

                {/* 📈 高度剖面圖 (Elevation Profile Chart) - 完全對齊使用者上傳的圖表 */}
                <ElevationProfileChart
                  elevationProfile={displayStats?.elevationProfile || []}
                  totalDistanceKm={displayStats?.totalDistanceKm || '0.00'}
                  maxElevationM={displayStats?.maxElevationM}
                  minElevationM={displayStats?.minElevationM}
                  totalAscentM={displayStats?.totalAscentM || 0}
                  totalDescentM={displayStats?.totalDescentM || 0}
                  onHoverPoint={setScrubbedPoint}
                  theme={displayTheme}
                />

                {/* 📍 Waypoints Tagging Section */}
                <div 
                  style={{
                    backgroundColor: isOled ? '#09090B' : '#FFFFFF',
                    borderColor: isOled ? '#27272A' : '#E2E8F0'
                  }}
                  className="p-3.5 rounded-2xl border shadow-xs"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">📍</span>
                      <strong className={`text-xs font-bold ${isOled ? 'text-white' : 'text-slate-900'}`}>沿途地標與打卡點 ({displayWaypoints.length})</strong>
                    </div>
                    <button
                      type="button"
                      disabled={!isRecording && trackPoints.length === 0}
                      onClick={() => setShowWaypointDialog(true)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
                        (isRecording || trackPoints.length > 0)
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : (isOled ? 'bg-zinc-800 text-zinc-600' : 'bg-slate-100 text-slate-400')
                      }`}
                    >
                      <span>＋</span>
                      <span>新增打卡點</span>
                    </button>
                  </div>

                  {displayWaypoints.length > 0 ? (
                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                      {displayWaypoints.map((wpt, idx) => (
                        <div 
                          key={idx}
                          style={{
                            backgroundColor: isOled ? '#000000' : '#F8FAFC',
                            borderColor: isOled ? '#27272A' : '#E2E8F0'
                          }}
                          className="px-3 py-2 rounded-xl border flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-emerald-400 font-bold font-mono shrink-0">#{idx + 1}</span>
                            <span className={`font-bold truncate ${isOled ? 'text-zinc-200' : 'text-slate-900'}`}>{wpt.name}</span>
                            {wpt.ele && <span className={`text-[10px] font-mono ${isOled ? 'text-sky-400' : 'text-slate-500'}`}>({Math.round(wpt.ele)}m)</span>}
                          </div>
                          <span className={`text-[10px] font-mono shrink-0 ${isOled ? 'text-zinc-500' : 'text-slate-400'}`}>
                            {new Date(wpt.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-[11px] text-center py-2 ${isOled ? 'text-zinc-500' : 'text-slate-500'}`}>
                      尚無打卡點。在行走時可隨時記錄岔路、觀景台、水源或營區地標。
                    </p>
                  )}
                </div>

                {/* 💾 Actions: Save to Phone, Download GPX, Export to Google My Maps */}
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    {/* 💾 存檔在自己的手機內 (離線保存) */}
                    <button
                      type="button"
                      disabled={displayPointsCount === 0}
                      onClick={() => handleSaveToPhone(trackName)}
                      style={{
                        backgroundColor: displayPointsCount > 0 ? '#10B981' : (isOled ? '#18181B' : '#E2E8F0'),
                        color: displayPointsCount > 0 ? '#FFFFFF' : (isOled ? '#52525B' : '#94A3B8')
                      }}
                      className="py-2.5 px-3 rounded-xl font-black text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                      title="保存到手機瀏覽器記憶體，離線隨時可用"
                    >
                      <span>💾</span>
                      <span>存檔在手機內 (離線)</span>
                    </button>

                    {/* 📥 下載標準 GPX 檔案 */}
                    <button
                      type="button"
                      disabled={displayPointsCount === 0}
                      onClick={() => downloadGPX(trackName)}
                      style={{
                        backgroundColor: displayPointsCount > 0 ? (isOled ? '#18181B' : '#1E293B') : (isOled ? '#18181B' : '#E2E8F0'),
                        borderColor: isOled ? '#27272A' : 'transparent',
                        color: displayPointsCount > 0 ? '#FFFFFF' : (isOled ? '#52525B' : '#94A3B8')
                      }}
                      className="py-2.5 px-3 rounded-xl font-black text-xs border shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90"
                    >
                      <span>📥</span>
                      <span>下載標準 GPX 檔案</span>
                    </button>
                  </div>

                  {/* 🌐 一鍵在 gpx.studio 線上檢視 (手機/電腦 0 秒直看) */}
                  <button
                    type="button"
                    disabled={displayPointsCount === 0}
                    onClick={() => handleOpenGPXStudio()}
                    style={{
                      background: displayPointsCount > 0 
                        ? 'linear-gradient(135deg, #059669 0%, #0D9488 100%)' 
                        : (isOled ? '#18181B' : '#E2E8F0'),
                      color: displayPointsCount > 0 ? '#FFFFFF' : (isOled ? '#52525B' : '#94A3B8')
                    }}
                    className="w-full py-2.5 px-4 rounded-xl font-black text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer border border-emerald-600/30"
                    title="免裝 App，一鍵在 gpx.studio 開啟完整衛星/等高線/3D高度分析"
                  >
                    <span className="text-base">🌐</span>
                    <span>一鍵在 gpx.studio 線上檢視 (衛星/等高線/坡度) ↗</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-white/25 text-[10px] font-mono font-bold">免裝 App</span>
                  </button>

                  {/* 🗺️ 匯入至 Google 我的地圖 */}
                  <button
                    type="button"
                    disabled={displayPointsCount === 0}
                    onClick={() => setShowGoogleGuide(true)}
                    style={{
                      backgroundColor: displayPointsCount > 0 ? (isOled ? '#000000' : '#FFFFFF') : (isOled ? '#09090B' : '#F1F5F9'),
                      borderColor: displayPointsCount > 0 ? (isOled ? '#27272A' : '#CBD5E1') : (isOled ? '#18181B' : '#E2E8F0'),
                      color: displayPointsCount > 0 ? (isOled ? '#A1A1AA' : '#334155') : (isOled ? '#52525B' : '#94A3B8')
                    }}
                    className="w-full py-2 px-4 rounded-xl font-bold text-xs border shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer hover:opacity-90"
                  >
                    <span>🗺️</span>
                    <span>備用方案：匯入至 Google 我的地圖 (Google My Maps) ↗</span>
                  </button>

                  {/* Reset Track Button */}
                  {displayPointsCount > 0 && !isRecording && (
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={resetTrack}
                        style={{ color: isOled ? '#71717A' : '#94A3B8' }}
                        className="text-xs hover:text-rose-500 underline cursor-pointer"
                      >
                        清空本次航跡重置
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── TAB 2: 手機存檔庫 (存檔在自己的手機內) ── */}
            {activeTab === 'history' && (
              <div className="space-y-3 font-sans">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <strong className={`text-xs font-black block ${isOled ? 'text-zinc-100' : 'text-slate-900'}`}>
                      📱 本機離線航跡庫 ({savedTracks.length} 筆)
                    </strong>
                    <p className={`text-[11px] ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>
                      航跡永久保存於手機記憶體，在深山開飛航模式無網路時依然完整可用。
                    </p>
                  </div>

                  {displayPointsCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSaveToPhone(trackName)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs shrink-0 cursor-pointer active:scale-95 transition-all"
                    >
                      ＋ 儲存目前航跡
                    </button>
                  )}
                </div>

                {/* 📍 手機存檔庫位置與防覆蓋說明 Banner */}
                <div 
                  style={{
                    backgroundColor: isOled ? '#1C1917' : '#FEF3C7',
                    borderColor: isOled ? '#44403C' : '#FDE68A',
                    color: isOled ? '#FDE68A' : '#78350F'
                  }}
                  className="p-3.5 rounded-2xl border text-xs space-y-1.5 shadow-xs"
                >
                  <div className={`flex items-center gap-1.5 font-bold ${isOled ? 'text-amber-300' : 'text-amber-900'}`}>
                    <span>📍 航跡存放在哪裡？與防覆蓋機制：</span>
                  </div>
                  <div className={`space-y-1 text-[11px] leading-relaxed ${isOled ? 'text-amber-200/90' : 'text-amber-800/90'}`}>
                    <p>
                      • <strong>儲存位置</strong>：航跡保存在您手機的<strong>本機離線安全空間</strong>（LocalStorage 鍵值：<code className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${isOled ? 'bg-zinc-900 border-zinc-700 text-amber-300' : 'bg-white border-amber-200 text-amber-900'}`}>camping_checker_saved_tracks_v1</code>）。在深山開啟飛航模式、無網路訊號、或是把 App 完全關閉重啟、手機重開機，資料都 100% 完整保留！
                    </p>
                    <p>
                      • <strong>實體檔案</strong>：點擊「📥 下載 GPX」，標準 GPX 檔案將直接下載至手機的「檔案 / 下載」資料夾，隨時可匯入至 Google 我的地圖、健行筆記或 Garmin。
                    </p>
                    <p>
                      • <strong>防覆蓋機制</strong>：若存過「A」，下次重開 App 再記錄「A」時，系統會<strong>自動編為「A (第 2 段)」</strong>獨立儲存，舊的「A」絕對不會被覆蓋！亦可隨時點擊「✏️ 改名」自訂名稱。
                    </p>
                  </div>
                </div>

                {savedTracks.length > 0 ? (
                  <div className="space-y-2.5">
                    {savedTracks.map((item) => (
                      <div 
                        key={item.id}
                        style={{
                          backgroundColor: isOled ? '#000000' : '#FFFFFF',
                          borderColor: isOled ? '#27272A' : '#E2E8F0'
                        }}
                        className="p-3.5 rounded-2xl border shadow-xs space-y-2"
                      >
                        {/* Inline Renaming or Track Header */}
                        {editingTrack?.id === item.id ? (
                          <div 
                            style={{
                              backgroundColor: isOled ? '#18181B' : '#F8FAFC',
                              borderColor: '#10B981'
                            }}
                            className="flex items-center gap-1.5 py-1 p-2 rounded-xl border"
                          >
                            <span className="text-xs shrink-0">🏷️</span>
                            <input
                              type="text"
                              value={editTrackNameInput}
                              onChange={(e) => setEditTrackNameInput(e.target.value)}
                              placeholder="輸入新名稱"
                              style={{
                                backgroundColor: isOled ? '#09090B' : '#FFFFFF',
                                borderColor: isOled ? '#27272A' : '#E2E8F0',
                                color: isOled ? '#FFFFFF' : '#0F172A'
                              }}
                              className="flex-1 px-2.5 py-1 text-xs font-bold rounded-lg border focus:outline-none focus:border-emerald-500"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (editTrackNameInput.trim()) {
                                  renameSavedTrack(item.id, editTrackNameInput.trim());
                                  setSaveSuccessMsg(`✅ 已成功將航跡更名為【${editTrackNameInput.trim()}】！`);
                                  setTimeout(() => setSaveSuccessMsg(null), 3000);
                                }
                                setEditingTrack(null);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold shrink-0 hover:bg-emerald-700 cursor-pointer"
                            >
                              確定
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTrack(null)}
                              style={{
                                backgroundColor: isOled ? '#27272A' : '#E2E8F0',
                                color: isOled ? '#D4D4D8' : '#334155'
                              }}
                              className="px-2 py-1 rounded-lg text-xs font-bold shrink-0 hover:opacity-80 cursor-pointer"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <strong className={`text-sm font-black block truncate ${isOled ? 'text-zinc-100' : 'text-slate-900'}`}>
                                {item.name}
                              </strong>
                              <div className={`flex items-center gap-2 text-[10px] font-mono mt-0.5 flex-wrap ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>
                                <span>📅 {new Date(item.finishedAt || Date.now()).toLocaleDateString('zh-TW')}</span>
                                <span>·</span>
                                <span className={isOled ? 'text-emerald-400 font-bold' : 'text-emerald-700 font-bold'}>📏 {item.stats?.totalDistanceKm || '0'} km</span>
                                <span>·</span>
                                <span className={isOled ? 'text-sky-400 font-bold' : 'text-sky-600 font-bold'}>⛰️ +{item.stats?.totalAscentM || 0}m</span>
                                <span>·</span>
                                <span>⏱️ {item.stats?.durationFormatted || '--'}</span>
                                {item.source === 'imported' && (
                                  <span className={`px-1.5 py-0.2 rounded font-bold ${isOled ? 'bg-sky-950/80 text-sky-300 border border-sky-800' : 'bg-sky-100 text-sky-800'}`}>外部匯入</span>
                                )}
                                {item.source === 'preset' && (
                                  <span className={`px-1.5 py-0.2 rounded font-bold ${isOled ? 'bg-amber-950/80 text-amber-300 border border-amber-800' : 'bg-amber-100 text-amber-800'}`}>官方範本</span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => deleteSavedTrack(item.id)}
                              className={`p-1 text-xs shrink-0 cursor-pointer transition-colors ${isOled ? 'text-zinc-500 hover:text-rose-400' : 'text-slate-400 hover:text-rose-600'}`}
                              title="從本機刪除此航跡"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {/* Actions for this saved track */}
                        <div 
                          style={{ borderColor: isOled ? '#18181B' : '#F1F5F9' }}
                          className="flex items-center gap-1.5 flex-wrap pt-1 border-t"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              loadTrackAsActiveRoute(item);
                              setActiveTab('record');
                              setSaveSuccessMsg(`已將【${item.name}】設為導航參考航線！開飛航模式亦可對照。`);
                              setTimeout(() => setSaveSuccessMsg(null), 4000);
                            }}
                            style={{
                              backgroundColor: activeRoute?.id === item.id 
                                ? '#059669' 
                                : (isOled ? '#18181B' : '#F1F5F9'),
                              borderColor: activeRoute?.id === item.id 
                                ? '#059669' 
                                : (isOled ? '#27272A' : '#E2E8F0'),
                              color: activeRoute?.id === item.id 
                                ? '#FFFFFF' 
                                : (isOled ? '#D4D4D8' : '#334155')
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span>🧭</span>
                            <span>{activeRoute?.id === item.id ? '導航中 (防走錯)' : '設為導航航線'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setExpandedHistoryTrackId(prev => prev === item.id ? null : item.id)}
                            style={{
                              backgroundColor: isOled ? '#18181B' : '#F1F5F9',
                              borderColor: isOled ? '#27272A' : '#E2E8F0',
                              color: isOled ? '#D4D4D8' : '#334155'
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>📈</span>
                            <span>{expandedHistoryTrackId === item.id ? '收合圖表' : '速度與高度圖'}</span>
                          </button>

                          {/* ✏️ Inline Rename Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTrack({ id: item.id, name: item.name });
                              setEditTrackNameInput(item.name);
                            }}
                            style={{
                              backgroundColor: isOled ? '#18181B' : '#F1F5F9',
                              borderColor: isOled ? '#27272A' : '#E2E8F0',
                              color: isOled ? '#D4D4D8' : '#334155'
                            }}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors flex items-center gap-1 cursor-pointer"
                            title="重新命名此航跡"
                          >
                            <span>✏️</span>
                            <span>改名</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenGPXStudio(item)}
                            style={{
                              backgroundColor: isOled ? '#064E3B40' : '#ECFDF5',
                              borderColor: isOled ? '#065F46' : '#A7F3D0',
                              color: isOled ? '#6EE7B7' : '#065F46'
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors flex items-center gap-1 cursor-pointer"
                            title="在 gpx.studio 線上打開此軌跡"
                          >
                            <span>🌐</span>
                            <span>gpx.studio</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadGPX(item)}
                            style={{
                              backgroundColor: isOled ? '#18181B' : '#F1F5F9',
                              borderColor: isOled ? '#27272A' : '#E2E8F0',
                              color: isOled ? '#D4D4D8' : '#334155'
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>📥</span>
                            <span>下載 GPX</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              downloadGPX(item);
                              setShowGoogleGuide(true);
                            }}
                            style={{
                              backgroundColor: isOled ? '#082F4950' : '#F0F9FF',
                              borderColor: isOled ? '#075985' : '#BAE6FD',
                              color: isOled ? '#7DD3FC' : '#0369A1'
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors flex items-center gap-1 ml-auto cursor-pointer"
                          >
                            <span>🗺️</span>
                            <span>匯入地圖</span>
                          </button>
                        </div>

                        {/* Inline Expandable Elevation Profile & Speed Telemetry for this Saved Track */}
                        {expandedHistoryTrackId === item.id && (
                          <div className="pt-2 space-y-3 animate-in fade-in">
                            {/* Automotive Virtual Cockpit Cluster */}
                            <AutomotiveClusterDashboard
                              displayStats={item.stats}
                              isRecording={false}
                              displayPointsCount={item.points?.length || 0}
                              displayTitle={item.name}
                              theme={displayTheme}
                            />

                            {/* Chart */}
                            <ElevationProfileChart
                              elevationProfile={item.stats?.elevationProfile || []}
                              totalDistanceKm={item.stats?.totalDistanceKm || '0.00'}
                              maxElevationM={item.stats?.maxElevationM}
                              minElevationM={item.stats?.minElevationM}
                              totalAscentM={item.stats?.totalAscentM || 0}
                              totalDescentM={item.stats?.totalDescentM || 0}
                              theme={displayTheme}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div 
                    style={{
                      backgroundColor: isOled ? '#000000' : '#FFFFFF',
                      borderColor: isOled ? '#27272A' : '#E2E8F0'
                    }}
                    className="p-8 rounded-2xl border text-center space-y-2 shadow-xs"
                  >
                    <span className="text-3xl block">📱</span>
                    <strong className={`text-xs font-bold block ${isOled ? 'text-zinc-200' : 'text-slate-800'}`}>手機本機尚無儲存航跡</strong>
                    <p className={`text-xs max-w-sm mx-auto ${isOled ? 'text-zinc-500' : 'text-slate-500'}`}>
                      當您在「路徑記錄」切換 OFF 後，或在「匯入」分頁匯入別人的 GPX 時，都會自動存放在這裡，隨時可離線讀取！
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 3: 匯入 / 別人紀錄 ── */}
            {activeTab === 'import' && (
              <div className="space-y-4 font-sans">
                {/* 1. 外部檔案匯入區 (健行筆記、山友 AirDrop / Line 分享) */}
                <div 
                  style={{
                    backgroundColor: isOled ? '#000000' : '#FFFFFF',
                    borderColor: isOled ? '#27272A' : '#E2E8F0'
                  }}
                  className="p-4 rounded-2xl border shadow-xs space-y-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📂</span>
                    <div>
                      <strong className={`text-xs font-black block ${isOled ? 'text-zinc-100' : 'text-slate-900'}`}>
                        匯入外部 GPX 檔 (健行筆記 / 山友分享)
                      </strong>
                      <p className={`text-[11px] ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>
                        支援標準 .gpx 格式。匯入後直接保存在手機本機，離線登山防走錯。
                      </p>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".gpx,application/gpx+xml,text/xml"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="gpx-file-upload-input"
                  />

                  <label
                    htmlFor="gpx-file-upload-input"
                    style={{
                      backgroundColor: isOled ? '#09090B' : '#F8FAFC',
                      borderColor: isOled ? '#27272A' : '#CBD5E1'
                    }}
                    className="p-4 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 transition-colors"
                  >
                    <span className="text-2xl">📥</span>
                    <span className="text-xs font-black text-emerald-500">
                      點擊選取手機內的 .gpx 航跡檔
                    </span>
                    <span className={`text-[10px] ${isOled ? 'text-zinc-500' : 'text-slate-400'}`}>
                      例如：從《健行筆記》網站或山友傳送之 GPX 檔案
                    </span>
                  </label>

                  {importError && (
                    <p className="text-rose-500 text-xs font-bold pt-1">
                      ⚠️ {importError}
                    </p>
                  )}
                </div>

                {/* 2. 官方精選台灣熱門露營健行步道範本庫 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className={`text-xs font-black block ${isOled ? 'text-zinc-100' : 'text-slate-900'}`}>
                        🌲 台灣熱門露營步道 GPX 雲端範本庫
                      </strong>
                      <p className={`text-[11px] ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>
                        免自行尋找，一鍵載入官方航跡點位到手機，開飛航模式也能跟著走！
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {PRESET_HIKING_TRAILS.map((trail) => (
                      <div 
                        key={trail.id}
                        style={{
                          backgroundColor: isOled ? '#000000' : '#FFFFFF',
                          borderColor: isOled ? '#27272A' : '#E2E8F0'
                        }}
                        className="p-3.5 rounded-2xl border shadow-xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <strong className={`text-xs font-black truncate ${isOled ? 'text-zinc-100' : 'text-slate-900'}`}>
                                {trail.name}
                              </strong>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isOled 
                                  ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                              }`}>
                                {trail.tag}
                              </span>
                            </div>
                            <p className={`text-[11px] leading-snug mt-0.5 line-clamp-2 ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>
                              {trail.description}
                            </p>
                          </div>
                        </div>

                        <div 
                          style={{ borderColor: isOled ? '#18181B' : '#F1F5F9' }}
                          className="flex items-center justify-between gap-2 pt-1 border-t text-[11px] font-mono flex-wrap"
                        >
                          <div className={`flex items-center gap-2 ${isOled ? 'text-zinc-400' : 'text-slate-500'}`}>
                            <span className={isOled ? 'text-emerald-400 font-bold' : 'text-emerald-700 font-bold'}>📏 {trail.distanceKm}km</span>
                            <span>·</span>
                            <span className={isOled ? 'text-sky-400 font-bold' : 'text-sky-600 font-bold'}>⛰️ +{trail.ascentM}m</span>
                            <span>·</span>
                            <span>⏱️ {trail.duration}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenPresetInGPXStudio(trail.id)}
                              style={{
                                backgroundColor: isOled ? '#064E3B40' : '#ECFDF5',
                                borderColor: isOled ? '#065F46' : '#A7F3D0',
                                color: isOled ? '#6EE7B7' : '#065F46'
                              }}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer"
                              title="在 gpx.studio 開啟此官方步道"
                            >
                              <span>🌐</span>
                              <span>gpx.studio 預覽</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleLoadPreset(trail.id)}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all cursor-pointer"
                            >
                              📥 載入防走錯
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ✈️ 飛航模式與離線導航安全專題說明 Modal */}
      {showAirplaneModeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div 
            className="w-full max-w-lg max-h-[90vh] bg-white border border-slate-200 text-slate-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden font-sans"
          >
            <div 
              className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">✈️</span>
                <strong className="text-base font-black text-slate-900">
                  開飛航模式真的不會走錯路嗎？
                </strong>
              </div>
              <button 
                onClick={() => setShowAirplaneModeModal(false)}
                className="w-7 h-7 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto text-xs leading-relaxed">
              {/* Question 1: 手機硬體衛星接收原理 */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1.5">
                <strong className="text-[13px] font-black text-emerald-700 block flex items-center gap-1.5">
                  <span>✅</span> 答案是：完全可以！而且是專業山友最推薦的做法！
                </strong>
                <p className="text-slate-600">
                  智慧型手機（iPhone / Android）內部裝有<strong>獨立的硬體衛星天線與 GPS 晶片</strong>。
                  GPS 運作是<strong>「純被動接收」</strong>太空中 2 萬公里軌道上的衛星電波廣播，手機只聽訊號、不發射任何電磁波，因此<strong>完全不受飛航模式影響</strong>，隨時隨地都能鎖定精確經緯度與海拔。
                </p>
              </div>

              {/* Question 2: 為什麼登山強烈建議開飛航模式？ */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1.5">
                <strong className="text-[13px] font-black text-amber-800 block flex items-center gap-1.5">
                  <span>🔋</span> 飛航模式的超級優點：省電 80%
                </strong>
                <p className="text-slate-600">
                  在深山無訊號時，手機若開著行動網路，會以最大功率不斷向遠方搜尋 4G/5G 基地台，導致手機發燙且 2~3 小時就耗盡電量！
                  <strong>切換為飛航模式後，關閉行動通訊發射，僅保留純被動 GPS 運作，手機能支撐整整一至兩天健行！</strong>
                </p>
              </div>

              {/* Question 3: 怎樣確保「絕不走錯路」？ */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1.5">
                <strong className="text-[13px] font-black text-sky-700 block flex items-center gap-1.5">
                  <span>🧭</span> 本系統如何幫您防走錯路？
                </strong>
                <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
                  <li><strong>離線儲存於手機</strong>：您下載或載入的 GPX 航跡已經完整保存在手機記憶體內，完全不吃任何網路流量。</li>
                  <li><strong>即時偏離軌道警報 (Cross-Track Alert)</strong>：系統隨時將您的衛星定位與航跡進行比對，只要偏離航線超過 <strong>35 公尺</strong>，即會發出警示！</li>
                  <li><strong>AR 實境視覺指引</strong>：在山徑岔路口時，舉起手機 AR 即可看到方位與步道方向，一目了然該走哪條叉路。</li>
                </ul>
              </div>

              {/* 注意事項 */}
              <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50/80 text-amber-900">
                <strong className="block mb-1">💡 專家小叮嚀 (冷啟動技巧)：</strong>
                在進入茂密樹林前，建議先在開闊處開啟定位 30~60 秒讓手機鎖定 4 顆以上衛星，定位會更加穩定精確。
              </div>

              <button
                type="button"
                onClick={() => setShowAirplaneModeModal(false)}
                className="w-full py-2.5 rounded-xl font-black text-xs shadow-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95 transition-all"
              >
                我了解了，返回記錄器
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📍 Waypoint Dialog */}
      {showWaypointDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div 
            className="w-full max-w-sm bg-white border border-slate-200 text-slate-900 rounded-3xl p-5 shadow-2xl space-y-3.5 font-sans"
          >
            <strong className="text-sm font-black text-slate-900 block">📍 新增打卡地標點</strong>
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">點位名稱</label>
              <input
                type="text"
                value={waypointName}
                onChange={(e) => setWaypointName(e.target.value)}
                placeholder="例如: 巨石觀景台 / 岔路取左 / 水源處"
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">類型標籤</label>
              <div className="grid grid-cols-4 gap-1.5">
                {['景點', '步道', '營地', '水源'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setWaypointType(t)}
                    className={`py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      waypointType === t
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowWaypointDialog(false)}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmWaypoint}
                className="flex-1 py-2 rounded-xl text-xs font-black shadow-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors"
              >
                確認新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🗺️ Google My Maps Step-by-Step Guide Modal (Hiking Biji Reference) */}
      {showGoogleGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div 
            className="w-full max-w-lg max-h-[90vh] bg-white border border-slate-200 text-slate-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden font-sans"
          >
            <div 
              className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">🗺️</span>
                <strong className="text-base font-black text-slate-900">
                  如何將 GPX 匯入 Google 我的地圖
                </strong>
              </div>
              <button 
                onClick={() => setShowGoogleGuide(false)}
                className="w-7 h-7 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto text-xs leading-relaxed">
              <p className="text-slate-600">
                依照<strong>《健行筆記》官方教學流程</strong>，您可以將剛才下載的 GPX 檔案（或匯入的別人的 GPX）匯入至個人的 <strong>Google 我的地圖 (Google My Maps)</strong>，在 Google 地圖 App 或電腦上永久查看行走軌跡：
              </p>

              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                  <strong className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shadow-2xs">1</span>
                    進入 Google 我的地圖網站
                  </strong>
                  <p className="text-slate-600">
                    使用瀏覽器開啟 <a href="https://mymaps.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-bold">Google My Maps (mymaps.google.com)</a> 並登入您的 Google 帳號。
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                  <strong className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shadow-2xs">2</span>
                    建立新地圖 ➜ 點擊「匯入」
                  </strong>
                  <p className="text-slate-600">
                    點擊左上角的<strong>「＋ 建立新地圖」</strong>，在左側「未命名的圖層」下方點擊<strong>「匯入」</strong>按鈕。
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                  <strong className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shadow-2xs">3</span>
                    上傳剛剛下載的 .gpx 檔案
                  </strong>
                  <p className="text-slate-600">
                    將剛才下載的 <strong>{trackName || '健行軌跡記錄'}.gpx</strong> 檔案拖曳至上傳方框，或點擊「瀏覽」從手機「下載項目/檔案」選取。
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                  <strong className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shadow-2xs">4</span>
                    在手機 Google Maps App 隨時開啟
                  </strong>
                  <p className="text-slate-600">
                    匯入後，地圖即自動顯示連續彩色軌跡與所有地標！開啟手機 <strong>Google Maps App ➜ 點擊下方「已儲存」➜ 最下方「地圖」</strong>即可隨時疊加查看！
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportToGoogleMyMaps(trackName)}
                  style={{ backgroundColor: '#2563EB', color: '#FFFFFF' }}
                  className="flex-1 py-2.5 rounded-xl font-black text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-blue-700"
                >
                  <span>🚀</span>
                  <span>立即開啟 Google 我的地圖網站 ↗</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🌙 OLED 口袋暗屏極致省電模式 (消滅頂部白條 + 100% 熄屏 0 像素發光 + 觸碰喚出微光 HUD) */}
      {isPocketMode && isRecording && (
        <div 
          onClick={handlePocketScreenTap}
          style={{ 
            zIndex: 99999, 
            backgroundColor: '#000000',
            paddingTop: 'max(env(safe-area-inset-top), 24px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 24px)'
          }}
          className="fixed inset-0 text-zinc-300 flex flex-col justify-between px-5 select-none overflow-hidden transition-all duration-300 cursor-pointer"
        >
          {/* Top Status (僅在喚醒時顯示，全黑熄屏時完全熄滅不發光) */}
          <div className={`flex items-center justify-between text-xs text-zinc-600 font-mono border-b border-zinc-900 pb-3 transition-opacity duration-300 ${
            !isPocketAwake && !pocketAlwaysDim ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse" />
              <span className="text-emerald-500/90 font-bold tracking-wider">🛰️ GPS 背景航跡收錄中</span>
            </div>
            
            {/* Mode Toggle: 自動純黑 (預設) vs 常駐微光 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPocketAlwaysDim(v => !v);
              }}
              className="px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-950 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 active:scale-95 transition-all cursor-pointer"
            >
              {pocketAlwaysDim ? '💡 常駐微光' : '🌙 自動純黑 (最省電)'}
            </button>
          </div>

          {/* Central Area: 100% 純黑極限熄屏 VS 微光 HUD */}
          {!isPocketAwake && !pocketAlwaysDim ? (
            /* 1. 深度全黑熄屏 (0 像素發光 · 0 nits · 頂部 status bar 與全屏 100% 純黑) */
            <div className="my-auto text-center space-y-4 pointer-events-none select-none opacity-40">
              <div className="w-1.5 h-1.5 mx-auto rounded-full bg-emerald-500/30 animate-pulse" />
              <div className="text-[11px] font-mono text-zinc-800 tracking-wider">
                🌙 100% 熄屏省電中 · 輕碰螢幕喚出資訊
              </div>
            </div>
          ) : (
            /* 2. 觸碰喚醒之微光 HUD (消除刺眼白字，採用低耗電深階琥珀微光) */
            <div className="text-center space-y-4 my-auto animate-in fade-in duration-200">
              {/* Status or Toast */}
              {showTouchHint ? (
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-amber-500/40 bg-amber-950/80 text-amber-300 text-xs font-mono shadow-2xl">
                  <span>🔒</span>
                  <span>口袋防誤觸中：請向右滑動滑軌或長按 2 秒解鎖</span>
                </div>
              ) : (
                <div className="inline-block px-3 py-1 rounded-full border border-zinc-800 bg-zinc-950 text-zinc-500 text-xs font-mono">
                  {pocketAlwaysDim ? '💡 常駐微光省電中' : '⏱️ 6 秒後自動沉入 100% 純黑熄屏'}
                </div>
              )}

              {/* Giant Time: 採用深階暖色琥珀 (非刺眼高亮白字，OLED 功耗大減 70% 且保護夜間暗適應) */}
              <div 
                style={{ color: '#F59E0B' }}
                className="text-5xl sm:text-6xl font-mono font-black tracking-tight drop-shadow-[0_0_12px_rgba(245,158,11,0.25)]"
              >
                {displayStats?.durationFormatted || '00:00:00'}
              </div>

              {/* Secondary Metrics (低功耗深灰與微光) */}
              <div className="flex items-center justify-center gap-6 text-sm font-mono pt-1">
                <div>
                  <span style={{ color: '#71717A' }} className="block text-xs">累計里程</span>
                  <span style={{ color: '#D4D4D8' }} className="text-xl font-bold">{displayStats?.totalDistanceKm || '0.00'} km</span>
                </div>
                <div style={{ backgroundColor: '#27272A' }} className="w-px h-8" />
                <div>
                  <span style={{ color: '#71717A' }} className="block text-xs">即時時速</span>
                  <span style={{ color: '#10B981' }} className="text-xl font-bold">{displayStats?.currentSpeedKmh || '0.0'} km/h</span>
                </div>
                <div style={{ backgroundColor: '#27272A' }} className="w-px h-8" />
                <div>
                  <span style={{ color: '#71717A' }} className="block text-xs">當前海拔</span>
                  <span style={{ color: '#38BDF8' }} className="text-xl font-bold">{displayStats?.currentElevation !== null ? `${displayStats.currentElevation}m` : '--'}</span>
                </div>
              </div>

              <p style={{ color: '#71717A' }} className="text-xs max-w-xs mx-auto pt-1 leading-relaxed">
                放入背包或口袋時，布料摩擦絕不誤觸喚醒；無操作自動沉入純黑！
              </p>
            </div>
          )}

          {/* Bottom Dual Anti-Touch Unlock Controls (向右滑軌 + 2 秒長按備援) */}
          <div 
            className={`pb-4 w-full max-w-sm mx-auto space-y-2.5 shrink-0 transition-opacity duration-200 ${
              !isPocketAwake && !pocketAlwaysDim ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. 滑動解鎖滑軌 (Swipe to Unlock Slider) */}
            <div 
              ref={sliderTrackRef}
              onPointerMove={handleSliderPointerMove}
              onPointerUp={handleSliderPointerUp}
              onPointerCancel={handleSliderPointerUp}
              style={{ backgroundColor: '#18181B', borderColor: '#3F3F46', height: '56px' }}
              className="relative border rounded-2xl flex items-center justify-center overflow-hidden touch-none select-none shadow-xl shrink-0"
            >
              {/* Animated Progress Fill Behind Thumb */}
              <div 
                style={{ 
                  width: `${sliderPosition + 48}px`,
                  backgroundColor: 'rgba(6, 78, 59, 0.6)',
                  borderColor: '#059669'
                }} 
                className="absolute left-0 top-0 bottom-0 border-r pointer-events-none transition-all duration-75"
              />

              {/* Background Guide Text */}
              <div style={{ color: '#A1A1AA' }} className="flex items-center gap-1.5 text-xs font-mono font-bold pointer-events-none tracking-wider">
                <span>向右滑動解鎖</span>
                <span className="animate-pulse">❯❯❯</span>
                <span style={{ color: '#34D399' }}>🔓</span>
              </div>

              {/* Draggable Slider Thumb Handle */}
              <div 
                style={{
                  transform: `translateX(${sliderPosition}px)`,
                  transition: isDraggingSlider ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
                  backgroundColor: '#059669',
                  color: '#FFFFFF'
                }}
                onPointerDown={handleSliderPointerDown}
                data-testid="pocket-slider-thumb"
                className="absolute left-1 top-1 bottom-1 w-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-lg cursor-grab active:cursor-grabbing active:scale-95"
              >
                <span>➔</span>
              </div>
            </div>

            {/* 2. 手套/雨中長按 2 秒解鎖備援 (Press & Hold for 2 seconds) */}
            <button
              type="button"
              onPointerDown={startLongPress}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onPointerCancel={cancelLongPress}
              data-testid="pocket-long-press-unlock-btn"
              style={{ backgroundColor: '#09090B', borderColor: '#27272A', color: '#A1A1AA', height: '42px' }}
              className="relative w-full py-2 px-4 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-2 overflow-hidden active:scale-98 transition-all cursor-pointer shrink-0"
            >
              {/* Fill Progress Bar */}
              <div 
                style={{ 
                  width: `${longPressProgress}%`,
                  backgroundColor: 'rgba(5, 150, 105, 0.3)',
                  borderColor: '#10B981'
                }}
                className="absolute left-0 top-0 bottom-0 border-r pointer-events-none transition-all duration-75"
              />
              <span className="relative z-10">⏱️</span>
              <span className="relative z-10">
                {longPressProgress > 0 ? `解鎖中 ${longPressProgress}% (長按不放)` : '手套或雨中：長按 2 秒解鎖'}
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
