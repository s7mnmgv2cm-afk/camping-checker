// Taiwan Mountains, Peaks & Ridges Database with Geospatial Visibility Algorithms
// Supports WebAR PeakVisor / PeakFinder camera perspective projection

// Earth Radius in meters
const EARTH_RADIUS = 6371000;

// Refraction index for atmospheric curvature correction
const REFRACTION_K = 0.13;

/**
 * Calculate Great-Circle Distance (in meters) between two WGS84 coordinates using Haversine formula
 */
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = EARTH_RADIUS;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate Forward Azimuth (in degrees, 0~360 from True North) from observer to target peak
 */
export function getForwardAzimuth(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return (theta * 180 / Math.PI + 360) % 360;
}

/**
 * Calculate Apparent Elevation Angle (in degrees) with Earth Curvature Drop and Atmospheric Refraction
 * @param {number} distMeters - Horizontal distance in meters
 * @param {number} obsElevM - Observer altitude in meters
 * @param {number} peakElevM - Target peak altitude in meters
 */
export function getApparentElevation(distMeters, obsElevM, peakElevM) {
  // Earth curvature drop formula corrected for refraction: h_drop = D^2 / (2 * R) * (1 - k)
  const earthDropMeters = (distMeters * distMeters) / (2 * EARTH_RADIUS) * (1 - REFRACTION_K);
  const effectiveHeightDiff = (peakElevM - obsElevM) - earthDropMeters;
  const elevRad = Math.atan2(effectiveHeightDiff, distMeters);
  return elevRad * 180 / Math.PI;
}

/**
 * Calculate relative position for all peaks from observer standpoint
 */
export function computePeaksFromLocation(obsLat, obsLng, obsElev = 500, maxDistanceKm = 80) {
  const maxDistM = maxDistanceKm * 1000;

  return TAIWAN_PEAKS.map(peak => {
    const distM = getDistanceMeters(obsLat, obsLng, peak.latitude, peak.longitude);
    if (distM > maxDistM) return null;

    const azimuth = Math.round(getForwardAzimuth(obsLat, obsLng, peak.latitude, peak.longitude) * 10) / 10;
    const apparentElevation = Math.round(getApparentElevation(distM, obsElev, peak.elevation) * 10) / 10;
    const distanceKm = Math.round(distM / 100) / 10;

    return {
      ...peak,
      altitudeM: peak.elevation,
      azimuth,
      apparentElevation,
      elevation: apparentElevation, // angular view elevation in degrees for screen projection
      heightMeters: peak.elevation,
      distanceKm,
      distKm: distanceKm,
      desc: peak.story,
      distM
    };
  }).filter(Boolean).sort((a, b) => a.distM - b.distM);
}

