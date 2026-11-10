// Taiwan Campsite Nearby POIs (Trails, Waterfalls, Viewpoints, Secret Spots)
// Seamless WebAR Geospatial Positioning Engine

import { getDistanceMeters, getForwardAzimuth, getApparentElevation } from './peaks.js';

// Category Definitions
export const POI_CATEGORIES = [
  { id: 'all', label: '全部景點', icon: '✨' },
  { id: 'waterfall', label: '瀑布野溪', icon: '💧' },
  { id: 'trail', label: '健行步道', icon: '🥾' },
  { id: 'viewpoint', label: '展望台／日出', icon: '🌅' },
  { id: 'attraction', label: '秘境景點', icon: '🌲' }
];

// Curated Taiwan Camping POI Knowledge Base (High-Accuracy Real Coordinates)
export const TAIWAN_REGIONAL_POIS = [
  // 苗栗 泰安 / 大湖 / 卓蘭
  {
    id: 'poi_miaoli_shuiyun',
    name: '水雲瀑布',
    type: 'waterfall',
    icon: '💧',
    latitude: 24.4694,
    longitude: 120.9889,
    elevation: 700,
    region: '苗栗縣',
    township: '泰安鄉',
    travelTime: '車程約 15 分鐘至水雲吊橋 + 溯溪步行 25 分鐘',
    travelMode: 'drive_walk',
    difficulty: '中等 (需涉溪，建議防滑溯溪鞋)',
    highlights: '汶水溪上游東洗水溪峽谷巨瀑，水質碧綠清澈，需經水雲吊橋步行溯溪前往',
    safetyWarning: '午後山區雷陣雨溪水易暴漲，請勿於深潭跳水'
  },
  {
    id: 'poi_miaoli_wugayan',
    name: '烏嘎彥竹林隧道',
    type: 'attraction',
    icon: '🌲',
    latitude: 24.4209,
    longitude: 120.9196,
    elevation: 900,
    region: '苗栗縣',
    township: '泰安鄉',
    travelTime: '步行約 10~15 分鐘 / 車程 3 分鐘',
    travelMode: 'walk',
    difficulty: '輕鬆健行 (平緩水泥與碎石路)',
    highlights: '台版京都嵐山竹林小徑，翠竹蔽天宛如世外桃源，拍照打卡熱點',
    safetyWarning: '道路狹窄不易會車，建議步行前往欣賞'
  },
  {
    id: 'poi_miaoli_henglong',
    name: '橫龍古道',
    type: 'trail',
    icon: '🥾',
    latitude: 24.4882,
    longitude: 120.9676,
    elevation: 1340,
    region: '苗栗縣',
    township: '泰安鄉',
    travelTime: '車程 20 分鐘至登山口，單程步程約 1.5 小時',
    travelMode: 'drive_walk',
    difficulty: '進階健行 (原始林徑、階梯陡升)',
    highlights: '昔日泰雅族打獵警備古道，秋季楓紅層層，登頂橫龍山展望極佳',
    safetyWarning: '山徑多樹根與落葉容易打滑，建議使用登山杖'
  },
  {
    id: 'poi_miaoli_manabang',
    name: '馬那邦山登山步道',
    type: 'trail',
    icon: '🥾',
    latitude: 24.3688,
    longitude: 120.9102,
    elevation: 1406,
    region: '苗栗縣',
    township: '泰安鄉',
    travelTime: '車程 25 分鐘至天然湖登山口',
    travelMode: 'drive_walk',
    difficulty: '中級山登山 (需耗時 3~4 小時)',
    highlights: '台灣一等三角點名山，遠眺大安溪谷與雪山聖稜線，秋冬雲海壯麗',
    safetyWarning: '午後山頂常起濃霧，請備齊頭燈、保暖衣物與足夠飲水'
  },
  {
    id: 'poi_miaoli_taian_hotspring',
    name: '泰安溫泉源頭步道',
    type: 'viewpoint',
    icon: '🌅',
    latitude: 24.4682,
    longitude: 120.9685,
    elevation: 580,
    region: '苗栗縣',
    township: '泰安鄉',
    travelTime: '車程約 18 分鐘至警光山莊',
    travelMode: 'drive',
    difficulty: '平緩好走 (適合全家大小)',
    highlights: '沿著汶水溪畔漫步，感受純天然碳酸氫鈉泉地熱白煙與溪谷風光',
    safetyWarning: '溪谷岩石濕滑，請沿步道木棧道行走'
  },

  // 新竹 尖石 / 五峰
  {
    id: 'poi_hsinchu_qingwa',
    name: '青蛙石天空步道',
    type: 'waterfall',
    icon: '💧',
    latitude: 24.6868,
    longitude: 121.2287,
    elevation: 480,
    region: '新竹縣',
    township: '尖石鄉',
    travelTime: '車程約 15 分鐘至售票接駁站',
    travelMode: 'drive',
    difficulty: '輕鬆 (透明玻璃懸空彩虹觀景台)',
    highlights: '巨型青蛙天然奇石，懸空玻璃橋俯瞰那羅溪壯麗彩虹飛瀑',
    safetyWarning: '需於售票亭搭乘接駁車，橋面遇雨濕滑請勿奔跑'
  },
  {
    id: 'poi_hsinchu_smangus',
    name: '司馬庫斯巨木步道',
    type: 'trail',
    icon: '🥾',
    latitude: 24.5776,
    longitude: 121.3377,
    elevation: 1540,
    region: '新竹縣',
    township: '尖石鄉',
    travelTime: '單程健行約 2.5 小時 (全長 5.2 公里至老爺神木)',
    travelMode: 'walk',
    difficulty: '入門至中等 (平緩好走土徑)',
    highlights: '上帝的部落，台灣第二大巨木「老爺神木」，滿滿檜木芬多精與碎石竹林',
    safetyWarning: '來回路程 10.4 公里需耗時 4~5 小時，請注意下午回程時間'
  },
  {
    id: 'poi_hsinchu_cangxi',
    name: '霞喀羅國家步道 (養老端)',
    type: 'trail',
    icon: '🥾',
    latitude: 24.5608,
    longitude: 121.2817,
    elevation: 1277,
    region: '新竹縣',
    township: '尖石鄉',
    travelTime: '車程約 30 分鐘至養老登山口',
    travelMode: 'drive_walk',
    difficulty: '中級健行 (平緩古道)',
    highlights: '全台最知名賞楓國家步道，橫跨薩克亞金溪，馬鞍楓香林與栗園竹林',
    safetyWarning: '山區午後路況濕滑，部分崩塌邊坡需快速通過勿逗留'
  },
  {
    id: 'poi_hsinchu_beijiao',
    name: '北角吊橋與油羅溪畔',
    type: 'viewpoint',
    icon: '🌅',
    latitude: 24.7022,
    longitude: 121.1973,
    elevation: 276,
    region: '新竹縣',
    township: '尖石鄉',
    travelTime: '車程約 10 分鐘',
    travelMode: 'drive',
    difficulty: '極輕鬆',
    highlights: '全台第二長吊橋，紅色鋼拱跨越清澈油羅溪，品嚐知名法式冰淇淋',
    safetyWarning: '吊橋偶有強烈側風，請握緊隨身帽子與手機'
  },
  {
    id: 'poi_hsinchu_zhenxibu',
    name: '鎮西堡千年神木群',
    type: 'attraction',
    icon: '🌲',
    latitude: 24.5540,
    longitude: 121.2927,
    elevation: 1620,
    region: '新竹縣',
    township: '尖石鄉',
    travelTime: '車程 25 分鐘至登山口 + 健行 3~4 小時',
    travelMode: 'drive_walk',
    difficulty: '中級登山 (泥濘樹根原始山徑)',
    highlights: '全台灣最大的原始巨木紅檜與扁柏森林，亞當神木與夏娃神木氣勢磅礴',
    safetyWarning: '山林原始濕度高，必穿防滑登山鞋並攜帶頭燈'
  },
  {
    id: 'poi_hsinchu_baxian',
    name: '大鹿林道八仙瀑布',
    type: 'waterfall',
    icon: '💧',
    latitude: 24.5339,
    longitude: 121.0994,
    elevation: 1000,
    region: '新竹縣',
    township: '五峰鄉',
    travelTime: '車程約 20 分鐘至大鹿林道 8.5K 觀瀑點',
    travelMode: 'drive',
    difficulty: '輕鬆 (林道公路旁觀景)',
    highlights: '大鹿林道旁峭壁垂落之雙層白絹飛瀑，遠眺爺巴堪溪峽谷水聲淙淙',
    safetyWarning: '林道狹窄請靠邊停車，注意過往大鹿林道車輛'
  },
  {
    id: 'poi_hsinchu_qingquan',
    name: '清泉吊橋與張學良故居',
    type: 'attraction',
    icon: '🌲',
    latitude: 24.5746,
    longitude: 121.1039,
    elevation: 550,
    region: '新竹縣',
    township: '五峰鄉',
    travelTime: '車程約 10 分鐘',
    travelMode: 'drive',
    difficulty: '極輕鬆 (平緩木棧步道與日式園區)',
    highlights: '泰雅族清泉部落溫泉文化、張學良幽禁故居、三毛夢屋與清泉一號吊橋',
    safetyWarning: '假日部落市集車位易滿，建議早點出發'
  },

  // 南投 仁愛 / 清境 / 埔里 / 魚池 / 信義
  {
    id: 'poi_nantou_tebilun',
    name: '帖比倫瀑布秘境',
    type: 'waterfall',
    icon: '💧',
    latitude: 24.1551,
    longitude: 121.1169,
    elevation: 1300,
    region: '南投縣',
    township: '仁愛鄉',
    travelTime: '車程 25 分鐘至紅香部落茶園停車場 + 步行 20 分鐘',
    travelMode: 'drive_walk',
    difficulty: '中等 (需拉繩下切濕滑岩壁)',
    highlights: '紅黑交錯礦石峽谷，漩渦狀沖蝕壺穴與碧綠深潭，震撼的視覺奇景',
    safetyWarning: '深潭水流漩渦暗湧強烈，嚴禁下水嬉戲，岩壁務必抓牢繩索'
  },
  {
    id: 'poi_nantou_shimen',
    name: '石門山日出步道',
    type: 'viewpoint',
    icon: '🌅',
    latitude: 24.1505,
    longitude: 121.2858,
    elevation: 3237,
    region: '南投縣',
    township: '仁愛鄉',
    travelTime: '車程 35 分鐘，單程步程僅 25 分鐘',
    travelMode: 'drive_walk',
    difficulty: '最親民台灣百岳 (木棧道與階梯)',
    highlights: '合歡群峰日出最佳觀景台，360 度俯瞰中央尖山、奇萊連峰與雲海翻騰',
    safetyWarning: '海拔超過 3000 公尺低溫強風，務必備齊禦寒手套毛帽防高山症'
  },
  {
    id: 'poi_nantou_aowanda',
    name: '奧萬大飛瀑與楓林區',
    type: 'waterfall',
    icon: '💧',
    latitude: 23.9573,
    longitude: 121.1734,
    elevation: 1220,
    region: '南投縣',
    township: '仁愛鄉',
    travelTime: '車程 30 分鐘，園區健行 1.5 小時',
    travelMode: 'drive_walk',
    difficulty: '輕鬆至中等',
    highlights: '腦寮溪高負離子雙層飛瀑，秋冬滿山楓紅與奧萬大壯麗大吊橋',
    safetyWarning: '颱風暴雨後園區易有邊坡落石，入園前請先查閱官網即時路況'
  },
  {
    id: 'poi_nantou_jinlong',
    name: '金龍山日出雲海琉璃光觀景台',
    type: 'viewpoint',
    icon: '🌅',
    latitude: 23.9042,
    longitude: 120.8931,
    elevation: 820,
    region: '南投縣',
    township: '魚池鄉',
    travelTime: '車程約 10 分鐘直達第二/三觀景台',
    travelMode: 'drive',
    difficulty: '極輕鬆 (開車直達木造觀景高台)',
    highlights: '低海拔日出雲海三大聖地之一，俯瞰魚池盆地夜景與五彩琉璃光',
    safetyWarning: '清晨路邊晨霧大，山區髮夾彎道請開霧燈並慢速慢行'
  },
  {
    id: 'poi_nantou_shuanglong',
    name: '雙龍瀑布七彩吊橋',
    type: 'waterfall',
    icon: '💧',
    latitude: 23.7550,
    longitude: 120.9289,
    elevation: 800,
    region: '南投縣',
    township: '信義鄉',
    travelTime: '車程約 25 分鐘 + 接駁車',
    travelMode: 'drive',
    difficulty: '中等 (需走好漢坡上山健行)',
    highlights: '全台最深最長七彩高空吊橋，橫跨 110 公尺深峽谷，俯瞰上下雙雙飛瀑',
    safetyWarning: '吊橋高度極高有強烈側風，有心臟病或懼高症者請衡量身體狀況'
  },

  // 嘉義 阿里山 / 梅山 / 竹崎
  {
    id: 'poi_chiayi_tefuye',
    name: '特富野古道 (自忠端)',
    type: 'trail',
    icon: '🥾',
    latitude: 23.4841,
    longitude: 120.8302,
    elevation: 2282,
    region: '嘉義縣',
    township: '阿里山鄉',
    travelTime: '車程約 25 分鐘至自忠登山口',
    travelMode: 'drive_walk',
    difficulty: '入門輕鬆 (前半段舊鐵道枕木極平緩)',
    highlights: '舊日阿里山舊鐵道高空桁架鐵橋，霧林柳杉林夾道，充滿山林歷史感',
    safetyWarning: '鐵道枕木潮濕容易打滑，後半段下坡梯階較陡請量力而行'
  },
  {
    id: 'poi_chiayi_dingshizhao',
    name: '頂石棹步道群 (霞之道/雲之道)',
    type: 'viewpoint',
    icon: '🌅',
    latitude: 23.4793,
    longitude: 120.6987,
    elevation: 1450,
    region: '嘉義縣',
    township: '阿里山鄉',
    travelTime: '車程 10 分鐘 / 步行可達周邊茶園',
    travelMode: 'drive_walk',
    difficulty: '入門好走 (石階與木棧道)',
    highlights: '茶園梯田環繞，夕陽雲海與阿里山琉璃光最佳攝影聖地',
    safetyWarning: '傍晚起霧快速視野驟降，建議攜帶手電筒或提早返回營地'
  },
  {
    id: 'poi_chiayi_yuantan',
    name: '圓潭自然生態瀑布園區',
    type: 'waterfall',
    icon: '💧',
    latitude: 23.5289,
    longitude: 120.6594,
    elevation: 980,
    region: '嘉義縣',
    township: '竹崎鄉 / 梅山鄉交界',
    travelTime: '車程約 15 分鐘',
    travelMode: 'drive',
    difficulty: '極輕鬆 (全線無障礙平緩木棧道)',
    highlights: '圓潭、向山與心湖三座自然瀑布，負離子充沛，清涼溪魚成群',
    safetyWarning: '夏季注意山區蚊蟲，請攜帶防蚊液'
  },

  // 桃園 復興
  {
    id: 'poi_taoyuan_xiaowulai',
    name: '小烏來天空步道與瀑布底',
    type: 'waterfall',
    icon: '💧',
    latitude: 24.7912,
    longitude: 121.3765,
    elevation: 380,
    region: '桃園市',
    township: '復興區',
    travelTime: '車程約 12 分鐘',
    travelMode: 'drive',
    difficulty: '輕鬆 (玻璃觀景台與階梯步道)',
    highlights: '凌空延伸 11 公尺玻璃走道，正上方俯瞰落差 50 公尺轟鳴巨瀑',
    safetyWarning: '下切水岸步道階梯較多，長者與幼童請放慢腳步'
  },
  {
    id: 'poi_taoyuan_dongyanshan',
    name: '東眼山自導式健行步道',
    type: 'trail',
    icon: '🥾',
    latitude: 24.8250,
    longitude: 121.4175,
    elevation: 1212,
    region: '桃園市',
    township: '復興區',
    travelTime: '車程約 20 分鐘至森林遊樂區',
    travelMode: 'drive_walk',
    difficulty: '中等健行 (約 2 小時完成)',
    highlights: '登上三等三角點瞭望台，遠眺大台北盆地、台北 101 與林口台地',
    safetyWarning: '林道氣候涼爽多霧，請準備薄外套防風'
  },

  // 宜蘭 大同 / 礁溪
  {
    id: 'poi_yilan_jianqing',
    name: '見晴懷古步道',
    type: 'trail',
    icon: '🥾',
    latitude: 24.5055,
    longitude: 121.5258,
    elevation: 1890,
    region: '宜蘭縣',
    township: '大同鄉',
    travelTime: '車程約 35 分鐘至太平山公路',
    travelMode: 'drive_walk',
    difficulty: '極輕鬆 (全長僅 900 公尺平緩台車道)',
    highlights: '全球最美 28 條古道之一，長滿青苔的舊森林舊鐵道與雲海山嵐交織',
    safetyWarning: '停車位有限建議一早前往，高山路段請注意防寒'
  },
  {
    id: 'poi_yilan_fanfan',
    name: '梵梵野溪溫泉',
    type: 'waterfall',
    icon: '💧',
    latitude: 24.6161,
    longitude: 121.5233,
    elevation: 320,
    region: '宜蘭縣',
    township: '大同鄉',
    travelTime: '車程 15 分鐘至英士部落停車場 + 步行 20 分鐘',
    travelMode: 'drive_walk',
    difficulty: '入門溯溪 (需踩水過溪床)',
    highlights: '天然原汁原味野溪溫泉池，溪水與溫泉冷熱交融，泡湯仰望峽谷山巒',
    safetyWarning: '嚴禁大雨過後前往，溪底碎石多請穿溯溪防滑鞋'
  }
];

