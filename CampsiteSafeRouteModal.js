'use client';

import React, { useMemo } from 'react';

// Extract altitude integer
function parseAltitude(altStr) {
  if (!altStr) return 0;
  const match = String(altStr).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Analyze campsite road safety risk profile
function analyzeSafetyProfile(campsite, userNotes = []) {
  const alt = parseAltitude(campsite.altitude);
  const textCorpus = [
    campsite.name || '',
    campsite.location || '',
    campsite.region || '',
    ...(campsite.cons || []),
    ...(campsite.pros || []),
    ...userNotes.map(n => `${n.precautions || ''} ${n.comment || ''}`)
  ].join(' ').toLowerCase();

  // Keyword scanners
  const steepSlopes = /陡坡|極陡|斜坡|很陡|陡峭|好陡|打滑|輪胎打滑/.test(textCorpus);
  const narrowPassing = /難會車|單線|無法會車|會車難|很窄|窄小|會車注意|避車彎|不易會車/.test(textCorpus);
  const hairpinTurns = /髮夾彎|連續彎道|九彎十八拐|彎曲|很多彎|彎道/.test(textCorpus);
  const lowChassisRisk = /刮底盤|底盤|卡底盤|低底盤|底盤低|刮到/.test(textCorpus);
  const roughRoad = /碎石|泥濘|坑洞|爛路|產業道路|林道|未鋪柏油|顛簸/.test(textCorpus);
  const fogRisk = /大霧|起霧|起嵐|濃霧|山嵐|白茫茫/.test(textCorpus);

  // Safety Grade Determination (A: 輕鬆好開, B: 偶有會車, C: 陡峭彎多, D: 挑戰級林道)
  let level = '🟢 平穩好開雙線道';
  let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  let difficulty = '入門級 (一般轎車可輕鬆抵達)';
  let score = 92;

  if (steepSlopes || roughRoad || alt > 1300) {
    level = '🔴 考驗駕駛技巧 (陡坡／狹窄路段)';
    badgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
    difficulty = '挑戰級 (建議高底盤休旅車或低速檔前進)';
    score = 65;
  } else if (narrowPassing || hairpinTurns || alt > 800) {
    level = '🟠 山路蜿蜒 (會車點少／多髮夾彎)';
    badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
    difficulty = '進階級 (需放慢車速，善用反射鏡與避車彎)';
    score = 78;
  } else if (alt > 400) {
    level = '🟡 丘陵緩坡 (部分路段路幅收窄)';
    badgeColor = 'bg-sky-100 text-sky-800 border-sky-300';
    difficulty = '適中級 (路況良好，注意上山盲彎)';
    score = 85;
  }

  return {
    alt,
    score,
    level,
    badgeColor,
    difficulty,
    warnings: {
      steepSlopes,
      narrowPassing,
      hairpinTurns,
      lowChassisRisk,
      roughRoad,
      fogRisk
    }
  };
}

export default function CampsiteSafeRouteModal({
  campsite,
  isOpen,
  onClose,
  originName = '台南安平區',
  userNotes = []
}) {
  const profile = useMemo(() => {
    if (!campsite) return null;
    return analyzeSafetyProfile(campsite, userNotes);
  }, [campsite, userNotes]);

  if (!isOpen || !campsite || !profile) return null;

  // Google Maps direct GPS navigation URL (不給起點，由手機自動抓取 GPS 即刻導航)
  const gpsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(campsite.name)}&travelmode=driving`;

  // AI Safety Analysis Query
  const aiSafetyQuery = `「${campsite.name} ${campsite.region || ''} ${campsite.location || ''}」路況安全性與最推薦開車路線分析：1. 最後幾公里路幅寬度與會車難度 2. 有無危險陡坡、坑洞或刮底盤路況 3. Google 地圖是否會誤導帶入危險產業道路或死胡同？建議的安全轉折地標為何 4. 週五夜衝與低底盤轎車適合嗎？請依露營車友真實經驗提供避坑指南。`;
  const aiSafetyUrl = new URL("https://www.google.com/search");
  aiSafetyUrl.searchParams.set("q", aiSafetyQuery);
  aiSafetyUrl.searchParams.set("udm", "50");
  aiSafetyUrl.searchParams.set("hl", "zh-TW");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🛡️</span>
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                {campsite.name} - 最安全行車路徑與路況分析
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                出發起點：<strong className="text-slate-800">{originName}</strong> | 終點：{campsite.region || ''} {campsite.location || ''} ({campsite.altitude || '海拔未知'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-sm shadow-sm transition-colors"
          >
            ✕ 關閉
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* 1. 安全評級概覽卡 */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-1">路段安全難度評級</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-black px-3 py-1 rounded-full border ${profile.badgeColor}`}>
                    {profile.level}
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    安全指數：<strong className="text-emerald-600 text-sm">{profile.score} 分</strong>
                  </span>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-xs font-bold text-slate-500 block mb-1">車輛適用建議</span>
                <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 inline-block">
                  {profile.difficulty}
                </span>
              </div>
            </div>

            {/* 偵測到的路況風險特徵 */}
            <div className="pt-3">
              <span className="text-xs font-bold text-slate-700 block mb-2">🔍 營區環境與路況偵測警示：</span>
              <div className="flex flex-wrap gap-2">
                {profile.warnings.steepSlopes ? (
                  <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1">
                    ⚠️ 有陡坡／打滑風險 (請掛低速檔)
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1 rounded-lg border border-emerald-100">
                    ✓ 無過度陡坡通報
                  </span>
                )}

                {profile.warnings.narrowPassing ? (
                  <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                    ⚠️ 狹窄會車路段 (請提早預留避車處)
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1 rounded-lg border border-emerald-100">
                    ✓ 路幅適中
                  </span>
                )}

                {profile.warnings.lowChassisRisk ? (
                  <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1">
                    ⚠️ 低底盤刮車風險 (進出斜坡需斜切)
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1 rounded-lg border border-emerald-100">
                    ✓ 一般房車底盤友善
                  </span>
                )}

                {profile.warnings.roughRoad && (
                  <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                    ⚠️ 部分非鋪裝／碎石路面 (放慢車速)
                  </span>
                )}

                {profile.warnings.fogRisk && (
                  <span className="text-xs bg-sky-100 text-sky-800 font-bold px-2.5 py-1 rounded-lg border border-sky-200 flex items-center gap-1">
                    🌫️ 山區易起霧 (午後或夜衝務必開啟霧燈)
                  </span>
                )}

                {profile.alt >= 1000 && (
                  <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-2.5 py-1 rounded-lg border border-indigo-200 flex items-center gap-1">
                    ⛰️ 海拔高於 1000m (長下坡注意煞車散熱)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2. 露營山路 5 大最安全駕駛指南 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span>🛣️</span> 台灣露營「最安全行車路徑」4 大避坑守則
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
              <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-xl">
                <strong className="text-amber-900 block font-bold mb-1 flex items-center gap-1">
                  1. 🚫 切勿盲信 Google Maps 抄農路小徑
                </strong>
                <p className="text-slate-700">
                  山區導航常為省 2 分鐘而將車流導引至未鋪柏油、無護欄的陡峭<strong>產業道路／果園採收道</strong>。
                  <strong>建議原則</strong>：沿主要省道（台線）、縣道行駛，堅持走主幹道路標，看到營區專屬黃色／木製指示牌再轉入支線。
                </p>
              </div>

              <div className="bg-blue-50/70 border border-blue-200 p-3.5 rounded-xl">
                <strong className="text-blue-900 block font-bold mb-1 flex items-center gap-1">
                  2. 📍 設定「安全中繼轉折地標」導航
                </strong>
                <p className="text-slate-700">
                  上山前，先將導航目的地設為<strong>山腳下的分駐所、中油加油站或小學</strong>。抵達主幹道轉折點確認路況、加滿油並重設營地導航，能 100% 避開導航誤入深山死胡同。
                </p>
              </div>

              <div className="bg-rose-50/70 border border-rose-200 p-3.5 rounded-xl">
                <strong className="text-rose-900 block font-bold mb-1 flex items-center gap-1">
                  3. ⚙️ 下坡全程切換低速檔 (引擎煞車)
                </strong>
                <p className="text-slate-700">
                  露營車輛多滿載重裝（帳篷、冰箱、裝備），長下坡若全程踩煞車，煞車油容易<strong>高溫氣化沸騰而導致煞車瞬間失靈</strong>！請將自排排入 <strong>L 檔、B 檔或手自排 1~2 檔</strong>，讓引擎自然牽引制動。
                </p>
              </div>

              <div className="bg-indigo-50/70 border border-indigo-200 p-3.5 rounded-xl">
                <strong className="text-indigo-900 block font-bold mb-1 flex items-center gap-1">
                  4. 🌙 週五夜衝 (Night Drive) 安全要領
                </strong>
                <p className="text-slate-700">
                  夜間山路無路燈，遇濃霧時<strong>切忌開啟遠光燈</strong>（光線會被水氣散射反而一片白茫茫）。請開啟<strong>近光燈＋前後霧燈</strong>，視線瞄準道路邊線白漆慢速行駛，盲彎前提早輕按喇叭示警。
                </p>
              </div>
            </div>
          </div>

          {/* 3. 一鍵智慧路徑與 AI 探測操作按鈕 */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <span className="font-extrabold text-sm text-emerald-400 flex items-center gap-1.5">
                  🚀 即刻規劃最安全行車路線
                </span>
                <p className="text-xs text-slate-300 mt-0.5">
                  可直接呼叫 Google AI 比對車友真實上山紀錄，或一鍵啟動安全導航：
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <a
                href={gpsNavUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 text-center"
              >
                🧭 即時安全導航 (自動抓取目前 GPS 位置)
              </a>

              <a
                href={aiSafetyUrl.toString()}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 text-center"
              >
                🤖 Google AI 車友路況深度分析
              </a>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <span>提醒：山區午後天氣多變，出發前請確認路況與胎壓</span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-sm transition-colors"
          >
            完成
          </button>
        </div>

      </div>
    </div>
  );
}