// Curated Database of 42 Iconic Taiwan Mountains, Baiyue & Prominent Landmarks
export const TAIWAN_PEAKS = [
  // 1. 雪山山脈與聖稜線核心 (Holy Ridge & Shei-Pa)
  {
    id: 'xueshan_main',
    name: '雪山主峰',
    enName: 'Xueshan Main Peak',
    elevation: 3886,
    latitude: 24.383401,
    longitude: 121.231754,
    range: '雪山山脈',
    type: '百岳 No.2 · 五岳之一',
    icon: '🏔️',
    color: '#38bdf8', // Sky Blue
    story: '台灣第二高峰，泰雅族語稱「Babo Hagay」。冬季覆蓋皓皓白雪，冰斗圈谷地形鬼斧神工，為聖稜線南端起點！'
  },
  {
    id: 'xueshan_east',
    name: '雪山東峰',
    enName: 'Xueshan East Peak',
    elevation: 3201,
    latitude: 24.384661,
    longitude: 121.272186,
    range: '雪山山脈',
    type: '台灣百岳 No.73',
    icon: '⛰️',
    color: '#38bdf8',
    story: '哭坡頂端之百岳，視野極致遼闊，可同時飽覽中央尖山、南湖大山與武陵農場全景。'
  },
  {
    id: 'xueshan_north',
    name: '雪山北峰',
    enName: 'Xueshan North Peak',
    elevation: 3703,
    latitude: 24.414724,
    longitude: 121.240396,
    range: '雪山山脈',
    type: '台灣百岳 No.11 · 十潤之一',
    icon: '🏔️',
    color: '#38bdf8',
    story: '聖稜線中段重要門戶，峰頂有童話般的紅頂童話木屋營地，遠眺如刀削斧劈的岩壁。'
  },
  {
    id: 'dabajian',
    name: '大霸尖山',
    enName: 'Dabajian Mountain',
    elevation: 3492,
    latitude: 24.460833,
    longitude: 121.258611,
    range: '雪山山脈',
    type: '百岳 No.28 · 世紀奇峰 · 三尖之一',
    icon: '🗿',
    color: '#fbbf24', // Amber
    story: '泰雅與賽夏族聖山，四面絕壁宛如酒桶直插雲霄，為新竹苗栗高海拔露營區最震撼的視覺地標！'
  },
  {
    id: 'xiaobajian',
    name: '小霸尖山',
    enName: 'Xiaobajian Mountain',
    elevation: 3418,
    latitude: 24.455278,
    longitude: 121.250833,
    range: '雪山山脈',
    type: '台灣百岳 No.36 · 八小巒之一',
    icon: '⛰️',
    color: '#fbbf24',
    story: '大霸尖山旁獨立挺拔的岩石巨峰，形如拇指，與大霸並列雙雄。'
  },
  {
    id: 'pintian',
    name: '品田山',
    enName: 'Pintian Mountain',
    elevation: 3524,
    latitude: 24.426389,
    longitude: 121.272222,
    range: '雪山山脈',
    type: '百岳 No.24 · 武陵四秀之首 · 十峻之一',
    icon: '🧗',
    color: '#34d399', // Emerald
    story: '武陵四秀最高峰，著名的品田斷崖橫亙，特殊褶皺沈積岩岩層如巨大階梯堆疊。'
  },
  {
    id: 'chiyou',
    name: '池有山',
    enName: 'Chiyou Mountain',
    elevation: 3303,
    latitude: 24.425833,
    longitude: 121.297500,
    range: '雪山山脈',
    type: '台灣百岳 No.52 · 武陵四秀',
    icon: '🌲',
    color: '#34d399',
    story: '以著名的「池有名樹」（鐵杉）與巨石碎石坡聞名，名列武陵四秀。'
  },
  {
    id: 'taoshan',
    name: '桃山',
    enName: 'Tao Mountain',
    elevation: 3325,
    latitude: 24.432222,
    longitude: 121.303889,
    range: '雪山山脈',
    type: '台灣百岳 No.48 · 武陵四秀',
    icon: '🍑',
    color: '#34d399',
    story: '山形由遠處眺望宛如一顆端坐桃子，峰頂展望極佳，可直面大霸尖山與雪山圈谷。'
  },

  // 2. 苗栗桃竹中級山露營名山 (Campers\' Landmarks)
  {
    id: 'jiali',
    name: '加里山',
    enName: 'Jiali Mountain',
    elevation: 2220,
    latitude: 24.513333,
    longitude: 121.032222,
    range: '加里山山脈',
    type: '苗栗聖山 · 小百岳 No.34',
    icon: '⛰️',
    color: '#2dd4bf', // Teal
    story: '苗栗代表性地標！有「苗栗富士山」之稱，山頂常湧現壯麗雲海，可直接眺望雪山聖稜線。'
  },
  {
    id: 'egongji',
    name: '鵝公髻山',
    enName: 'Egongji Mountain',
    elevation: 1579,
    latitude: 24.607500,
    longitude: 121.085000,
    range: '五峰山脈',
    type: '小百岳 No.31 · 賽夏族聖山',
    icon: '🪿',
    color: '#2dd4bf',
    story: '形如公鵝頭頂肉冠，新竹五峰與苗栗泰安各大露營區幾乎都能仰望其蒼鬱身影。'
  },
  {
    id: 'wuzhi',
    name: '五指山',
    enName: 'Wuzhi Mountain',
    elevation: 1062,
    latitude: 24.636111,
    longitude: 121.080556,
    range: '雪山山系',
    type: '小百岳 No.30 · 台灣八景之一',
    icon: '🖐️',
    color: '#2dd4bf',
    story: '五峰並立如五指並列，清代即名列台灣八景，常有壯闊翻騰的五指山雲海流瀑。'
  },
  {
    id: 'huoyan',
    name: '火炎山',
    enName: 'Huoyan Mountain',
    elevation: 602,
    latitude: 24.373611,
    longitude: 120.730278,
    range: '苗栗丘陵',
    type: '小百岳 No.35 · 台灣大峽谷',
    icon: '🔥',
    color: '#f97316',
    story: '赭紅色礫石惡地地質，夕陽西照時如烈火燃燒，台中苗栗露營南眺之鮮明地標。'
  },
  {
    id: 'yuanzui',
    name: '鳶嘴山',
    enName: 'Yuanzui Mountain',
    elevation: 2180,
    latitude: 24.238333,
    longitude: 120.963611,
    range: '雪山山系',
    type: '中部最驚險岩場名山',
    icon: '🦅',
    color: '#f97316',
    story: '尖銳如鳶鷹之嘴直指蒼穹，純天然刀刃岩脊，台中大雪山露營區最佳視覺焦點。'
  },

  // 3. 中央山脈北段：南湖中央尖與黑色奇萊 (Central Range North)
  {
    id: 'nanhu_main',
    name: '南湖大山',
    enName: 'Nanhu Main Peak',
    elevation: 3742,
    latitude: 24.361805,
    longitude: 121.439359,
    range: '中央山脈',
    type: '百岳 No.7 · 五岳之北岳 · 帝王之山',
    icon: '👑',
    color: '#ec4899', // Pink
    story: '中央山脈北段霸主，山容恢弘端凝，具有保存最完整的古冰河 U 型下圈谷。'
  },
  {
    id: 'zhongyangjian',
    name: '中央尖山',
    enName: 'Zhongyangjian Mountain',
    elevation: 3705,
    latitude: 24.310226,
    longitude: 121.416203,
    range: '中央山脈',
    type: '百岳 No.10 · 三尖之首 · 寶島第一尖',
    icon: '🗡️',
    color: '#ec4899',
    story: '如金字塔般尖銳拔萃的巨大角峰，南壁崩崖千仞，全台灣最具辨識度的山形王者！'
  },
  {
    id: 'qilai_north',
    name: '奇萊北峰',
    enName: 'Qilai North Peak',
    elevation: 3607,
    latitude: 24.118611,
    longitude: 121.332500,
    range: '中央山脈',
    type: '百岳 No.15 · 一奇 · 十峻之一',
    icon: '⚡',
    color: '#8b5cf6', // Violet
    story: '黑色奇萊代表！全山黑色板岩與黑色頁岩疊構，三面絕壁，清晨日出背光時巍峨深邃。'
  },
  {
    id: 'qilai_main',
    name: '奇萊主山',
    enName: 'Qilai Main Peak',
    elevation: 3560,
    latitude: 24.085833,
    longitude: 121.321667,
    range: '中央山脈',
    type: '百岳 No.20 · 四大天王之一',
    icon: '⛰️',
    color: '#8b5cf6',
    story: '奇萊連峰核心，山勢雄偉，與奇萊北峰、卡羅樓斷崖連成一線壯麗天際線。'
  },

  // 4. 合歡群峰 (Hehuan Range - Central Taiwan Stargazing & Camping Hub)
  {
    id: 'hehuan_north',
    name: '合歡北峰',
    enName: 'Hehuan North Peak',
    elevation: 3422,
    latitude: 24.181389,
    longitude: 121.281944,
    range: '中央山脈',
    type: '百岳 No.34 · 合歡群峰最高峰',
    icon: '📡',
    color: '#06b6d4', // Cyan
    story: '合歡群峰最高峰，山頂立有著名的巨大反射板，高山草原如茵，為全台最高海拔觀星聖地。'
  },
  {
    id: 'hehuan_east',
    name: '合歡東峰',
    enName: 'Hehuan East Peak',
    elevation: 3421,
    latitude: 24.137222,
    longitude: 121.287222,
    range: '中央山脈',
    type: '百岳 No.35 · 九峨之一',
    icon: '🌸',
    color: '#06b6d4',
    story: '合歡滑雪場舊址所在，每年五月玉山杜鵑盛開滿山遍野，遠眺奇萊北峰最近最佳看台。'
  },
  {
    id: 'hehuan_main',
    name: '合歡主峰',
    enName: 'Hehuan Main Peak',
    elevation: 3417,
    latitude: 24.142500,
    longitude: 121.271389,
    range: '中央山脈',
    type: '百岳 No.37 · 合歡山門面',
    icon: '🌅',
    color: '#06b6d4',
    story: '步道平緩親民，立霧溪與大甲溪的分水嶺，欣賞日出晨曦與夕陽雲海翻滾的絕品勝地。'
  },
  {
    id: 'shimen',
    name: '石門山',
    enName: 'Shimen Mountain',
    elevation: 3237,
    latitude: 24.153889,
    longitude: 121.285556,
    range: '中央山脈',
    type: '百岳 No.66 · 最親民百岳 · 八小巒',
    icon: '🚶',
    color: '#06b6d4',
    story: '只需步行 30 分鐘即可登頂的百岳，省道台 14 甲線公路穿越山腹，視野縱覽中央山脈。'
  },

  // 5. 玉山群峰 (Yushan Range - Southern Taiwan Crown)
  {
    id: 'yushan_main',
    name: '玉山主峰',
    enName: 'Yushan Main Peak',
    elevation: 3952,
    latitude: 23.470002,
    longitude: 120.957274,
    range: '玉山山脈',
    type: '百岳 No.1 · 東北亞第一高峰 · 五岳之首',
    icon: '👑',
    color: '#eab308', // Gold
    story: '台灣最高峰！海拔 3,952 公尺，巍峨崇高，全台灣與東亞最高屋脊，為台灣大地之母與象徵。'
  },
  {
    id: 'yushan_east',
    name: '玉山東峰',
    enName: 'Yushan East Peak',
    elevation: 3869,
    latitude: 23.470775,
    longitude: 120.965668,
    range: '玉山山脈',
    type: '百岳 No.3 · 十峻之首 · 鐵壁斷崖',
    icon: '🧗',
    color: '#eab308',
    story: '三面斷崖垂直落差逾千公尺，全由巨大硬砂岩構成，被譽為十峻之首，極具王者威儀。'
  },
  {
    id: 'yushan_north',
    name: '玉山北峰',
    enName: 'Yushan North Peak',
    elevation: 3858,
    latitude: 23.487452,
    longitude: 120.959672,
    range: '玉山山脈',
    type: '百岳 No.4 · 氣象站所在',
    icon: '🏦',
    color: '#eab308',
    story: '新台幣千元鈔票背面玉山主峰全貌之取景角度！頂端建有全台最高建築——玉山氣象站。'
  },
  {
    id: 'datashan',
    name: '大塔山',
    enName: 'Data Mountain',
    elevation: 2663,
    latitude: 23.528333,
    longitude: 120.825000,
    range: '阿里山山脈',
    type: '阿里山山脈最高峰 · 鄒族聖山',
    icon: '🌲',
    color: '#10b981',
    story: '鄒族傳說中善良靈魂安息之聖山，嘉義梅山與阿里山露營區向東仰望之最高峰，絕壁雄奇。'
  },
  // 6. 南台灣門戶、阿里山與大武山系 (Southern Taiwan & Dawu Range)
  {
    id: 'tainan_dadong',
    name: '大凍山',
    enName: 'Dadong Mountain (Tainan)',
    elevation: 1241,
    latitude: 23.310833,
    longitude: 120.536944,
    range: '阿里山山脈支稜',
    type: '台南市第一高峰 · 小百岳 No.63',
    icon: '⛰️',
    color: '#10b981',
    story: '台南市最高峰，為白河、楠西露營區向北遠眺最著名的山容指標，山勢雄渾宛如獅頭。'
  },
  {
    id: 'wushan_tainan',
    name: '烏山 (刣牛湖山)',
    enName: 'Wushan Mountain',
    elevation: 799,
    latitude: 23.080556,
    longitude: 120.528333,
    range: '阿里山山脈南端',
    type: '小百岳 No.70 · 楠西玉井地標',
    icon: '⛰️',
    color: '#34d399',
    story: '橫跨台南南化與高雄杉林之壯麗脊稜，視野開闊俯瞰曾文溪谷，為台南露營熱門遠眺稜線。'
  },
  {
    id: 'kantou_tainan',
    name: '崁頭山',
    enName: 'Kantou Mountain',
    elevation: 844,
    latitude: 23.273056,
    longitude: 120.505278,
    range: '阿里山山脈支稜',
    type: '小百岳 No.65 · 東山地標',
    icon: '⛰️',
    color: '#34d399',
    story: '座落於東山仙公廟後方，山頂有知名巨石「情人石」，天氣晴朗時向西遠眺可直達嘉南平原與台灣海峽。'
  },
  {
    id: 'zhentoushan',
    name: '枕頭山',
    enName: 'Zhentou Mountain',
    elevation: 645,
    latitude: 23.336111,
    longitude: 120.501944,
    range: '阿里山山脈支稜',
    type: '關子嶺名山 · 石灰岩峭壁',
    icon: '⛰️',
    color: '#6ee7b7',
    story: '關子嶺溫泉鄉著名地標，整座山如同一塊巨大石灰岩枕頭，壁立千仞，暮色下剪影極美。'
  },
  {
    id: 'beidawu',
    name: '北大武山',
    enName: 'Beidawu Mountain',
    elevation: 3092,
    latitude: 22.628889,
    longitude: 120.758333,
    range: '中央山脈南段',
    type: '百岳 No.90 · 台灣五岳之一 · 南台灣之脊',
    icon: '🏔️',
    color: '#f59e0b',
    story: '排灣族與魯凱族之靈山，中央山脈最南端的三千公尺巨峰，雲海夕照與鐵杉林立名揚全台。'
  },
  {
    id: 'nandawu',
    name: '南大武山',
    enName: 'Nandawu Mountain',
    elevation: 2841,
    latitude: 22.569444,
    longitude: 120.738889,
    range: '中央山脈南段',
    type: '台灣高山名峰 · 險峻雙峰',
    icon: '⛰️',
    color: '#f59e0b',
    story: '大武山系南疆門戶，與北大武山南北對峙，山勢峻峭險阻，保留全台灣最原始原始闊葉林生態。'
  },
  // 7. 台灣中央山脈脊樑、南投中台灣與苗栗水雲名峰 (Central Spine & Iconic Camp Peaks)
  {
    id: 'xiuguluan',
    name: '秀姑巒山',
    enName: 'Xiuguluan Mountain',
    elevation: 3805,
    latitude: 23.498889,
    longitude: 121.059444,
    range: '中央山脈',
    type: '百岳 No.6 · 中央山脈最高峰 · 五岳之一',
    icon: '👑',
    color: '#ec4899',
    story: '中央山脈全線第一高峰！山容渾圓磅礴，峰頂堆疊板岩礫石，與玉山主峰遙遙相對，為台灣屋脊之核心地標。'
  },
  {
    id: 'mabolasi',
    name: '馬博拉斯山',
    enName: 'Mabolasi Mountain',
    elevation: 3785,
    latitude: 23.520278,
    longitude: 121.066944,
    range: '中央山脈',
    type: '百岳 No.7 · 中央山脈第二高峰 · 十峻之一',
    icon: '🧗',
    color: '#ec4899',
    story: '中央山脈第二高峰，南側千仞絕壁直瀉而下，險峻威嚴，與秀姑巒山並列中央山脈南二段雙雄。'
  },
  {
    id: 'qilai_south',
    name: '奇萊南峰',
    enName: 'Qilai South Peak',
    elevation: 3358,
    latitude: 24.060000,
    longitude: 121.282500,
    range: '中央山脈',
    type: '百岳 No.41 · 最親民金色奇萊大草原',
    icon: '🌾',
    color: '#facc15',
    story: '能高越嶺古道著名百岳，柔美如茵的金色高山箭竹草原，破曉晨光映照時一片金黃如童話仙境。'
  },
  {
    id: 'nanhua',
    name: '南華山 (能高北峰)',
    enName: 'Nanhua Mountain',
    elevation: 3184,
    latitude: 24.039167,
    longitude: 121.285833,
    range: '中央山脈',
    type: '百岳 No.76 · 能高草原明珠',
    icon: '⛰️',
    color: '#facc15',
    story: '座落於南投與花蓮縣界脊樑，平緩開闊的翠綠草坡連綿不絕，能高鞍部光被八表碑之北側門戶。'
  },
  {
    id: 'junda',
    name: '郡大山',
    enName: 'Junda Mountain',
    elevation: 3265,
    latitude: 23.577222,
    longitude: 120.963889,
    range: '玉山山脈',
    type: '百岳 No.54 · 八秀之一 · 坐車比爬山累',
    icon: '🚙',
    color: '#eab308',
    story: '玉山山脈北段名峰，郡大林道直通登山口，峰頂西望濁水溪谷、南眺玉山群峰全景，視野極度震撼。'
  },
  {
    id: 'xiluan',
    name: '西巒大山',
    enName: 'Xiluan Mountain',
    elevation: 3081,
    latitude: 23.693611,
    longitude: 120.945833,
    range: '玉山山脈',
    type: '百岳 No.92 · 膝蓋摧毀者 · 信義門戶',
    icon: '🌲',
    color: '#eab308',
    story: '南投信義鄉著名百岳，以落差 1,500 公尺之陡升箭竹原始林聞名，山頂保留木造日治森林瞭望台遺跡。'
  },
  {
    id: 'hushan',
    name: '虎山',
    enName: 'Hu Mountain (Tai\'an)',
    elevation: 1492,
    latitude: 24.485556,
    longitude: 120.998611,
    range: '加里山山脈',
    type: '水雲三星之首 · 中級山大霸尖山',
    icon: '🐯',
    color: '#2dd4bf',
    story: '苗栗泰安溫泉露營區正面仰望最鮮明的岩壁神山！南壁絕壁垂直拔起千仞，山形酷似大霸尖山，氣勢極具壓迫感。'
  },
  {
    id: 'niaozuishan_taian',
    name: '鳥嘴山 (上島山)',
    enName: 'Shangdao Mountain',
    elevation: 1437,
    latitude: 24.460833,
    longitude: 120.970278,
    range: '加里山山脈',
    type: '水雲三星之一 · 泰安溫泉守護神',
    icon: '🦅',
    color: '#2dd4bf',
    story: '汶水溪南岸雄渾聳立的名山，登頂鳥瞰汶水溪谷聚落與泰安溫泉全景，秋季楓葉轉紅襯托山巒深翠。'
  },
  {
    id: 'shuishe',
    name: '水社大山',
    enName: 'Shuishe Mountain',
    elevation: 2059,
    latitude: 23.839444,
    longitude: 120.957500,
    range: '雪山山系支脈',
    type: '日月潭最高峰 · 明潭四秀之首',
    icon: '🌊',
    color: '#06b6d4',
    story: '日月潭最高守護神！落差達 1,300 公尺，從孟宗竹林一路穿梭至原生杜鵑純林，觀景台可將日月潭湖光山色盡收眼底。'
  },
  {
    id: 'zhoushan',
    name: '祝山',
    enName: 'Zhu Mountain (Alishan)',
    elevation: 2488,
    latitude: 23.515278,
    longitude: 120.824722,
    range: '阿里山山脈',
    type: '全台最知名日出觀景台 · 祝山觀日樓',
    icon: '🌅',
    color: '#10b981',
    story: '阿里山觀看玉山群峰破曉萬丈光芒的最經典名山！祝山觀日平台與小笠原山 360 度環景視野名揚海外。'
  },
  {
    id: 'jiayang',
    name: '佳陽山',
    enName: 'Jiayang Mountain',
    elevation: 3314,
    latitude: 24.316111,
    longitude: 121.218889,
    range: '雪山山脈',
    type: '百岳 No.50 · 八小巒之首 · 世紀大崩壁',
    icon: '⛰️',
    color: '#38bdf8',
    story: '雪山山脈大劍稜線之核心奇峰！東南面整片光禿垂直的黑色千仞大滑壁，為大甲溪上游最懾人的視覺屏障。'
  }
];