export function normalizeSpot(spot) {
  return {
    ...spot,
    travelTime: spot.travelTime || spot.travel_time || '車程約 10 分鐘',
    travelMode: spot.travelMode || spot.travel_mode || 'drive',
    safetyWarning: spot.safetyWarning || spot.safety_warning || '山區路況多變，請注意慢行',
    distanceKm: spot.distanceKm || spot.distance_km || 1.0,
    highlights: spot.highlights || '熱門山林健行與自然景觀',
    desc: spot.highlights || spot.desc || '鄰近自然生態秘境'
  };
}

/**
 * Compute Relative POI Coordinates from User / Campsite location
 */
export function computeNearbyPOIs(obsLat, obsLng, obsElev = 500, maxDistanceKm = 25, activeCategory = 'all', dynamicSpots = []) {
  const maxDistM = maxDistanceKm * 1000;
  
  // Combine dynamic Google Overview spots with curated Taiwan camping POIs (prevent duplicate IDs)
  const combined = dynamicSpots.map(normalizeSpot);
  const dynamicNames = new Set(dynamicSpots.map(s => s.name));

  TAIWAN_REGIONAL_POIS.forEach(p => {
    if (!dynamicNames.has(p.name)) {
      combined.push(normalizeSpot(p));
    }
  });

  return combined.map(spot => {
    if (!spot.latitude || !spot.longitude) return null;
    
    // Category Filter
    if (activeCategory !== 'all' && spot.type !== activeCategory) {
      return null;
    }

    const distM = getDistanceMeters(obsLat, obsLng, spot.latitude, spot.longitude);
    if (distM > maxDistM) return null;

    const azimuth = Math.round(getForwardAzimuth(obsLat, obsLng, spot.latitude, spot.longitude) * 10) / 10;
    const targetElev = spot.elevation || obsElev;
    const apparentElevation = Math.round(getApparentElevation(distM, obsElev, targetElev) * 10) / 10;
    const distanceKm = Math.round(distM / 100) / 10;

    return {
      ...spot,
      altitudeM: targetElev,
      elevationM: targetElev,
      azimuth,
      apparentElevation,
      elevation: apparentElevation,
      distM,
      distanceKm,
      distKm: distanceKm
    };
  }).filter(Boolean).sort((a, b) => a.distM - b.distM);
}

