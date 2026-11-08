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
import CampsiteNoteModal from '../components/CampsiteNoteModal';
import CampsiteWeatherModal from '../components/CampsiteWeatherModal';
import CampsiteSafeRouteModal from '../components/CampsiteSafeRouteModal';
import CampsiteARModal from '../components/CampsiteARModal';

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
  const [sortBy, setSortBy] = useState('favorite_first');
  const [showCompareModal, setShowCompareModal] = useState(false);

  // 🎯 搜尋與篩選狀態
  const [searchName, setSearchName] = useState('');
  const [searchRegion, setSearchRegion] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // 📌 待確認名單 (比較用) 狀態
  const [bookmarkedCamps, setBookmarkedCamps] = useState(new Set());
  const [showOnlyBookmarked, setShowOnlyBookmarked] = useState(false);

  // ❤️ 我的最愛營地 狀態 (支援 localStorage 持久化儲存)
  const [favoriteCamps, setFavoriteCamps] = useState(new Set());
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [showOnlyFavoriteMap, setShowOnlyFavoriteMap] = useState(false);

  // 📝 露營註解與紀錄 (時間、天氣、評價、注意事項)
  const [userNotes, setUserNotes] = useState({});
  const [showOnlyWithNotes, setShowOnlyWithNotes] = useState(false);
  const [activeNoteCamp, setActiveNoteCamp] = useState(null);

  // ⛅ 天氣預報 & 日照風向羅盤 Modal 狀態
  const [weatherModalCamp, setWeatherModalCamp] = useState(null);

  // 🛡️ 最安全行車路徑分析 Modal 狀態
  const [safeRouteModalCamp, setSafeRouteModalCamp] = useState(null);

  // 📱 AR 實境陀螺儀搭帳方位指引 Modal 狀態
  const [arModalCamp, setArModalCamp] = useState(null);

  // 🎯 被選擇的營地物件
  const [selectedCamp, setSelectedCamp] = useState(null);
  const [showOnlySelectedMap, setShowOnlySelectedMap] = useState(false);

  // 讀取本機儲存的「我的最愛」與「露營註解」
  useEffect(() => {
    try {
      const savedFavs = localStorage.getItem('camping_favorites_v1');
      if (savedFavs) {
        const parsed = JSON.parse(savedFavs);
        if (Array.isArray(parsed)) {
          setFavoriteCamps(new Set(parsed));
        }
      }
      const savedNotes = localStorage.getItem('camping_user_notes_v1');
      if (savedNotes) {
        const parsedNotes = JSON.parse(savedNotes);
        if (parsedNotes && typeof parsedNotes === 'object') {
          setUserNotes(parsedNotes);
        }
      }
    } catch (e) {
      console.error('Failed to load user storage:', e);
    }
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    setCurrentPage(1); // 搜尋時重置頁碼
    try {
      const params = new URLSearchParams();
      if (searchName) params.append('searchName', searchName);
      if (searchRegion) params.append('searchRegion', searchRegion);
      if (originKey) params.append('originKey', originKey);

      const queryString = params.toString();
      const res = await fetch('/api/campsites?' + queryString, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
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

  const toggleFavorite = (e, campId) => {
    if (e) e.stopPropagation();
    setFavoriteCamps(prev => {
      const next = new Set(prev);
      if (next.has(campId)) next.delete(campId);
      else next.add(campId);
      try {
        localStorage.setItem('camping_favorites_v1', JSON.stringify(Array.from(next)));
      } catch (err) {
        console.error('Failed to save favorites:', err);
      }
      return next;
    });
  };

  const handleSaveNote = (campId, noteData) => {
    setUserNotes(prev => {
      const currentList = prev[campId] || [];
      let updatedList;
      if (noteData.id) {
        updatedList = currentList.map(n => n.id === noteData.id ? { ...noteData, updatedAt: new Date().toISOString() } : n);
      } else {
        const newEntry = {
          ...noteData,
          id: 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
          createdAt: new Date().toISOString()
        };
        updatedList = [newEntry, ...currentList];
      }
      const nextState = { ...prev, [campId]: updatedList };
      try {
        localStorage.setItem('camping_user_notes_v1', JSON.stringify(nextState));
      } catch (err) {
        console.error('Failed to save notes:', err);
      }
      return nextState;
    });
  };

  const handleDeleteNote = (campId, noteId) => {
    setUserNotes(prev => {
      const currentList = prev[campId] || [];
      const updatedList = currentList.filter(n => n.id !== noteId);
      const nextState = { ...prev };
      if (updatedList.length > 0) {
        nextState[campId] = updatedList;
      } else {
        delete nextState[campId];
      }
      try {
        localStorage.setItem('camping_user_notes_v1', JSON.stringify(nextState));
      } catch (err) {
        console.error('Failed to delete note:', err);
      }
      return nextState;
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
      setMaxDriveTime(300);
    } else if (preset === 'family') {
      setMinAltitude(0);
      setMaxAltitude(2500);
      setMaxDriveTime(60);
      setSelectedTags(new Set(['大草皮']));
    } else if (preset === 'view') {
      setMinAltitude(500);
      setMaxAltitude(2500);
      setMaxDriveTime(300);
      setSelectedTags(new Set(['雲海']));
    } else if (preset === 'reset') {
      setMinAltitude(0);
      setMaxAltitude(2500);
      setMaxDriveTime(300);
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
    const favOk = showOnlyFavorites ? favoriteCamps.has(site.id) : true;
    const notesOk = showOnlyWithNotes ? (userNotes[site.id] && userNotes[site.id].length > 0) : true;

    // 🔒 解鎖限制，允許搜尋所有縣市
    let originRegionOk = true;

    // 🏷️ 標籤智慧過濾 (使用同義詞擴充比對)
    const TAG_SYNONYMS = {
      '大草皮': ['大草皮', '草皮', '草地', '草坪', '寬廣的空間'],
      '少帳包區': ['少帳包區', '包區', '小區', '小包區', '隱私', '獨立營位'],
      '雲海': ['雲海', '大景', '絕美景觀', '山景', '視野'],
      '夜景': ['夜景', '百萬夜景', '星空', '星星', '夜間景觀', '俯瞰'],
      '乾濕分離': ['乾濕分離', '乾溼分離', '舒適衛浴', '五星級衛浴', '乾淨衛浴'],
      '無小黑蚊': ['無小黑蚊', '沒蚊子', '蚊蟲較少', '蚊蟲少', '沒有蚊蟲'],
      '有餐點外送服務': ['外送', 'foodpanda', 'uber eats', '熊貓', '叫外送', '外送服務', '叫餐']
    };

    const tagsOk = selectedTags.size === 0 || Array.from(selectedTags).every(tag => {
      const textToSearch = `${site.name || ''} ${(site.pros || []).join(' ')} ${(site.cons || []).join(' ')}`.toLowerCase();
      // 如果標籤有定義同義詞，只要命中任何一個同義詞即可
      const synonyms = TAG_SYNONYMS[tag] || [tag];
      return synonyms.some(synonym => textToSearch.includes(synonym.toLowerCase()));
    });

    return driveOk && altOk && nameMatch && regionMatch && bookmarkOk && favOk && notesOk && originRegionOk && tagsOk;
  });

  // 當過濾條件改變時，自動回到第一頁
  useEffect(() => {
    setCurrentPage(1);
  }, [campsites, originKey, maxDriveTime, minAltitude, maxAltitude, searchName, searchRegion, showOnlyBookmarked, showOnlyFavorites, showOnlyWithNotes, selectedTags]);

  // 🎯 2. 智慧排序邏輯
  const sortedFilteredCampsites = [...filteredCampsites].sort((a, b) => {
    if (sortBy === 'favorite_first') {
      const aFav = favoriteCamps.has(a.id) ? 1 : 0;
      const bFav = favoriteCamps.has(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      const aBookmarked = bookmarkedCamps.has(a.id) ? 1 : 0;
      const bBookmarked = bookmarkedCamps.has(b.id) ? 1 : 0;
      if (aBookmarked !== bBookmarked) return bBookmarked - aBookmarked;
    } else if (sortBy === 'bookmark_first') {
      const aBookmarked = bookmarkedCamps.has(a.id) ? 1 : 0;
      const bBookmarked = bookmarkedCamps.has(b.id) ? 1 : 0;
      if (aBookmarked !== bBookmarked) return bBookmarked - aBookmarked;
    } else if (sortBy === 'notes_first') {
      const aNotes = (userNotes[a.id]?.length || 0);
      const bNotes = (userNotes[b.id]?.length || 0);
      if (aNotes !== bNotes) return bNotes - aNotes;
    }

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
    const originName = FIXED_ORIGINS[originKey] || '台南安平區';
    const originShort = originKey === 'tainan' ? '台南' : originKey === 'hsinchu' ? '新竹' : originKey === 'taipei' ? '台北' : '台中';
    const routePlanUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originName)}&destination=${encodeURIComponent(site.name)}&travelmode=driving`;
    const gpsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.name)}&travelmode=driving`;
    
    // 🤖 讓使用者點擊按鈕直接進入 Google Search AI 總結
    const promptText = `請總結「${site.name} ${site.region || ''} ${site.location || ''}」露營區的真實評價，包含：1.衛浴乾淨程度 2.營位實際狀況 3.營地大小 4.適合小孩嗎 5.可以生火嗎 6.未來三個月氣候與溫度 7.綜合優缺點。請基於真實回饋，不可捏造。`;
    const aiUrl = new URL("https://www.google.com/search");
    aiUrl.searchParams.set("q", promptText);
    aiUrl.searchParams.set("udm", "50");
    aiUrl.searchParams.set("hl", "zh-TW");
    const aiLink = aiUrl.toString();

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
        {/* 訂位按鈕 (優先最醒目) */}
        {btns}

        {/* 🚗 行車路徑規劃 (從所選出發地) */}
        <a
          href={routePlanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
          title={`使用 Google Maps 規劃從 [${originName}] 開車到營地的最佳路線`}
        >
          🚗 行車規劃 (從{originShort})
        </a>

        {/* 🧭 即時 GPS 導航 */}
        <a
          href={gpsNavUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
          title="開啟 Google Maps 即時開啟導航 (以您目前所在位置為起點)"
        >
          🧭 即時 GPS 導航
        </a>

        {/* Google AI 營地評價 */}
        <a href={aiLink} target="_blank" rel="noopener noreferrer" className="text-center bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          🤖 AI 評價摘要
        </a>

        {/* Google 地圖搜尋 */}
        <a href={googleMapUrl} target="_blank" rel="noopener noreferrer" className="text-center bg-slate-600 hover:bg-slate-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm">
          🗺️ Google 地圖
        </a>
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
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => {
                setShowOnlyFavorites(!showOnlyFavorites);
                setShowOnlyBookmarked(false);
                setShowOnlyWithNotes(false);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-1 ${
                showOnlyFavorites ? 'bg-rose-100 text-rose-700 border-rose-300 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showOnlyFavorites ? '👈 返回全部' : `❤️ 我的最愛 (${favoriteCamps.size})`}
            </button>
            <button
              onClick={() => {
                setShowOnlyWithNotes(!showOnlyWithNotes);
                setShowOnlyBookmarked(false);
                setShowOnlyFavorites(false);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-1 ${
                showOnlyWithNotes ? 'bg-blue-100 text-blue-700 border-blue-300 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showOnlyWithNotes ? '👈 返回全部' : `📝 露營札記 (${Object.keys(userNotes).filter(k => userNotes[k]?.length > 0).length})`}
            </button>
            <button
              onClick={() => {
                setShowOnlyBookmarked(!showOnlyBookmarked);
                setShowOnlyFavorites(false);
                setShowOnlyWithNotes(false);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                showOnlyBookmarked ? 'bg-amber-100 text-amber-700 border-amber-300 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showOnlyBookmarked ? '👈 返回全部' : `📌 待確認 (${bookmarkedCamps.size})`}
            </button>
            {bookmarkedCamps.size > 0 && (
              <button
                onClick={() => {
                  setBookmarkedCamps(new Set());
                  setShowOnlyBookmarked(false);
                }}
                className="px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all border bg-white text-slate-400 border-slate-200 hover:text-rose-600 hover:border-rose-300"
                title="清空待確認清單"
              >
                🗑️
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
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-800 text-xs p-3 rounded-xl border border-indigo-100 flex flex-col justify-center h-[50px]">
              💡 享受無限制車程與跨縣市探索！
            </div>
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
                {maxDriveTime === 300 ? `${maxDriveTime} 分鐘 (無上限)` : `${maxDriveTime} 分鐘`}
              </span>
            </div>
            <input 
              type="range" 
              min="20" 
              max={300} 
              step="10" 
              value={maxDriveTime} 
              onChange={(e) => setMaxDriveTime(Number(e.target.value))} 
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-3" 
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-8 overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center z-20 relative flex-wrap gap-2">
          <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">🗺️ 地圖預覽</span>
          <div className="flex items-center gap-2 flex-wrap">
            {favoriteCamps.size > 0 && (
              <label className="flex items-center gap-1.5 text-xs font-bold text-rose-700 cursor-pointer bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-colors border border-rose-200">
                <input 
                  type="checkbox" 
                  checked={showOnlyFavoriteMap} 
                  onChange={(e) => {
                    setShowOnlyFavoriteMap(e.target.checked);
                    if (e.target.checked) setShowOnlySelectedMap(false);
                  }} 
                  className="w-3.5 h-3.5 accent-rose-600 rounded cursor-pointer" 
                />
                ❤️ 僅顯示我的最愛 ({favoriteCamps.size})
              </label>
            )}
            {bookmarkedCamps.size > 0 && (
              <label className="flex items-center gap-1.5 text-xs font-bold text-amber-700 cursor-pointer bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors border border-amber-200">
                <input 
                  type="checkbox" 
                  checked={showOnlySelectedMap} 
                  onChange={(e) => {
                    setShowOnlySelectedMap(e.target.checked);
                    if (e.target.checked) setShowOnlyFavoriteMap(false);
                  }} 
                  className="w-3.5 h-3.5 accent-amber-600 rounded cursor-pointer" 
                />
                📌 僅顯示待確認 ({bookmarkedCamps.size})
              </label>
            )}
          </div>
        </div>
        <div className="h-80 relative z-10 w-full">
          <MapWithNoSSR 
            campsites={
              showOnlyFavoriteMap && favoriteCamps.size > 0 
                ? sortedFilteredCampsites.filter(site => favoriteCamps.has(site.id))
                : (showOnlySelectedMap && bookmarkedCamps.size > 0 
                    ? sortedFilteredCampsites.filter(site => bookmarkedCamps.has(site.id)) 
                    : sortedFilteredCampsites)
            } 
            mapMode={mapMode} 
            onSelectCampsite={handleSelectCamp} 
            selectedCampId={selectedCamp?.id} 
            favoriteCamps={favoriteCamps}
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
                  const isFav = favoriteCamps.has(data.id);
                  const isBk = bookmarkedCamps.has(data.id);
                  const notesCount = userNotes[data.id]?.length || 0;
                  return (
                    <div className="bg-slate-900/95 backdrop-blur text-white p-3.5 rounded-xl text-xs shadow-xl border border-slate-700">
                      <p className="font-bold text-sm text-amber-400 mb-1 flex items-center gap-1">
                        {isFav && <span className="text-rose-400">❤️</span>}
                        {isBk && !isFav && '📌 '}
                        {data.name}
                      </p>
                      <p>⛰️ 海拔高度: <strong className="text-emerald-300">{data.y} m</strong></p>
                      <p>🚗 車程距離: <strong>{data.currentMins ? `${data.currentMins} 分鐘` : '確認中'} ({data.currentDist})</strong></p>
                      {notesCount > 0 && (
                        <p className="mt-1 text-sky-300 font-semibold">📝 已記錄 {notesCount} 筆露營札記</p>
                      )}
                    </div>
                  );
                }
                return null;
              }} />
              <Scatter name="營地" data={chartData} onClick={handleSelectCamp} className="cursor-pointer">
                {chartData.map((entry, index) => {
                  let dotColor = '#059669';
                  if (favoriteCamps.has(entry.id)) dotColor = '#e11d48';
                  else if (bookmarkedCamps.has(entry.id)) dotColor = '#8b5cf6';
                  if (selectedCamp?.id === entry.id) dotColor = '#f59e0b';
                  return (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={dotColor} 
                      r={selectedCamp?.id === entry.id ? 9 : (favoriteCamps.has(entry.id) ? 8 : (bookmarkedCamps.has(entry.id) ? 7 : 5))} 
                    />
                  );
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-black text-slate-900">{selectedCamp.name}</h2>
                    <button 
                      onClick={(e) => toggleFavorite(e, selectedCamp.id)}
                      className={`text-2xl transition-transform hover:scale-125 p-1 ${favoriteCamps.has(selectedCamp.id) ? 'text-rose-500' : 'text-slate-300 hover:text-rose-400'}`}
                      title={favoriteCamps.has(selectedCamp.id) ? "從我的最愛移除" : "加入我的最愛"}
                    >
                      {favoriteCamps.has(selectedCamp.id) ? '❤️' : '🤍'}
                    </button>
                    <button onClick={(e) => toggleBookmark(e, selectedCamp.id)} className={`text-sm px-2.5 py-1 rounded-lg border transition-colors ${bookmarkedCamps.has(selectedCamp.id) ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                      {bookmarkedCamps.has(selectedCamp.id) ? '📌 待確認' : '➕ 待確認'}
                    </button>
                    <button
                      onClick={() => setActiveNoteCamp(selectedCamp)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1 shadow-sm"
                    >
                      📝 露營札記 / 註解 ({userNotes[selectedCamp.id]?.length || 0})
                    </button>
                  </div>
                  {selectedCamp.altitude && <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-md border border-sky-100">⛰️ {selectedCamp.altitude}</span>}
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">⭐ Google 評分: {selectedCamp.rating || 4.5} | 🚗 車程: 約 {getCampDriveInfo(selectedCamp).mins || '確認中'} 分鐘 ({getCampDriveInfo(selectedCamp).dist})</p>
              
              {/* 核心功能快捷列 (單一排版，每項功能僅出現一次) */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setArModalCamp(selectedCamp)}
                  className="px-2.5 py-2 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-500 hover:to-rose-600 text-slate-950 font-black text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1"
                >
                  📱 AR 實境搭帳
                </button>
                <button
                  type="button"
                  onClick={() => setSafeRouteModalCamp(selectedCamp)}
                  className="px-2.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1"
                >
                  🛡️ 最安全路徑
                </button>
                <button
                  type="button"
                  onClick={() => setWeatherModalCamp(selectedCamp)}
                  className="px-2.5 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1"
                >
                  ⛅ 天氣與風向
                </button>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl mb-3 border border-slate-100 flex flex-wrap justify-between items-center text-xs font-semibold text-slate-700 gap-2">
                <span>📞 電話: <strong className="text-blue-600">{selectedCamp.phone || '請洽官網/粉絲專頁'}</strong></span>
              </div>

              {/* 札記預覽 */}
              {userNotes[selectedCamp.id]?.length > 0 && (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 mb-3 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-amber-900">📝 最新露營紀錄：</span>
                    <button
                      onClick={() => setActiveNoteCamp(selectedCamp)}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      查看全部 {userNotes[selectedCamp.id].length} 筆
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-100">
                      📅 {userNotes[selectedCamp.id][0].date}
                    </span>
                    <span className="font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {userNotes[selectedCamp.id][0].weather}
                    </span>
                    <span className="text-amber-500 font-bold">
                      {'★'.repeat(userNotes[selectedCamp.id][0].rating || 5)}
                    </span>
                  </div>
                  {userNotes[selectedCamp.id][0].precautions && (
                    <p className="text-rose-800 bg-white/80 p-2 rounded border border-rose-100 mt-1">
                      <strong>⚠️ 注意事項：</strong> {userNotes[selectedCamp.id][0].precautions}
                    </p>
                  )}
                </div>
              )}
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
          <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
            <span>{showOnlyFavorites ? '❤️ 我的最愛營地' : showOnlyWithNotes ? '📝 曾留過筆記的營地' : showOnlyBookmarked ? '📌 我的待確認清單' : '🏕️ 營地清單'}</span>
            <span className="text-sm font-semibold text-slate-500">(共 {sortedFilteredCampsites.length} 個符合條件)</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-700">排序方式：</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
            >
              <option value="favorite_first">❤️ 我的最愛優先</option>
              <option value="notes_first">📝 有露營札記優先</option>
              <option value="bookmark_first">📌 待確認優先</option>
              <option value="rating_desc">⭐ 評分由高至低</option>
              <option value="drive_time_asc">🚗 車程由近到遠</option>
              <option value="altitude_desc">⛰️ 海拔由高至低</option>
              <option value="altitude_asc">⛰️ 海拔由低至高</option>
            </select>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 items-center">
          {bookmarkedCamps.size >= 2 && (
            <button
              onClick={() => setShowCompareModal(true)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all border bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-violet-700 shadow hover:from-violet-700 hover:to-fuchsia-700 flex items-center gap-1"
            >
              ⚖️ 營地大 PK ({bookmarkedCamps.size})
            </button>
          )}
          <button
            onClick={() => {
              setShowOnlyFavorites(!showOnlyFavorites);
              setShowOnlyBookmarked(false);
              setShowOnlyWithNotes(false);
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-1 ${
              showOnlyFavorites 
                ? 'bg-rose-100 text-rose-700 border-rose-300 shadow' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {showOnlyFavorites ? '顯示全部' : `❤️ 我的最愛 (${favoriteCamps.size})`}
          </button>
          <button
            onClick={() => {
              setShowOnlyWithNotes(!showOnlyWithNotes);
              setShowOnlyFavorites(false);
              setShowOnlyBookmarked(false);
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-1 ${
              showOnlyWithNotes 
                ? 'bg-blue-100 text-blue-700 border-blue-300 shadow' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {showOnlyWithNotes ? '顯示全部' : `📝 露營札記 (${Object.keys(userNotes).filter(k => userNotes[k]?.length > 0).length})`}
          </button>
          <button
            onClick={() => {
              setShowOnlyBookmarked(!showOnlyBookmarked);
              setShowOnlyFavorites(false);
              setShowOnlyWithNotes(false);
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-1 ${
              showOnlyBookmarked 
                ? 'bg-amber-100 text-amber-700 border-amber-300 shadow' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {showOnlyBookmarked ? '顯示全部' : `📌 待確認 (${bookmarkedCamps.size})`}
          </button>
          {bookmarkedCamps.size > 0 && (
            <button
              onClick={() => {
                setBookmarkedCamps(new Set());
                setShowOnlyBookmarked(false);
              }}
              className="px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all border bg-white text-slate-400 border-slate-200 hover:text-rose-600"
              title="清空待確認名單"
            >
              🗑️ 清空待確認
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
              const isFav = favoriteCamps.has(site.id);
              const campNotes = userNotes[site.id] || [];
              const latestNote = campNotes[0];

              return (
                <div
                  key={site.id}
                  className={`bg-white p-6 rounded-2xl shadow-sm border transition-all flex flex-col justify-between ${
                    selectedCamp?.id === site.id 
                      ? 'border-2 border-amber-500 shadow-md ring-2 ring-amber-200' 
                      : isFav ? 'border-2 border-rose-300 bg-rose-50/20 shadow-sm'
                      : isBookmarked ? 'border-2 border-amber-300 bg-amber-50/20' : 'border-slate-200 hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl font-bold text-slate-900">{site.name}</h2>
                          {isFav && (
                            <span className="text-[11px] font-black bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200 flex items-center gap-0.5">
                              ❤️ 最愛
                            </span>
                          )}
                        </div>
                        {site.altitude && <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-md border border-sky-100">⛰️ {site.altitude}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={(e) => toggleFavorite(e, site.id)}
                          className={`text-2xl transition-transform hover:scale-125 p-1 ${isFav ? 'text-rose-500' : 'text-slate-300 hover:text-rose-400 opacity-60 hover:opacity-100'}`}
                          title={isFav ? "從我的最愛移除" : "加入我的最愛"}
                        >
                          {isFav ? '❤️' : '🤍'}
                        </button>
                        <button 
                          onClick={(e) => toggleBookmark(e, site.id)}
                          className={`text-xl transition-transform hover:scale-110 p-1 ${isBookmarked ? 'text-amber-500' : 'text-slate-300 grayscale opacity-40 hover:opacity-100'}`}
                          title="加入/移除待確認名單"
                        >
                          {isBookmarked ? '📌' : '➕'}
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">⭐ Google 評分: {site.rating || 4.5} | 🚗 車程: {mins ? `約 ${mins} 分鐘` : '確認中'} ({dist})</p>
                    
                    {/* 核心特色功能快捷按鈕 (單一排版，不再與下方導航按鈕重複) */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                      <button
                        type="button"
                        onClick={() => setArModalCamp(site)}
                        className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-slate-950 transition-colors flex items-center gap-1 shadow-sm"
                        title="開啟手機相機與陀螺儀，以 AR 實境透視太陽方位與搭帳指南"
                      >
                        📱 AR 搭帳
                      </button>
                      <button
                        type="button"
                        onClick={() => setSafeRouteModalCamp(site)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 transition-colors flex items-center gap-1 shadow-sm"
                        title="分析前往此營地最安全的行車路徑、會車難度與防刮底盤建議"
                      >
                        🛡️ 安全路徑
                      </button>
                      <button
                        type="button"
                        onClick={() => setWeatherModalCamp(site)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors flex items-center gap-1 shadow-sm"
                      >
                        ⛅ 天氣 & 羅盤
                      </button>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl mb-3 border border-slate-100 flex flex-wrap justify-between items-center text-xs font-semibold text-slate-700 gap-2">
                      <span>📞 電話: <strong className="text-blue-600">{site.phone || '請洽官網/粉絲專頁'}</strong></span>
                    </div>

                    {/* 📝 使用者個人註解與露營紀錄 */}
                    <div className="mb-3 pt-2 border-t border-slate-100">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          📝 我的露營札記 / 註解
                          {campNotes.length > 0 && (
                            <span className="bg-blue-100 text-blue-700 font-black px-1.5 py-0.2 rounded-full text-[10px]">
                              {campNotes.length} 筆
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => setActiveNoteCamp(site)}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                        >
                          {campNotes.length > 0 ? '✏️ 查看 / 編輯札記' : '➕ 填寫露營時間/天氣/評價/注意事項'}
                        </button>
                      </div>

                      {latestNote ? (
                        <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 text-xs text-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                📅 {latestNote.date}
                              </span>
                              <span className="font-semibold text-slate-700">
                                {latestNote.weather}
                              </span>
                              <span className="text-amber-500 font-bold">
                                {'★'.repeat(latestNote.rating || 5)}
                              </span>
                            </div>
                            {campNotes.length > 1 && (
                              <span className="text-[10px] text-slate-400">還有其他 {campNotes.length - 1} 筆紀錄</span>
                            )}
                          </div>
                          {latestNote.precautions && (
                            <div className="text-rose-800 bg-rose-50/80 p-2 rounded-lg border border-rose-100">
                              <span className="font-bold">⚠️ 注意事項：</span>
                              <span className="line-clamp-2">{latestNote.precautions}</span>
                            </div>
                          )}
                          {latestNote.comment && (
                            <p className="text-slate-600 line-clamp-2 italic">
                              💬 「{latestNote.comment}」
                            </p>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={() => setActiveNoteCamp(site)}
                          className="cursor-pointer bg-slate-50 hover:bg-blue-50/50 border border-dashed border-slate-200 hover:border-blue-300 rounded-xl p-2.5 text-center text-xs text-slate-500 hover:text-blue-600 transition-colors"
                        >
                          ✍️ 點此新增露營時間、天氣狀況、評價與避坑注意事項
                        </div>
                      )}
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
          📋 營地快速預約對照表 (我的最愛與待確認清單會自動置頂)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                <th className="p-3.5 font-bold">營地名稱</th>
                <th className="p-3.5 font-bold">真實海拔</th>
                <th className="p-3.5 font-bold">車程 / 距離 ({FIXED_ORIGINS[originKey]})</th>
                <th className="p-3.5 font-bold">我的札記</th>
                <th className="p-3.5 font-bold">一鍵直達連結</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentCampsites.map((site) => {
                const { mins, dist } = getCampDriveInfo(site);
                const isBookmarked = bookmarkedCamps.has(site.id);
                const isFav = favoriteCamps.has(site.id);
                const campNotes = userNotes[site.id] || [];

                return (
                  <tr
                    key={site.id}
                    className={`transition-colors ${
                      selectedCamp?.id === site.id ? 'bg-amber-50 font-medium' : isFav ? 'bg-rose-50/40' : isBookmarked ? 'bg-amber-50/40' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                      <button onClick={(e) => toggleFavorite(e, site.id)} className="text-lg hover:scale-110 transition-transform" title={isFav ? "從我的最愛移除" : "加入我的最愛"}>
                        {isFav ? '❤️' : '🤍'}
                      </button>
                      <button onClick={(e) => toggleBookmark(e, site.id)} className={`text-lg transition-transform hover:scale-110 ${isBookmarked ? 'text-amber-500' : 'text-slate-300 grayscale opacity-50'}`}>
                        {isBookmarked ? '📌' : '➕'}
                      </button>
                      <span>{site.name}</span>
                    </td>
                    <td className="p-3.5 text-slate-600">{site.altitude || '標示中'}</td>
                    <td className="p-3.5 text-slate-600">{mins ? `${mins} 分鐘` : '確認中'} ({dist})</td>
                    <td className="p-3.5">
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setArModalCamp(site)}
                          className="text-xs px-2 py-1 rounded-lg border font-semibold bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 transition-colors flex items-center justify-center gap-1"
                        >
                          📱 AR 搭帳
                        </button>
                        <button
                          type="button"
                          onClick={() => setSafeRouteModalCamp(site)}
                          className="text-xs px-2 py-1 rounded-lg border font-semibold bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1"
                        >
                          🛡️ 安全路徑分析
                        </button>
                        <button
                          onClick={() => setActiveNoteCamp(site)}
                          className={`text-xs px-2 py-1 rounded-lg border font-semibold transition-colors flex items-center justify-center gap-1 ${
                            campNotes.length > 0 
                              ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' 
                              : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          📝 {campNotes.length > 0 ? `${campNotes.length} 筆紀錄` : '+ 新增筆記'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setWeatherModalCamp(site)}
                          className="text-xs px-2 py-1 rounded-lg border font-semibold bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 transition-colors flex items-center justify-center gap-1"
                        >
                          ⛅ 天氣預報 & 羅盤
                        </button>
                      </div>
                    </td>
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
                    const isFav = favoriteCamps.has(site.id);
                    const campNotes = userNotes[site.id] || [];

                    return (
                      <div key={`pk-${site.id}`} className="min-w-[280px] w-[300px] flex-shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col snap-start">
                        <div className="p-4 bg-slate-50 border-b border-slate-100 min-h-[5.5rem] flex flex-col justify-center">
                          <div className="flex justify-between items-start">
                            <h3 className="text-lg font-bold text-slate-900 line-clamp-2 leading-tight">{site.name}</h3>
                            <button 
                              onClick={(e) => toggleFavorite(e, site.id)}
                              className="text-xl hover:scale-125 transition-transform"
                              title={isFav ? "從我的最愛移除" : "加入我的最愛"}
                            >
                              {isFav ? '❤️' : '🤍'}
                            </button>
                          </div>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {site.rating && <span className="text-xs font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">⭐ {site.rating}</span>}
                            {site.altitude && <span className="text-xs font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">⛰️ {site.altitude}</span>}
                          </div>
                        </div>
                        
                        <div className="p-4 flex-1 flex flex-col gap-3 text-sm">
                          <div>
                            <p className="text-xs font-bold text-slate-500 mb-1">🚗 距離 ({FIXED_ORIGINS[originKey]})</p>
                            <p className="font-semibold text-slate-800">{mins ? `${mins} 分鐘` : '確認中'}</p>
                            <p className="text-xs text-slate-500">{dist}</p>
                          </div>

                          {/* PK Modal 中的筆記 */}
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-bold text-slate-700">📝 個人筆記 ({campNotes.length})</span>
                              <button
                                onClick={() => setActiveNoteCamp(site)}
                                className="text-[11px] font-bold text-blue-600 hover:underline"
                              >
                                {campNotes.length > 0 ? '編輯' : '+填寫'}
                              </button>
                            </div>
                            {campNotes.length > 0 ? (
                              <p className="text-xs text-rose-700 line-clamp-2 font-medium">
                                ⚠️ {campNotes[0].precautions || campNotes[0].comment || '已記錄'}
                              </p>
                            ) : (
                              <span className="text-slate-400 text-xs italic">尚未填寫注意事項</span>
                            )}
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

      {/* 📝 營地露營筆記 / 註解 Modal */}
      <CampsiteNoteModal
        campsite={activeNoteCamp}
        notes={activeNoteCamp ? (userNotes[activeNoteCamp.id] || []) : []}
        isOpen={!!activeNoteCamp}
        onClose={() => setActiveNoteCamp(null)}
        onSaveNote={handleSaveNote}
        onDeleteNote={handleDeleteNote}
        isFavorite={activeNoteCamp ? favoriteCamps.has(activeNoteCamp.id) : false}
        onToggleFavorite={toggleFavorite}
      />

      {/* ⛅ 營地天氣預報 & 日照風向羅盤 Modal */}
      <CampsiteWeatherModal
        campsite={weatherModalCamp}
        isOpen={!!weatherModalCamp}
        onClose={() => setWeatherModalCamp(null)}
        originKey={originKey}
        originName={FIXED_ORIGINS[originKey]}
        onOpenSafeRoute={setSafeRouteModalCamp}
        onOpenAR={setArModalCamp}
      />

      {/* 🛡️ 最安全行車路徑分析 Modal */}
      <CampsiteSafeRouteModal
        campsite={safeRouteModalCamp}
        isOpen={!!safeRouteModalCamp}
        onClose={() => setSafeRouteModalCamp(null)}
        originKey={originKey}
        originName={FIXED_ORIGINS[originKey]}
        userNotes={safeRouteModalCamp ? (userNotes[safeRouteModalCamp.id] || []) : []}
      />

      {/* 📱 AR 實境陀螺儀搭帳方位指引 Modal */}
      <CampsiteARModal
        campsite={arModalCamp}
        isOpen={!!arModalCamp}
        onClose={() => setArModalCamp(null)}
      />

    </main>
  );
}
