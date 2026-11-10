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

// ============================================================================
// 🪐 太陽系大行星開普勒動力學軌道計算 (Planetary Ephemeris: 土星、木星、火星、金星)
// 支援 2024~2030+ 任意日期時間精準推算赤經 (RA) 與赤緯 (Dec)
// ============================================================================
export function getPlanetaryPositions(date = new Date()) {
  const rad = Math.PI / 180;
  const rev = x => ((x % 360) + 360) % 360;
  const d = (date.getTime() / 86400000 + 2440587.5) - 2451545.0;

  // Earth heliocentric coordinates
  const Ms = rev(356.0470 + 0.9856002585 * d);
  const eEarth = 0.016709 - 1.151e-9 * d;
  const Es = Ms + (180 / Math.PI) * eEarth * Math.sin(Ms * rad) * (1 + eEarth * Math.cos(Ms * rad));
  const xvSun = Math.cos(Es * rad) - eEarth;
  const yvSun = Math.sqrt(1 - eEarth * eEarth) * Math.sin(Es * rad);
  const vSun = rev(Math.atan2(yvSun, xvSun) / rad);
  const rSun = Math.sqrt(xvSun * xvSun + yvSun * yvSun);
  const lonsun = rev(vSun + (282.9404 + 4.70935e-5 * d));
  const xs = rSun * Math.cos(lonsun * rad);
  const ys = rSun * Math.sin(lonsun * rad);
  const ecl = (23.4393 - 3.563e-7 * d) * rad;

  const planets = [
    {
      id: 'saturn',
      name: '土星 (Saturn)',
      enName: 'Saturn',
      constellation: '雙魚座',
      type: 'planet',
      icon: '🪐',
      badge: '太陽系指環王 · 鎮星',
      color: 'from-amber-200 via-yellow-300 to-amber-500',
      story: '擁有全太陽系最壯麗冰晶星環！肉眼呈現淡金黃色穩定光芒，古代稱為「鎮星」或「填星」，此時正運行於雙魚座腹部，是露營望遠鏡必看的大行星！',
      mag: 0.7,
      N: 113.6634 + 2.38980e-5 * d,
      i: 2.4886 - 1.081e-6 * d,
      w: 339.3939 + 2.97661e-5 * d,
      a: 9.55475,
      e: 0.055549 - 9.499e-9 * d,
      M: 316.9670 + 0.0334442282 * d
    },
    {
      id: 'jupiter',
      name: '木星 (Jupiter)',
      enName: 'Jupiter',
      constellation: '金牛座 / 雙子座',
      type: 'planet',
      icon: '🪐',
      badge: '太陽系行星之王 · 歲星',
      color: 'from-amber-100 via-amber-300 to-orange-400',
      story: '太陽系最大行星，視星等可達 -2.5 等以上！夜空中極為明亮穩定，小型雙筒鏡即可看見伽利略四大衛星相伴。',
      mag: -2.4,
      N: 100.4542 + 2.76854e-5 * d,
      i: 1.3030 - 1.557e-7 * d,
      w: 273.8777 + 1.64505e-5 * d,
      a: 5.20256,
      e: 0.048498 + 4.469e-9 * d,
      M: 19.8950 + 0.0830853001 * d
    },
    {
      id: 'mars',
      name: '火星 (Mars)',
      enName: 'Mars',
      constellation: '巨蟹座 / 獅子座',
      type: 'planet',
      icon: '♂️',
      badge: '紅色行星 · 熒惑',
      color: 'from-red-400 to-rose-600',
      story: '表面氧化鐵土壤散發鮮明紅色光澤，古代稱之為「熒惑」。在夜空中呈現顯著的紅銅色光芒。',
      mag: 0.5,
      N: 49.5574 + 2.11081e-5 * d,
      i: 1.8497 - 1.78e-8 * d,
      w: 286.5016 + 2.92961e-5 * d,
      a: 1.523688,
      e: 0.093405 + 2.516e-9 * d,
      M: 18.6021 + 0.5240207766 * d
    },
    {
      id: 'venus',
      name: '金星 (Venus)',
      enName: 'Venus',
      constellation: '室女座 / 天秤座',
      type: 'planet',
      icon: '♀️',
      badge: '長庚星 · 太白金星',
      color: 'from-amber-100 via-yellow-200 to-white',
      story: '全天除日月外最明亮天體！散發耀眼純白光芒，晨見為「啟明」，暮見為「長庚」，山區露營黃昏時極為耀眼。',
      mag: -4.1,
      N: 76.6799 + 2.46590e-5 * d,
      i: 3.3946 + 2.75e-8 * d,
      w: 54.8910 + 1.38374e-5 * d,
      a: 0.723330,
      e: 0.006773 - 1.302e-9 * d,
      M: 48.0052 + 1.6021302244 * d
    }
  ];

  return planets.map(p => {
    const N = rev(p.N);
    const i = p.i;
    const w = rev(p.w);
    const a = p.a;
    const e = p.e;
    const M = rev(p.M);

    let E = M + (180 / Math.PI) * e * Math.sin(M * rad) * (1 + e * Math.cos(M * rad));
    for (let iter = 0; iter < 3; iter++) {
      E = E - (E - (180 / Math.PI) * e * Math.sin(E * rad) - M) / (1 - e * Math.cos(E * rad));
    }

    const xv = a * (Math.cos(E * rad) - e);
    const yv = a * Math.sqrt(1 - e * e) * Math.sin(E * rad);
    const v = rev(Math.atan2(yv, xv) / rad);
    const r = Math.sqrt(xv * xv + yv * yv);

    const xh = r * (Math.cos(N * rad) * Math.cos((v + w) * rad) - Math.sin(N * rad) * Math.sin((v + w) * rad) * Math.cos(i * rad));
    const yh = r * (Math.sin(N * rad) * Math.cos((v + w) * rad) + Math.cos(N * rad) * Math.sin((v + w) * rad) * Math.cos(i * rad));
    const zh = r * (Math.sin((v + w) * rad) * Math.sin(i * rad));

    const xg = xh + xs;
    const yg = yh + ys;
    const zg = zh;

    const xe = xg;
    const ye = yg * Math.cos(ecl) - zg * Math.sin(ecl);
    const ze = yg * Math.sin(ecl) + zg * Math.cos(ecl);

    const ra = rev(Math.atan2(ye, xe) / rad);
    const dec = Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) / rad;

    return {
      id: p.id,
      name: p.name,
      enName: p.enName,
      constellation: p.constellation,
      type: p.type,
      icon: p.icon,
      badge: p.badge,
      color: p.color,
      story: p.story,
      mag: p.mag,
      ra: Math.round(ra * 100) / 100,
      dec: Math.round(dec * 100) / 100
    };
  });
}

