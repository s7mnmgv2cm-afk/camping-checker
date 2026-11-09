// Astronomical calculations for Solar, Stellar, and Lunar Ephemeris

// Standard Julian Date & Local Sidereal Time
export function getLocalSiderealTime(date, lng) {
  const jd = 2440587.5 + date.getTime() / 86400000;
  const d = jd - 2451545.0;
  const gmst = 280.46061837 + 360.98564736629 * d;
  return ((gmst + lng) % 360 + 360) % 360;
}

// Convert Celestial Equatorial Coordinates (RA, Dec in degrees) to Horizontal (Azimuth, Elevation)
export function radecToAltAz(raDeg, decDeg, date, lat, lng) {
  const rad = Math.PI / 180;
  const lst = getLocalSiderealTime(date, lng);
  const ha = ((lst - raDeg) % 360 + 360) % 360;
  const haRad = ha * rad;
  const decRad = decDeg * rad;
  const latRad = lat * rad;

  const sinEl = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  
  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinEl) / (Math.cos(latRad) * Math.cos(el));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) / rad;
  if (Math.sin(haRad) > 0) {
    az = 360 - az;
  }
  return {
    azimuth: Math.round(az * 10) / 10,
    elevation: Math.round((el / rad) * 10) / 10
  };
}

// Astronomical calculation for Sun Elevation and Azimuth
export function calculateSolarPosition(date, lat, lng) {
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

// Moon Phase and Light Pollution Index
export function getMoonPhaseInfo(date = new Date()) {
  const knownNewMoon = new Date(2024, 0, 11, 11, 57);
  const diffDays = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const cycle = 29.53058770576; // Synodic month
  const phaseDays = ((diffDays % cycle) + cycle) % cycle;
  const illumination = Math.round((1 - Math.cos((phaseDays / cycle) * 2 * Math.PI)) / 2 * 100);
  
  let phaseName = '新月 (朔)';
  let rating = '⭐⭐⭐⭐⭐ 絕佳觀星夜 (0% 月光害)';
  let advice = '整夜無月光干擾，銀河與暗星肉眼清晰可見，是露營深空攝影最佳黃金期！';
  let icon = '🌑';

  if (phaseDays < 1.5 || phaseDays > 28) {
    phaseName = '新月 (朔)';
    rating = '⭐⭐⭐⭐⭐ 絕佳觀星夜 (0% 月光害)';
    advice = '新月完全無月光，銀河核心與深空天體最為璀璨壯觀！';
    icon = '🌑';
  } else if (phaseDays < 7) {
    phaseName = '眉月 (娥眉月)';
    rating = '⭐⭐⭐⭐ 極佳觀星 (月光微弱)';
    advice = '月亮在前半夜即西沉，後半夜夜空純淨，銀河拍攝窗口極佳。';
    icon = '🌒';
  } else if (phaseDays < 9.5) {
    phaseName = '上弦月';
    rating = '⭐⭐⭐ 良好 (前半夜有半月)';
    advice = '午夜 00:00 後月亮西落，後半夜恢復純黑無光害夜空。';
    icon = '🌓';
  } else if (phaseDays < 14) {
    phaseName = '盈凸月';
    rating = '⭐⭐ 普通 (月光較強)';
    advice = '前半夜月光較強，可專注觀測木星、土星與冬季/夏季一等亮星。';
    icon = '🌔';
  } else if (phaseDays < 16) {
    phaseName = '滿月 (望)';
    rating = '⭐ 月光強烈 (滿月光害)';
    advice = '滿月照亮全天，銀河不可見；推薦欣賞月球環形山與高空明亮星座。';
    icon = '🌕';
  } else if (phaseDays < 21) {
    phaseName = '虧凸月';
    rating = '⭐⭐ 普通 (後半夜有月光)';
    advice = '把握黃昏入夜後至 22:30 前無月光空檔，為夜景與銀河拍攝良機！';
    icon = '🌖';
  } else if (phaseDays < 23) {
    phaseName = '下弦月';
    rating = '⭐⭐⭐ 良好 (前半夜無月光)';
    advice = '午夜前夜空漆黑無月光，把握 19:30~23:30 仰望璀璨銀河。';
    icon = '🌗';
  } else {
    phaseName = '殘月';
    rating = '⭐⭐⭐⭐ 極佳 (破曉前月起)';
    advice = '整晚幾乎無光害，僅拂曉晨曦破曉前出現極細銀彎月。';
    icon = '🌘';
  }

  return {
    phaseDays: Math.round(phaseDays * 10) / 10,
    illumination,
    phaseName,
    rating,
    advice,
    icon
  };
}

// Curated Stargazing Targets for Taiwanese Campers
export const CELESTIAL_TARGETS = [
  // 1. 北極星與北天樞紐
  {
    id: 'polaris',
    name: '北極星 (Polaris)',
    enName: 'Alpha Ursae Minoris',
    constellation: '小熊座',
    type: 'star',
    mag: 1.98,
    ra: 37.95,
    dec: 89.26,
    icon: '🌟',
    badge: '真北指針',
    story: '全天夜空旋轉樞紐，仰角恰好等於營地緯度（台灣約 24°~25°）。露營搭帳定位正北與赤道儀對極軸的核心！',
    color: 'from-amber-200 to-yellow-400'
  },
  {
    id: 'dubhe',
    name: '天樞星 (Dubhe)',
    enName: 'Alpha UMa',
    constellation: '大熊座 (北斗七星)',
    type: 'star',
    mag: 1.79,
    ra: 165.93,
    dec: 61.75,
    icon: '✨',
    badge: '北斗第一星',
    story: '北斗七星勺口外緣星，與天璇連線延長5倍即可直指北極星。',
    color: 'from-amber-300 to-orange-400'
  },
  {
    id: 'merak',
    name: '天璇星 (Merak)',
    enName: 'Beta UMa',
    constellation: '大熊座 (北斗七星)',
    type: 'star',
    mag: 2.37,
    ra: 165.46,
    dec: 56.38,
    icon: '✨',
    badge: '指極雙星',
    story: '北斗七星勺底星，與天樞星被天文愛好者合稱為「指極雙星」。',
    color: 'from-sky-200 to-indigo-300'
  },
  {
    id: 'alioth',
    name: '玉衡星 (Alioth)',
    enName: 'Epsilon UMa',
    constellation: '大熊座 (北斗七星)',
    type: 'star',
    mag: 1.77,
    ra: 193.51,
    dec: 55.96,
    icon: '✨',
    badge: '北斗最亮星',
    story: '北斗七星中視星等最亮的一顆，位於斗柄連接處。',
    color: 'from-sky-200 to-blue-400'
  },
  {
    id: 'schedar',
    name: '王良四 (Schedar)',
    enName: 'Alpha Cas',
    constellation: '仙后座 (倒 W 字)',
    type: 'star',
    mag: 2.24,
    ra: 10.13,
    dec: 56.54,
    icon: '👑',
    badge: '秋冬尋北指標',
    story: '仙后座倒 W 字核心星。秋冬季節北斗七星隱沒於地平線時，仙后座高懸北天，是尋找北極星的最佳指引。',
    color: 'from-amber-300 to-orange-500'
  },

  // 2. 夏季大三角與璀璨銀河
  {
    id: 'milkyway_core',
    name: '銀河核心 (Milky Way Core)',
    enName: 'Galactic Center',
    constellation: '人馬座 / 天蠍座',
    type: 'deepsky',
    mag: 0.0,
    ra: 266.42,
    dec: -29.01,
    icon: '🌌',
    badge: '壯麗銀河拱橋',
    story: '銀河系中心超大質量黑洞方向，星雲與暗星雲交織最密集的璀璨銀帶，露營夏季必拍的絕美銀河倒影！',
    color: 'from-purple-400 via-pink-400 to-amber-300'
  },
  {
    id: 'vega',
    name: '織女星 (Vega)',
    enName: 'Alpha Lyrae',
    constellation: '天琴座',
    type: 'star',
    mag: 0.03,
    ra: 279.23,
    dec: 38.78,
    icon: '💎',
    badge: '夏季大三角',
    story: '全天第5亮星，散發清澈青白光芒。隔著銀河與牽牛星遙遙相望，為夏季星空無可爭議的女王。',
    color: 'from-cyan-200 to-blue-400'
  },
  {
    id: 'altair',
    name: '牛郎星 / 牽牛星 (Altair)',
    enName: 'Alpha Aquilae',
    constellation: '天鷹座',
    type: 'star',
    mag: 0.77,
    ra: 297.70,
    dec: 8.87,
    icon: '🦅',
    badge: '夏季大三角',
    story: '天鷹座心臟，自轉極快的扁球狀恆星。兩側各有「河鼓一」與「河鼓三」相伴，民間稱為扁擔星。',
    color: 'from-amber-100 to-yellow-300'
  },
  {
    id: 'deneb',
    name: '天津四 (Deneb)',
    enName: 'Alpha Cygni',
    constellation: '天鵝座',
    type: 'star',
    mag: 1.25,
    ra: 310.36,
    dec: 45.28,
    icon: '🦢',
    badge: '夏季大三角',
    story: '天鵝座尾部超巨星，距離地球超過 2,600 光年依然耀眼奪目！象徵天鵝順著銀河展翅翱翔。',
    color: 'from-blue-200 to-indigo-400'
  },
  {
    id: 'antares',
    name: '心宿二 (Antares)',
    enName: 'Alpha Scorpii',
    constellation: '天蠍座',
    type: 'star',
    mag: 1.06,
    ra: 247.35,
    dec: -26.43,
    icon: '🦂',
    badge: '大火星 · 天蠍心臟',
    story: '紅超巨星，散發如火焰般的鮮紅光芒，中國古代稱之為「大火」。「七月流火」即指心宿二入秋後向西偏落。',
    color: 'from-red-400 to-rose-600'
  },

  // 3. 冬季大三角與王者獵戶座
  {
    id: 'sirius',
    name: '天狼星 (Sirius)',
    enName: 'Alpha Canis Majoris',
    constellation: '大犬座',
    type: 'star',
    mag: -1.46,
    ra: 101.29,
    dec: -16.72,
    icon: '⭐',
    badge: '全天最亮恆星',
    story: '夜空中肉眼可見最明亮的恆星！散發鑽石般璀璨的藍白光輝，距離地球僅 8.6 光年。',
    color: 'from-blue-100 via-cyan-300 to-white'
  },
  {
    id: 'betelgeuse',
    name: '參宿四 (Betelgeuse)',
    enName: 'Alpha Orionis',
    constellation: '獵戶座',
    type: 'star',
    mag: 0.50,
    ra: 88.79,
    dec: 7.41,
    icon: '🏹',
    badge: '冬季大三角 · 紅超巨星',
    story: '獵戶座右肩巨大紅超巨星，體積大到若置於太陽系中心將吞噬木星軌道！近年天文學界密切關注其超新星爆發。',
    color: 'from-amber-400 to-red-500'
  },
  {
    id: 'rigel',
    name: '參宿七 (Rigel)',
    enName: 'Beta Orionis',
    constellation: '獵戶座',
    type: 'star',
    mag: 0.13,
    ra: 78.63,
    dec: -8.20,
    icon: '⚡',
    badge: '藍白超巨星',
    story: '獵戶座左膝，光度為太陽的 12 萬倍！與參宿四一藍一紅形成強烈鮮明對比。',
    color: 'from-cyan-300 to-blue-500'
  },
  {
    id: 'procyon',
    name: '南河三 (Procyon)',
    enName: 'Alpha Canis Minoris',
    constellation: '小犬座',
    type: 'star',
    mag: 0.38,
    ra: 114.83,
    dec: 5.22,
    icon: '🐕',
    badge: '冬季大三角',
    story: '冬季大三角的重要頂點，在古希臘語中意為「在天狼星之前升起」。',
    color: 'from-yellow-200 to-amber-400'
  },

  // 4. 深空天體與著名星團
  {
    id: 'pleiades',
    name: '昴宿星團 (Pleiades M45)',
    enName: 'Seven Sisters',
    constellation: '金牛座',
    type: 'cluster',
    mag: 1.6,
    ra: 56.75,
    dec: 24.11,
    icon: '✨',
    badge: '七姊妹星團',
    story: '肉眼可見的一小簇淡藍色星團，猶如鑲嵌在黑絲絨上的鑽石，日語稱為「Subaru (速霸陸)」。',
    color: 'from-cyan-300 via-sky-200 to-indigo-300'
  },
  {
    id: 'andromeda',
    name: '仙女座大星系 (Andromeda M31)',
    enName: 'M31 Spiral Galaxy',
    constellation: '仙女座',
    type: 'galaxy',
    mag: 3.44,
    ra: 10.68,
    dec: 41.27,
    icon: '🌀',
    badge: '肉眼最遠天體',
    story: '人類肉眼能看到最遙遠的天體！距離地球 250 萬光年，也是銀河系未來的碰撞伴侶。山區無光害時肉眼呈紡錘狀光斑。',
    color: 'from-indigo-300 via-purple-300 to-pink-300'
  },
  {
    id: 'arcturus',
    name: '大角星 (Arcturus)',
    enName: 'Alpha Bootis',
    constellation: '牧夫座',
    type: 'star',
    mag: -0.05,
    ra: 213.92,
    dec: 19.18,
    icon: '🌾',
    badge: '春季大弧線',
    story: '全天第4亮星，泛著溫暖橙黃光澤。循著北斗斗柄圓弧順勢向外延伸，第一眼就能找到它。',
    color: 'from-amber-400 to-orange-500'
  },
  {
    id: 'capella',
    name: '五車二 (Capella)',
    enName: 'Alpha Aurigae',
    constellation: '御夫座',
    type: 'star',
    mag: 0.08,
    ra: 79.17,
    dec: 45.99,
    icon: '🐐',
    badge: '北天金黃一等星',
    story: '全天第6亮星，常在秋冬夜空北東方閃耀金黃光芒，由兩對黃色巨星組成的複雜四合星系統。',
    color: 'from-yellow-300 to-amber-400'
  }
];

// Stargazing Observation Guide Content
export const STARGAZING_GUIDE = {
  title: '營地夜間觀星重點指南 (Stargazing Field Manual)',
  sub: '給露營愛好者的天文實用手冊 · 銀河窗口 ✕ 手機夜拍 ✕ 流星雨',
  sections: [
    {
      icon: '🌌',
      title: '銀河核心 (Milky Way Core) 拍攝黃金窗口',
      tag: '露友必讀',
      points: [
        '春末夏初 (4~6月)：午夜 00:00~03:30 自東南方升起，呈壯麗傾斜橫跨拱橋。',
        '仲夏至秋初 (7~9月)：入夜 20:00 即矗立於正南方天際，銀心直立貫穿天頂，肉眼極致震撼！',
        '深秋 (10~11月)：日落後西南方低空短暫可見（約 18:30~20:30），隨後西落。',
        '最佳拍攝方位：向南或西南方視野開闊無樹遮蔽之營位，搭配遠方帳篷內透光營造氛圍。'
      ]
    },
    {
      icon: '📸',
      title: '營地手機夜拍星空設定大補帖 (無須單眼相機)',
      tag: '極致夜拍',
      points: [
        'iPhone 設定：必備腳架或平放於露營桌上。陀螺儀偵測到「完全靜止」時，相機夜間模式秒數會自動解鎖至最高【30 秒】！曝光補償拉到 -0.7 以壓制暗部噪點。',
        'Android 旗艦 (Samsung / Xiaomi / Vivo)：開啟「專業模式 (Pro Mode)」：ISO 1600~3200、快門 20~25 秒、手動對焦 (MF) 拉至無限遠 (∞)、白平衡設為 3800K~4000K 拍出湛藍冷星空。',
        'Google Pixel：直接切換至「天文攝影模式」，倒數計時按快門即可自動多幀合成降噪星空與星軌縮時。',
        '嚴禁開啟手電筒：按下快門前請告知周遭露友，避免白光破壞夜視與長曝光畫面。'
      ]
    },
    {
      icon: '🌠',
      title: '全年度重要流星雨週期 (Meteor Showers)',
      tag: '許願良機',
      points: [
        '8月12~13日【英仙座流星雨】：ZHR 約 100，夏季露營避暑首選，流星速度快且常帶有明亮火流星！',
        '12月13~14日【雙子座流星雨】：ZHR 約 150，全天最穩定最大量！冬季高海拔營地觀星極品。',
        '1月3~4日【象限儀座流星雨】：ZHR 約 110，極大期窗口較短，速度中等明亮。',
        '10月21日【獵戶座流星雨】：母體為哈雷彗星，常出現快速且持久的流星餘痕。'
      ]
    },
    {
      icon: '🧭',
      title: '營地四季快速尋星心法',
      tag: '肉眼認星',
      points: [
        '尋找正北 (北極星)：認北斗七星勺口「天璇至天樞」連線延長 5 倍；若秋冬北斗隱沒，改認仙后座倒「W」字。',
        '夏季大三角：天頂最亮的三顆星串成大三角形——織女星（天琴座）、牛郎星（天鷹座）、天津四（天鵝座），銀河貫穿其中。',
        '冬季大三角：全天最亮天狼星（大犬座）、火紅參宿四（獵戶座）、南河三（小犬座），正中央即為王者獵戶座腰帶三星。'
      ]
    }
  ]
};
