'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

import 'leaflet/dist/leaflet.css';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MapWithNoSSR = dynamic(() => import('../components/CampsiteMap'), {
  ssr: false,
  loading: () => (
    <div className="h-80 bg-slate-800 rounded-2xl flex items-center justify-center text-white font-medium">
      🗺️ 地圖與標記載入中...
    </div>
  )
});

// 📍 四大固定出發點對照設定
const FIXED_ORIGINS = {
  tainan: '台南安平區',
  hsinchu: '新竹高鐵站',
  taipei: '台北車站',
  taichung: '台中高鐵站'
};

export default function Home() {
  const [campsites, setCampsites] = useState([]);
  const [originKey, setOriginKey] = useState('tainan');
  const [maxDriveTime, setMaxDriveTime] = useState(120);
  const [minAltitude, setMinAltitude] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(2500);
  const [mapMode, setMapMode] = useState('2d');
  const [loading, setLoading] = useState(true);

  // 🎯 搜尋與篩選狀態
  const [searchName, setSearchName] = useState('');
  const [searchRegion, setSearchRegion] = useState('');
  
  // 📌 待確認名單 (收藏) 狀態
  const [bookmarkedCamps, setBookmarkedCamps] = useState(new Set());
  const [showOnlyBookmarked, setShowOnlyBookmarked] = useState(false);

  // 🎯 被選擇的營地物件
  const [selectedCamp, setSelectedCamp] = useState(null);

  // 🚀 網頁初次載入時，抓取一次營地資料即可
  useEffect(() => {
    async function fetchCampsites() {
      setLoading(true);
      
      const { data: campsitesData, error } = await supabase
        .from('campsites')
        .select('*');

      if (!error && campsitesData) {
        setCampsites(campsitesData);
      }
      setLoading(false);
    }

    fetchCampsites();
  }, []);

  const parseAltitudeNum = (altStr) => {
    if (!altStr) return 0;
    const match = altStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const parseDistanceNum = (distStr) => {
    if (!distStr) return 0;
    const match = distStr.match(/[\d\.]+/);
    return match ? parseFloat(match[0]) : 0;
  };

  // 🎯 1. 嚴格解析車程數字（將字串或 NULL 轉為真實數字）
  const getCampDriveInfo = (site) => {
    const rawMins = site[`drive_time_${originKey}`] ?? site.drive_time_mins;
    const mins = rawMins !== null && rawMins !== undefined ? Number(rawMins) : null;
    const dist = site[`distance_${originKey}`] ?? site.distance_km ?? '距離確認中';
    return { mins, dist };
  };

  // 🎯 切換待確認名單邏輯
  const toggleBookmark = (e, campId) => {
    e.stopPropagation();
    setBookmarkedCamps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(campId)) {
        newSet.delete(campId);
      } else {
        newSet.add(campId);
      }
      return newSet;
    });
  };

  // 🎯 2. 精準過濾邏輯：車程、海拔、名稱搜尋、地區搜尋、待確認名單
  const filteredCampsites = campsites.filter((site) => {
    const { mins } = getCampDriveInfo(site);
    
    // 🛡️ 只有真實數字且 <= maxDriveTime 的營地才能通過
    const driveOk = mins !== null && !isNaN(mins) && mins > 0 && mins <= maxDriveTime;
    
    // 🛡️ 海拔過濾
    const alt = parseAltitudeNum(site.altitude);
    const altOk = (site.altitude === '海拔未知' || !site.altitude) 
      ? true 
      : (alt >= minAltitude && alt <= maxAltitude);

    // 🛡️ 搜尋過濾
    const nameMatch = searchName ? (site.name || '').toLowerCase().includes(searchName.toLowerCase()) : true;
    const regionText = (site.location || site.region || site.address || '').toLowerCase();
    const regionMatch = searchRegion ? regionText.includes(searchRegion.toLowerCase()) : true;

    // 🛡️ 待確認名單過濾
    const bookmarkOk = showOnlyBookmarked ? bookmarkedCamps.has(site.id) : true;

    return driveOk && altOk && nameMatch && regionMatch && bookmarkOk;
  });

  const chartData = filteredCampsites
    .filter((site) => site.altitude)
    .map((site) => {
      const { mins, dist } = getCampDriveInfo(site);
      return {
        ...site,
        currentMins: mins,
        currentDist: dist,
        x: parseDistanceNum(dist),
        y: parseAltitudeNum(site.altitude),
      };
    });

  const handleSelectCamp = (camp) => {
    if (!camp) return;
    const targetCamp = camp.payload ? camp.payload : camp;
    setSelectedCamp(targetCamp);
  };

  // 🚀 精準直達與比對按鈕組件 (AI 智慧動態版)
  const renderActionButtons = (site) => {
    const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.name)}`;
    
    let mainActionBtn = null;

    if (site.booking_type === 'line') {
      const lineLink = site.booking_url || `https://line.me/R/ti/p/${site.line_id?.replace('@', '%40')}`;
      mainActionBtn = (
        <a href={lineLink} target="_blank" rel="noopener noreferrer" className="text-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          💬 加 LINE 預約 {site.line_id && `(${site.line_id})`}
        </a>
      );
    } 
    else if (['icamping', 'easycamp'].includes(site.booking_type) && site.booking_url) {
      mainActionBtn = (
        <a href={site.booking_url} target="_blank" rel="noopener noreferrer" className="text-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          🏕️ 前往平台線上訂位
        </a>
      );
    } 
    else if (site.booking_type === 'official_site' && site.booking_url) {
      mainActionBtn = (
        <a href={site.booking_url} target="_blank" rel="noopener noreferrer" className="text-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          🌐 前往官網預約
        </a>
      );
    } 
    else if (site.phone) {
      mainActionBtn = (
        <a href={`tel:${site.phone}`} className="text-center bg-rose-500 hover:bg-rose-600 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          📞 撥打電話預約
        </a>
      );
    } 
    else {
      const searchBookingUrl = `https://www.google.com/search?q=${encodeURIComponent(site.name + ' 露營 預約')}`;
      mainActionBtn = (
        <a href={searchBookingUrl} target="_blank" rel="noopener noreferrer" className="text-center bg-slate-600 hover:bg-slate-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          🔍 搜尋訂位資訊
        </a>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 mt-3 w-full">
        {mainActionBtn}
        <a href={googleMapUrl} target="_blank" rel="noopener noreferrer" className="text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          🗺️ Google 地圖
        </a>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-8 max-w-6xl mx-auto font-sans">
      {/* 頂部標題 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-2">
          <span>🏕️</span> 全台露營區即時 3D 地形與直達預約
        </h1>
        <div className="flex gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setShowOnlyBookmarked(!showOnlyBookmarked)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
              showOnlyBookmarked 
                ? 'bg-amber-100 text-amber-700 border-amber-300 shadow' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {showOnlyBookmarked ? '👈 返回完整列表' : `📌 檢視待確認清單 (${bookmarkedCamps.size})`}
          </button>
          <div className="bg-slate-200 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => setMapMode('2d')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mapMode === '2d' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
              }`}
            >
              🗺️ 2D 平面圖
            </button>
            <button
              onClick={() => setMapMode('3d')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mapMode === '3d' ? 'bg-blue-600 text-white shadow' : 'text-slate-600'
              }`}
            >
              ⛰️ 衛星高程圖
            </button>
          </div>
        </div>
      </div>

      {/* 控制面板 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 relative z-30">
        {/* 第一排：搜尋與出發地點 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              🔍 營地名稱搜尋：
            </label>
            <input
              type="text"
              placeholder="例如：馬雅竹軒"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-base rounded-xl p-3 font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              📍 地區 / 縣市搜尋：
            </label>
            <input
              type="text"
              placeholder="例如：新竹 或 五峰鄉"
              value={searchRegion}
              onChange={(e) => setSearchRegion(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-base rounded-xl p-3 font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              🚗 出發地點：
            </label>
            <select
              value={originKey}
              onChange={(e) => setOriginKey(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-base rounded-xl p-3 font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-inner cursor-pointer"
            >
              <option value="tainan">🌊 台南安平區</option>
              <option value="hsinchu">🚄 新竹高鐵站</option>
              <option value="taipei">🚆 台北車站</option>
              <option value="taichung">🚄 台中高鐵站</option>
            </select>
          </div>
        </div>

        {/* 第二排：數值滑桿 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-bold text-slate-700">⛰️ 海拔高度區間：</label>
              <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                {minAltitude} - {maxAltitude} m
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                  <span>最低海拔 (Min)</span>
                  <span>≥ {minAltitude} m</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2500"
                  step="50"
                  value={minAltitude}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val <= maxAltitude) setMinAltitude(val);
                  }}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                  <span>最高海拔 (Max)</span>
                  <span>≤ {maxAltitude} m</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2500"
                  step="50"
                  value={maxAltitude}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= minAltitude) setMaxAltitude(val);
                  }}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-700">⏳ {FIXED_ORIGINS[originKey]} 車程上限：</label>
              <span className="text-sm font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                {maxDriveTime} 分鐘
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="300"
              step="10"
              value={maxDriveTime}
              onChange={(e) => setMaxDriveTime(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-3"
            />
          </div>
        </div>
      </div>

      {/* 地圖模組 */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 mb-8 h-80 relative z-10">
        <MapWithNoSSR
          campsites={filteredCampsites}
          mapMode={mapMode}
          onSelectCampsite={handleSelectCamp}
          selectedCampId={selectedCamp?.id}
        />
      </div>

      {/* 散佈圖 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>📍</span> 營地分佈座標圖 (Y: 海拔高度 vs X: 開車距離)
          </h3>
          <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-md">
            👉 點擊點位檢視詳情與直達連結
          </span>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                type="number"
                dataKey="x"
                name="距離"
                unit=" km"
                label={{ value: `從 [${FIXED_ORIGINS[originKey]}] 開車距離 (公里)`, position: 'insideBottom', offset: -10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="海拔高度"
                unit="m"
                domain={['auto', 'auto']}
                label={{ value: '海拔高度 (公尺)', angle: -90, position: 'insideLeft', offset: -5 }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900/95 backdrop-blur text-white p-3.5 rounded-xl text-xs shadow-xl border border-slate-700">
                        <p className="font-bold text-sm text-amber-400 mb-1">
                          {bookmarkedCamps.has(data.id) ? '📌 ' : ''}{data.name}
                        </p>
                        <p>⛰️ 海拔高度: <strong className="text-emerald-300">{data.y} m</strong></p>
                        <p>🚗 車程距離: <strong>{data.currentMins ? `${data.currentMins} 分鐘` : '確認中'} ({data.currentDist})</strong></p>
                        <p className="mt-1 text-slate-300">💰 價格: {data.price_range || '以官網/訂位頁為準'}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter
                name="營地"
                data={chartData}
                onClick={handleSelectCamp}
                className="cursor-pointer"
              >
                {chartData.map((entry, index) => {
                  // 動態色彩：選取(橘色) > 收藏(紅色) > 預設(綠色)
                  let dotColor = '#059669';
                  if (bookmarkedCamps.has(entry.id)) dotColor = '#ef4444';
                  if (selectedCamp?.id === entry.id) dotColor = '#f59e0b';
                  
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={dotColor}
                      r={selectedCamp?.id === entry.id ? 9 : (bookmarkedCamps.has(entry.id) ? 7 : 5)}
                    />
                  );
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* 🎯 點擊後顯示的詳細資訊與直達按鈕 */}
        {selectedCamp && (
          <div className="mt-6 pt-6 border-t-2 border-dashed border-amber-300 bg-amber-50/50 p-6 rounded-2xl relative transition-all">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-black tracking-wide text-amber-800 bg-amber-200/80 px-3 py-1 rounded-full uppercase">
                🎯 已選擇營地詳細資訊
              </span>
              <button
                onClick={() => setSelectedCamp(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-sm"
              >
                ✕ 關閉預覽
              </button>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-200">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-black text-slate-900">{selectedCamp.name}</h2>
                    <button 
                      onClick={(e) => toggleBookmark(e, selectedCamp.id)}
                      className={`text-sm px-2 py-1 rounded border transition-colors ${
                        bookmarkedCamps.has(selectedCamp.id) ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {bookmarkedCamps.has(selectedCamp.id) ? '📌 已加入待確認' : '➕ 待確認'}
                    </button>
                  </div>
                  {selectedCamp.altitude && (
                    <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-md border border-sky-100">
                      ⛰️ {selectedCamp.altitude}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sm text-slate-600 mb-3">
                ⭐ Google 評分: {selectedCamp.rating || 4.5} | 🚗 從 {FIXED_ORIGINS[originKey]} 出發車程: 約 {getCampDriveInfo(selectedCamp).mins || '確認中'} 分鐘 ({getCampDriveInfo(selectedCamp).dist})
              </p>

              <div className="bg-slate-50 p-3 rounded-xl mb-3 border border-slate-100 flex flex-wrap justify-between items-center text-xs font-semibold text-slate-700 gap-2">
                <span>💰 價格資訊: <strong className="text-emerald-600">{selectedCamp.price_range || '以官網/訂位頁為準'}</strong></span>
                <span>📞 電話: <strong className="text-blue-600">{selectedCamp.phone || '請洽官網/粉絲專頁'}</strong></span>
              </div>

              {/* 👍👎 AI 優缺點標籤 (僅在有資料時顯示) */}
              {((selectedCamp.pros && selectedCamp.pros.length > 0) || (selectedCamp.cons && selectedCamp.cons.length > 0)) && (
                <div className="space-y-2 pt-2 border-t border-slate-100 mb-3">
                  {selectedCamp.pros && selectedCamp.pros.length > 0 && (
                    <div>
                      <span className="text-xs font-bold text-slate-500 block mb-1">👍 AI 整理優點：</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCamp.pros.map((pro, i) => (
                          <span
                            key={i}
                            className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-0.5 rounded-md border border-emerald-100"
                          >
                            {pro}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCamp.cons && selectedCamp.cons.length > 0 && (
                    <div className="mt-1">
                      <span className="text-xs font-bold text-slate-500 block mb-1">👎 AI 整理缺點：</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCamp.cons.map((con, i) => (
                          <span
                            key={i}
                            className="text-xs bg-rose-50 text-rose-700 font-medium px-2.5 py-0.5 rounded-md border border-rose-100"
                          >
                            {con}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 🔗 一鍵直達按鈕組 */}
              {renderActionButtons(selectedCamp)}
            </div>
          </div>
        )}
      </div>

      {/* 📋 營地卡片區域 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-900">
          {showOnlyBookmarked ? '📌 我的待確認清單' : '🏕️ 營地清單'} (共 {filteredCampsites.length} 個符合條件)
        </h3>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 font-medium">🔄 載入營地資料中...</div>
      ) : filteredCampsites.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500">
          😔 沒有找到符合篩選條件的營地。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {filteredCampsites.map((site) => {
            const { mins, dist } = getCampDriveInfo(site);
            const isBookmarked = bookmarkedCamps.has(site.id);

            return (
              <div
                key={site.id}
                className={`bg-white p-6 rounded-2xl shadow-sm border transition-all flex flex-col justify-between ${
                  selectedCamp?.id === site.id 
                    ? 'border-2 border-amber-500 shadow-md ring-2 ring-amber-200' 
                    : isBookmarked ? 'border-2 border-rose-300 bg-rose-50/30' : 'border-slate-200 hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{site.name}</h2>
                      {site.altitude && (
                        <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-md border border-sky-100">
                          ⛰️ {site.altitude}
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={(e) => toggleBookmark(e, site.id)}
                      className={`text-xl transition-transform hover:scale-110 ${isBookmarked ? 'text-rose-500' : 'text-slate-300 grayscale opacity-50'}`}
                      title="加入/移除待確認名單"
                    >
                      {isBookmarked ? '📌' : '➕'}
                    </button>
                  </div>

                  <p className="text-sm text-slate-600 mb-3">
                    ⭐ Google 評分: {site.rating || 4.5} | 🚗 車程: {mins ? `約 ${mins} 分鐘` : '確認中'} ({dist})
                  </p>

                  <div className="bg-slate-50 p-3 rounded-xl mb-3 border border-slate-100 flex flex-wrap justify-between items-center text-xs font-semibold text-slate-700 gap-2">
                    <span>💰 價格: <strong className="text-emerald-600">{site.price_range || '以官網/訂位頁為準'}</strong></span>
                    <span>📞 電話: <strong className="text-blue-600">{site.phone || '請洽官網/粉絲專頁'}</strong></span>
                  </div>

                  {/* 👍👎 AI 優缺點標籤 (僅在有資料時顯示) */}
                  {((site.pros && site.pros.length > 0) || (site.cons && site.cons.length > 0)) && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 mb-2">
                      {site.pros && site.pros.length > 0 && (
                        <div>
                          <span className="text-xs font-bold text-slate-500 block mb-1">👍 AI 整理優點：</span>
                          <div className="flex flex-wrap gap-1.5">
                            {site.pros.map((pro, i) => (
                              <span
                                key={i}
                                className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-0.5 rounded-md border border-emerald-100"
                              >
                                {pro}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {site.cons && site.cons.length > 0 && (
                        <div className="mt-1">
                          <span className="text-xs font-bold text-slate-500 block mb-1">👎 AI 整理缺點：</span>
                          <div className="flex flex-wrap gap-1.5">
                            {site.cons.map((con, i) => (
                              <span
                                key={i}
                                className="text-xs bg-rose-50 text-rose-700 font-medium px-2.5 py-0.5 rounded-md border border-rose-100"
                              >
                                {con}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 🔗 直達與比對按鈕組 */}
                <div className="pt-3 border-t border-slate-100 mt-2">
                  <span className="text-xs font-bold text-slate-500 block mb-1">🔗 1秒直達價目與訂位專區：</span>
                  {renderActionButtons(site)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 📋 下方營地快速對照表 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-12">
        <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 text-sm">
          📋 營地快速預約對照表
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                <th className="p-3.5 font-bold">營地名稱</th>
                <th className="p-3.5 font-bold">真實海拔</th>
                <th className="p-3.5 font-bold">車程 / 距離 ({FIXED_ORIGINS[originKey]})</th>
                <th className="p-3.5 font-bold">價格資訊</th>
                <th className="p-3.5 font-bold">一鍵直達連結</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCampsites.map((site) => {
                const { mins, dist } = getCampDriveInfo(site);
                const isBookmarked = bookmarkedCamps.has(site.id);
                return (
                  <tr
                    key={site.id}
                    className={`transition-colors ${
                      selectedCamp?.id === site.id ? 'bg-amber-50 font-medium' : isBookmarked ? 'bg-rose-50/50' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                      <button 
                        onClick={(e) => toggleBookmark(e, site.id)}
                        className={`text-lg transition-transform ${isBookmarked ? 'text-rose-500' : 'text-slate-300 grayscale opacity-50'}`}
                      >
                        {isBookmarked ? '📌' : '➕'}
                      </button>
                      {site.name}
                    </td>
                    <td className="p-3.5 text-slate-600">{site.altitude || '標示中'}</td>
                    <td className="p-3.5 text-slate-600">{mins ? `${mins} 分鐘` : '確認中'} ({dist})</td>
                    <td className="p-3.5 text-emerald-600 font-medium">{site.price_range || '以官網/訂位頁為準'}</td>
                    <td className="p-3.5">
                      {renderActionButtons(site)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
