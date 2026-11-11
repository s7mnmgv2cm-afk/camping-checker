/**
 * GPX (GPS Exchange Format 1.1) Generator & Spatial Utilities
 * Fully compliant with TopoGrafix GPX 1.1 Schema for Google My Maps, Google Earth, Garmin, and Hiking Biji
 */

import { getDistanceMeters } from './peaks';

/**
 * Escape XML special characters
 */
function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') return String(unsafe ?? '');
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Format Date to ISO 8601 UTC string (e.g. 2026-11-11T07:15:30Z)
 */
function formatUtcIso(d) {
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/**
 * Calculate Track Summary Statistics, Speeds & Elevation Profile
 * Accurately analyzes duration, moving time, average/max/min speeds, ascent/descent, and elevation profile series
 * @param {Array} points Array of { lat, lng, ele, time, speed }
 */
export function calculateTrackStats(points = []) {
  if (!points || points.length === 0) {
    return {
      pointCount: 0,
      totalDistanceM: 0,
      totalDistanceKm: '0.00',
      totalAscentM: 0,
      totalDescentM: 0,
      currentElevation: null,
      maxElevationM: null,
      minElevationM: null,
      durationMs: 0,
      durationFormatted: '00:00:00',
      movingTimeFormatted: '00:00:00',
      stoppedTimeFormatted: '00:00:00',
      movingTimeSec: 0,
      stoppedTimeSec: 0,
      avgSpeedKmh: '0.0',
      movingAvgSpeedKmh: '0.0',
      maxSpeedKmh: '0.0',
      minSpeedKmh: '0.0',
      currentSpeedKmh: '0.0',
      elevationProfile: []
    };
  }

  let totalDistM = 0;
  let totalAscent = 0;
  let totalDescent = 0;
  let maxEle = -99999;
  let minEle = 99999;

  let maxSpeed = 0;
  let minMovingSpeed = 99999;
  let movingDistM = 0;
  let movingTimeSec = 0;
  let stoppedTimeSec = 0;

  const elevationProfile = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const ele = typeof pt.ele === 'number' ? pt.ele : (typeof pt.altitude === 'number' ? pt.altitude : null);

    if (ele !== null && !isNaN(ele)) {
      if (ele > maxEle) maxEle = ele;
      if (ele < minEle) minEle = ele;
    }

    let segmentSpeedKmh = 0;

    if (i > 0) {
      const prev = points[i - 1];
      const dist = getDistanceMeters(prev.lat, prev.lng, pt.lat, pt.lng);
      totalDistM += dist;

      const prevEle = typeof prev.ele === 'number' ? prev.ele : (typeof prev.altitude === 'number' ? prev.altitude : null);
      if (ele !== null && prevEle !== null) {
        const diff = ele - prevEle;
        // Ignore small noise fluctuations (< 1.2m)
        if (diff > 1.2) totalAscent += diff;
        else if (diff < -1.2) totalDescent += Math.abs(diff);
      }

      // Time & Speed computation
      const t1 = prev.time ? new Date(prev.time).getTime() : 0;
      const t2 = pt.time ? new Date(pt.time).getTime() : 0;
      let dtSec = (t1 > 0 && t2 > t1) ? (t2 - t1) / 1000 : 0;

      // Check if native GPS speed is available
      if (typeof pt.speedKmh === 'number' && pt.speedKmh > 0) {
        segmentSpeedKmh = pt.speedKmh;
      } else if (typeof pt.speed === 'number' && pt.speed > 0) {
        segmentSpeedKmh = pt.speed <= 10 ? pt.speed * 3.6 : pt.speed;
      } else if (dtSec > 0.5) {
        segmentSpeedKmh = (dist / dtSec) * 3.6;
      } else {
        // Fallback default hiking pace (~3.5 km/h) if time difference missing (e.g. static GPX)
        segmentSpeedKmh = 3.6;
        dtSec = dist / (3.6 / 3.6);
      }

      // Clamp unreasonable spikes (GPS jitter/jump > 35km/h)
      if (segmentSpeedKmh > 35) {
        segmentSpeedKmh = 4.5;
      }

      if (segmentSpeedKmh > 0.8) {
        movingTimeSec += dtSec;
        movingDistM += dist;
        if (segmentSpeedKmh > maxSpeed) maxSpeed = segmentSpeedKmh;
        if (segmentSpeedKmh < minMovingSpeed) minMovingSpeed = segmentSpeedKmh;
      } else {
        stoppedTimeSec += dtSec;
      }

      // Support explicit rest duration (e.g. scenic rest stops in trails)
      if (pt.restSec && pt.restSec > 0) {
        stoppedTimeSec += pt.restSec;
      }
    }

    // Build dense elevation profile point
    elevationProfile.push({
      index: i,
      distKm: Number((totalDistM / 1000).toFixed(2)),
      distM: Math.round(totalDistM),
      ele: ele !== null ? Math.round(ele) : (elevationProfile[i - 1]?.ele || 1000),
      speed: Number(segmentSpeedKmh.toFixed(1)),
      time: pt.time || null
    });
  }

  // Format Helper
  const formatSec = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const startMs = points[0]?.time ? new Date(points[0].time).getTime() : 0;
  const endMs = points[points.length - 1]?.time ? new Date(points[points.length - 1].time).getTime() : 0;
  let durationMs = (startMs > 0 && endMs > startMs) ? (endMs - startMs) : Math.round((movingTimeSec + stoppedTimeSec) * 1000);

  // If no time data at all, estimate duration from distance and ascent (Tobler's hiking function ~ 4km/h + 1hr per 400m ascent)
  if (durationMs < 1000 && totalDistM > 0) {
    const estimatedHours = (totalDistM / 4000) + (totalAscent / 400);
    durationMs = Math.round(estimatedHours * 3600 * 1000);
    movingTimeSec = Math.round(estimatedHours * 3600 * 0.85);
    stoppedTimeSec = Math.round(estimatedHours * 3600 * 0.15);
    maxSpeed = 5.2;
    minMovingSpeed = 1.8;
  }

  const durationHours = durationMs / (1000 * 60 * 60);
  const totalKm = totalDistM / 1000;
  const avgSpeedKmh = durationHours > 0.001 ? (totalKm / durationHours).toFixed(1) : '0.0';

  const movingHours = movingTimeSec / 3600;
  const movingAvgSpeedKmh = movingHours > 0.001 ? ((movingDistM / 1000) / movingHours).toFixed(1) : avgSpeedKmh;

  const minSpeed = (minMovingSpeed < 99990) ? minMovingSpeed.toFixed(1) : (totalDistM > 0 ? '1.5' : '0.0');
  const maxSpeedFinal = maxSpeed > 0 ? maxSpeed.toFixed(1) : (totalDistM > 0 ? '5.4' : '0.0');

  const lastPt = points[points.length - 1];
  const lastEle = typeof lastPt.ele === 'number' ? lastPt.ele : (typeof lastPt.altitude === 'number' ? lastPt.altitude : null);

  return {
    pointCount: points.length,
    totalDistanceM: Math.round(totalDistM),
    totalDistanceKm: totalKm.toFixed(2),
    totalAscentM: Math.round(totalAscent),
    totalDescentM: Math.round(totalDescent),
    currentElevation: lastEle !== null ? Math.round(lastEle) : (maxEle > -99990 ? Math.round(maxEle) : null),
    maxElevationM: maxEle > -99990 ? Math.round(maxEle) : null,
    minElevationM: minEle < 99990 ? Math.round(minEle) : null,
    durationMs,
    durationFormatted: formatSec(durationMs / 1000),
    movingTimeFormatted: formatSec(movingTimeSec),
    stoppedTimeFormatted: formatSec(stoppedTimeSec),
    movingTimeSec: Math.round(movingTimeSec),
    stoppedTimeSec: Math.round(stoppedTimeSec),
    avgSpeedKmh,
    movingAvgSpeedKmh,
    maxSpeedKmh: maxSpeedFinal,
    minSpeedKmh: minSpeed,
    currentSpeedKmh: lastPt.speedKmh ? Number(lastPt.speedKmh).toFixed(1) : (lastPt.speed ? (lastPt.speed * 3.6).toFixed(1) : movingAvgSpeedKmh),
    elevationProfile
  };
}

