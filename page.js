'use client';

import { useState, useEffect, useMemo } from 'react';
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

const POPULAR_TAGS = ['大草皮', '少帳包區', '雲海', '夜景', '乾濕分離', '無小黑蚊', '有餐點外送服務'];

// 🏷️ 特色標籤與同義詞對照表（避免關鍵字遺漏造成篩選失準）
const TAG_SYNONYMS = {
  '大草皮': ['大草皮', '草皮', '大草地', '草地', '大草坪'],
  '少帳包區': ['少帳包區', '包區', '小包區', '少帳', '獨立包區'],
  '雲海': ['雲海', '雲瀑', '雲霧'],
  '夜景': ['夜景', '百萬夜景', '星空', '銀河'],
  '乾濕分離': ['乾濕分離', '乾溼分離', '獨立衛浴', '乾濕分離衛浴'],
  '無小黑蚊': ['無小黑蚊', '沒小黑蚊', '無蚊', '少蚊', '低蚊蟲'],
  '有餐點外送服務': ['有餐點外送服務', '餐點外送', '外送', '代訂餐點', '早餐', '下午茶']
};

// 📜 系統版本更新歷程紀錄 (Version History Changelog)
const APP_VERSION = 'v2.7.0';
const VERSION_HISTORY = [
  {
    version: 'v2.7.0',
    date: '2026-11-09',
    isLatest: true,
    tag: 'AR 夜間星空圖 & 觀測重點指南大補帖',
    changes: [
      { badge: '🌌 AR 星空圖', text: 'AR 實境搭帳全面升級雙模式：【☀️ 日照搭帳】與【🌌 夜間星空】無縫切換，支援即時與多時段 (20:00~04:30) 夜空推演。' },
      { badge: '✨ 天體瞄準鎖定', text: '陀螺儀仰望天際自動運算赤道與地平坐標，中央準心智慧鎖定北極星、銀河核心、夏季/冬季大三角與深空星系。' },
      { badge: '📖 觀星重點指南', text: '內建營地專屬觀星大補帖：銀河核心拍攝黃金月份窗口、手機 30 秒夜拍無痛設定、全年度流星雨週期與四季尋星心法。' },
      { badge: '🌙 月相光害指標', text: '實時推演農曆月相天象週期（朔望月日月角距演算法），精確計算月面光害照度百分比與深空拍攝能見度。' }
    ]
  },
  {
    version: 'v2.6.1',
    date: '2026-11-09',
    tag: '行動版對照表超緊湊排版修復',
    changes: [
      { badge: '📐 消除異常空白', text: '修復手機版 5 欄表格因右側欄位溢出所引發的單列巨大空白與高度拉伸問題。' },
      { badge: '📱 雙行高密度流', text: '行動版重構為原生雙行高密度卡片流：首行並排名稱/海拔/車程，次行橫列全部快捷鍵，高度從 120px 縮至 48px（完全免橫向滑動）。' }
    ]
  },
  {
    version: 'v2.6.0',
    date: '2026-11-09',
    tag: '手機版對照表折疊優化 & GPS 實境全進化',
    changes: [
      { badge: '📱 對照表折疊', text: '營地快速預約對照表在手機版預設智慧折疊收合，徹底告別 3,000px 無止盡滑動，支援一鍵秒展開。' },
      { badge: '📊 高密度表格', text: '特色按鈕優化為高密度橫向膠囊徽章，高度大減 70%，並加入 max-h 獨立滑動容器與置頂過濾。' },
      { badge: '📍 雙定位模式', text: 'AR 實境搭帳支援「營地模式」與「目前所在地 (手機 GPS)」一鍵切換，現場搭帳與行前模擬皆宜。' },
      { badge: '💨 真實即時風向', text: '全台營地全面連線即時氣候測站，自動抓取 10 公尺實測風向與風速，告別靜態 45° 預設值。' },
      { badge: '🧭 陀螺儀校正', text: '徹底解耦地勢水平儀 (平放 0°) 與天球鏡頭仰角，導航方位顯示全面解除圖層遮擋。' }
    ]
  },
  {
    version: 'v2.5.0',
    date: '2026-11-08',
    tag: '獨家黑科技 & 易讀性全進化',
    changes: [
      { badge: '✨ 獨家黑科技', text: 'AR 實境搭帳導引儀升級為點擊展開全螢幕獨立圖文解說彈窗，兼顧主頁面呼吸感與行動瀏覽。' },
      { badge: '⛅ 標題強化', text: '「營地名稱 - 天氣預報 & 日照風向羅盤」標題顯著放大，戶外強光下閱讀清晰不費力。' },
      { badge: '🎨 字型規範', text: '全站網頁最小字型基準統一（淘汰所有 sub-12px 微型字），符合 WCAG 高易讀性排版。' },
      { badge: '🛡️ 篩選修復', text: '補齊特色標籤同義詞字典 (TAG_SYNONYMS)，解決點選情境預設集與特色標籤時引發的客戶端例外。' },
      { badge: '📜 版本歷程', text: '頂部與頁尾新增系統版本號 (History)，點擊可隨時查閱即時更新日誌與里程碑。' }
    ]
  },
  {
    version: 'v2.4.0',
    date: '2026-11-08',
    tag: 'WebAR 太陽天文實境透視',
    changes: [
      { badge: '📱 實境相機', text: '結合天文太陽天球運行軌跡演算法與手機後置相機 WebAR 實境透視草地。' },
      { badge: '🧭 智能指引', text: '360° 實時滾動刻度羅盤帶與多目標決策準心（防 06:00 晨曬溫室效應 ✕ 平行氣流破風）。' },
      { badge: '📐 陀螺儀', text: '手機水平陀螺儀地勢量測（前後 Pitch / 左右 Roll），指引睡墊頭部朝向上坡。' }
    ]
  },
  {
    version: 'v2.3.0',
    date: '2026-11-07',
    tag: '極致氣象模型與即時風向',
    changes: [
      { badge: '⛅ 數值氣象', text: '整合 Open-Meteo 高解析數值氣象模型，即時演算全台營地 7 日逐日氣溫、降雨機率。' },
      { badge: '💨 蒲福風級', text: '整合蒲福風級 (Beaufort scale) 與抗風營釘下釘裝備建議。' },
      { badge: '🌅 晨昏計算', text: '營地日出、日落與黃金晨曦時刻精確計算。' }
    ]
  },
  {
    version: 'v2.2.0',
    date: '2026-11-07',
    tag: '安全行車導引與冗餘重構',
    changes: [
      { badge: '🛡️ 安全分析', text: '最安全行車路徑分析（避開高危險險降坡、產業農路與刮底盤路段）。' },
      { badge: '🧹 介面精簡', text: '移除多餘重複導航按鈕，簡化為單一智慧 GPS 導航與電話撥號功能。' },
      { badge: '⚡ 安心路況', text: '行車路徑自動依 GPS 與起點快速規劃，提供安心路況指引。' }
    ]
  },
  {
    version: 'v2.1.0',
    date: '2026-10-20',
    tag: '多維度篩選與營地 PK 比較',
    changes: [
      { badge: '👶 快速情境', text: '快速情境預設集（夏天避暑聖地、親子輕鬆露、我要看大景）一鍵套用。' },
      { badge: '⚖️ 營地 PK', text: '營地即時 PK 評估工具，支援多營地橫向參數並排評分。' },
      { badge: '🗺️ 雙模地圖', text: '2D 平面分布圖與 3D 衛星高程圖實時聯動。' }
    ]
  },
  {
    version: 'v2.0.0',
    date: '2026-09-15',
    tag: '露營札記與個人化離線儲存',
    changes: [
      { badge: '📝 露營札記', text: '露營札記 / 註解系統（自訂日期、天氣、評價與注意事項本地持久化）。' },
      { badge: '❤️ 我的最愛', text: '我的最愛與待確認營地快捷收藏清單。' },
      { badge: '🤖 Google AI', text: 'Google AI 營地評價與自然語言即時分析推薦。' }
    ]
  },
  {
    version: 'v1.0.0',
    date: '2026-08-15',
    tag: '初始版本上線',
    changes: [
      { badge: '🏕️ 基礎建設', text: '全台主要露營地海量資料庫建立，涵蓋車程、海拔、電話與特色標籤。' }
    ]
  }
];

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
  const [arModalWind, setArModalWind] = useState(null);
  const [arModalInitialMode, setArModalInitialMode] = useState('campsite');
  const [showArGuideModal, setShowArGuideModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // 📋 快速對照表展開／收合與過濾狀態 (手機版預設收合，避免過長)
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [tableFilter, setTableFilter] = useState('all'); // 'all' | 'favorites' | 'bookmarked'

  const handleOpenAR = (camp, windData, mode = 'campsite') => {
    setArModalCamp(camp);
    setArModalWind(windData || null);
    setArModalInitialMode(mode);
  };

  // 🎯 被選擇的營地物件
  const [selectedCamp, setSelectedCamp] = useState(null);

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

    const tagsOk = selectedTags.size === 0 || Array.from(selectedTags).every(tag => {
      const textToSearch = `${site.name || ''} ${(site.pros || []).join(' ')} ${(site.cons || []).join(' ')}`.toLowerCase();
      // 如果標籤有定義同義詞，只要命中任何一個同義詞即可
      const synonyms = TAG_SYNONYMS[tag] || [tag];
      return synonyms.some(synonym => textToSearch.includes(synonym.toLowerCase()));
    });

    return driveOk && altOk && nameMatch && regionMatch && bookmarkOk && favOk && notesOk && tagsOk;
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

  // 📋 表格模式專屬篩選資料
  const tableDisplayCamps = useMemo(() => {
    if (tableFilter === 'favorites') {
      return currentCampsites.filter(c => favoriteCamps.has(c.id));
    }
    if (tableFilter === 'bookmarked') {
      return currentCampsites.filter(c => bookmarkedCamps.has(c.id));
    }
    return currentCampsites;
  }, [currentCampsites, tableFilter, favoriteCamps, bookmarkedCamps]);

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
    // 不給起點：由 Google Maps 自動偵測使用者所在 GPS 位置，一鍵開啟語音路線導航
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
        {/* 訂位按鈕 (優先最醒目，佔滿兩欄) */}
        <div className="col-span-2">
          {btns}
        </div>

        {/* 🧭 即時行車導航 (自動抓取目前 GPS 位置) */}
        <a
          href={gpsNavUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="col-span-2 sm:col-span-1 text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
          title="開啟 Google Maps，自動抓取您目前 GPS 位置直接啟動語音導航"
        >
          <span>🧭</span> Google 地圖導航 (GPS)
        </a>

        {/* Google AI 營地評價 */}
        <a 
          href={aiLink} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="col-span-2 sm:col-span-1 text-center bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-2 px-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
        >
          <span>🤖</span> AI 評價摘要
        </a>
      </div>
    );
  };

  // 📋 表格模式專用的輕量操作按鈕
  const renderTableActions = (site) => {
    const gpsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.name)}&travelmode=driving`;
    let bookUrl = null;
    let bookLabel = '🏕️ 前往訂位';
    if (site.booking_url) {
      bookUrl = site.booking_url.split('\n')[0].trim();
      if (bookUrl.includes('icamping')) bookLabel = '🏕️ 愛露營';
      else if (bookUrl.includes('easycamp')) bookLabel = '🏕️ 露營樂';
    } else if (site.booking_type === 'line' && site.line_id) {
      bookUrl = `https://line.me/R/ti/p/${site.line_id.replace('@', '%40')}`;
      bookLabel = '💬 加 LINE';
    } else if (site.phone) {
      bookUrl = `tel:${site.phone}`;
      bookLabel = `📞 ${site.phone}`;
    } else {
      bookUrl = `https://www.google.com/search?q=${encodeURIComponent(site.name + ' 露營 預約')}`;
      bookLabel = '🔍 搜尋訂位';
    }

    return (
      <div className="flex flex-col gap-1 min-w-[90px]">
        <a
          href={bookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-1 px-2 rounded-lg text-xs transition-colors shadow-sm truncate"
        >
          {bookLabel}
        </a>
        <a
          href={gpsNavUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2 rounded-lg text-xs transition-colors shadow-sm flex items-center justify-center gap-1"
        >
          🧭 導航
        </a>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-8 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2">
            <span>🏕️</span> 台灣露營地研究中心
          </h1>
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="px-2.5 py-1 text-xs font-black rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all flex items-center gap-1.5 shadow-sm transform hover:scale-105 cursor-pointer"
            title="點擊查看版本更新歷程 (Version History)"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-mono">{APP_VERSION}</span>
            <span className="text-xs text-indigo-500 font-bold hidden sm:inline">📜 更新歷程</span>
          </button>
        </div>
        <div className="flex gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={handleGenerateAIPrompt}
            className="px-4 py-2 text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 border bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-transparent"
          >
            🤖 Google AI 即時分析推薦
          </button>
          <button
            onClick={() => setShowArGuideModal(true)}
            className="px-4 py-2 text-sm font-black rounded-xl transition-all shadow-md flex items-center gap-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-500 hover:to-rose-600 text-slate-950 transform hover:scale-105"
          >
            <span>✨</span> 獨家黑科技：AR 搭帳
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

      {/* ✨ 獨家黑科技：按鈕點擊打開圖文解說 */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-2xl border border-indigo-500/30 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-3xl shadow-lg flex-shrink-0">
            📱
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs sm:text-sm bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                ✨ 獨家黑科技
              </span>
              <h2 className="text-lg sm:text-2xl font-black text-white tracking-wide">
                AR 實境搭帳導引儀：太陽軌跡 ✕ 陀螺儀防晨曬
              </h2>
            </div>
            <p className="text-sm sm:text-base text-slate-200 mt-1.5 leading-relaxed">
              結合天體日照演算法與即時風向，站在草地上 1 秒找出避晨曬、破側風的最佳帳門方位！
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-shrink-0 mt-2 sm:mt-0">
          <button
            type="button"
            onClick={() => {
              const targetCamp = selectedCamp || sortedFilteredCampsites[0] || campsites[0];
              if (targetCamp) handleOpenAR(targetCamp, null, 'current');
            }}
            className="flex-1 sm:flex-none px-5 py-3 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-500 hover:to-rose-600 text-slate-950 font-black text-sm sm:text-base rounded-xl shadow-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
          >
            <span>🚀</span> 立即體驗 AR
          </button>
          <button
            type="button"
            onClick={() => setShowArGuideModal(true)}
            className="flex-1 sm:flex-none px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-black text-sm sm:text-base rounded-xl border border-white/25 transition-all flex items-center justify-center gap-2 shadow hover:bg-white/25"
          >
            <span>📖</span> 點擊打開圖文解說
          </button>
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
          <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">🗺️ 地圖分佈預覽</span>
          <span className="text-xs text-slate-500 font-medium bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm">
            📍 顯示目前符合條件的 <strong className="text-blue-600 font-mono">{sortedFilteredCampsites.length}</strong> 處營地（與上方篩選條件即時連動）
          </span>
        </div>
        <div className="h-80 relative z-10 w-full">
          <MapWithNoSSR 
            campsites={sortedFilteredCampsites} 
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
                    {userNotes[selectedCamp.id]?.length > 0 ? (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 shadow-sm flex items-center gap-1">
                        📝 已有 {userNotes[selectedCamp.id].length} 筆札記
                      </span>
                    ) : (
                      <button
                        onClick={() => setActiveNoteCamp(selectedCamp)}
                        className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-1 shadow-sm"
                      >
                        ➕ 撰寫札記
                      </button>
                    )}
                  </div>
                  {selectedCamp.altitude && <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-md border border-sky-100">⛰️ {selectedCamp.altitude}</span>}
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">⭐ Google 評分: {selectedCamp.rating || 4.5} | 🚗 車程: 約 {getCampDriveInfo(selectedCamp).mins || '確認中'} 分鐘 ({getCampDriveInfo(selectedCamp).dist})</p>
              
              {/* 核心功能快捷列 (單一排版，每項功能僅出現一次) */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => handleOpenAR(selectedCamp)}
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

              <div className="bg-slate-50 p-2.5 rounded-xl mb-3 border border-slate-100 flex flex-wrap justify-between items-center text-xs font-semibold text-slate-700 gap-2">
                <span>
                  📞 預約電話: {selectedCamp.phone ? (
                    <a href={`tel:${selectedCamp.phone}`} className="text-blue-600 hover:underline font-bold">
                      {selectedCamp.phone} (點擊撥號)
                    </a>
                  ) : (
                    <strong className="text-slate-400">請洽官網/粉專</strong>
                  )}
                </span>
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
                            <span className="text-xs font-black bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full border border-rose-200 flex items-center gap-0.5">
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
                    <div className="flex items-center gap-2 flex-wrap mb-2.5">
                      <button
                        type="button"
                        onClick={() => handleOpenAR(site)}
                        className="text-xs sm:text-sm font-black px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-500 hover:to-rose-600 text-slate-950 transition-all flex items-center gap-1.5 shadow-sm transform hover:scale-105"
                        title="開啟手機相機與陀螺儀，以 AR 實境透視太陽方位與搭帳指南"
                      >
                        📱 AR 搭帳
                      </button>
                      <button
                        type="button"
                        onClick={() => setSafeRouteModalCamp(site)}
                        className="text-xs sm:text-sm font-bold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 transition-colors flex items-center gap-1.5 shadow-sm"
                        title="分析前往此營地最安全的行車路徑、會車難度與防刮底盤建議"
                      >
                        🛡️ 安全路徑
                      </button>
                      <button
                        type="button"
                        onClick={() => setWeatherModalCamp(site)}
                        className="text-xs sm:text-sm font-bold px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        ⛅ 天氣 & 羅盤
                      </button>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl mb-3 border border-slate-100 flex flex-wrap justify-between items-center text-xs font-semibold text-slate-700 gap-2">
                      <span>
                        📞 預約電話: {site.phone ? (
                          <a href={`tel:${site.phone}`} className="text-blue-600 hover:underline font-bold">
                            {site.phone} (點擊撥號)
                          </a>
                        ) : (
                          <strong className="text-slate-400">請洽官網/粉專</strong>
                        )}
                      </span>
                    </div>

                    {/* 📝 使用者個人註解與露營紀錄 */}
                    <div className="mb-3 pt-2 border-t border-slate-100">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          📝 我的露營札記 / 註解
                          {campNotes.length > 0 && (
                            <span className="bg-blue-100 text-blue-700 font-black px-2 py-0.5 rounded-full text-xs">
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
                              <span className="text-xs text-slate-500 font-medium">還有其他 {campNotes.length - 1} 筆紀錄</span>
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

      {/* 📋 下方營地快速對照表 - 支援手機版摺疊收合與緊湊高密度檢視 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-12">
        <div 
          onClick={() => setIsTableExpanded(!isTableExpanded)}
          className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3 cursor-pointer select-none hover:bg-slate-100/80 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📋</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  營地快速預約對照表
                </h3>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold border border-indigo-200">
                  共 {currentCampsites.length} 筆
                </span>
                {favoriteCamps.size > 0 && (
                  <span className="text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full font-bold border border-rose-200">
                    ❤️ 最愛 {currentCampsites.filter(c => favoriteCamps.has(c.id)).length} 筆
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isTableExpanded ? '點擊此處可收合表格' : '📱 手機版已預設摺疊收合防長滑，點擊即可展開對照'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3.5 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>{isTableExpanded ? '收合對照表 ▴' : `展開對照表 (${currentCampsites.length}筆) ▾`}</span>
            </button>
          </div>
        </div>

        {/* 展開時的內容 */}
        {isTableExpanded && (
          <div className="animate-in fade-in duration-200">
            {/* 快速篩選工具列 */}
            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-200 flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-500">快速過濾：</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setTableFilter('all'); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  tableFilter === 'all' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                全部 ({currentCampsites.length})
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setTableFilter('favorites'); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  tableFilter === 'favorites' 
                    ? 'bg-rose-600 text-white shadow-sm' 
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                ❤️ 我的最愛 ({currentCampsites.filter(c => favoriteCamps.has(c.id)).length})
              </button>
              {bookmarkedCamps.size > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setTableFilter('bookmarked'); }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    tableFilter === 'bookmarked' 
                      ? 'bg-amber-600 text-white shadow-sm' 
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  📌 待確認 ({currentCampsites.filter(c => bookmarkedCamps.has(c.id)).length})
                </button>
              )}
            </div>

            {/* 限制最大高度與內部獨立滾動 (max-h-[60vh]) */}
            <div className="max-h-[60vh] overflow-y-auto">
              
              {/* 1. 📱 行動版專用極致緊湊清單 (sm:hidden) - 無須橫向捲動，單筆高度僅 ~50px，完全沒有多餘空白！ */}
              <div className="block sm:hidden divide-y divide-slate-100">
                {tableDisplayCamps.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    目前篩選條件下無符合項目
                  </div>
                ) : (
                  tableDisplayCamps.map((site) => {
                    const { mins, dist } = getCampDriveInfo(site);
                    const isBookmarked = bookmarkedCamps.has(site.id);
                    const isFav = favoriteCamps.has(site.id);
                    const campNotes = userNotes[site.id] || [];

                    let bookUrl = null;
                    let bookLabel = '🏕️ 訂位';
                    if (site.booking_url) {
                      bookUrl = site.booking_url.split('\n')[0].trim();
                      if (bookUrl.includes('icamping')) bookLabel = '🏕️ 愛露營';
                      else if (bookUrl.includes('easycamp')) bookLabel = '🏕️ 露營樂';
                    } else if (site.booking_type === 'line' && site.line_id) {
                      bookUrl = `https://line.me/R/ti/p/${site.line_id.replace('@', '%40')}`;
                      bookLabel = '💬 LINE';
                    } else if (site.phone) {
                      bookUrl = `tel:${site.phone}`;
                      bookLabel = `📞 電話`;
                    } else {
                      bookUrl = `https://www.google.com/search?q=${encodeURIComponent(site.name + ' 露營 預約')}`;
                      bookLabel = '🔍 訂位';
                    }
                    const gpsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.name)}&travelmode=driving`;

                    return (
                      <div
                        key={site.id}
                        className={`p-2.5 transition-colors ${
                          selectedCamp?.id === site.id ? 'bg-amber-50' : isFav ? 'bg-rose-50/40' : isBookmarked ? 'bg-amber-50/40' : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* 第 1 行：收藏 + 營地名稱 + 海拔 + 車程距離 */}
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <button onClick={(e) => toggleFavorite(e, site.id)} className="text-base hover:scale-110 shrink-0 transition-transform" title={isFav ? "從我的最愛移除" : "加入我的最愛"}>
                              {isFav ? '❤️' : '🤍'}
                            </button>
                            <button onClick={(e) => toggleBookmark(e, site.id)} className={`text-base shrink-0 transition-transform hover:scale-110 ${isBookmarked ? 'text-amber-500' : 'text-slate-300 grayscale opacity-50'}`}>
                              {isBookmarked ? '📌' : '➕'}
                            </button>
                            <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">{site.name}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0 font-medium">
                            <span className="bg-slate-100 text-slate-700 font-semibold px-1.5 py-0.2 rounded text-xs">
                              ⛰️ {site.altitude || '標示中'}
                            </span>
                            <span>·</span>
                            <span className="text-amber-700 font-bold text-xs whitespace-nowrap">
                              🚗 {mins ? `${mins}分` : '確認中'}
                            </span>
                          </div>
                        </div>

                        {/* 第 2 行：所有功能與訂位導航膠囊（全部在一行內橫向展開） */}
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <div className="flex items-center gap-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleOpenAR(site)}
                              className="text-xs px-2 py-0.5 rounded-md border font-bold bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 transition-colors shadow-xs"
                            >
                              📱 AR
                            </button>
                            <button
                              type="button"
                              onClick={() => setSafeRouteModalCamp(site)}
                              className="text-xs px-2 py-0.5 rounded-md border font-bold bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 transition-colors shadow-xs"
                            >
                              🛡️ 路徑
                            </button>
                            <button
                              type="button"
                              onClick={() => setWeatherModalCamp(site)}
                              className="text-xs px-2 py-0.5 rounded-md border font-bold bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 transition-colors shadow-xs"
                            >
                              ⛅ 天氣
                            </button>
                            <button
                              onClick={() => setActiveNoteCamp(site)}
                              className={`text-xs px-2 py-0.5 rounded-md border font-bold transition-colors shadow-xs ${
                                campNotes.length > 0 
                                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                  : 'bg-slate-50 text-slate-500 border-slate-200'
                              }`}
                            >
                              📝 {campNotes.length > 0 ? `${campNotes.length}筆` : '筆記'}
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <a
                              href={bookUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-0.5 px-2 rounded-md text-xs shadow-xs whitespace-nowrap"
                            >
                              {bookLabel}
                            </a>
                            <a
                              href={gpsNavUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-0.5 px-2 rounded-md text-xs shadow-xs whitespace-nowrap"
                            >
                              🧭 導航
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 2. 💻 桌機平板版專用乾淨 5 欄表格 (hidden sm:block) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
                    <tr className="text-slate-600 border-b border-slate-200 text-xs sm:text-sm">
                      <th className="p-3 font-bold">營地名稱</th>
                      <th className="p-3 font-bold">海拔</th>
                      <th className="p-3 font-bold whitespace-nowrap">車程 / 距離 ({FIXED_ORIGINS[originKey]})</th>
                      <th className="p-3 font-bold">特色功能</th>
                      <th className="p-3 font-bold">預約 / 導航</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableDisplayCamps.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 text-xs">
                          目前篩選條件下無符合項目
                        </td>
                      </tr>
                    ) : (
                      tableDisplayCamps.map((site) => {
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
                            <td className="p-2.5 sm:p-3 font-bold text-slate-900 align-middle">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <button onClick={(e) => toggleFavorite(e, site.id)} className="text-base hover:scale-110 transition-transform" title={isFav ? "從我的最愛移除" : "加入我的最愛"}>
                                  {isFav ? '❤️' : '🤍'}
                                </button>
                                <button onClick={(e) => toggleBookmark(e, site.id)} className={`text-base transition-transform hover:scale-110 ${isBookmarked ? 'text-amber-500' : 'text-slate-300 grayscale opacity-50'}`}>
                                  {isBookmarked ? '📌' : '➕'}
                                </button>
                                <span className="text-xs sm:text-sm">{site.name}</span>
                              </div>
                            </td>
                            <td className="p-2.5 sm:p-3 text-slate-600 text-xs sm:text-sm whitespace-nowrap align-middle">{site.altitude || '標示中'}</td>
                            <td className="p-2.5 sm:p-3 text-slate-600 text-xs sm:text-sm whitespace-nowrap align-middle">{mins ? `${mins} 分` : '確認中'} ({dist})</td>
                            <td className="p-2.5 sm:p-3 align-middle">
                              <div className="flex flex-wrap gap-1 max-w-[210px]">
                                <button
                                  type="button"
                                  onClick={() => handleOpenAR(site)}
                                  className="text-xs px-2 py-0.5 rounded-lg border font-semibold bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap"
                                >
                                  📱 AR
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSafeRouteModalCamp(site)}
                                  className="text-xs px-2 py-0.5 rounded-lg border font-semibold bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap"
                                >
                                  🛡️ 路徑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setWeatherModalCamp(site)}
                                  className="text-xs px-2 py-0.5 rounded-lg border font-semibold bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap"
                                >
                                  ⛅ 天氣
                                </button>
                                <button
                                  onClick={() => setActiveNoteCamp(site)}
                                  className={`text-xs px-2 py-0.5 rounded-lg border font-semibold transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap ${
                                    campNotes.length > 0 
                                      ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' 
                                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  📝 {campNotes.length > 0 ? `${campNotes.length}筆` : '筆記'}
                                </button>
                              </div>
                            </td>
                            <td className="p-2.5 sm:p-3 align-middle">{renderTableActions(site)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 表格底部快速收合列 */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
              <span>💡 提示：在表格中點擊愛心 ❤️ 或釘選 📌 可快速將營地收藏置頂</span>
              <button
                type="button"
                onClick={() => setIsTableExpanded(false)}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded hover:bg-slate-200 transition-colors"
              >
                收合對照表 ▴
              </button>
            </div>
          </div>
        )}
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
                                className="text-xs font-bold text-blue-600 hover:underline"
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
                        
                        <div className="p-3 border-t border-slate-100 bg-slate-50 mt-auto flex flex-col gap-1.5">
                          <a
                            href={site.booking_url ? site.booking_url.split('\n')[0].trim() : (site.phone ? `tel:${site.phone}` : `https://www.google.com/search?q=${encodeURIComponent(site.name + ' 露營 預約')}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors shadow-sm flex items-center justify-center gap-1"
                          >
                            🏕️ 前往預約 / 訂位
                          </a>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.name)}&travelmode=driving`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors shadow-sm flex items-center justify-center gap-1"
                          >
                            🧭 Google 導航
                          </a>
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
        onOpenAR={handleOpenAR}
      />

      {/* 🛡️ 最安全行車路徑分析 Modal */}
      <CampsiteSafeRouteModal
        campsite={safeRouteModalCamp}
        isOpen={!!safeRouteModalCamp}
        onClose={() => setSafeRouteModalCamp(null)}
        originName={FIXED_ORIGINS[originKey]}
        userNotes={safeRouteModalCamp ? (userNotes[safeRouteModalCamp.id] || []) : []}
      />

      {/* 📱 AR 實境陀螺儀搭帳方位指引 Modal */}
      <CampsiteARModal
        campsite={arModalCamp}
        isOpen={!!arModalCamp}
        onClose={() => {
          setArModalCamp(null);
          setArModalWind(null);
        }}
        windDir={arModalWind?.windDir}
        windSpeed={arModalWind?.windSpeed}
        initialLocationMode={arModalInitialMode}
      />

      {/* ✨ 獨家黑科技：AR 實境搭帳圖文解說 Modal (點擊按鈕彈出) */}
      {showArGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-indigo-500/30">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-white/10 flex justify-between items-center bg-slate-900/95 backdrop-blur-md flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs sm:text-sm font-black bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 uppercase tracking-wide shadow-md">
                  ✨ 獨家黑科技
                </span>
                <h2 className="text-lg sm:text-2xl font-black text-white flex items-center gap-2">
                  <span>📱</span> AR 實境搭帳導引儀：圖文使用說明與科學原理
                </h2>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowArGuideModal(false);
                    const targetCamp = selectedCamp || sortedFilteredCampsites[0] || campsites[0];
                    if (targetCamp) handleOpenAR(targetCamp, null, 'current');
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-500 hover:to-rose-600 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center gap-1.5 transform hover:scale-105"
                >
                  <span>🚀</span> 立即體驗 AR
                </button>
                <button
                  onClick={() => setShowArGuideModal(false)}
                  className="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-colors"
                >
                  ✕ 關閉
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-7 overflow-y-auto flex-1 space-y-7 text-white">
              {/* 現場實地三步驟圖解 */}
              <div>
                <span className="text-sm font-black text-amber-400 tracking-wider block mb-3 uppercase">
                  📍 現場操作三部曲（拿起手機，站在營位中央即可使用）：
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  
                  {/* Step 1 */}
                  <div className="bg-slate-800/80 rounded-2xl p-4 sm:p-5 border border-white/10 flex flex-col justify-between shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="w-7 h-7 rounded-full bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center">1</span>
                        <span className="text-xs font-bold text-slate-400">啟用後置鏡頭與羅盤</span>
                      </div>
                      <h3 className="font-extrabold text-base text-white mb-2">📱 舉起手機，環顧現場</h3>
                      
                      <div className="bg-slate-950/70 rounded-xl p-3 border border-white/10 text-center mb-3">
                        <div className="w-full h-8 bg-slate-900 rounded-full border border-white/20 flex items-center justify-center text-xs text-amber-400 font-mono mb-2">
                          ▲ 100° 東 (E) 滾動刻度帶
                        </div>
                        <div className="text-2xl animate-bounce">☀️</div>
                        <span className="text-xs text-amber-300 block font-semibold mt-1">透視天空日出／正午／日落方位</span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        在營地按任一卡片的「📱 AR 搭帳」，手機會開啟鏡頭透視草地，畫面上方即時顯示 360° 羅盤刻度帶與太陽天球軌跡。
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="bg-slate-800/80 rounded-2xl p-4 sm:p-5 border border-amber-400/30 flex flex-col justify-between shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="w-7 h-7 rounded-full bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center">2</span>
                        <span className="text-xs font-bold text-amber-300">智慧角度差值引導</span>
                      </div>
                      <h3 className="font-extrabold text-base text-white mb-2">🧭 跟隨上方箭頭旋轉身體</h3>
                      
                      <div className="bg-slate-950/70 rounded-xl p-3 border border-amber-400/40 text-center mb-3">
                        <div className="px-3 py-1.5 bg-amber-400/20 border border-amber-400/50 rounded-lg text-amber-300 font-black text-xs sm:text-sm mb-1.5 inline-block">
                          👈 請向左轉動 64°
                        </div>
                        <span className="text-xs text-slate-400 block font-mono">尋找最優目標：250° (西南西)</span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        系統依據營地所在經緯度自動計算最佳搭帳朝向（240°~270° 西南西）。請照著頂部箭頭提示的角度旋轉身體。
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="bg-slate-800/80 rounded-2xl p-4 sm:p-5 border border-emerald-500/30 flex flex-col justify-between shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="w-7 h-7 rounded-full bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center">3</span>
                        <span className="text-xs font-bold text-emerald-400">準心鎖定 ✕ 平整鋪墊</span>
                      </div>
                      <h3 className="font-extrabold text-base text-white mb-2">🎯 準心轉綠，立即下釘</h3>
                      
                      <div className="bg-emerald-950/40 rounded-xl p-3 border border-emerald-500/40 text-center mb-3">
                        <div className="w-10 h-10 mx-auto rounded-full border-2 border-emerald-400 flex items-center justify-center text-xs font-bold text-emerald-300 shadow-[0_0_15px_#10b981] mb-1">
                          ┼
                        </div>
                        <span className="text-xs sm:text-sm text-emerald-400 font-black block">🎯 完美搭帳朝向！</span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        當準心亮起翡翠綠光圈，代表帳門正對此方位！清晨 06:00~07:30 晨曬在帳篷背後，不會把內帳烤熱。
                      </p>
                    </div>
                  </div>

                </div>

                {/* 🌌 新增：AR 夜間星空圖與觀測重點亮點橫幅 */}
                <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-purple-950/60 via-indigo-950/70 to-slate-900 border border-purple-500/40 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-3xl shrink-0">🌌</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-purple-500 text-white">v2.7.0 旗艦新功能</span>
                        <h4 className="text-sm sm:text-base font-black text-purple-200">AR 夜間星空圖 ✕ 觀測重點介紹手冊</h4>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        入夜後點擊 AR 頂部【🌌 夜間星空】，仰望天空即時鎖定北極星、銀河核心、夏季/冬季大三角與深空星系！內建月光害指數推演、手機 30 秒夜拍教學與全年度流星雨日曆。
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowArGuideModal(false);
                      const targetCamp = selectedCamp || sortedFilteredCampsites[0] || campsites[0];
                      if (targetCamp) handleOpenAR(targetCamp, null, 'current');
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-lg transition-all shrink-0"
                  >
                    🚀 體驗 AR 星空
                  </button>
                </div>
              </div>

              {/* 背後科學原理圖解 */}
              <div className="pt-4 border-t border-white/10">
                <span className="text-sm font-black text-sky-400 tracking-wider block mb-3 uppercase">
                  🔬 為什麼這樣搭？背後的露營科學三大定律：
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 space-y-1.5">
                    <span className="text-amber-400 font-bold text-sm flex items-center gap-1.5">
                      ☀️ 1. 避開清晨 06:00 晨曬溫室效應
                    </span>
                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                      台灣夏季早晨 6 點太陽便自東北東升起，若帳門朝東，晨光直射內帳會瞬間升溫破 35°C 悶熱難耐！將帳門朝向西南西（240°~270°），內帳處於背光陰影區，享受睡到自然醒。
                    </p>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 space-y-1.5">
                    <span className="text-sky-400 font-bold text-sm flex items-center gap-1.5">
                      💨 2. 平行氣流破風，狂風不倒帳
                    </span>
                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                      右下角即時風向顯示來風方向。隧道帳長軸須平行風向，讓流線圓弧迎風破風；天幕主脊線順風擺設，能減少 60% 以上側受風壓，避免營釘在強陣風下被拔起。
                    </p>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 space-y-1.5">
                    <span className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                      📐 3. 水平儀偵測地勢，防睡覺血液倒流
                    </span>
                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                      手機平放於草地可量測前後與左右傾角。若斜度 &gt; 5°，睡墊頭部必須朝向上坡方向，避免夜間睡覺時腦部充血頭痛或整個人滑下充氣床墊。
                    </p>
                  </div>

                </div>
              </div>

              {/* 演算法多目標權衡機制 (Multi-Objective Optimization) */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="text-sm font-black text-amber-400 tracking-wider uppercase flex items-center gap-1.5">
                    ⚖️ 我們的演算法在背景進行了「多目標權衡（Multi-Objective Optimization）」：
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    核心原則：安全抗風 ＞ 遮陽避晨曬 ＞ 景觀視野
                  </span>
                </div>
                
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-xs sm:text-sm bg-slate-950/70 border-collapse">
                    <thead>
                      <tr className="border-b border-white/15 bg-white/5 text-slate-300 font-bold">
                        <th className="p-3">現場氣候條件</th>
                        <th className="p-3">系統決策邏輯</th>
                        <th className="p-3">AR 準心指引建議</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs sm:text-sm text-slate-200">
                      <tr>
                        <td className="p-3 font-semibold text-emerald-300 whitespace-nowrap">
                          🍃 微風 / 無風時<br />
                          <span className="text-xs text-slate-400 font-mono">風速 &lt; 15 km/h</span>
                        </td>
                        <td className="p-3 font-medium text-amber-300">
                          ☀️ 防晨曬熱醒優先
                        </td>
                        <td className="p-3 text-slate-300">
                          強制引導準心至 <strong className="text-amber-400 font-mono">240°~270° (西南西)</strong>，太陽在帳篷正背後，享受睡到自然醒。
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-rose-300 whitespace-nowrap">
                          💨 強風警戒時<br />
                          <span className="text-xs text-slate-400 font-mono">風速 &gt; 25 km/h</span>
                        </td>
                        <td className="p-3 font-medium text-rose-300">
                          🛡️ 結構抗風安全優先
                        </td>
                        <td className="p-3 text-slate-300">
                          提示長軸平行來風破風；若側向曬太陽，建議將天幕迎風側壓低斜搭（A-Frame）阻擋側風與側光。
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-sky-300 whitespace-nowrap">
                          ⛰️ 一般山區氣候<br />
                          <span className="text-xs text-slate-400 font-mono">風速 15~25 km/h</span>
                        </td>
                        <td className="p-3 font-medium text-sky-300">
                          ⚖️ 兼顧破風與避曬
                        </td>
                        <td className="p-3 text-slate-300">
                          自動抓取風向與日出夾角的中間平衡點（長軸順風、帳門背日），兼顧舒適與安全。
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-900/90 border-t border-white/10 flex justify-between items-center text-xs text-slate-400">
              <span>支援全台營地經緯度日照軌跡與即時風向計算</span>
              <button
                onClick={() => setShowArGuideModal(false)}
                className="px-5 py-1.5 bg-white text-slate-950 hover:bg-slate-200 font-black text-xs rounded-xl shadow transition-colors"
              >
                關閉說明
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📜 網頁頁腳 & 版號資訊 */}
      <footer className="mt-12 pt-6 pb-4 border-t border-slate-200 text-center text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-3">
        <p>© 2026 台灣露營地研究中心 · 整合全台營地數據、天體天文模型與數值氣象預報</p>
        <button
          type="button"
          onClick={() => setShowHistoryModal(true)}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span>📜</span> 目前系統版本：<strong className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{APP_VERSION} (查看完整更新日誌)</strong>
        </button>
      </footer>

      {/* 📜 系統版本更新歷程 Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white text-slate-900 w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📜</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-black text-white">版本更新歷程 (Version History)</h2>
                    <span className="text-xs font-mono font-bold bg-emerald-500 text-slate-950 px-2.5 py-0.5 rounded-full">
                      最新 {APP_VERSION}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">追蹤台灣露營地研究中心的每項功能進化與改版紀錄</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-colors"
              >
                ✕ 關閉
              </button>
            </div>

            {/* Modal Body: Timeline */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {VERSION_HISTORY.map((ver) => (
                <div key={ver.version} className="relative pl-6 pb-6 border-l-2 border-indigo-200 last:border-transparent last:pb-0">
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white shadow ${
                    ver.isLatest ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-400'
                  }`}></div>

                  <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-900 font-mono">{ver.version}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {ver.tag}
                      </span>
                      {ver.isLatest && (
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-slate-400 font-medium">{ver.date}</span>
                  </div>

                  <ul className="space-y-2 text-xs sm:text-sm text-slate-700">
                    {ver.changes.map((c, cIdx) => (
                      <li key={cIdx} className="flex items-start gap-2">
                        <span className="font-bold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 flex-shrink-0 mt-0.5">
                          {c.badge}
                        </span>
                        <span className="leading-relaxed">{c.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
              <span>持續迭代優化中 · 感謝露友的使用與回饋</span>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow transition-colors"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
