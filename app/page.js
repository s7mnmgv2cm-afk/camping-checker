'use client';

import { useState, useEffect } from 'react';
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

// 📍 出發點對應的限制縣市 (非 VIP 專用)
const ORIGIN_REGION_MAP = {
  tainan: ['台南'],
  hsinchu: ['新竹'],
  taipei: ['台北', '新北'],
  taichung: ['台中', '南投', '苗栗', '彰化'] // 台中附近也可以開放一點點，或者嚴格只給台中。嚴格遵守 user：同縣市
};

// 修正：嚴格遵守「同縣市」
const STRICT_ORIGIN_REGION_MAP = {
  tainan: ['台南'],
  hsinchu: ['新竹'],
  taipei: ['台北', '新北'],
  taichung: ['台中']
};

const POPULAR_TAGS = ['大草皮', '少帳包區', '雲海', '夜景', '乾濕分離', '無小黑蚊', '有餐點外送服務'];

export default function Home() {
  const [campsites, setCampsites] = useState([]);
  const [originKey, setOriginKey] = useState('tainan');
  const [maxDriveTime, setMaxDriveTime] = useState(90);
  const [minAltitude, setMinAltitude] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(2500);
  const [mapMode, setMapMode] = useState('2d');
  const [loading, setLoading] = useState(false);
  const [isNightDrive, setIsNightDrive] = useState(false);

  const [selectedTags, setSelectedTags] = useState(new Set());
  const [sortBy, setSortBy] = useState('bookmark_first');
  const [showCompareModal, setShowCompareModal] = useState(false);

  // 🎯 搜尋與篩選狀態
  const [searchName, setSearchName] = useState('');
  const [searchRegion, setSearchRegion] = useState('');
  const [apiKey, setApiKey] = useState(''); // 隱藏的 VIP 金鑰狀態
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // 📌 待確認名單 (收藏) 狀態
  const [bookmarkedCamps, setBookmarkedCamps] = useState(new Set());
  const [showOnlyBookmarked, setShowOnlyBookmarked] = useState(false);

  // 🎯 被選擇的營地物件
  const [selectedCamp, setSelectedCamp] = useState(null);
  const [showOnlySelectedMap, setShowOnlySelectedMap] = useState(false);

  const handleSearch = async () => {
    // 🎁 彩蛋：如果在名稱輸入 VIP 密碼，解鎖隱藏模式
    if (searchName.trim().toLowerCase() === 'camp888') {
      setApiKey('camp888');
      setSearchName('');
      alert('🎉 VIP 模式已解鎖！您現在可以使用無限制的車程搜尋，且享有更高搜尋額度！');
      return;
    }

    setLoading(true);
    setCurrentPage(1); // 搜尋時重置頁碼
    try {
      const params = new URLSearchParams();
      if (searchName) params.append('searchName', searchName);
      if (searchRegion) params.append('searchRegion', searchRegion);
      if (apiKey) params.append('key', apiKey);
      if (originKey) params.append('originKey', originKey);

      const queryString = params.toString();
      const res = await fetch('/api/campsites?' + queryString);
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || '搜尋失敗，請稍後再試。');
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      setCampsites(data);
    } catch (err) {
      console.error(err);
      alert('發生錯誤');
    }
    setLoading(false);
  };

  const parseAltitudeNum = (altStr) => {
    if (!altStr || altStr === '海拔未知') return 0;
    const match = altStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  // 當選擇的出發地改變時，自動重新向後端請求資料（因為後端會根據出發地限制回傳範圍）
  useEffect(() => {
    handleSearch();
  }, [originKey]);

  const parseDistanceNum = (distStr) => {
    if (!distStr) return 0;
    const match = distStr.match(/[\d\.]+/);
    return match ? parseFloat(match[0]) : 0;
  };

  const getCampDriveInfo = (site) => {
    const fieldKey = isNightDrive ? `drive_time_${originKey}_fri` : `drive_time_${originKey}`;
    const rawMins = site[fieldKey] ?? site.drive_time_mins;
    const mins = rawMins !== null && rawMins !== undefined ? Number(rawMins) : null;
    const dist = site[`distance_${originKey}`] ?? site.distance_km ?? '距離確認中';
    return { mins, dist };
  };

  const toggleBookmark = (e, campId) => {
    if (e) e.stopPropagation();
    setBookmarkedCamps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(campId)) newSet.delete(campId);
      else newSet.add(campId);
      return newSet;
    });
  };

  const toggleTag = (tag) => {
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) newSet.delete(tag);
      else newSet.add(tag);
      return newSet;
    });
  };

  const applyPreset = (preset) => {
    setSelectedTags(new Set());
    if (preset === 'summer') {
      setMinAltitude(800);
      setMaxAltitude(2500);
      setMaxDriveTime(apiKey === 'camp888' ? 300 : 90);
    } else if (preset === 'family') {
      setMinAltitude(0);
      setMaxAltitude(2500);
      setMaxDriveTime(60);
      setSelectedTags(new Set(['大草皮']));
    } else if (preset === 'view') {
      setMinAltitude(500);
      setMaxAltitude(2500);
      setMaxDriveTime(apiKey === 'camp888' ? 300 : 90);
      setSelectedTags(new Set(['雲海']));
    } else if (preset === 'reset') {
      setMinAltitude(0);
      setMaxAltitude(2500);
      setMaxDriveTime(apiKey === 'camp888' ? 300 : 90);
    }
  };

  // 🎯 1. 基礎過濾邏輯
  const filteredCampsites = campsites.filter((site) => {
    const { mins } = getCampDriveInfo(site);
    const driveOk = (mins === null || isNaN(mins) || mins === 0) ? true : (mins <= maxDriveTime);
    const alt = parseAltitudeNum(site.altitude);
    const altOk = (site.altitude === '海拔未知' || !site.altitude) ? true : (alt >= minAltitude && alt <= maxAltitude);
    const nameMatch = searchName ? (site.name || '').toLowerCase().includes(searchName.toLowerCase()) : true;
    const regionText = `${site.region || ''} ${site.location || ''} ${site.address || ''}`.toLowerCase();
    const regionMatch = searchRegion ? regionText.includes(searchRegion.toLowerCase()) : true;
    const bookmarkOk = showOnlyBookmarked ? bookmarkedCamps.has(site.id) : true;

    // 🔒 非 VIP 只能搜尋跟出發地同縣市
    let originRegionOk = true;
    if (apiKey !== 'camp888') {
      const allowedRegions = STRICT_ORIGIN_REGION_MAP[originKey] || [];
      originRegionOk = allowedRegions.some(r => regionText.includes(r));
    }

    const tagsOk = selectedTags.size === 0 || Array.from(selectedTags).every(tag => {
      const textToSearch = `${site.name || ''} ${(site.pros || []).join(' ')} ${(site.cons || []).join(' ')}`.toLowerCase();
      return textToSearch.includes(tag.toLowerCase());
    });

    return driveOk && altOk && nameMatch && regionMatch && bookmarkOk && originRegionOk && tagsOk;
  });

  // 當過濾條件改變時，自動回到第一頁
  useEffect(() => {
    setCurrentPage(1);
  }, [campsites, originKey, maxDriveTime, minAltitude, maxAltitude, searchName, searchRegion, showOnlyBookmarked]);

  // 🎯 2. 智慧排序邏輯
  const sortedFilteredCampsites = [...filteredCampsites].sort((a, b) => {
    const aBookmarked = bookmarkedCamps.has(a.id) ? 1 : 0;
    const bBookmarked = bookmarkedCamps.has(b.id) ? 1 : 0;
    if (aBookmarked !== bBookmarked) return bBookmarked - aBookmarked;

    if (sortBy === 'rating_desc') {
      return (b.rating || 0) - (a.rating || 0);
    } else if (sortBy === 'drive_time_asc') {
      const aMins = getCampDriveInfo(a).mins || 999;
      const bMins = getCampDriveInfo(b).mins || 999;
      return aMins - bMins;
    } else if (sortBy === 'altitude_desc') {
      return parseAltitudeNum(b.altitude) - parseAltitudeNum(a.altitude);
    } else if (sortBy === 'altitude_asc') {
      return parseAltitudeNum(a.altitude) - parseAltitudeNum(b.altitude);
    }
    return 0;
  });

  const chartData = sortedFilteredCampsites
    .filter((site) => site.altitude)
    .map((site) => {
      const { mins, dist } = getCampDriveInfo(site);
      return { ...site, currentMins: mins, currentDist: dist, x: parseDistanceNum(dist), y: parseAltitudeNum(site.altitude) };
    });

  // 🎯 3. 分頁邏輯
  const totalPages = Math.max(1, Math.ceil(sortedFilteredCampsites.length / itemsPerPage));
  const currentCampsites = sortedFilteredCampsites.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSelectCamp = (camp) => {
    if (!camp) return;
    const targetCamp = camp.payload ? camp.payload : camp;
    setSelectedCamp(targetCamp);
  };

  const handleGenerateAIPrompt = () => {
    const currentMonth = new Date().getMonth() + 1;
    let season = '';
    if (currentMonth >= 3 && currentMonth <= 5) season = '春季';
    else if (currentMonth >= 6 && currentMonth <= 8) season = '夏季';
    else if (currentMonth >= 9 && currentMonth <= 11) season = '秋季';
    else season = '冬季';

    // 擷取目前篩選出來的營地名稱（最多 5~10 個以免過長）
    const topCamps = sortedFilteredCampsites.slice(0, 10).map(c => c.name).join(', ');

    const query = `現在是台灣 ${currentMonth}月 (${season})，請幫我分析以下露營地的氣候、適合的海拔以及近期可觀察的生態，推薦最適合現在出發的：${topCamps}`;

    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", query);
    url.searchParams.set("udm", "50"); // 觸發 Google AI 總結/特定視圖
    url.searchParams.set("hl", "zh-TW");
    
    window.open(url.toString(), '_blank');
  };

  const renderActionButtons = (site) => {
    const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.name)}`;
    
    // 🤖 讓使用者點擊按鈕直接進入 Gemini 得到營地評價
    const promptText = `請根據網路上最新的真實評價，告訴我「${site.name} ${site.region || ''} ${site.location || ''}」這間露營區的：\n1. 衛浴設備的好壞與乾淨程度\n2. 營位（或草地/雨棚）的實際狀況\n3. 營地大小\n4. 適合小孩玩嗎?\n5. 可以生火嗎?\n6. 未來三個月此營區氣候狀態, 早上和夜間溫度\n7. 綜合優缺點\n\n⚠️ 請務必基於真實網友回饋，不可捏造資訊。`;
    const aiLink = `https://gemini.google.com/app?q=${encodeURIComponent(promptText)}`;

    let btns = [];
    
    // 如果有 booking_url，依據換行符號切割支援多個網址
    if (site.booking_url) {
      const urls = site.booking_url.split('\n').map(u => u.trim()).filter(Boolean);
      const uniqueUrls = Array.from(new Set(urls));
      
      const typeCounts = {};
      const btnConfigs = uniqueUrls.map(url => {
        let type = 'other';
        let baseText = '🏕️ 前往平台線上訂位';
        
        if (url.includes('icamping')) { type = 'icamping'; baseText = '🏕️ 前往 愛露營 訂位'; }
        else if (url.includes('easycamp')) { type = 'easycamp'; baseText = '🏕️ 前往 露營樂 訂位'; }
        else if (url.includes('asiacamp')) { type = 'asiacamp'; baseText = '🏕️ 前往 AsiaCamp 訂位'; }
        else if (url.includes('campingdaddy')) { type = 'campingdaddy'; baseText = '🏕️ 前往 露營老爹 訂位'; }
        else if (site.booking_type === 'line' || url.includes('line.me')) { type = 'line'; baseText = '💬 加 LINE 預約'; }
        else if (site.booking_type === 'official_site') { type = 'official'; baseText = '🌐 前往官網預約'; }
        
        typeCounts[type] = (typeCounts[type] || 0) + 1;
        return { url, type, baseText };
      });
      
      const typeCurrent = {};
      btnConfigs.forEach((config, idx) => {
        typeCurrent[config.type] = (typeCurrent[config.type] || 0) + 1;
        let btnText = config.baseText;
        if (typeCounts[config.type] > 1) {
          btnText += ` (${typeCurrent[config.type]})`;
        }
        
        btns.push(
          <a key={`booking-${idx}`} href={config.url} target="_blank" rel="noopener noreferrer" className="text-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
            {btnText}
          </a>
        );
      });
    } else if (site.booking_type === 'line' && site.line_id) {
      const lineLink = `https://line.me/R/ti/p/${site.line_id.replace('@', '%40')}`;
      btns.push(
        <a key="line" href={lineLink} target="_blank" rel="noopener noreferrer" className="text-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          💬 加 LINE 預約 ({site.line_id})
        </a>
      );
    } else if (site.phone) {
      btns.push(
        <a key="phone" href={`tel:${site.phone}`} className="text-center bg-rose-500 hover:bg-rose-600 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          📞 撥打電話預約
        </a>
      );
    } else {
      const searchBookingUrl = `https://www.google.com/search?q=${encodeURIComponent(site.name + ' 露營 預約')}`;
      btns.push(
        <a key="search" href={searchBookingUrl} target="_blank" rel="noopener noreferrer" className="text-center bg-slate-600 hover:bg-slate-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          🔍 搜尋訂位資訊
        </a>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 mt-3 w-full">
        <a href={aiLink} target="_blank" rel="noopener noreferrer" className="col-span-2 text-center bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">🤖 Google AI 營地評價與摘要</a>
        {btns}
        <a href={googleMapUrl} target="_blank" rel="noopener noreferrer" className="text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">🗺️ Google 地圖</a>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-8 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-2">
          <span>🏕️</span> 台灣露營地研究中心
        </h1>
        <div className="flex gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={handleGenerateAIPrompt}
            className="px-4 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 border bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-transparent"
          >
            🤖 Google AI 即時分析推薦
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowOnlyBookmarked(!showOnlyBookmarked)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                showOnlyBookmarked ? 'bg-amber-100 text-amber-700 border-amber-300 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showOnlyBookmarked ? '👈 返回完整列表' : `📌 檢視待確認清單 (${bookmarkedCamps.size})`}
            </button>
            {bookmarkedCamps.size > 0 && (
              <button
                onClick={() => {
                  setBookmarkedCamps(new Set());
                  setShowOnlyBookmarked(false);
                }}
                className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all border bg-white text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                title="清空待確認清單"
              >
                🗑️ 清空
              </button>
            )}
          </div>
          <div className="bg-slate-200 p-1 rounded-xl flex gap-1">
            <button onClick={() => setMapMode('2d')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${mapMode === '2d' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>🗺️ 2D 平面圖</button>
            <button onClick={() => setMapMode('3d')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${mapMode === '3d' ? 'bg-blue-600 text-white shadow' : 'text-slate-600'}`}>⛰️ 衛星高程圖</button>
          </div>
        </div>
      </div>

      {/* 🎯 快速情境預設集 */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-sm font-bold text-slate-700 mr-2">🎯 快速情境：</span>
        <button onClick={() => applyPreset('summer')} className="px-3 py-1.5 text-xs font-bold rounded-full bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors">🌲 夏天避暑聖地</button>
        <button onClick={() => applyPreset('family')} className="px-3 py-1.5 text-xs font-bold rounded-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors">👶 親子輕鬆露</button>
        <button onClick={() => applyPreset('view')} className="px-3 py-1.5 text-xs font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors">☁️ 我要看大景</button>
        <button onClick={() => applyPreset('reset')} className="px-3 py-1.5 text-xs font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors">🔄 重置條件</button>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 relative z-30">
        
        {/* 🏷️ 熱門標籤 */}
        <div className="mb-6 pb-4 border-b border-slate-100">
          <label className="block text-sm font-bold text-slate-700 mb-2">🏷️ 熱門特色標籤 (可複選)：</label>
          <div className="flex flex-wrap gap-2">
            {POPULAR_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                  selectedTags.has(tag) 
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {selectedTags.has(tag) ? '✓ ' : '+ '}{tag}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">🔍 營地名稱：</label>
            <input type="text" placeholder="例如：馬雅竹軒" value={searchName} onChange={(e) => setSearchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-base rounded-xl p-3 font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">📍 地區 / 縣市：</label>
            <input type="text" placeholder="例如：新竹 或 五峰鄉" value={searchRegion} onChange={(e) => setSearchRegion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-base rounded-xl p-3 font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" />
          </div>
          <div className="flex flex-col justify-end">
            {apiKey === 'camp888' ? (
              <div className="bg-gradient-to-r from-amber-200 to-yellow-400 text-amber-900 font-bold p-3 rounded-xl shadow-sm border border-amber-300 flex items-center justify-center gap-2 h-[50px]">
                👑 VIP 模式已啟用
              </div>
            ) : (
              <div className="bg-slate-100 text-slate-500 text-xs p-3 rounded-xl border border-slate-200 flex flex-col justify-center h-[50px]">
                💡 想獲得更豐富的功能與進階使用？請與網頁設計人員聯絡！
              </div>
            )}
          </div>
          <div className="flex items-end">
            <button 
              onClick={handleSearch} 
              disabled={loading}
              className={`w-full ${loading ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'} text-white text-base rounded-xl p-3 font-bold shadow transition-colors h-[50px]`}
            >
              {loading ? '⏳ 搜尋中...' : '🚀 立即搜尋'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-bold text-slate-700">🚗 出發地點：</label>
              <button
                onClick={() => setIsNightDrive(!isNightDrive)}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all border ${
                  isNightDrive 
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' 
                    : 'bg-amber-50 text-amber-700 border-amber-300 shadow-sm hover:bg-amber-100'
                }`}
              >
                {isNightDrive ? '🌙 週五夜衝' : '☀️ 週末早衝'}
              </button>
            </div>
            <select value={originKey} onChange={(e) => setOriginKey(e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-base rounded-xl p-3 font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-inner cursor-pointer">
              <option value="tainan">🌊 台南安平區</option>
              <option value="hsinchu">🚄 新竹高鐵站</option>
              <option value="taipei">🚆 台北車站</option>
              <option value="taichung">🚄 台中高鐵站</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-bold text-slate-700">⛰️ 海拔高度區間：</label>
              <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">{minAltitude} - {maxAltitude} m</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1"><span>最低海拔 (Min)</span><span>≥ {minAltitude} m</span></div>
                <input type="range" min="0" max="2500" step="50" value={minAltitude} onChange={(e) => { const val = Number(e.target.value); if (val <= maxAltitude) setMinAltitude(val); }} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600" />
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1"><span>最高海拔 (Max)</span><span>≤ {maxAltitude} m</span></div>
                <input type="range" min="0" max="2500" step="50" value={maxAltitude} onChange={(e) => { const val = Number(e.target.value); if (val >= minAltitude) setMaxAltitude(val); }} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600" />
              </div>
            </div>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-700">⏳ {FIXED_ORIGINS[originKey]} 車程上限：</label>
              <span className="text-sm font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                {maxDriveTime === (apiKey === 'camp888' ? 300 : 90) ? `${maxDriveTime} 分鐘 (無上限)` : `${maxDriveTime} 分鐘`}
              </span>
            </div>
            <input 
              type="range" 
              min="20" 
              max={apiKey === 'camp888' ? 300 : 90} 
              step="10" 
              value={maxDriveTime} 
              onChange={(e) => setMaxDriveTime(Number(e.target.value))} 
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-3" 
            />
            {apiKey !== 'camp888' && (
              <p className="text-xs text-slate-500 mt-2">💡 一般使用者最高限制 1.5 小時 (90 分鐘)，且僅能查看出發地所在縣市之營地。</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-8 overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center z-20 relative">
          <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">🗺️ 地圖預覽</span>
          <div className="flex items-center gap-3">
            {bookmarkedCamps.size > 0 && (
              <label className="flex items-center gap-1.5 text-xs font-bold text-rose-700 cursor-pointer bg-rose-100 hover:bg-rose-200 px-3 py-1.5 rounded-lg transition-colors border border-rose-300">
                <input 
                  type="checkbox" 
                  checked={showOnlySelectedMap} 
                  onChange={(e) => setShowOnlySelectedMap(e.target.checked)} 
                  className="w-3.5 h-3.5 accent-rose-600 rounded cursor-pointer" 
                />
                📌 地圖僅顯示待確認名單 ({bookmarkedCamps.size})
              </label>
            )}
          </div>
        </div>
        <div className="h-80 relative z-10 w-full">
          <MapWithNoSSR 
            campsites={showOnlySelectedMap && bookmarkedCamps.size > 0 ? sortedFilteredCampsites.filter(site => bookmarkedCamps.has(site.id)) : sortedFilteredCampsites} 
            mapMode={mapMode} 
            onSelectCampsite={handleSelectCamp} 
            selectedCampId={selectedCamp?.id} 
          />
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><span>📍</span> 營地分佈座標圖 (Y: 海拔 vs X: 車程距離)</h3>
          <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-md">👉 點擊點位檢視詳情</span>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" dataKey="x" name="距離" unit=" km" label={{ value: `從 [${FIXED_ORIGINS[originKey]}] 開車距離 (公里)`, position: 'insideBottom', offset: -10 }} />
              <YAxis type="number" dataKey="y" name="海拔" unit="m" domain={['auto', 'auto']} label={{ value: '海拔高度 (公尺)', angle: -90, position: 'insideLeft', offset: -5 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                if (payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-slate-900/95 backdrop-blur text-white p-3.5 rounded-xl text-xs shadow-xl border border-slate-700">
                      <p className="font-bold text-sm text-amber-400 mb-1">{bookmarkedCamps.has(data.id) ? '📌 ' : ''}{data.name}</p>
                      <p>⛰️ 海拔高度: <strong className="text-emerald-300">{data.y} m</strong></p>
                      <p>🚗 車程距離: <strong>{data.currentMins ? `${data.currentMins} 分鐘` : '確認中'} ({data.currentDist})</strong></p>
                    </div>
                  );
                }
                return null;
              }} />
              <Scatter name="營地" data={chartData} onClick={handleSelectCamp} className="cursor-pointer">
                {chartData.map((entry, index) => {
                  let dotColor = '#059669';
                  if (bookmarkedCamps.has(entry.id)) dotColor = '#ef4444';
                  if (selectedCamp?.id === entry.id) dotColor = '#f59e0b';
                  return <Cell key={`cell-${index}`} fill={dotColor} r={selectedCamp?.id === entry.id ? 9 : (bookmarkedCamps.has(entry.id) ? 7 : 5)} />;
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {selectedCamp && (
          <div className="mt-6 pt-6 border-t-2 border-dashed border-amber-300 bg-amber-50/50 p-6 rounded-2xl relative transition-all">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-black tracking-wide text-amber-800 bg-amber-200/80 px-3 py-1 rounded-full uppercase">🎯 已選擇營地詳細資訊</span>
              <button onClick={() => setSelectedCamp(null)} className="text-xs font-bold text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-sm">✕ 關閉預覽</button>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-200">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-black text-slate-900">{selectedCamp.name}</h2>
                    <button onClick={(e) => toggleBookmark(e, selectedCamp.id)} className={`text-sm px-2 py-1 rounded border transition-colors ${bookmarkedCamps.has(selectedCamp.id) ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>
                      {bookmarkedCamps.has(selectedCamp.id) ? '📌 已加入待確認' : '➕ 待確認'}
                    </button>
                  </div>
                  {selectedCamp.altitude && <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-md border border-sky-100">⛰️ {selectedCamp.altitude}</span>}
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">⭐ Google 評分: {selectedCamp.rating || 4.5} | 🚗 車程: 約 {getCampDriveInfo(selectedCamp).mins || '確認中'} 分鐘 ({getCampDriveInfo(selectedCamp).dist})</p>
              <div className="bg-slate-50 p-3 rounded-xl mb-3 border border-slate-100 flex flex-wrap justify-between items-center text-xs font-semibold text-slate-700 gap-2">
                <span>📞 電話: <strong className="text-blue-600">{selectedCamp.phone || '請洽官網/粉絲專頁'}</strong></span>
              </div>
              {((selectedCamp.pros && selectedCamp.pros.length > 0) || (selectedCamp.cons && selectedCamp.cons.length > 0)) && (
                <div className="space-y-2 pt-2 border-t border-slate-100 mb-3">
                  {selectedCamp.pros && selectedCamp.pros.length > 0 && (
                    <div>
                      <span className="text-xs font-bold text-slate-500 block mb-1">👍 AI 整理優點：</span>
                      <div className="flex flex-wrap gap-1.5">{selectedCamp.pros.map((pro, i) => <span key={i} className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-0.5 rounded-md border border-emerald-100">{pro}</span>)}</div>
                    </div>
                  )}
                  {selectedCamp.cons && selectedCamp.cons.length > 0 && (
                    <div className="mt-1">
                      <span className="text-xs font-bold text-slate-500 block mb-1">👎 AI 整理缺點：</span>
                      <div className="flex flex-wrap gap-1.5">{selectedCamp.cons.map((con, i) => <span key={i} className="text-xs bg-rose-50 text-rose-700 font-medium px-2.5 py-0.5 rounded-md border border-rose-100">{con}</span>)}</div>
                    </div>
                  )}
                </div>
              )}
              {renderActionButtons(selectedCamp)}
            </div>
          </div>
        )}
      </div>

      {/* 📋 營地卡片區域 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-4 gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            {showOnlyBookmarked ? '📌 我的待確認清單' : '🏕️ 營地清單'} (共 {sortedFilteredCampsites.length} 個符合條件)
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-700">排序方式：</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2 py-1.5 font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
            >
              <option value="bookmark_first">預設 (待確認優先)</option>
              <option value="rating_desc">⭐ 評分由高至低</option>
              <option value="drive_time_asc">🚗 車程由近到遠</option>
              <option value="altitude_desc">⛰️ 海拔由高至低</option>
              <option value="altitude_asc">⛰️ 海拔由低至高</option>
            </select>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {bookmarkedCamps.size >= 2 && (
            <button
              onClick={() => setShowCompareModal(true)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all border bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-violet-700 shadow hover:from-violet-700 hover:to-fuchsia-700 flex items-center gap-1"
            >
              ⚖️ 營地大 PK ({bookmarkedCamps.size})
            </button>
          )}
          <button
            onClick={() => setShowOnlyBookmarked(!showOnlyBookmarked)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
              showOnlyBookmarked 
                ? 'bg-amber-100 text-amber-700 border-amber-300 shadow' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {showOnlyBookmarked ? '顯示全部結果' : '過濾：只顯示待確認 📌'}
          </button>
          {bookmarkedCamps.size > 0 && (
            <button
              onClick={() => {
                setBookmarkedCamps(new Set());
                setShowOnlyBookmarked(false);
              }}
              className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all border bg-white text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              🗑️ 清空名單
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 font-medium">🔄 載入營地資料中...</div>
      ) : sortedFilteredCampsites.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500">
          😔 沒有找到符合篩選條件的營地。
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {currentCampsites.map((site) => {
              const { mins, dist } = getCampDriveInfo(site);
              const isBookmarked = bookmarkedCamps.has(site.id);

              return (
                <div
                  key={site.id}
                  className={`bg-white p-6 rounded-2xl shadow-sm border transition-all flex flex-col justify-between ${
                    selectedCamp?.id === site.id 
                      ? 'border-2 border-amber-500 shadow-md ring-2 ring-amber-200' 
                      : isBookmarked ? 'border-2 border-rose-300 bg-rose-50' : 'border-slate-200 hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{site.name}</h2>
                        {site.altitude && <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-md border border-sky-100">⛰️ {site.altitude}</span>}
                      </div>
                      <button 
                        onClick={(e) => toggleBookmark(e, site.id)}
                        className={`text-2xl transition-transform hover:scale-110 ${isBookmarked ? 'text-rose-500' : 'text-slate-300 grayscale opacity-50'}`}
                        title="加入/移除待確認名單"
                      >
                        {isBookmarked ? '📌' : '➕'}
                      </button>
                    </div>
                    <p className="text-sm text-slate-600 mb-3">⭐ Google 評分: {site.rating || 4.5} | 🚗 車程: {mins ? `約 ${mins} 分鐘` : '確認中'} ({dist})</p>
                    <div className="bg-slate-50 p-3 rounded-xl mb-3 border border-slate-100 flex flex-wrap justify-between items-center text-xs font-semibold text-slate-700 gap-2">
                      <span>📞 電話: <strong className="text-blue-600">{site.phone || '請洽官網/粉絲專頁'}</strong></span>
                    </div>
                    {((site.pros && site.pros.length > 0) || (site.cons && site.cons.length > 0)) && (
                      <div className="space-y-2 pt-2 border-t border-slate-100 mb-2">
                        {site.pros && site.pros.length > 0 && (
                          <div>
                            <span className="text-xs font-bold text-slate-500 block mb-1">👍 AI 整理優點：</span>
                            <div className="flex flex-wrap gap-1.5">{site.pros.map((pro, i) => <span key={i} className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-0.5 rounded-md border border-emerald-100">{pro}</span>)}</div>
                          </div>
                        )}
                        {site.cons && site.cons.length > 0 && (
                          <div className="mt-1">
                            <span className="text-xs font-bold text-slate-500 block mb-1">👎 AI 整理缺點：</span>
                            <div className="flex flex-wrap gap-1.5">{site.cons.map((con, i) => <span key={i} className="text-xs bg-rose-50 text-rose-700 font-medium px-2.5 py-0.5 rounded-md border border-rose-100">{con}</span>)}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-slate-100 mt-2">
                    <span className="text-xs font-bold text-slate-500 block mb-1">🔗 1秒直達價目與訂位專區：</span>
                    {renderActionButtons(site)}
                  </div>
                </div>
              );
            })}
          </div>

        </>
      )}

      {/* 📋 下方營地快速對照表 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-12">
        <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 text-sm">
          📋 營地快速預約對照表 (待確認清單會自動置頂)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                <th className="p-3.5 font-bold">營地名稱</th>
                <th className="p-3.5 font-bold">真實海拔</th>
                <th className="p-3.5 font-bold">車程 / 距離 ({FIXED_ORIGINS[originKey]})</th>
                <th className="p-3.5 font-bold">一鍵直達連結</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentCampsites.map((site) => {
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
                      <button onClick={(e) => toggleBookmark(e, site.id)} className={`text-lg transition-transform hover:scale-110 ${isBookmarked ? 'text-rose-500' : 'text-slate-300 grayscale opacity-50'}`}>
                        {isBookmarked ? '📌' : '➕'}
                      </button>
                      {site.name}
                    </td>
                    <td className="p-3.5 text-slate-600">{site.altitude || '標示中'}</td>
                    <td className="p-3.5 text-slate-600">{mins ? `${mins} 分鐘` : '確認中'} ({dist})</td>
                    <td className="p-3.5">{renderActionButtons(site)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分頁控制列 (移至最下方) */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mb-12">
          <button 
            onClick={() => {
              setCurrentPage(p => Math.max(1, p - 1));
              window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
            }}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 shadow-sm transition-colors"
          >
            ◀ 上一頁
          </button>
          <span className="text-sm font-bold text-slate-600">
            第 {currentPage} 頁 / 共 {totalPages} 頁
          </span>
          <button 
            onClick={() => {
              setCurrentPage(p => Math.min(totalPages, p + 1));
              window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
            }}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 shadow-sm transition-colors"
          >
            下一頁 ▶
          </button>
        </div>
      )}

      {/* ⚖️ 營地大 PK Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">⚖️ 營地大 PK (最多比較 4 個)</h2>
              <button onClick={() => setShowCompareModal(false)} className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-sm shadow-sm transition-colors">✕ 關閉</button>
            </div>
            
            <div className="p-6 overflow-auto flex-1 bg-slate-100/50">
              {bookmarkedCamps.size > 4 && (
                <div className="mb-4 p-3 bg-amber-100 text-amber-800 rounded-xl text-sm font-bold border border-amber-200 flex items-center gap-2">
                  ⚠️ 待確認名單太多啦！建議保留 4 個以內比較清楚喔。
                </div>
              )}
              
              <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                {campsites
                  .filter(site => bookmarkedCamps.has(site.id))
                  .slice(0, 4)
                  .map(site => {
                    const { mins, dist } = getCampDriveInfo(site);
                    return (
                      <div key={`pk-${site.id}`} className="min-w-[280px] w-[300px] flex-shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col snap-start">
                        <div className="p-4 bg-slate-50 border-b border-slate-100 h-24 flex flex-col justify-center">
                          <h3 className="text-lg font-bold text-slate-900 line-clamp-2 leading-tight">{site.name}</h3>
                          <div className="mt-1 flex items-center gap-2">
                            {site.rating && <span className="text-xs font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">⭐ {site.rating}</span>}
                            {site.altitude && <span className="text-xs font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">⛰️ {site.altitude}</span>}
                          </div>
                        </div>
                        
                        <div className="p-4 flex-1 flex flex-col gap-4 text-sm">
                          <div>
                            <p className="text-xs font-bold text-slate-500 mb-1">🚗 距離 ({FIXED_ORIGINS[originKey]})</p>
                            <p className="font-semibold text-slate-800">{mins ? `${mins} 分鐘` : '確認中'}</p>
                            <p className="text-xs text-slate-500">{dist}</p>
                          </div>
                          
                          <div>
                            <p className="text-xs font-bold text-slate-500 mb-1">👍 優點</p>
                            {site.pros && site.pros.length > 0 ? (
                              <ul className="list-disc pl-4 text-emerald-700 space-y-1 text-xs font-medium">
                                {site.pros.map((p, i) => <li key={i}>{p}</li>)}
                              </ul>
                            ) : <span className="text-slate-400 text-xs">無</span>}
                          </div>
                          
                          <div>
                            <p className="text-xs font-bold text-slate-500 mb-1">👎 缺點</p>
                            {site.cons && site.cons.length > 0 ? (
                              <ul className="list-disc pl-4 text-rose-700 space-y-1 text-xs font-medium">
                                {site.cons.map((c, i) => <li key={i}>{c}</li>)}
                              </ul>
                            ) : <span className="text-slate-400 text-xs">無</span>}
                          </div>
                        </div>
                        
                        <div className="p-4 border-t border-slate-100 bg-slate-50 mt-auto">
                          {renderActionButtons(site)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