// ============================================================================
// 🌙 月球即時開普勒軌道與攝動精密推算 (Jean Meeus / Paul Schlyter Lunar Ephemeris)
// 支援 2024~2030+ 任意日期時間推算赤經 (RA) 與赤緯 (Dec)，精確度 < 0.2°
// ============================================================================
export function getMoonPosition(date = new Date()) {
  const rad = Math.PI / 180;
  const rev = x => ((x % 360) + 360) % 360;
  const d = (date.getTime() / 86400000 + 2440587.5) - 2451545.0;

  // 太陽要素
  const Ms = rev(356.0470 + 0.9856002585 * d);
  const Ls = rev(280.460 + 0.9856474 * d);
  const ecl = (23.4393 - 3.563e-7 * d) * rad;

  // 月球軌道根數 (Schlyter / Meeus 標準大地攝動模型)
  const N = rev(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = rev(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.054900;
  const M = rev(115.3654 + 13.0649929509 * d);
  const Lm = rev(N + w + M);
  const D = rev(Lm - Ls);
  const F = rev(Lm - N);

  let E = M + (180 / Math.PI) * e * Math.sin(M * rad) * (1 + e * Math.cos(M * rad));
  for (let iter = 0; iter < 3; iter++) {
    E = E - (E - (180 / Math.PI) * e * Math.sin(E * rad) - M) / (1 - e * Math.cos(E * rad));
  }

  const xv = a * (Math.cos(E * rad) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E * rad);
  const v = rev(Math.atan2(yv, xv) / rad);
  const r = Math.sqrt(xv * xv + yv * yv);

  const xh = r * (Math.cos(N * rad) * Math.cos((v + w) * rad) - Math.sin(N * rad) * Math.sin((v + w) * rad) * Math.cos(i * rad));
  const yh = r * (Math.sin(N * rad) * Math.cos((v + w) * rad) + Math.cos(N * rad) * Math.sin((v + w) * rad) * Math.cos(i * rad));
  const zh = r * (Math.sin((v + w) * rad) * Math.sin(i * rad));

  let lon = rev(Math.atan2(yh, xh) / rad);
  let lat = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) / rad;

  // 主要月球攝動修正 (Evection 出差、Variation 二均差、年差)
  lon += -1.274 * Math.sin((M - 2 * D) * rad)
       + 0.658 * Math.sin(2 * D * rad)
       - 0.186 * Math.sin(Ms * rad)
       - 0.059 * Math.sin((2 * M - 2 * D) * rad)
       - 0.057 * Math.sin((M - 2 * D + Ms) * rad)
       + 0.053 * Math.sin((M + 2 * D) * rad)
       + 0.046 * Math.sin((2 * D - Ms) * rad)
       + 0.041 * Math.sin((M - Ms) * rad)
       - 0.035 * Math.sin(D * rad)
       - 0.031 * Math.sin((M + Ms) * rad);

  lat += -0.173 * Math.sin((F - 2 * D) * rad)
       - 0.055 * Math.sin((M - F - 2 * D) * rad)
       - 0.046 * Math.sin((M + F - 2 * D) * rad)
       + 0.033 * Math.sin((F + 2 * D) * rad)
       + 0.017 * Math.sin((2 * M + F) * rad);

  lon = rev(lon);

  // 轉換為赤道坐標系 (RA, Dec)
  const xe = Math.cos(lat * rad) * Math.cos(lon * rad);
  const ye = Math.cos(lat * rad) * Math.sin(lon * rad) * Math.cos(ecl) - Math.sin(lat * rad) * Math.sin(ecl);
  const ze = Math.cos(lat * rad) * Math.sin(lon * rad) * Math.sin(ecl) + Math.sin(lat * rad) * Math.cos(ecl);

  const ra = rev(Math.atan2(ye, xe) / rad);
  const dec = Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) / rad;

  const phaseInfo = getMoonPhaseInfo(date);

  return {
    id: 'moon',
    name: `月球 (${phaseInfo.phaseName})`,
    enName: 'The Moon',
    constellation: '黃道天體',
    type: 'moon',
    icon: phaseInfo.icon || '🌙',
    badge: `月相 ${phaseInfo.phaseName} · ${phaseInfo.illumination}%`,
    color: 'from-slate-100 via-amber-100 to-yellow-200',
    story: `地球唯一的天然衛星，距離地球約 38 萬公里！目前月相為「${phaseInfo.phaseName}」（光照面比例約 ${phaseInfo.illumination}%）。古代稱為「太陰」，在露營夜空中肉眼可辨識靜海、雨海等玄武岩月海及環形山脈。${phaseInfo.advice}`,
    mag: phaseInfo.illumination > 50 ? -12.5 : phaseInfo.illumination > 10 ? -10.0 : -4.0,
    ra: Math.round(ra * 100) / 100,
    dec: Math.round(dec * 100) / 100,
    phaseInfo
  };
}

// Curated Stargazing Targets for Taiwanese Campers (恆星、深空星系、著名星團)
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
  },
  {
    id: 'm42_orion_nebula',
    name: '獵戶座大星雲 (Orion Nebula M42)',
    enName: 'M42 Diffuse Nebula',
    constellation: '獵戶座',
    type: 'nebula',
    mag: 4.0,
    ra: 83.82,
    dec: -5.39,
    icon: '🌌',
    badge: '肉眼可見恆星育嬰室',
    story: '夜空中最著名、最壯麗的發射星雲！位於獵戶座佩劍中央，四合星新生恆星正照亮著星際塵埃，是露營雙筒鏡與長曝必看天體。',
    color: 'from-fuchsia-400 via-pink-400 to-purple-600'
  },
  {
    id: 'm33_triangulum',
    name: '三角座星系 (Triangulum Galaxy M33)',
    enName: 'M33 Spiral Galaxy',
    constellation: '三角座',
    type: 'galaxy',
    mag: 5.7,
    ra: 23.46,
    dec: 30.66,
    icon: '🌀',
    badge: '本星系群第三大星系',
    story: '本星系群中僅次於仙女座與銀河系的第三大旋渦星系！距離地球約 273 萬光年，在無光害的高山露營區，用雙筒望遠鏡可見微弱的橢圓雲霧。',
    color: 'from-cyan-300 via-sky-300 to-indigo-400'
  },
  {
    id: 'm44_beehive',
    name: '蜂巢星團 (Beehive Cluster M44)',
    enName: 'Praesepe M44',
    constellation: '巨蟹座',
    type: 'cluster',
    mag: 3.7,
    ra: 130.10,
    dec: 19.67,
    icon: '🐝',
    badge: '鬼宿星團 · 積尸氣',
    story: '位於巨蟹座中央的疏散星團，肉眼看像一團模糊發光的小雲朵，雙筒望遠鏡下可解離出上百顆如蜜蜂般飛舞的晶瑩星點。',
    color: 'from-amber-200 via-yellow-200 to-amber-400'
  },
  {
    id: 'm13_hercules',
    name: '武仙座球狀星團 (Hercules Cluster M13)',
    enName: 'M13 Globular Cluster',
    constellation: '武仙座',
    type: 'cluster',
    mag: 5.8,
    ra: 250.42,
    dec: 36.46,
    icon: '🔮',
    badge: '北天最壯麗球狀星團',
    story: '北半球夜空最龐大耀眼的球狀星團！包含超過 30 萬顆古老恆星，密集匯聚成一個直徑 145 光年的發光雪球，距離地球 22,000 光年。',
    color: 'from-indigo-300 via-purple-300 to-sky-300'
  },
  {
    id: 'ngc869_double_cluster',
    name: '英仙座雙星團 (Double Cluster)',
    enName: 'NGC 869 & NGC 884',
    constellation: '英仙座',
    type: 'cluster',
    mag: 3.7,
    ra: 34.75,
    dec: 57.15,
    icon: '💎',
    badge: '雙生寶石星團',
    story: '相距僅數百光年的兩座年輕疏散星團並排閃耀，在秋冬高海拔營地肉眼即可看見雙重亮斑，雙筒望遠鏡下猶如鑲嵌在銀河中的碎鑽。',
    color: 'from-blue-200 via-cyan-200 to-indigo-300'
  },
  {
    id: 'aldebaran',
    name: '畢宿五 (Aldebaran)',
    enName: 'Alpha Tauri',
    constellation: '金牛座',
    type: 'star',
    mag: 0.85,
    ra: 68.98,
    dec: 16.51,
    icon: '🐂',
    badge: '金牛之眼 · 橙紅巨星',
    story: '金牛座最明亮的橙紅巨星，象徵公牛憤怒充血的眼睛！位於著名的 V 字形畢星團前端。',
    color: 'from-orange-400 to-red-500'
  },
  {
    id: 'regulus',
    name: '軒轅十四 (Regulus)',
    enName: 'Alpha Leonis',
    constellation: '獅子座',
    type: 'star',
    mag: 1.36,
    ra: 152.09,
    dec: 11.97,
    icon: '🦁',
    badge: '獅子座王者之心',
    story: '獅子座心臟一等亮星，散發清冷純白光輝。自轉極為迅速（自轉週期僅 15.9 小時），是春季星空王者標誌。',
    color: 'from-blue-100 to-indigo-300'
  },
  {
    id: 'spica',
    name: '角宿一 (Spica)',
    enName: 'Alpha Virginis',
    constellation: '室女座',
    type: 'star',
    mag: 0.98,
    ra: 201.30,
    dec: -11.16,
    icon: '🌾',
    badge: '春季大三角 · 麥穗',
    story: '全天第15亮星，散發純白無暇的光芒。象徵正義女神手中象徵豐收的麥穗，是春季大三角與春季大弧線的終點地標。',
    color: 'from-cyan-100 to-blue-300'
  }
];

