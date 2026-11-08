'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';

// Astronomical calculation for Sun Elevation and Azimuth
function calculateSolarPosition(date, lat, lng) {
  const rad = Math.PI / 180;
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
  const hour = date.getHours() + date.getMinutes() / 60;
  
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  
  const timeOffset = eqtime + 4 * lng - 480; // UTC+8
  const tst = hour * 60 + timeOffset;
  const ha = (tst / 4 - 180) * rad;
  const latRad = lat * rad;
  
  const sinElev = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(ha);
  const elev = Math.asin(Math.max(-1, Math.min(1, sinElev)));
  
  const sinZenith = Math.cos(elev);
  let azRad = Math.acos(Math.max(-1, Math.min(1, (Math.sin(decl) - Math.sin(latRad) * sinElev) / (Math.cos(latRad) * sinZenith))));
  let az = azRad / rad;
  if (Math.sin(ha) > 0) {
    az = 360 - az;
  }
  
  return {
    elevation: Math.round(elev / rad * 10) / 10,
    azimuth: Math.round(az * 10) / 10
  };
}

export default function CampsiteARModal({
  campsite,
  isOpen,
  onClose,
  windDir = 45, // default NE 45
  windSpeed = 10
}) {
  const videoRef = useRef(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  // Gyroscope / Orientation state
  const [heading, setHeading] = useState(0); // 0° to 360° (Compass Azimuth)
  const [pitch, setPitch] = useState(15); // -90° to 90° (Tilt front/back / elevation)
  const [roll, setRoll] = useState(0); // -90° to 90° (Tilt left/right)
  const [isManualSim, setIsManualSim] = useState(false);
  
  // Selected simulation mode (Summer / Winter / Current)
  const [seasonMode, setSeasonMode] = useState('current');

  const lat = campsite?.latitude ? Number(campsite.latitude) : 24.1;
  const lng = campsite?.longitude ? Number(campsite.longitude) : 121.0;

  // 1. Calculate Sun milestones for current or selected season
  const sunMilestones = useMemo(() => {
    let targetDate = new Date();
    if (seasonMode === 'summer') targetDate = new Date(2026, 5, 21); // June 21
    if (seasonMode === 'winter') targetDate = new Date(2026, 11, 21); // Dec 21

    const hours = [
      { h: 6, label: '🌅 清晨日出 (06:00)', tag: '晨曬起點' },
      { h: 7, label: '☀️ 晨光加溫 (07:00)', tag: '防熱醒關鍵' },
      { h: 9, label: '☀️ 早晨斜陽 (09:00)', tag: '曬帳時段' },
      { h: 12, label: '🔥 正午頂光 (12:00)', tag: '天頂直射' },
      { h: 14, label: '🌇 午後西曬 (14:00)', tag: '西曬高溫' },
      { h: 16, label: '🌇 傍晚斜陽 (16:00)', tag: '天幕側翼下壓' },
      { h: 17.5, label: '🌆 日落黃昏 (17:30)', tag: '夜暮降溫' }
    ];

    return hours.map(item => {
      const d = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), Math.floor(item.h), (item.h % 1) * 60);
      const pos = calculateSolarPosition(d, lat, lng);
      return { ...item, ...pos };
    });
  }, [seasonMode, lat, lng]);

  // Recommended tent door orientation (Default: 250° WSW to prevent morning direct sunlight)
  const recommendedDoorAzimuth = useMemo(() => {
    // If strong wind (>20km/h), prioritize wind alignment
    if (windSpeed > 20) {
      // Point door to leeward (downwind) side
      return (windDir + 180) % 360;
    }
    // Normal weather: point to West-Southwest (250°) to avoid 06:00~07:30 morning sun
    return 250;
  }, [windDir, windSpeed]);

  // Request Gyroscope & Camera Permissions on open
  useEffect(() => {
    if (!isOpen) return;

    let localStream = null;

    // Start rear camera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      })
      .then(stream => {
        localStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setHasCamera(true);
      })
      .catch(err => {
        console.warn('Camera access error or desktop:', err);
        setCameraError('未偵測到後置鏡頭或未允許相機權限，已啟動 AR 實境全景模擬器。');
        setHasCamera(false);
      });
    }

    // Start Orientation / Gyro
    const handleOrientation = (e) => {
      let currentHeading = 0;
      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        // iOS Safari provides true compass heading directly
        currentHeading = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        // Android Chrome
        currentHeading = (360 - e.alpha) % 360;
      }

      const currentPitch = e.beta !== null ? Math.max(-80, Math.min(80, e.beta - 45)) : 15;
      const currentRoll = e.gamma !== null ? Math.max(-60, Math.min(60, e.gamma)) : 0;

      setHeading(Math.round(currentHeading));
      setPitch(Math.round(currentPitch));
      setRoll(Math.round(currentRoll));
      setPermissionGranted(true);
      setIsManualSim(false);
    };

    if (typeof DeviceOrientationEvent !== 'undefined') {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ requires user gesture
        DeviceOrientationEvent.requestPermission()
          .then(res => {
            if (res === 'granted') {
              window.addEventListener('deviceorientation', handleOrientation);
            }
          })
          .catch(() => {});
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen]);

  // Request explicit permission on button click (for iOS Safari strict policy)
  const handleRequestMotionPermission = () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(res => {
          if (res === 'granted') {
            setPermissionGranted(true);
          } else {
            alert('需允許裝置動作與方向感測，方能自動轉動羅盤與太陽方位。');
          }
        })
        .catch(console.error);
    }
  };

  if (!isOpen || !campsite) return null;

  // Angular difference between device heading and recommended tent door azimuth
  let azimuthDiff = (recommendedDoorAzimuth - heading + 540) % 360 - 180;
  const isAligned = Math.abs(azimuthDiff) <= 12;

  // Compass directions for HUD ribbon
  const cardinalTicks = [
    { deg: 0, label: '北 (N)' },
    { deg: 45, label: '東北 (NE)' },
    { deg: 90, label: '東 (E)' },
    { deg: 135, label: '東南 (SE)' },
    { deg: 180, label: '南 (S)' },
    { deg: 225, label: '西南 (SW)' },
    { deg: 270, label: '西 (W)' },
    { deg: 315, label: '西北 (NW)' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-hidden select-none">
      <div className="relative w-full h-full sm:max-w-4xl sm:max-h-[92vh] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden bg-slate-900 text-white border border-slate-700 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Header Floating Glass Bar */}
        <div className="absolute top-0 left-0 right-0 z-30 px-4 py-3 bg-slate-900/80 backdrop-blur-md border-b border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <div>
              <h2 className="text-sm sm:text-base font-black flex items-center gap-1.5 text-white">
                AR 實境相機陀螺儀：營地搭帳方位建議
              </h2>
              <p className="text-[11px] text-slate-300">
                {campsite.name} | 即時方位角：<strong className="text-amber-400 font-mono text-xs">{heading}°</strong> | 鏡頭仰角：<strong className="text-sky-300 font-mono text-xs">{pitch}°</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-xl font-bold text-xs backdrop-blur-md transition-colors"
          >
            ✕ 關閉
          </button>
        </div>

        {/* Main AR Viewport (Camera Video + AR Canvas HUD) */}
        <div className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center bg-slate-950">
          
          {/* 1. Live Rear Camera View */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${hasCamera ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* 1.5 Desktop / No-Camera Fallback Cyber-Grid Background */}
          {!hasCamera && (
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950/60 flex flex-col items-center justify-center p-6 text-center">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40"></div>
              <div className="relative z-10 max-w-md bg-slate-900/90 border border-slate-700/80 p-5 rounded-2xl shadow-xl backdrop-blur-md mb-8">
                <span className="text-3xl block mb-2">🔭</span>
                <p className="text-sm font-bold text-slate-200 mb-1">
                  {cameraError || 'AR 實境全景模擬模式'}
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  用手機開啟本頁面可直接啟動相機與真實陀螺儀！目前可透過下方滑桿旋轉模擬手機朝向。
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setHeading(h => (h + 315) % 360)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-600"
                  >
                    ↺ 逆時針轉 45°
                  </button>
                  <button
                    onClick={() => setHeading(h => (h + 45) % 360)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-slate-600"
                  >
                    ↻ 順時針轉 45°
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. AR HUD: Top Rolling Compass Ribbon */}
          <div className="absolute top-16 left-0 right-0 z-20 flex flex-col items-center pointer-events-none">
            <div className="relative w-80 sm:w-96 h-11 bg-slate-900/75 backdrop-blur-md border border-white/15 rounded-full overflow-hidden shadow-lg flex items-center justify-center">
              {/* Center Sight Line */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 shadow-[0_0_8px_#f59e0b]"></div>
              <div className="absolute bottom-0 text-[9px] text-amber-400 font-mono font-bold z-10">▲ {heading}°</div>

              {/* Ticks Ribbon */}
              <div
                className="absolute flex items-center h-full transition-transform ease-out duration-75"
                style={{ transform: `translateX(${-heading * 4}px)` }}
              >
                {/* 360 * 3 loops for seamless wrap */}
                {[-360, 0, 360].map(offset => (
                  <div key={offset} className="flex relative" style={{ width: '1440px' }}>
                    {cardinalTicks.map(t => (
                      <div
                        key={t.deg}
                        className="absolute flex flex-col items-center"
                        style={{ left: `${t.deg * 4}px` }}
                      >
                        <span className={`text-[10px] font-black ${t.deg === 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                          {t.label}
                        </span>
                        <div className={`w-0.5 h-2 mt-0.5 ${t.deg === 0 ? 'bg-rose-400' : 'bg-slate-400'}`}></div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. AR HUD: Floating Sun Markers in Sky Dome */}
          <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
            {sunMilestones.map(sun => {
              // Angular difference between device heading and sun azimuth
              const azDiff = (sun.azimuth - heading + 540) % 360 - 180;
              // Angular difference between device pitch and sun elevation
              const elDiff = sun.elevation - pitch;

              // Camera field of view (FOV): approx +/- 35 deg horizontal, +/- 25 deg vertical
              const inFOV = Math.abs(azDiff) < 38 && Math.abs(elDiff) < 28;

              // Map angles to screen percentage (0% to 100%)
              const screenX = 50 + (azDiff / 38) * 45;
              const screenY = 50 - (elDiff / 28) * 40;

              if (!inFOV || sun.elevation < -5) return null;

              return (
                <div
                  key={sun.label}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-100 animate-in fade-in zoom-in-75"
                  style={{ left: `${screenX}%`, top: `${screenY}%` }}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-amber-400/20 animate-ping absolute inset-0"></div>
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 border-2 border-white shadow-[0_0_20px_#f59e0b] flex items-center justify-center text-xl">
                      ☀️
                    </div>
                  </div>
                  <div className="bg-slate-900/90 border border-amber-400/60 text-white px-2.5 py-1 rounded-xl text-[11px] font-bold shadow-xl backdrop-blur-md mt-1 text-center whitespace-nowrap">
                    <span className="text-amber-300 block">{sun.label}</span>
                    <span className="text-[10px] text-slate-300">方位 {sun.azimuth}° | 仰角 {sun.elevation}°</span>
                    <span className="text-[9px] text-emerald-400 block font-semibold">{sun.tag}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. AR Central Reticle & Real-time Pitching Guidance */}
          <div className="absolute z-20 pointer-events-none flex flex-col items-center justify-center">
            {/* Target Reticle */}
            <div className={`relative w-44 h-44 sm:w-52 sm:h-52 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
              isAligned 
                ? 'border-emerald-400 shadow-[0_0_30px_#10b981] scale-105 bg-emerald-500/10' 
                : 'border-white/30 border-dashed'
            }`}>
              {/* Crosshairs */}
              <div className="absolute w-full h-0.5 bg-white/20"></div>
              <div className="absolute h-full w-0.5 bg-white/20"></div>
              <div className="w-4 h-4 rounded-full border border-white/60"></div>
              
              {isAligned && (
                <div className="absolute -top-3 px-3 py-0.5 bg-emerald-500 text-slate-950 font-black text-[11px] rounded-full shadow animate-bounce">
                  🎯 完美搭帳朝向！
                </div>
              )}
            </div>

            {/* Turn Arrows Guidance Banner */}
            <div className="mt-4 px-4 py-2 rounded-2xl bg-slate-900/90 border border-white/20 backdrop-blur-md text-center max-w-xs shadow-2xl">
              {isAligned ? (
                <div>
                  <span className="text-emerald-400 font-extrabold text-sm block">
                    ✨ 推薦帳門正對此方位（{heading}°）
                  </span>
                  <p className="text-[11px] text-slate-200 mt-0.5">
                    清晨 6:00~7:30 晨曬位於背後，不會直射內帳熱醒；且避開主風向灌風！
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-center gap-1.5 text-amber-400 font-black text-sm">
                    {azimuthDiff > 0 ? (
                      <>
                        <span>👉 請向右轉動</span>
                        <span className="font-mono text-base">{Math.abs(Math.round(azimuthDiff))}°</span>
                      </>
                    ) : (
                      <>
                        <span>👈 請向左轉動</span>
                        <span className="font-mono text-base">{Math.abs(Math.round(azimuthDiff))}°</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    尋找最優搭帳朝向：<strong className="text-amber-300">{recommendedDoorAzimuth}° (西南西)</strong>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 5. Left Floating Gyro Pitch/Roll Leveler (水準儀) */}
          <div className="absolute bottom-24 left-4 z-20 bg-slate-900/85 backdrop-blur-md border border-white/15 p-3 rounded-2xl text-[11px] space-y-1 shadow-lg pointer-events-none">
            <span className="text-slate-400 font-bold block mb-1">📐 地勢水準與傾角：</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-300">前後傾斜:</span>
              <span className={`font-mono font-bold ${Math.abs(pitch) > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {pitch > 0 ? `上坡 +${pitch}°` : `下坡 ${pitch}°`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-300">左右傾斜:</span>
              <span className={`font-mono font-bold ${Math.abs(roll) > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {roll}°
              </span>
            </div>
            <p className="text-[10px] text-sky-300 pt-1 border-t border-white/10 font-medium">
              💡 睡墊頭部請朝向上坡方向
            </p>
          </div>

          {/* 6. Right Floating Wind Stream HUD */}
          <div className="absolute bottom-24 right-4 z-20 bg-slate-900/85 backdrop-blur-md border border-white/15 p-3 rounded-2xl text-[11px] space-y-1 shadow-lg pointer-events-none text-right">
            <span className="text-slate-400 font-bold block mb-1">💨 即時氣流風向：</span>
            <span className="text-sky-300 font-extrabold text-xs block">
              來風 {windDir}° ({windSpeed} km/h)
            </span>
            <p className="text-[10px] text-slate-300 pt-1 border-t border-white/10">
              隧道帳長軸平行風向<br />天幕主脊線破風擺設
            </p>
          </div>

        </div>

        {/* Bottom Floating Control Deck */}
        <div className="z-30 px-4 py-3 bg-slate-900/90 backdrop-blur-md border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-3">
          
          {/* Season Simulation Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">☀️ 太陽軌跡季節：</span>
            <div className="bg-slate-800 p-1 rounded-xl flex gap-1 border border-slate-700">
              <button
                onClick={() => setSeasonMode('current')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  seasonMode === 'current' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-300 hover:text-white'
                }`}
              >
                今日現況
              </button>
              <button
                onClick={() => setSeasonMode('summer')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  seasonMode === 'summer' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-300 hover:text-white'
                }`}
              >
                夏至 (防晨曬)
              </button>
              <button
                onClick={() => setSeasonMode('winter')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  seasonMode === 'winter' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-300 hover:text-white'
                }`}
              >
                冬至 (迎暖陽)
              </button>
            </div>
          </div>

          {/* Actions & Permission Trigger */}
          <div className="flex items-center gap-2">
            {!permissionGranted && typeof DeviceOrientationEvent !== 'undefined' && (
              <button
                onClick={handleRequestMotionPermission}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1"
              >
                🧭 啟動真實陀螺儀權限
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-1.5 bg-white text-slate-950 hover:bg-slate-200 font-black text-xs rounded-xl shadow transition-colors"
            >
              完成關閉
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