/**
 * Project POIs to WebAR Camera Screen (0~100% viewport)
 */
export function projectPOIsToScreen(pois, heading, camElevation, fovH = 65, fovV = 55) {
  return pois.map(poi => {
    let azDiff = (poi.azimuth - heading + 540) % 360 - 180;
    let elDiff = poi.apparentElevation - camElevation;

    const screenX = 50 + (azDiff / (fovH / 2)) * 50;
    const screenY = 50 - (elDiff / (fovV / 2)) * 50;

    const isVisible = screenX >= -20 && screenX <= 120 && screenY >= -20 && screenY <= 120;
    const inView = screenX >= 0 && screenX <= 100 && screenY >= 0 && screenY <= 100;

    // Edge direction indicator (-1 for left, 1 for right, 0 for in center horizontal zone)
    const edgeIndicator = azDiff < -fovH / 2 ? 'left' : azDiff > fovH / 2 ? 'right' : null;

    return {
      ...poi,
      screenX,
      screenY,
      isVisible,
      inView,
      azDiff,
      edgeIndicator
    };
  });
}

/**
 * Fetch campsite nearby POIs via Google Realtime Places / AI Overview with LocalStorage & Cloud caching (方案 C)
 */
export async function fetchCampsiteSpots(campsite, options = {}) {
  const {
    forceRefresh = false,
    lat: propLat,
    lng: propLng,
    locationMode = 'campsite'
  } = options;

  if (!campsite && (!propLat || !propLng)) return [];

  const activeLat = propLat !== undefined && propLat !== null ? Number(propLat) : (campsite?.latitude ? Number(campsite.latitude) : 24.42);
  const activeLng = propLng !== undefined && propLng !== null ? Number(propLng) : (campsite?.longitude ? Number(campsite.longitude) : 120.92);
  const isCurrentGps = locationMode === 'current';

  const cacheKey = isCurrentGps
    ? `campsite_ai_spots_gps_${activeLat.toFixed(3)}_${activeLng.toFixed(3)}`
    : `campsite_ai_spots_${campsite?.id || campsite?.name || 'default'}`;

  // If not forcing refresh, check LocalStorage
  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to read POI cache:', e);
    }
  }

  try {
    const res = await fetch('/api/spots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: campsite?.id,
        name: isCurrentGps ? '目前 GPS 所在地' : (campsite?.name || '露營區'),
        region: campsite?.region || '',
        location: campsite?.location || '',
        latitude: activeLat,
        longitude: activeLng,
        altitude: campsite?.altitude || 600,
        locationMode,
        forceRefresh
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.spots)) {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data.spots));
        } catch (e) {
          console.warn('Failed to save POI cache:', e);
        }
      }
      data.spots.__meta = {
        source: data.source,
        summary: data.summary,
        campsite: data.campsite
      };
      return data.spots;
    }
  } catch (err) {
    console.warn('Fetch spots API error, using local fallback:', err);
  }

  // Fallback to local curated
  const elev = campsite?.altitude ? Number(campsite.altitude) : 600;
  return computeNearbyPOIs(activeLat, activeLng, elev, 35, 'all');
}