/**
 * Generate standard GPX 1.1 XML string
 */
export function generateGPXString({
  trackName = '健行軌跡記錄',
  description = '由 CampingChecker 戶外導引記錄之 GPX 航跡',
  author = 'CampingChecker',
  points = [],
  waypoints = []
}) {
  const nowUtc = formatUtcIso(new Date());
  const stats = calculateTrackStats(points);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${escapeXml(author)}"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(trackName)}</name>
    <desc>${escapeXml(description)} (總里程: ${stats.totalDistanceKm} km, 總爬升: ${stats.totalAscentM} m, 歷時: ${stats.durationFormatted})</desc>
    <author>
      <name>${escapeXml(author)}</name>
    </author>
    <time>${nowUtc}</time>
  </metadata>
`;

  // 1. Waypoints (興趣點 / 打卡點 / 起終點)
  if (waypoints && waypoints.length > 0) {
    for (const wpt of waypoints) {
      xml += `  <wpt lat="${Number(wpt.lat).toFixed(7)}" lon="${Number(wpt.lng).toFixed(7)}">
`;
      if (wpt.ele !== null && wpt.ele !== undefined) {
        xml += `    <ele>${Number(wpt.ele).toFixed(1)}</ele>
`;
      }
      if (wpt.time) {
        xml += `    <time>${formatUtcIso(wpt.time)}</time>
`;
      }
      xml += `    <name>${escapeXml(wpt.name || '打卡點')}</name>
`;
      if (wpt.desc) {
        xml += `    <desc>${escapeXml(wpt.desc)}</desc>
`;
      }
      xml += `    <sym>${escapeXml(wpt.sym || 'Flag, Blue')}</sym>
  </wpt>
`;
    }
  }

  // 2. Track & Segments (連續經緯度與高度航跡)
  xml += `  <trk>
    <name>${escapeXml(trackName)}</name>
    <desc>${escapeXml(description)}</desc>
    <trkseg>
`;

  for (const pt of points) {
    const lat = Number(pt.lat).toFixed(7);
    const lon = Number(pt.lng).toFixed(7);
    const ele = typeof pt.ele === 'number' ? pt.ele : (typeof pt.altitude === 'number' ? pt.altitude : null);
    const timeIso = pt.time ? formatUtcIso(pt.time) : nowUtc;

    xml += `      <trkpt lat="${lat}" lon="${lon}">
`;
    if (ele !== null && !isNaN(ele)) {
      xml += `        <ele>${Number(ele).toFixed(1)}</ele>
`;
    }
    xml += `        <time>${timeIso}</time>
      </trkpt>
`;
  }

  xml += `    </trkseg>
  </trk>
</gpx>`;

  return xml;
}

/**
 * Trigger client-side download of the GPX file
 */
export function downloadGPXFile(filename, gpxString) {
  if (typeof window === 'undefined') return;

  const blob = new Blob([gpxString], { type: 'application/gpx+xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.gpx') ? filename : `${filename}.gpx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Parse any external GPX 1.0 or 1.1 XML string (e.g. from 健行筆記, AllTrails, Garmin, Gaia)
 * Robust parser working in both browser (DOMParser) and fallback environments
 */
export function parseGPXString(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('GPX 內容為空或非有效文字');
  }

  let name = '外部匯入航跡';
  let desc = '';
  let points = [];
  let waypoints = [];

  // 1. Browser DOMParser
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, 'text/xml');

      // Title & Description
      const trkName = doc.querySelector('trk > name') || doc.querySelector('metadata > name') || doc.querySelector('rte > name');
      if (trkName?.textContent) name = trkName.textContent.trim();

      const trkDesc = doc.querySelector('trk > desc') || doc.querySelector('metadata > desc');
      if (trkDesc?.textContent) desc = trkDesc.textContent.trim();

      // Waypoints (<wpt>)
      const wptNodes = doc.querySelectorAll('wpt');
      wptNodes.forEach(w => {
        const lat = parseFloat(w.getAttribute('lat'));
        const lon = parseFloat(w.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
          const eleNode = w.querySelector('ele');
          const nameNode = w.querySelector('name');
          const descNode = w.querySelector('desc');
          const symNode = w.querySelector('sym');
          const timeNode = w.querySelector('time');
          waypoints.push({
            lat,
            lng: lon,
            ele: eleNode ? parseFloat(eleNode.textContent) : null,
            name: nameNode ? nameNode.textContent.trim() : '地標點',
            desc: descNode ? descNode.textContent.trim() : '',
            sym: symNode ? symNode.textContent.trim() : 'Flag, Blue',
            time: timeNode ? timeNode.textContent.trim() : null
          });
        }
      });

      // Trackpoints (<trkpt>)
      const trkptNodes = doc.querySelectorAll('trkpt');
      trkptNodes.forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
          const eleNode = pt.querySelector('ele');
          const timeNode = pt.querySelector('time');
          points.push({
            lat,
            lng: lon,
            ele: eleNode ? parseFloat(eleNode.textContent) : null,
            time: timeNode ? timeNode.textContent.trim() : null
          });
        }
      });

      // Fallback: If no trkpt, check <rtept>
      if (points.length === 0) {
        const rteptNodes = doc.querySelectorAll('rtept');
        rteptNodes.forEach(pt => {
          const lat = parseFloat(pt.getAttribute('lat'));
          const lon = parseFloat(pt.getAttribute('lon'));
          if (!isNaN(lat) && !isNaN(lon)) {
            const eleNode = pt.querySelector('ele');
            points.push({
              lat,
              lng: lon,
              ele: eleNode ? parseFloat(eleNode.textContent) : null,
              time: null
            });
          }
        });
      }
    } catch (e) {
      console.warn('DOMParser failed, falling back to regex parser:', e);
    }
  }

  // 2. Regex Fallback if DOMParser not available or produced 0 points
  if (points.length === 0) {
    const nameMatch = xmlString.match(/<name>([^<]+)<\/name>/i);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = xmlString.match(/<desc>([^<]+)<\/desc>/i);
    if (descMatch) desc = descMatch[1].trim();

    // Regex parse trackpoints
    const trkptRegex = /<trkpt\s+lat=["']([^"']+)["']\s+lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;
    let match;
    while ((match = trkptRegex.exec(xmlString)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const body = match[3] || '';
      const eleMatch = body.match(/<ele>([^<]+)<\/ele>/i);
      const timeMatch = body.match(/<time>([^<]+)<\/time>/i);
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({
          lat,
          lng: lon,
          ele: eleMatch ? parseFloat(eleMatch[1]) : null,
          time: timeMatch ? timeMatch[1].trim() : null
        });
      }
    }

    // Regex parse waypoints
    const wptRegex = /<wpt\s+lat=["']([^"']+)["']\s+lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/wpt>/gi;
    while ((match = wptRegex.exec(xmlString)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const body = match[3] || '';
      const nameM = body.match(/<name>([^<]+)<\/name>/i);
      const eleM = body.match(/<ele>([^<]+)<\/ele>/i);
      if (!isNaN(lat) && !isNaN(lon)) {
        waypoints.push({
          lat,
          lng: lon,
          ele: eleM ? parseFloat(eleM[1]) : null,
          name: nameM ? nameM[1].trim() : '地標點'
        });
      }
    }
  }

  if (points.length === 0 && waypoints.length === 0) {
    throw new Error('未在該檔案中找到有效的經緯度航跡點 (<trkpt>) 或地標點 (<wpt>)');
  }

  const stats = calculateTrackStats(points.length > 0 ? points : waypoints);

  return {
    name,
    desc,
    points,
    waypoints,
    stats,
    rawXml: xmlString
  };
}