// 🌌 取得當前時間所有可觀察天體（月球 + 太陽系大行星 + 恆星 + 深空星系星團）
export function getRealtimeCelestialTargets(date = new Date()) {
  const dynamicMoon = getMoonPosition(date);
  const dynamicPlanets = getPlanetaryPositions(date);
  return [dynamicMoon, ...dynamicPlanets, ...CELESTIAL_TARGETS];
}

// SkyView-style Constellation Line Graph Definition
export const CONSTELLATIONS = [
  {
    id: 'ursa_major',
    name: '大熊座 (北斗七星)',
    latin: 'Ursa Major',
    icon: '🐻',
    season: '春夏季必看',
    story: '夜空最著名勺狀星群！天璇至天樞連線延長5倍直指北極星。古人稱「斗柄東指，天下皆春」。',
    color: '#38bdf8', // Neon Sky Blue
    glowColor: 'rgba(56, 189, 248, 0.4)',
    stars: [
      { id: 'dubhe', name: '天樞 (Dubhe)', ra: 165.93, dec: 61.75, mag: 1.79 },
      { id: 'merak', name: '天璇 (Merak)', ra: 165.46, dec: 56.38, mag: 2.37 },
      { id: 'phecda', name: '天璣 (Phecda)', ra: 178.46, dec: 53.69, mag: 2.44 },
      { id: 'megrez', name: '天權 (Megrez)', ra: 183.86, dec: 57.03, mag: 3.31 },
      { id: 'alioth', name: '玉衡 (Alioth)', ra: 193.51, dec: 55.96, mag: 1.77 },
      { id: 'mizar', name: '開陽 (Mizar)', ra: 200.98, dec: 54.92, mag: 2.23 },
      { id: 'alkaid', name: '搖光 (Alkaid)', ra: 206.89, dec: 49.31, mag: 1.86 }
    ],
    lines: [
      ['merak', 'dubhe'],
      ['dubhe', 'megrez'],
      ['megrez', 'phecda'],
      ['phecda', 'merak'],
      ['megrez', 'alioth'],
      ['alioth', 'mizar'],
      ['mizar', 'alkaid']
    ]
  },
  {
    id: 'cassiopeia',
    name: '仙后座 (倒 W 字)',
    latin: 'Cassiopeia',
    icon: '👑',
    season: '秋冬季必看',
    story: '北天極著名的倒 W 形王冠，秋冬北斗七星西沉時，是露營尋找正北極星的最佳指針！',
    color: '#f59e0b', // Neon Amber
    glowColor: 'rgba(245, 158, 11, 0.4)',
    stars: [
      { id: 'caph', name: '策 (Caph)', ra: 2.30, dec: 59.15, mag: 2.28 },
      { id: 'schedar', name: '王良四 (Schedar)', ra: 10.13, dec: 56.54, mag: 2.24 },
      { id: 'navi', name: '閣道三 (Navi)', ra: 14.18, dec: 60.72, mag: 2.47 },
      { id: 'ruchbah', name: '閣道二 (Ruchbah)', ra: 20.30, dec: 60.23, mag: 2.68 },
      { id: 'segin', name: '王良一 (Segin)', ra: 26.10, dec: 63.67, mag: 3.35 }
    ],
    lines: [
      ['caph', 'schedar'],
      ['schedar', 'navi'],
      ['navi', 'ruchbah'],
      ['ruchbah', 'segin']
    ]
  },
  {
    id: 'orion',
    name: '獵戶座 (冬季星空之王)',
    latin: 'Orion',
    icon: '🏹',
    season: '冬季必看',
    story: '全天最壯麗王者星座！蝴蝶沙漏輪廓，中央腰帶三星筆直排列，參宿四（紅超巨星）與參宿七（藍白超巨星）交相輝映。',
    color: '#60a5fa', // Electric Blue
    glowColor: 'rgba(96, 165, 250, 0.4)',
    stars: [
      { id: 'betelgeuse', name: '參宿四 (Betelgeuse)', ra: 88.79, dec: 7.41, mag: 0.50 },
      { id: 'bellatrix', name: '參宿五 (Bellatrix)', ra: 81.28, dec: 6.35, mag: 1.64 },
      { id: 'rigel', name: '參宿七 (Rigel)', ra: 78.63, dec: -8.20, mag: 0.13 },
      { id: 'saiph', name: '參宿六 (Saiph)', ra: 86.94, dec: -9.67, mag: 2.07 },
      { id: 'alnitak', name: '參宿一 (Alnitak)', ra: 85.19, dec: -1.94, mag: 1.77 },
      { id: 'alnilam', name: '參宿二 (Alnilam)', ra: 84.05, dec: -1.20, mag: 1.69 },
      { id: 'mintaka', name: '參宿三 (Mintaka)', ra: 83.00, dec: -0.30, mag: 2.23 }
    ],
    lines: [
      ['betelgeuse', 'bellatrix'],
      ['bellatrix', 'mintaka'],
      ['betelgeuse', 'alnitak'],
      ['alnitak', 'saiph'],
      ['saiph', 'rigel'],
      ['rigel', 'mintaka'],
      ['alnitak', 'alnilam'],
      ['alnilam', 'mintaka']
    ]
  },
  {
    id: 'cygnus',
    name: '天鵝座 (北十字)',
    latin: 'Cygnus',
    icon: '🦢',
    season: '夏季大三角',
    story: '北十字星群！天鵝展翅順著璀璨銀河翱翔，天津四為夏季大三角頂點之一。',
    color: '#a78bfa', // Purple Neon
    glowColor: 'rgba(167, 139, 250, 0.4)',
    stars: [
      { id: 'deneb', name: '天津四 (Deneb)', ra: 310.36, dec: 45.28, mag: 1.25 },
      { id: 'sadr', name: '天津一 (Sadr)', ra: 305.56, dec: 40.26, mag: 2.23 },
      { id: 'albireo', name: '輦道增七 (Albireo)', ra: 292.68, dec: 27.96, mag: 3.05 },
      { id: 'gienah', name: '天津九 (Gienah)', ra: 311.55, dec: 33.97, mag: 2.48 },
      { id: 'rukh', name: '奚仲四 (Rukh)', ra: 296.24, dec: 45.13, mag: 2.87 }
    ],
    lines: [
      ['deneb', 'sadr'],
      ['sadr', 'albireo'],
      ['gienah', 'sadr'],
      ['sadr', 'rukh']
    ]
  },
  {
    id: 'lyra',
    name: '天琴座 (織女之琴)',
    latin: 'Lyra',
    icon: '💎',
    season: '夏季大三角',
    story: '全天第5亮星織女星鎮守，下方菱形為古希臘神話中奧菲斯的七弦豎琴。',
    color: '#22d3ee', // Cyan
    glowColor: 'rgba(34, 211, 238, 0.4)',
    stars: [
      { id: 'vega', name: '織女星 (Vega)', ra: 279.23, dec: 38.78, mag: 0.03 },
      { id: 'eps_lyr', name: '織女二 (Eps Lyr)', ra: 281.07, dec: 39.67, mag: 4.6 },
      { id: 'zeta_lyr', name: '織女三 (Zeta Lyr)', ra: 281.20, dec: 37.60, mag: 4.34 },
      { id: 'sheliak', name: '漸台二 (Sheliak)', ra: 282.52, dec: 33.36, mag: 3.52 },
      { id: 'sulafat', name: '漸台三 (Sulafat)', ra: 284.74, dec: 32.69, mag: 3.25 },
      { id: 'delta_lyr', name: '漸台一 (Delta Lyr)', ra: 283.71, dec: 36.90, mag: 4.3 }
    ],
    lines: [
      ['vega', 'eps_lyr'],
      ['eps_lyr', 'zeta_lyr'],
      ['zeta_lyr', 'vega'],
      ['zeta_lyr', 'sheliak'],
      ['sheliak', 'sulafat'],
      ['sulafat', 'delta_lyr'],
      ['delta_lyr', 'zeta_lyr']
    ]
  },
  {
    id: 'aquila',
    name: '天鷹座 (牛郎之鷹)',
    latin: 'Aquila',
    icon: '🦅',
    season: '夏季大三角',
    story: '宙斯派遣的神鷹，牛郎星（牽牛星）兩側有河鼓一與河鼓三相伴，俗稱扁擔星。',
    color: '#facc15', // Yellow
    glowColor: 'rgba(250, 204, 21, 0.4)',
    stars: [
      { id: 'altair', name: '牛郎星 (Altair)', ra: 297.70, dec: 8.87, mag: 0.77 },
      { id: 'tarazed', name: '河鼓一 (Tarazed)', ra: 296.54, dec: 10.61, mag: 2.72 },
      { id: 'alshain', name: '河鼓三 (Alshain)', ra: 298.83, dec: 6.41, mag: 3.71 }
    ],
    lines: [
      ['tarazed', 'altair'],
      ['altair', 'alshain']
    ]
  },
  {
    id: 'scorpius',
    name: '天蠍座 (南天巨蠍)',
    latin: 'Scorpius',
    icon: '🦂',
    season: '夏季南方必看',
    story: '夏季南方夜空最具代表性的巨大「S」形天蠍，火紅心宿二為天蠍心臟，蠍尾橫跨銀河核心。',
    color: '#f43f5e', // Rose Red
    glowColor: 'rgba(244, 63, 94, 0.4)',
    stars: [
      { id: 'graffias', name: '房宿四 (Graffias)', ra: 241.36, dec: -19.80, mag: 2.62 },
      { id: 'dschubba', name: '房宿三 (Dschubba)', ra: 240.08, dec: -22.62, mag: 2.29 },
      { id: 'pi_sco', name: '房宿一 (Pi Sco)', ra: 242.22, dec: -26.11, mag: 2.89 },
      { id: 'antares', name: '心宿二 (Antares)', ra: 247.35, dec: -26.43, mag: 1.06 },
      { id: 'wei', name: '尾宿一 (Wei)', ra: 252.54, dec: -34.29, mag: 2.29 },
      { id: 'sargas', name: '尾宿五 (Sargas)', ra: 264.33, dec: -42.99, mag: 1.86 },
      { id: 'shaula', name: '尾宿八 (Shaula)', ra: 263.40, dec: -37.10, mag: 1.62 }
    ],
    lines: [
      ['graffias', 'dschubba'],
      ['dschubba', 'pi_sco'],
      ['dschubba', 'antares'],
      ['antares', 'wei'],
      ['wei', 'sargas'],
      ['sargas', 'shaula']
    ]
  },
  {
    id: 'taurus',
    name: '金牛座 (昂首巨牛)',
    latin: 'Taurus',
    icon: '🐂',
    season: '秋冬季必看',
    story: '冬季星空前鋒，畢宿五為巨牛猩紅怒目，金牛背上嵌著絕美閃耀的昴宿星團（M45 七姊妹）。',
    color: '#fb923c', // Orange
    glowColor: 'rgba(251, 146, 60, 0.4)',
    stars: [
      { id: 'aldebaran', name: '畢宿五 (Aldebaran)', ra: 68.98, dec: 16.51, mag: 0.85 },
      { id: 'elnath', name: '五車五 (Elnath)', ra: 81.57, dec: 28.61, mag: 1.65 },
      { id: 'tianguan', name: '天關 (Tianguan)', ra: 84.41, dec: 21.14, mag: 3.0 },
      { id: 'pleiades_star', name: '昴宿星團 (M45)', ra: 56.75, dec: 24.11, mag: 1.6 }
    ],
    lines: [
      ['aldebaran', 'elnath'],
      ['aldebaran', 'tianguan'],
      ['aldebaran', 'pleiades_star']
    ]
  },
  {
    id: 'summer_triangle',
    name: '夏季大三角 (Summer Triangle)',
    latin: 'Summer Triangle',
    icon: '✨',
    season: '夏秋天頂地標',
    story: '夏季星空最重要的導航標誌！由織女星（天琴座）、牛郎星（天鷹座）、天津四（天鵝座）跨越銀河組成的壯麗大三角。',
    color: '#38bdf8', // Dashed Sky Blue
    glowColor: 'rgba(56, 189, 248, 0.5)',
    isAsterism: true,
    stars: [
      { id: 'st_vega', name: '織女星 (Vega)', ra: 279.23, dec: 38.78, mag: 0.03 },
      { id: 'st_altair', name: '牛郎星 (Altair)', ra: 297.70, dec: 8.87, mag: 0.77 },
      { id: 'st_deneb', name: '天津四 (Deneb)', ra: 310.36, dec: 45.28, mag: 1.25 }
    ],
    lines: [
      ['st_vega', 'st_altair'],
      ['st_altair', 'st_deneb'],
      ['st_deneb', 'st_vega']
    ]
  },
  {
    id: 'winter_triangle',
    name: '冬季大三角 (Winter Triangle)',
    latin: 'Winter Triangle',
    icon: '🌟',
    season: '冬夜璀璨地標',
    story: '冬季夜空最耀眼的三芒星！天狼星（全天最亮）、參宿四（紅超巨星）、南河三組成近乎等邊的大三角形。',
    color: '#facc15', // Dashed Gold
    glowColor: 'rgba(250, 204, 21, 0.5)',
    isAsterism: true,
    stars: [
      { id: 'wt_sirius', name: '天狼星 (Sirius)', ra: 101.29, dec: -16.72, mag: -1.46 },
      { id: 'wt_betelgeuse', name: '參宿四 (Betelgeuse)', ra: 88.79, dec: 7.41, mag: 0.50 },
      { id: 'wt_procyon', name: '南河三 (Procyon)', ra: 114.83, dec: 5.22, mag: 0.38 }
    ],
    lines: [
      ['wt_sirius', 'wt_betelgeuse'],
      ['wt_betelgeuse', 'wt_procyon'],
      ['wt_procyon', 'wt_sirius']
    ]
  },
  {
    id: 'pisces',
    name: '雙魚座 (Pisces)',
    latin: 'Pisces',
    icon: '♓',
    season: '秋冬季黃道星座',
    story: '黃道第十二宮，此時太陽系「指環王」土星正漫步於雙魚座腹部！兩條魚尾由一條絲帶（Alrescha）相連。',
    color: '#38bdf8', // Cyan
    glowColor: 'rgba(56, 189, 248, 0.4)',
    stars: [
      { id: 'alrescha', name: '外屏七 (Alrescha)', ra: 30.50, dec: 2.76, mag: 3.8 },
      { id: 'alpherg', name: '右更四 (Alpherg)', ra: 22.84, dec: 15.35, mag: 3.6 },
      { id: 'delta_psc', name: '外屏一 (Delta Psc)', ra: 11.23, dec: 7.59, mag: 4.4 },
      { id: 'epsilon_psc', name: '外屏二 (Epsilon Psc)', ra: 15.74, dec: 7.89, mag: 4.2 },
      { id: 'gamma_psc', name: '霹靂二 (Gamma Psc)', ra: 349.25, dec: 3.28, mag: 3.7 },
      { id: 'omega_psc', name: '霹靂一 (Omega Psc)', ra: 359.81, dec: 6.86, mag: 4.0 }
    ],
    lines: [
      ['alrescha', 'alpherg'],
      ['alrescha', 'delta_psc'],
      ['delta_psc', 'epsilon_psc'],
      ['alrescha', 'gamma_psc'],
      ['gamma_psc', 'omega_psc']
    ]
  },
  {
    id: 'leo',
    name: '獅子座 (Leo)',
    latin: 'Leo',
    icon: '🦁',
    season: '春季王者星座',
    story: '春季夜空標誌性星座！頭部為著名的反問號「鐮刀星群」，心臟為一等藍白亮星「軒轅十四」，此時木星正於此附近相伴閃耀。',
    color: '#fbbf24', // Amber
    glowColor: 'rgba(251, 191, 36, 0.4)',
    stars: [
      { id: 'regulus', name: '軒轅十四 (Regulus)', ra: 152.09, dec: 11.97, mag: 1.36 },
      { id: 'denebola', name: '五帝座一 (Denebola)', ra: 177.26, dec: 14.57, mag: 2.14 },
      { id: 'algieba', name: '軒轅十二 (Algieba)', ra: 154.99, dec: 19.84, mag: 2.01 },
      { id: 'zosma', name: '西上相 (Zosma)', ra: 168.53, dec: 20.52, mag: 2.56 }
    ],
    lines: [
      ['regulus', 'algieba'],
      ['algieba', 'zosma'],
      ['zosma', 'denebola'],
      ['denebola', 'regulus']
    ]
  },
  {
    id: 'aries',
    name: '白羊座 (Aries)',
    latin: 'Aries',
    icon: '♈',
    season: '秋冬季黃道星座',
    story: '黃道第一宮！婁宿三星組成標誌性的微彎羊角，主星婁宿三（Hamal）為金黃二等星。',
    color: '#f87171', // Red / Rose
    glowColor: 'rgba(248, 113, 113, 0.4)',
    stars: [
      { id: 'hamal', name: '婁宿三 (Hamal)', ra: 31.79, dec: 23.46, mag: 2.01 },
      { id: 'sheratan', name: '婁宿一 (Sheratan)', ra: 28.66, dec: 20.80, mag: 2.64 },
      { id: 'mesarthim', name: '婁宿二 (Mesarthim)', ra: 28.40, dec: 19.29, mag: 3.88 }
    ],
    lines: [
      ['hamal', 'sheratan'],
      ['sheratan', 'mesarthim']
    ]
  },
  {
    id: 'gemini',
    name: '雙子座 (Gemini)',
    latin: 'Gemini',
    icon: '♊',
    season: '冬春季黃道星座',
    story: '黃道第三宮！北河二（Castor）與北河三（Pollux）雙星並列，象徵古希臘神話中形影不離的孿生兄弟。',
    color: '#38bdf8', // Sky Blue
    glowColor: 'rgba(56, 189, 248, 0.4)',
    stars: [
      { id: 'pollux', name: '北河三 (Pollux)', ra: 116.33, dec: 28.03, mag: 1.16 },
      { id: 'castor', name: '北河二 (Castor)', ra: 113.65, dec: 31.89, mag: 1.58 },
      { id: 'alhena', name: '井宿三 (Alhena)', ra: 99.43, dec: 16.40, mag: 1.93 },
      { id: 'wasat', name: '天樽二 (Wasat)', ra: 108.87, dec: 21.98, mag: 3.53 },
      { id: 'mebsuta', name: '井宿五 (Mebsuta)', ra: 100.98, dec: 25.13, mag: 3.06 }
    ],
    lines: [
      ['castor', 'pollux'],
      ['pollux', 'wasat'],
      ['wasat', 'alhena'],
      ['castor', 'mebsuta']
    ]
  },
  {
    id: 'cancer',
    name: '巨蟹座 (Cancer)',
    latin: 'Cancer',
    icon: '♋',
    season: '春季黃道星座',
    story: '黃道第四宮！中央鑲嵌著肉眼可見的著名「蜂巢星團（M44 鬼宿星團）」，古人稱「積尸氣」。',
    color: '#a78bfa', // Purple
    glowColor: 'rgba(167, 139, 250, 0.4)',
    stars: [
      { id: 'acubens', name: '柳宿增三 (Acubens)', ra: 134.61, dec: 11.85, mag: 4.26 },
      { id: 'altarf', name: '柳宿八 (Al Tarf)', ra: 124.13, dec: 9.19, mag: 3.53 },
      { id: 'asellus_aus', name: '鬼宿四 (Asellus Aus)', ra: 131.17, dec: 18.15, mag: 3.94 },
      { id: 'asellus_bor', name: '鬼宿三 (Asellus Bor)', ra: 130.84, dec: 21.47, mag: 4.66 }
    ],
    lines: [
      ['asellus_bor', 'asellus_aus'],
      ['asellus_aus', 'acubens'],
      ['asellus_aus', 'altarf']
    ]
  },
  {
    id: 'virgo',
    name: '室女座 (Virgo)',
    latin: 'Virgo',
    icon: '♍',
    season: '春夏季黃道星座',
    story: '黃道第六宮，全天第二大星座！主星「角宿一（Spica）」為春季大三角一等純白亮星，象徵正義女神手中的麥穗。',
    color: '#34d399', // Emerald
    glowColor: 'rgba(52, 211, 153, 0.4)',
    stars: [
      { id: 'spica', name: '角宿一 (Spica)', ra: 201.30, dec: -11.16, mag: 0.98 },
      { id: 'porrima', name: '東上相 (Porrima)', ra: 190.43, dec: -1.45, mag: 2.74 },
      { id: 'zavijava', name: '右執法 (Zavijava)', ra: 177.67, dec: 1.77, mag: 3.59 },
      { id: 'vindemiatrix', name: '東次將 (Vindemiatrix)', ra: 195.55, dec: 10.96, mag: 2.85 },
      { id: 'heze', name: '角宿二 (Heze)', ra: 203.88, dec: -0.60, mag: 3.38 }
    ],
    lines: [
      ['zavijava', 'porrima'],
      ['porrima', 'vindemiatrix'],
      ['porrima', 'spica'],
      ['spica', 'heze']
    ]
  },
  {
    id: 'libra',
    name: '天秤座 (Libra)',
    latin: 'Libra',
    icon: '♎',
    season: '春夏季黃道星座',
    story: '黃道第七宮，象徵正義公正的天秤！主星「氐宿四」是夜空中罕見肉眼可察覺帶有淡綠色澤的恆星。',
    color: '#60a5fa', // Blue
    glowColor: 'rgba(96, 165, 250, 0.4)',
    stars: [
      { id: 'zubeneschamali', name: '氐宿四 (Zubeneschamali)', ra: 229.25, dec: -9.38, mag: 2.61 },
      { id: 'zubenelgenubi', name: '氐宿一 (Zubenelgenubi)', ra: 222.72, dec: -16.04, mag: 2.75 },
      { id: 'zubenelhakrabi', name: '氐宿增一 (Zubenelhakrabi)', ra: 233.84, dec: -14.79, mag: 3.91 },
      { id: 'brachium', name: '氐宿二 (Brachium)', ra: 226.04, dec: -25.28, mag: 3.25 }
    ],
    lines: [
      ['zubenelgenubi', 'zubeneschamali'],
      ['zubeneschamali', 'zubenelhakrabi'],
      ['zubenelgenubi', 'brachium'],
      ['brachium', 'zubenelhakrabi']
    ]
  },
  {
    id: 'sagittarius',
    name: '人馬座 (Sagittarius)',
    latin: 'Sagittarius',
    icon: '♐',
    season: '夏季必看茶壺',
    story: '黃道第九宮，銀河系中心所在！著名的「茶壺星群（Teapot）」壺嘴直噴出壯闊璀璨的銀河蒸氣！',
    color: '#f43f5e', // Rose
    glowColor: 'rgba(244, 63, 94, 0.4)',
    stars: [
      { id: 'kaus_aus', name: '箕宿三 (Kaus Aus)', ra: 276.04, dec: -34.38, mag: 1.79 },
      { id: 'nunki', name: '斗宿四 (Nunki)', ra: 282.52, dec: -26.30, mag: 2.05 },
      { id: 'ascella', name: '斗宿六 (Ascella)', ra: 285.65, dec: -29.88, mag: 2.60 },
      { id: 'kaus_med', name: '箕宿二 (Kaus Med)', ra: 275.24, dec: -29.83, mag: 2.72 },
      { id: 'kaus_bor', name: '斗宿二 (Kaus Bor)', ra: 276.99, dec: -25.42, mag: 2.82 },
      { id: 'alnasl', name: '箕宿一 (Alnasl)', ra: 271.49, dec: -30.42, mag: 2.98 }
    ],
    lines: [
      ['kaus_med', 'kaus_bor'],
      ['kaus_bor', 'nunki'],
      ['nunki', 'ascella'],
      ['ascella', 'kaus_aus'],
      ['kaus_aus', 'kaus_med'],
      ['kaus_med', 'alnasl'],
      ['kaus_aus', 'alnasl']
    ]
  },
  {
    id: 'capricornus',
    name: '摩羯座 (Capricornus)',
    latin: 'Capricornus',
    icon: '♑',
    season: '夏秋季黃道星座',
    story: '黃道第十宮，古老的羊身魚尾神話海山羊！倒三角骨架在夏末秋初南天低空緩緩滑行。',
    color: '#cbd5e1', // Slate
    glowColor: 'rgba(203, 213, 225, 0.4)',
    stars: [
      { id: 'algedi', name: '牛宿二 (Algedi)', ra: 304.49, dec: -12.54, mag: 3.58 },
      { id: 'dabih', name: '牛宿一 (Dabih)', ra: 305.25, dec: -14.78, mag: 3.05 },
      { id: 'deneb_algedi', name: '壘壁陣四 (Deneb Algedi)', ra: 326.76, dec: -16.13, mag: 2.85 },
      { id: 'nashira', name: '壘壁陣三 (Nashira)', ra: 324.97, dec: -16.66, mag: 3.67 }
    ],
    lines: [
      ['algedi', 'dabih'],
      ['dabih', 'nashira'],
      ['nashira', 'deneb_algedi'],
      ['deneb_algedi', 'algedi']
    ]
  },
  {
    id: 'aquarius',
    name: '寶瓶座 (Aquarius)',
    latin: 'Aquarius',
    icon: '♒',
    season: '秋季黃道星座',
    story: '黃道第十一宮，象徵自天神酒杯傾瀉而出的甘霖星流！寶瓶傾倒的水流順流灌入南魚座北落師門。',
    color: '#38bdf8', // Sky Blue
    glowColor: 'rgba(56, 189, 248, 0.4)',
    stars: [
      { id: 'sadalsuud', name: '虛宿一 (Sadalsuud)', ra: 322.89, dec: -5.57, mag: 2.90 },
      { id: 'sadalmelik', name: '危宿一 (Sadalmelik)', ra: 331.45, dec: -0.32, mag: 2.95 },
      { id: 'sadachbia', name: '墳墓一 (Sadachbia)', ra: 335.42, dec: -1.39, mag: 3.86 },
      { id: 'skat', name: '羽林軍二十六 (Skat)', ra: 343.66, dec: -15.82, mag: 3.27 }
    ],
    lines: [
      ['sadalsuud', 'sadalmelik'],
      ['sadalmelik', 'sadachbia'],
      ['sadachbia', 'skat']
    ]
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

// ============================================================================
// 💨 蒲福風級 ✕ 露營帳篷與天幕物理抗風極限評估 (Beaufort Wind & Structural Safety)
// ============================================================================
// ============================================================================
// 💨 蒲福風級 ✕ 露營帳篷與天幕物理抗風極限評估 (Beaufort Wind & Structural Safety)
// 符合中央氣象署 (CWA) 標準物理規範 (0~12 級全量程對照表)
// ============================================================================

export const BEAUFORT_SCALE_TABLE = [
  {
    scale: 0,
    name: '無風 (Calm)',
    msRange: '< 0.3 m/s',
    kmhRange: '< 1 km/h',
    knots: '< 1 kt',
    campSafety: 'safe',
    campRating: '🟢 極佳 · 適合各類帳篷與大天幕',
    desc: '靜止無風，炊煙垂直直上。露營搭帳無任何結構風阻風險。'
  },
  {
    scale: 1,
    name: '軟風 (Light Air)',
    msRange: '0.3 ~ 1.5 m/s',
    kmhRange: '1 ~ 5 km/h',
    knots: '1 ~ 3 kt',
    campSafety: 'safe',
    campRating: '🟢 極佳 · 適合各類帳篷與大天幕',
    desc: '煙能表示風向，但風向標不轉動。微風徐徐，搭帳輕鬆愜意。'
  },
  {
    scale: 2,
    name: '輕風 (Light Breeze)',
    msRange: '1.6 ~ 3.3 m/s',
    kmhRange: '6 ~ 11 km/h',
    knots: '4 ~ 6 kt',
    campSafety: 'safe',
    campRating: '🟢 良好 · 適合各類帳篷與大天幕',
    desc: '人面感覺有風，樹葉微動，風向標轉動。標準 20cm 營釘即可穩固。'
  },
  {
    scale: 3,
    name: '微風 (Gentle Breeze)',
    msRange: '3.4 ~ 5.4 m/s',
    kmhRange: '12 ~ 19 km/h',
    knots: '7 ~ 10 kt',
    campSafety: 'safe',
    campRating: '🟢 良好 · 適合各類帳篷與大天幕',
    desc: '樹葉及小枝搖動不息，旗幟展開。搭設天幕需拉緊副營柱營繩。'
  },
  {
    scale: 4,
    name: '和風 (Moderate Breeze)',
    msRange: '5.5 ~ 7.9 m/s',
    kmhRange: '20 ~ 28 km/h',
    knots: '11 ~ 16 kt',
    campSafety: 'caution',
    campRating: '🟡 注意 · 需加固防風與拉滿營繩',
    desc: '地面塵土及碎紙吹起，樹枝搖動。建議更換 28cm 鍛造釘，天幕調降高度。'
  },
  {
    scale: 5,
    name: '清風 (Fresh Breeze)',
    msRange: '8.0 ~ 10.7 m/s',
    kmhRange: '29 ~ 38 km/h',
    knots: '17 ~ 21 kt',
    campSafety: 'caution',
    campRating: '🟡 警戒 · 換 30cm 鍛造釘與 45° 雙向拉繩',
    desc: '有葉之小樹整棵搖動，內陸水面起小波。單人搭天幕不易，側向營柱受風力道顯著。'
  },
  {
    scale: 6,
    name: '強風 (Strong Breeze)',
    msRange: '10.8 ~ 13.8 m/s',
    kmhRange: '39 ~ 49 km/h',
    knots: '22 ~ 27 kt',
    campSafety: 'high_risk',
    campRating: '🟠 休閒露營極限 · 嚴禁搭天幕 · 僅限抗風圓頂帳',
    desc: '大樹枝搖動，電線呼呼有聲，撐傘困難。天幕易化身風箏造成危險，隧道帳側柱易被吹彎。'
  },
  {
    scale: 7,
    name: '疾風 (Near Gale)',
    msRange: '13.9 ~ 17.1 m/s',
    kmhRange: '50 ~ 61 km/h',
    knots: '28 ~ 33 kt',
    campSafety: 'danger',
    campRating: '🔴 嚴禁搭帳 · 鋁合金骨架易折斷',
    desc: '全樹搖動，逆風步行困難。休閒帳篷物理上無法定型，穿桿頂柱極易折斷。'
  },
  {
    scale: 8,
    name: '大風 / 烈風 (Gale)',
    msRange: '17.2 ~ 20.7 m/s',
    kmhRange: '62 ~ 74 km/h',
    knots: '34 ~ 40 kt',
    campSafety: 'critical',
    campRating: '🔴 嚴禁搭帳 · 輕型結構破壞撤離',
    desc: '小樹枝折斷，行人無法前行。營釘連同土塊易被拔起如砲彈飛射，帳布撕裂。'
  },
  {
    scale: 9,
    name: '狂風 (Strong Gale)',
    msRange: '20.8 ~ 24.4 m/s',
    kmhRange: '75 ~ 88 km/h',
    knots: '41 ~ 47 kt',
    campSafety: 'critical',
    campRating: '☠️ 毀滅性危險 · 建築物受損立即撤離',
    desc: '煙囪及平房瓦片被吹落，大樹被吹折。露營裝備百分之百摧毀，人員請進入水泥建築避難。'
  },
  {
    scale: 10,
    name: '暴風 (Storm)',
    msRange: '24.5 ~ 28.4 m/s',
    kmhRange: '89 ~ 102 km/h',
    knots: '48 ~ 55 kt',
    campSafety: 'disaster',
    campRating: '☠️ 輕颱等級 · 樹木拔起 · 嚴禁戶外活動',
    desc: '陸上少見，大樹連根拔起，建築物嚴重受損。相當於輕度颱風核心環流。'
  },
  {
    scale: 11,
    name: '狂暴風 (Violent Storm)',
    msRange: '28.5 ~ 32.6 m/s',
    kmhRange: '103 ~ 117 km/h',
    knots: '56 ~ 63 kt',
    campSafety: 'disaster',
    campRating: '☠️ 中颱暴風圈 · 毀滅性災害',
    desc: '陸上極少見，造成普遍廣泛嚴重破壞。相當於強烈輕颱至中度颱風上限。'
  },
  {
    scale: 12,
    name: '颶風 (Hurricane)',
    msRange: '>= 32.7 m/s',
    kmhRange: '>= 118 km/h',
    knots: '>= 64 kt',
    campSafety: 'catastrophic',
    campRating: '☠️ 中度/強烈颱風 · 毀滅性颶風',
    desc: '陸上絕少見，毀滅性破壞力。相當於中央氣象署中度颱風核心至強烈颱風。'
  }
];

export function getBeaufortWindSafety(speedKmh) {
  const kmh = Math.max(0, Number(speedKmh) || 0);

  if (kmh < 20) {
    const scale = kmh < 1 ? 0 : kmh < 6 ? 1 : kmh < 12 ? 2 : 3;
    const names = { 0: '無風', 1: '軟風', 2: '輕風', 3: '微風' };
    return {
      kmh: Math.round(kmh),
      beaufort: scale,
      beaufortName: names[scale] || '微風',
      level: 'calm',
      levelName: `${scale} 級${names[scale] || '微風'} (風力平緩)`,
      statusTag: '適合各類帳篷',
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      bannerBg: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
      pillColor: 'bg-emerald-500 text-slate-950',
      canPitch: true,
      riskLevel: 'low',
      riskTitle: '🟢 安全無虞 · 輕鬆搭帳',
      consequences: [
        '風壓極低，對帳篷與天幕骨架無結構威脅。',
        '單人即可輕鬆穿桿頂柱，標準營釘即可穩固。'
      ],
      gearAdvice: '依照日照方向搭設即可；標準 20cm 營釘即可穩固固定。',
      tarpAdvice: '大型天幕、客廳帳、雙峰帳皆可安心搭建。',
      planB: null
    };
  } else if (kmh < 39) {
    const scale = kmh < 29 ? 4 : 5;
    return {
      kmh: Math.round(kmh),
      beaufort: scale,
      beaufortName: scale === 4 ? '和風' : '清風',
      level: 'caution',
      levelName: `${scale} 級${scale === 4 ? '和風' : '清風'} (防風加固)`,
      statusTag: '需加固防風',
      badgeColor: 'bg-amber-50 text-amber-900 border-amber-300',
      bannerBg: 'bg-amber-950/85 border-amber-500/50 text-amber-200',
      pillColor: 'bg-amber-400 text-slate-950',
      canPitch: true,
      riskLevel: 'medium',
      riskTitle: '🟡 防風加固警戒 · 換長釘拉滿繩',
      consequences: [
        '帳篷布面開始明顯受壓晃動，細短鋁釘極易鬆脫。',
        '天幕劇烈拍打晃動，單人搭設可能因受風拉扯失控，需兩人以上協同。',
        '若側風迎風，一房一廳側向營柱承受較大剪切力。'
      ],
      gearAdvice: '強烈建議使用 28~30cm 鍛造釘；防風營繩務必以 45° 角度斜向拉滿。',
      tarpAdvice: '天幕高度建議降至 180cm 以下減少力矩；大風時隨時準備撤除副營柱。',
      planB: '如風勢持續增強，建議先搭睡帳避風，暫緩展開超大天幕。'
    };
  } else if (kmh < 50) {
    return {
      kmh: Math.round(kmh),
      beaufort: 6,
      beaufortName: '強風',
      level: 'high_risk',
      levelName: '6 級強風 (休閒露營極限)',
      statusTag: '不建議搭帳',
      badgeColor: 'bg-orange-50 text-orange-950 border-orange-400 font-bold',
      bannerBg: 'bg-orange-950/90 border-orange-500/60 text-orange-200',
      pillColor: 'bg-orange-500 text-white font-black',
      canPitch: false,
      riskLevel: 'high',
      riskTitle: '🟠 達到休閒露營極限 · 強烈不建議搭帳',
      consequences: [
        '💥 穿骨頂柱瞬間極易折斷營柱（未定型受風面積大）。',
        '🪁 嚴禁搭設大型天幕！天幕將化身大型風箏，營柱拔起恐橫掃車輛或傷人。',
        '⛺ 大型一房一廳或隧道帳側柱易被風壓壓扁變形。',
        '⚠️ 地面抓地力差時，營釘有連根拔起如砲彈飛射之危險。'
      ],
      gearAdvice: '新手與家庭帳請暫停搭建！若必須搭，僅限低風阻穹頂自立帳，並必須讓窄背風面迎向來風，帳門絕對背風！',
      tarpAdvice: '⛔ 嚴禁搭設天幕！若已搭設請立即撤收，避免裝備損毀或傷人。',
      planB: '建議改詢問營主轉移至「雨棚營位」，或今夜在車內「車宿」避風。'
    };
  } else {
    // 蒲福風級 7~12 級全量程細分 (符合中央氣象署標準)
    const scale = kmh < 62 ? 7 : kmh < 75 ? 8 : kmh < 89 ? 9 : kmh < 103 ? 10 : kmh < 118 ? 11 : 12;
    const names = {
      7: '疾風 (Near Gale)',
      8: '大風 / 烈風 (Gale)',
      9: '狂風 (Strong Gale)',
      10: '暴風 (Storm · 輕颱)',
      11: '狂暴風 (Violent Storm · 中颱)',
      12: '颶風 (Hurricane · 強颱)'
    };
    const isTyphoonGrade = scale >= 10;
    return {
      kmh: Math.round(kmh),
      beaufort: scale,
      beaufortName: names[scale],
      level: 'danger',
      levelName: `${scale} 級${names[scale]} (${isTyphoonGrade ? '颱風級破壞力' : '毀滅性強風'})`,
      statusTag: '嚴禁搭帳 · 撤離',
      badgeColor: 'bg-rose-100 text-rose-950 border-rose-500 font-black animate-pulse',
      bannerBg: 'bg-rose-950/95 border-rose-500/70 text-rose-200',
      pillColor: 'bg-rose-600 text-white font-black',
      canPitch: false,
      riskLevel: 'critical',
      riskTitle: isTyphoonGrade
        ? `☠️ 蒲福 ${scale} 級${names[scale]} · 颱風核心暴風圈 (立即撤離)`
        : `🔴 蒲福 ${scale} 級${names[scale]} · 嚴禁搭帳 (毀滅性危險)`,
      consequences: [
        '❌ 帳篷在物理上根本無法定型，人員徒手無法抗衡狂風。',
        '🌪️ 帳布遭狂風抽打撕裂、拉鍊直接爆齒開裂。',
        '💥 鋁合金骨架折斷後刺穿外帳，整頂帳篷被吹翻捲走。',
        '🏹 營釘連同大土塊被連根拔起，高速飛射具有致命殺傷力。',
        ...(isTyphoonGrade ? ['🌲 大樹連根拔起、電線桿被吹斷，可能伴隨土石流與道路中斷。'] : [])
      ],
      gearAdvice: '市售任何休閒家庭帳篷皆無法抵禦此等級風力！切勿嘗試搭帳。',
      tarpAdvice: '☠️ 絕對不可搭天幕！天幕布面必裂，營柱必折斷。',
      planB: '🚨 請立即撤退、延期或就近前往營地本部實體水泥建築 / 民宿緊急避難！'
    };
  }
}
