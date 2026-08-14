const fs = require('fs');
const path = require('path');
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.replace(/\\n/gm, '\n').slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  } catch(err) {}
}
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GOOGLE_MAPS_API_KEY) {
  console.error('❌ 錯誤：找不到必要的環境變數！');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const csvPath = path.join(__dirname, 'campsites_rows.csv');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ORIGINS = [
  { key: 'taipei', name: '台北車站' },
  { key: 'hsinchu', name: '新竹高鐵站' },
  { key: 'taichung', name: '台中高鐵站' },
  { key: 'tainan', name: '台南安平區' }
];
const originsString = ORIGINS.map(o => o.name).join('|');

function getFutureTimestamp(dayOfWeek, hour) {
  const now = new Date();
  const targetDate = new Date(now.getTime());
  let daysUntil = (7 + dayOfWeek - now.getDay()) % 7;
  if (daysUntil === 0 && now.getHours() >= hour) daysUntil = 7;
  targetDate.setDate(now.getDate() + daysUntil);
  targetDate.setHours(hour, 0, 0, 0);
  return Math.floor(targetDate.getTime() / 1000);
}

const tsFriday = getFutureTimestamp(5, 16);
const tsSaturday = getFutureTimestamp(6, 8);

async function fetchTrafficData(destinationName, timestamp) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(originsString)}&destinations=${encodeURIComponent(destinationName)}&mode=driving&departure_time=${timestamp}&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === 'OK' && data.rows && data.rows.length === ORIGINS.length) {
      let result = {};
      ORIGINS.forEach((origin, index) => {
        const element = data.rows[index].elements[0];
        if (element.status === 'OK' && element.duration_in_traffic) {
          result[origin.key] = Math.ceil(element.duration_in_traffic.value / 60);
          result[`distance_${origin.key}`] = element.distance.text;
        }
      });
      return result;
    } else {
      console.warn(`    ⚠️ 抓取 ${destinationName} 路況失敗: ${data.status}`);
    }
  } catch(e) {
    console.error("Fetch API error:", e);
  }
  return {};
}

function parseProsCons(camp) {
  const pros = [];
  const cons = [];
  
  if (camp.特色摘要 && camp.特色摘要 !== '不確定') pros.push(camp.特色摘要);
  if (camp.雨棚區 === '有') pros.push('有提供雨棚區');
  if (camp.是否免搭帳 === '是') pros.push('提供免搭帳住宿');
  if (camp.兒童設施 && camp.兒童設施 !== '不確定' && camp.兒童設施 !== '無') pros.push(`兒童設施: ${camp.兒童設施}`);
  if (camp.衛浴設備評價 && camp.衛浴設備評價 !== '不確定') {
    if (camp.衛浴設備評價.includes('良好') || camp.衛浴設備評價.includes('乾淨')) {
      pros.push(`衛浴評價: ${camp.衛浴設備評價}`);
    } else if (camp.衛浴設備評價.includes('差') || camp.衛浴設備評價.includes('不穩')) {
      cons.push(`衛浴評價: ${camp.衛浴設備評價}`);
    } else {
      pros.push(`衛浴評價: ${camp.衛浴設備評價}`);
    }
  }

  return { 
    pros: pros, 
    cons: cons 
  };
}

async function main() {
  // 1. Read CSV to find new campsites (TW-CAMP-*)
  console.log('讀取 CSV...');
  const csvData = fs.readFileSync(csvPath, 'utf8');
  const targetIds = new Set();
  csvData.split('\n').forEach(line => {
    if (line.startsWith('TW-CAMP-')) {
      const id = line.split(',')[0];
      targetIds.add(id);
    }
  });

  if (targetIds.size === 0) {
    console.log('沒有找到 TW-CAMP- 開頭的新營地資料。');
    return;
  }
  console.log(`找到 ${targetIds.size} 筆準備更新的營地資料。`);

  // 2. Fetch JSON data
  console.log('獲取外部來源資料庫...');
  let jsonData = '';
  await new Promise((resolve, reject) => {
    https.get('https://family-camping-tw.github.io/data/camps.js', (res) => {
      res.on('data', chunk => jsonData += chunk);
      res.on('end', resolve);
    }).on('error', reject);
  });

  const match = jsonData.match(/window\.CAMP_DATA\s*=\s*(\[.*\]);?/s);
  if (!match || !match[1]) {
    console.error('解析外部 JSON 失敗');
    return;
  }
  
  const camps = JSON.parse(match[1]);
  const newCampsToProcess = camps.filter(c => targetIds.has(c.camp_id));
  
  console.log(`準備處理並上傳 ${newCampsToProcess.length} 筆營地至 Supabase...`);

  for (let i = 0; i < newCampsToProcess.length; i++) {
    const camp = newCampsToProcess[i];
    console.log(`\n[${i + 1}/${newCampsToProcess.length}] 正在處理: ${camp.營地}...`);

    const { pros, cons } = parseProsCons(camp);
    
    let booking_type = '';
    if (camp.訂位平台 === '愛露營') booking_type = 'icamping';
    else if (camp.訂位方式 === '電話訂位') booking_type = 'phone';
    else if (camp.訂位方式 && camp.訂位方式.includes('LINE')) booking_type = 'line';
    else if (camp.訂位平台 === '官方網站') booking_type = 'official_site';
    else if (camp.訂位平台 === '露營樂') booking_type = 'easycamp';

    let payload = {
      id: camp.camp_id,
      name: camp.營地,
      altitude: (camp.海拔高度 && camp.海拔高度 !== '不確定') ? camp.海拔高度 : null,
      rating: (camp.Google星等 && camp.Google星等 !== '不確定') ? camp.Google星等 : null,
      price_range: (camp.價格 && camp.價格 !== '不確定') ? camp.價格 : null,
      pros: pros,
      cons: cons,
      region: camp.縣市,
      location: camp.鄉鎮,
      booking_type: booking_type,
      updated_at: new Date().toISOString()
    };

    // 抓取週六 08:00
    console.log(`   ➡️ 抓取週六早衝路況...`);
    const satData = await fetchTrafficData(`${camp.營地} 露營區`, tsSaturday);
    if (Object.keys(satData).length > 0) {
      payload.drive_time_taipei = satData.taipei;
      payload.distance_taipei = satData.distance_taipei;
      payload.drive_time_hsinchu = satData.hsinchu;
      payload.distance_hsinchu = satData.distance_hsinchu;
      payload.drive_time_taichung = satData.taichung;
      payload.distance_taichung = satData.distance_taichung;
      payload.drive_time_tainan = satData.tainan;
      payload.distance_tainan = satData.distance_tainan;
    }

    // 抓取週五 16:00
    console.log(`   ➡️ 抓取週五夜衝路況...`);
    const friData = await fetchTrafficData(`${camp.營地} 露營區`, tsFriday);
    if (Object.keys(friData).length > 0) {
      payload.drive_time_taipei_fri = friData.taipei;
      payload.drive_time_hsinchu_fri = friData.hsinchu;
      payload.drive_time_taichung_fri = friData.taichung;
      payload.drive_time_tainan_fri = friData.tainan;
    }

    console.log(`   ➡️ 寫入 Supabase...`);
    const { error } = await supabase
      .from('campsites')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error(`   ❌ Supabase 寫入失敗:`, error.message);
    } else {
      console.log(`   ✅ Supabase 寫入成功！`);
    }

    // 避免打擊過快
    await delay(1000);
  }

  console.log('\n🎉 所有新營地已豐富化並成功上傳至 Supabase！');
}

main();