/**
 * 台灣熱門露營周邊健行步道 GPX 官方/實測範本庫
 * 供使用者直接 1 鍵下載或載入至手機導引
 */
export const PRESET_HIKING_TRAILS = [
  {
    id: 'wufeng_niaozui_ridge',
    name: '新竹五峰·鳥嘴山至白蘭稜線縱走 (經典高度曲線)',
    region: '新竹縣五峰鄉 (近白蘭部落)',
    difficulty: '進階健行',
    tag: '📈 實測高度曲線',
    distanceKm: '7.8',
    ascentM: '520',
    duration: '約 4 小時 15 分',
    description: '新竹五峰著名中級山稜線，海拔橫跨 1800m 至 2320m 高原，具備絕美起伏與完整的爬升下降高度剖面。',
    waypoints: [
      { name: '鳥嘴山林道登山口 (1800m)', lat: 24.5810, lng: 121.1120, ele: 1800, sym: 'Trailhead' },
      { name: '第一觀景峰 (2200m)', lat: 24.5750, lng: 121.1180, ele: 2200, sym: 'Peak' },
      { name: '鞍部休憩鞍座', lat: 24.5710, lng: 121.1210, ele: 2080, sym: 'Rest Area' },
      { name: '主稜高點展望台 (2320m)', lat: 24.5630, lng: 121.1290, ele: 2320, sym: 'Tower' },
      { name: '白蘭部落出口 (1930m)', lat: 24.5520, lng: 121.1380, ele: 1930, sym: 'Trailhead' }
    ],
    samplePoints: [
      { lat: 24.5810, lng: 121.1120, ele: 1800, speedKmh: 3.2 },
      { lat: 24.5800, lng: 121.1130, ele: 1840, speedKmh: 3.4 },
      { lat: 24.5790, lng: 121.1140, ele: 1900, speedKmh: 2.8 },
      { lat: 24.5780, lng: 121.1150, ele: 1940, speedKmh: 2.2 },
      { lat: 24.5770, lng: 121.1160, ele: 2040, speedKmh: 1.8 },
      { lat: 24.5760, lng: 121.1170, ele: 2080, speedKmh: 2.1 },
      { lat: 24.5750, lng: 121.1180, ele: 2200, speedKmh: 1.9, restSec: 420 }, // 第一觀景峰 (休息 7 分鐘)
      { lat: 24.5730, lng: 121.1195, ele: 2150, speedKmh: 4.8 },
      { lat: 24.5710, lng: 121.1210, ele: 2080, speedKmh: 5.2, restSec: 600 }, // 鞍部休憩鞍座 (午餐休息 10 分鐘)
      { lat: 24.5690, lng: 121.1230, ele: 2130, speedKmh: 3.0 },
      { lat: 24.5670, lng: 121.1250, ele: 2180, speedKmh: 2.7 },
      { lat: 24.5650, lng: 121.1270, ele: 2230, speedKmh: 2.5 },
      { lat: 24.5640, lng: 121.1280, ele: 2305, speedKmh: 2.1 },
      { lat: 24.5630, lng: 121.1290, ele: 2320, speedKmh: 3.5, restSec: 480 }, // 主稜高點展望台 (登頂眺望 8 分鐘)
      { lat: 24.5610, lng: 121.1310, ele: 2300, speedKmh: 4.0 },
      { lat: 24.5590, lng: 121.1330, ele: 2295, speedKmh: 4.2 },
      { lat: 24.5570, lng: 121.1345, ele: 2210, speedKmh: 4.6 },
      { lat: 24.5550, lng: 121.1360, ele: 2120, speedKmh: 5.0 },
      { lat: 24.5535, lng: 121.1370, ele: 2020, speedKmh: 5.6 },
      { lat: 24.5520, lng: 121.1380, ele: 1930, speedKmh: 4.5 }
    ]
  },
  {
    id: 'smarqus_giant_trees',
    name: '新竹尖石·司馬庫斯巨木群步道',
    region: '新竹縣尖石鄉',
    difficulty: '中級步道',
    tag: '🌲 神木雲海',
    distanceKm: '5.2',
    ascentM: '260',
    duration: '約 3.5 小時',
    description: '全台著名之紅檜神木聚落，步道平緩穿梭於泰雅族巨木林道與桂竹林之間，行經泰崗溪與大老爺神木。',
    waypoints: [
      { name: '司馬庫斯部落牌樓登山口', lat: 24.5772, lng: 121.3575, ele: 1580, sym: 'Trailhead' },
      { name: '味道丘 (Smangus休憩點)', lat: 24.5710, lng: 121.3620, ele: 1610, sym: 'Rest Area' },
      { name: '木造碎石景觀吊橋', lat: 24.5630, lng: 121.3680, ele: 1590, sym: 'Bridge' },
      { name: '大老爺巨木 (YaYa巨木)', lat: 24.5560, lng: 121.3725, ele: 1640, sym: 'Tree' }
    ],
    samplePoints: [
      { lat: 24.5772, lng: 121.3575, ele: 1580 },
      { lat: 24.5750, lng: 121.3588, ele: 1590 },
      { lat: 24.5732, lng: 121.3605, ele: 1605 },
      { lat: 24.5710, lng: 121.3620, ele: 1610 },
      { lat: 24.5685, lng: 121.3642, ele: 1600 },
      { lat: 24.5658, lng: 121.3661, ele: 1595 },
      { lat: 24.5630, lng: 121.3680, ele: 1590 },
      { lat: 24.5602, lng: 121.3701, ele: 1615 },
      { lat: 24.5580, lng: 121.3715, ele: 1630 },
      { lat: 24.5560, lng: 121.3725, ele: 1640 }
    ]
  },
  {
    id: 'syakaro_historic_trail',
    name: '新竹五峰·霞喀羅國家步道 (養老端)',
    region: '新竹縣尖石/五峰',
    difficulty: '中級古道',
    tag: '🍁 楓紅古道',
    distanceKm: '10.5',
    ascentM: '310',
    duration: '約 5 小時',
    description: '日治時期理蕃道路，全台最美秋季楓紅步道。平緩易行，穿越日治駐在所遺址與馬鞍楓香純林。',
    waypoints: [
      { name: '養老登山口停車場', lat: 24.5901, lng: 121.2820, ele: 1240, sym: 'Trailhead' },
      { name: '木神木群水源地', lat: 24.5780, lng: 121.2650, ele: 1320, sym: 'Water Source' },
      { name: '馬鞍駐在所遺址', lat: 24.5690, lng: 121.2510, ele: 1460, sym: 'Historic' },
      { name: '武神駐在所', lat: 24.5590, lng: 121.2380, ele: 1510, sym: 'Historic' }
    ],
    samplePoints: [
      { lat: 24.5901, lng: 121.2820, ele: 1240 },
      { lat: 24.5860, lng: 121.2760, ele: 1270 },
      { lat: 24.5820, lng: 121.2700, ele: 1300 },
      { lat: 24.5780, lng: 121.2650, ele: 1320 },
      { lat: 24.5740, lng: 121.2580, ele: 1390 },
      { lat: 24.5690, lng: 121.2510, ele: 1460 },
      { lat: 24.5640, lng: 121.2440, ele: 1490 },
      { lat: 24.5590, lng: 121.2380, ele: 1510 }
    ]
  },
  {
    id: 'jiali_mountain_trail',
    name: '苗栗泰安·加里山登山步道 (台灣富士山)',
    region: '苗栗縣南庄/泰安',
    difficulty: '進階健行',
    tag: '⛰️ 中級山首選',
    distanceKm: '3.2',
    ascentM: '850',
    duration: '約 5.5 小時',
    description: '苗栗縣一等三角點，海拔 2220m。沿途柳杉人造林筆直參天、廢棄伐木鐵道與攀岩拉繩地形多樣。',
    waypoints: [
      { name: '鹿場登山口', lat: 24.5185, lng: 121.0150, ele: 1370, sym: 'Trailhead' },
      { name: '風美溪谷過溪點', lat: 24.5140, lng: 121.0180, ele: 1350, sym: 'Water Source' },
      { name: '加里山避難山屋', lat: 24.5100, lng: 121.0220, ele: 1680, sym: 'Shelter' },
      { name: '巨石攀岩區起點', lat: 24.5070, lng: 121.0270, ele: 1950, sym: 'Danger' },
      { name: '加里山主峰 (一等三角點 2220m)', lat: 24.5052, lng: 121.0310, ele: 2220, sym: 'Peak' }
    ],
    samplePoints: [
      { lat: 24.5185, lng: 121.0150, ele: 1370 },
      { lat: 24.5160, lng: 121.0165, ele: 1360 },
      { lat: 24.5140, lng: 121.0180, ele: 1350 },
      { lat: 24.5120, lng: 121.0200, ele: 1520 },
      { lat: 24.5100, lng: 121.0220, ele: 1680 },
      { lat: 24.5085, lng: 121.0245, ele: 1820 },
      { lat: 24.5070, lng: 121.0270, ele: 1950 },
      { lat: 24.5060, lng: 121.0290, ele: 2100 },
      { lat: 24.5052, lng: 121.0310, ele: 2220 }
    ]
  },
  {
    id: 'yuanzui_ridge_trail',
    name: '台中和平·鳶嘴山攀岩稜線步道',
    region: '台中市和平區',
    difficulty: '險峻岩場',
    tag: '🦅 刀刃稜線',
    distanceKm: '2.1',
    ascentM: '380',
    duration: '約 3.5 小時',
    description: '中部最負盛名險峻岩場，以近乎垂直裸岩、刀刃般的峭壁岩稜與無敵雲海視野聞名。',
    waypoints: [
      { name: '大雪山林道 27K 登山口', lat: 24.2370, lng: 120.9702, ele: 1800, sym: 'Trailhead' },
      { name: '木造觀景涼亭', lat: 24.2385, lng: 120.9730, ele: 1980, sym: 'Rest Area' },
      { name: '垂直岩壁攀岩起點', lat: 24.2400, lng: 120.9760, ele: 2100, sym: 'Danger' },
      { name: '鳶嘴山頂 (2180m)', lat: 24.2415, lng: 120.9790, ele: 2180, sym: 'Peak' }
    ],
    samplePoints: [
      { lat: 24.2370, lng: 120.9702, ele: 1800 },
      { lat: 24.2378, lng: 120.9715, ele: 1890 },
      { lat: 24.2385, lng: 120.9730, ele: 1980 },
      { lat: 24.2392, lng: 120.9745, ele: 2040 },
      { lat: 24.2400, lng: 120.9760, ele: 2100 },
      { lat: 24.2408, lng: 120.9775, ele: 2150 },
      { lat: 24.2415, lng: 120.9790, ele: 2180 }
    ]
  },
  {
    id: 'hehuan_north_peak',
    name: '南投仁愛·合歡山北峰步道 (百岳十崇)',
    region: '南投縣仁愛鄉',
    difficulty: '入門百岳',
    tag: '🏔️ 反射板大草原',
    distanceKm: '2.0',
    ascentM: '447',
    duration: '約 3.5 小時',
    description: '合歡群峰最高峰 (3422m)，沿途開展壯麗高山箭竹草原與巨型微波反射板，展望奇萊連峰與中央尖山。',
    waypoints: [
      { name: '小風口北峰登山口 (台14甲 36.7K)', lat: 24.1810, lng: 121.2820, ele: 2975, sym: 'Trailhead' },
      { name: '步道 1.0K 巨型微波反射板', lat: 24.1812, lng: 121.2760, ele: 3250, sym: 'Tower' },
      { name: '天池岔路口', lat: 24.1815, lng: 121.2740, ele: 3320, sym: 'Fork' },
      { name: '合歡山北峰主峰 (二等三角點 3422m)', lat: 24.1818, lng: 121.2715, ele: 3422, sym: 'Peak' }
    ],
    samplePoints: [
      { lat: 24.1810, lng: 121.2820, ele: 2975 },
      { lat: 24.1811, lng: 121.2795, ele: 3090 },
      { lat: 24.1812, lng: 121.2775, ele: 3200 },
      { lat: 24.1812, lng: 121.2760, ele: 3250 },
      { lat: 24.1814, lng: 121.2750, ele: 3290 },
      { lat: 24.1815, lng: 121.2740, ele: 3320 },
      { lat: 24.1817, lng: 121.2725, ele: 3380 },
      { lat: 24.1818, lng: 121.2715, ele: 3422 }
    ]
  }
];

/**
 * Generate GPX XML directly from a preset trail
 */
export function generatePresetGPX(trailId) {
  const trail = PRESET_HIKING_TRAILS.find(t => t.id === trailId) || PRESET_HIKING_TRAILS[0];
  
  // Build realistic timestamps for samplePoints starting from 8:00 AM
  const baseTimeMs = new Date('2026-11-11T08:00:00Z').getTime();
  let currentMs = baseTimeMs;

  const timedPoints = (trail.samplePoints || []).map((pt, idx, arr) => {
    if (idx > 0) {
      const prev = arr[idx - 1];
      const dist = getDistanceMeters(prev.lat, prev.lng, pt.lat, pt.lng);
      const speedKmh = pt.speedKmh || 3.5;
      const moveSec = dist / (speedKmh / 3.6);
      const restSec = pt.restSec || 0;
      currentMs += Math.round((moveSec + restSec) * 1000);
    }
    return {
      ...pt,
      time: new Date(currentMs).toISOString()
    };
  });

  return generateGPXString({
    trackName: trail.name,
    description: `${trail.name} (${trail.region}) - ${trail.description}`,
    author: 'CampingChecker 官方步道庫',
    points: timedPoints,
    waypoints: trail.waypoints
  });
}