// Major Scenic Mountain Ridges & Skylines connecting iconic peaks
export const TAIWAN_RIDGES = [
  {
    id: 'holy_ridge',
    name: '聖稜線 (Holy Ridge)',
    subtitle: '大霸尖山 ➔ 品田山 ➔ 雪山主峰',
    range: '雪山山脈',
    color: '#38bdf8',
    story: '沼井鐵太郎名言：「這神聖的稜線啊！誰能真正完成大霸尖山至雪山的縱走，戴上勝利的花冠...」',
    lineStyle: 'solid',
    peakIds: ['dabajian', 'xiaobajian', 'pintian', 'chiyou', 'taoshan', 'xueshan_north', 'xueshan_main', 'xueshan_east']
  },
  {
    id: 'hehuan_skyline',
    name: '合歡連峰天際線',
    subtitle: '合歡北峰 ➔ 石門山 ➔ 合歡主峰 ➔ 合歡東峰',
    range: '中央山脈',
    color: '#06b6d4',
    story: '全台最高海拔高山草原稜線，台 14 甲公路蜿蜒其間，全台最親近的壯麗天際線。',
    lineStyle: 'solid',
    peakIds: ['hehuan_north', 'shimen', 'hehuan_main', 'hehuan_east']
  },
  {
    id: 'qilai_ridge',
    name: '黑色奇萊斷崖稜線',
    subtitle: '奇萊北峰 ➔ 奇萊主山',
    range: '中央山脈',
    color: '#a855f7',
    story: '中央山脈著名的黑色巨峰屏障，斷崖深谷險峻壯麗，夕陽落山時剪影如黑色剪紙。',
    lineStyle: 'dashed',
    peakIds: ['qilai_north', 'qilai_main']
  },
  {
    id: 'nanhu_zhongyang',
    name: '北一段帝王之脊',
    subtitle: '南湖大山 ➔ 中央尖山',
    range: '中央山脈',
    color: '#f43f5e',
    story: '帝王之尊與寶島第一尖的王者對峙，全台灣最剛毅挺拔的高山天際線。',
    lineStyle: 'dashed',
    peakIds: ['nanhu_main', 'zhongyangjian']
  },
  {
    id: 'yushan_ridge',
    name: '玉山群峰黃金天際線',
    subtitle: '玉山東峰 ➔ 玉山主峰 ➔ 玉山北峰',
    range: '玉山山脈',
    color: '#eab308',
    story: '東北亞最高峰脊樑，清晨破曉陽光首度照射之金色山脊。',
    lineStyle: 'solid',
    peakIds: ['yushan_east', 'yushan_main', 'yushan_north']
  },
  {
    id: 'tainan_ridge',
    name: '台南名山綠色天際線',
    subtitle: '烏山 ➔ 崁頭山 ➔ 大凍山 ➔ 枕頭山',
    range: '阿里山山脈支稜',
    color: '#34d399',
    story: '橫跨曾文溪與嘉南平原的蒼翠山脈，為南台灣露營最親近的壯闊地勢天際線。',
    lineStyle: 'solid',
    peakIds: ['wushan_tainan', 'kantou_tainan', 'tainan_dadong', 'zhentoushan']
  },
  {
    id: 'dawu_skyline',
    name: '南疆大武雙峰天際線',
    subtitle: '北大武山 ➔ 南大武山',
    range: '中央山脈南段',
    color: '#f59e0b',
    story: '南台灣巍峨矗立之聖山屏障，雲海波濤之上的守護神。',
    lineStyle: 'solid',
    peakIds: ['beidawu', 'nandawu']
  },
  {
    id: 'nenggao_skyline',
    name: '奇萊南華金色草原天際線',
    subtitle: '奇萊南峰 ➔ 南華山',
    range: '中央山脈',
    color: '#eab308',
    story: '能高越嶺古道著名的黃金高山箭竹草原脊樑，晨曦日照宛如金色地毯鋪展於天地之間。',
    lineStyle: 'solid',
    peakIds: ['qilai_south', 'nanhua']
  },
  {
    id: 'taian_skyline',
    name: '泰安水雲雙星峽谷天際線',
    subtitle: '鳥嘴山 (上島山) ➔ 虎山',
    range: '加里山山脈',
    color: '#2dd4bf',
    story: '苗栗泰安溫泉兩岸夾峙的著名地標！南有上島山、北有虎山，隔著汶水溪深谷彼此凝望。',
    lineStyle: 'dashed',
    peakIds: ['niaozuishan_taian', 'hushan']
  }
];
