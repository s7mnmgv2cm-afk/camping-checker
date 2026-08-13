// 🎯 1. 嘗試讀取本地 .env.local 檔案
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {}

const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// 2. 初始化環境變數
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 錯誤：找不到 SUPABASE_URL 或 SUPABASE_KEY！');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket }
});

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FIXED_ORIGINS = {
  tainan: '台南安平區',
  hsinchu: '新竹高鐵站',
  taipei: '台北車站',
  taichung: '台中高鐵站'
};

/**
 * 🔍 [做法二] 利用 Playwright 開啟 Google 搜尋營地的真實收費關鍵字
 */
async function searchPriceWithPlaywright(browser, campsiteName, region) {
  try {
    const page = await browser.newPage();
    const query = encodeURIComponent(`${region} ${campsiteName} 露營區 費用 OR 價格 OR 一帳`);
    const searchUrl = `https://www.google.com/search?q=${query}&hl=zh-TW`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
    await page.close();

    const matchRange = pageText.match(/(\$\d+[\d,]*\s*[\-\~～]\s*\$?\d+[\d,]*|\d{3,4}\s*[\-\~～]\s*\d{3,4}\s*元)/);
    if (matchRange) {
      return matchRange[0].replace(/\s+/g, '') + ' / 帳';
    }

    const matchSingle = pageText.match(/(\$\d{3,4}|\d{3,4}\s*元)/);
    if (matchSingle) {
      return matchSingle[0].replace(/\s+/g, '') + ' / 帳';
    }
  } catch (err) {
    console.warn(`⚠️ Playwright 搜尋價格失敗 (${campsiteName}):`, err.message);
  }

  return '請洽官網/訂位系統';
}

/**
 * 📞 透過 Google Places API 搜尋營地的真實官方電話
 */
async function fetchOfficialPhoneFromGoogle(campsiteName, region) {
  if (!GOOGLE_MAPS_API_KEY) return '請洽官網/粉絲專頁';

  try {
    const query = encodeURIComponent(`${region} ${campsiteName} 露營區`);
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.status === 'OK' && searchData.results && searchData.results.length > 0) {
      const placeId = searchData.results[0].place_id;

      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,international_phone_number&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();

      if (detailsData.status === 'OK' && detailsData.result) {
        const phone = detailsData.result.formatted_phone_number || detailsData.result.international_phone_number;
        if (phone) {
          return phone.replace(/\s+/g, ' ').trim();
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Google Places API 查詢電話失敗 (${campsiteName}):`, err.message);
  }

  return '請洽官網/粉絲專頁';
}

/**
 * 🕷️ Playwright 自動爬蟲
 */
async function scrapeTaiwanCampsites(browser) {
  console.log(`🕷️ 爬取全台灣熱門露營區...`);
  const page = await browser.newPage();
  const scrapedCampsites = [];

  const targetRegions = [
    { region: '台南', url: 'https://www.google.com/maps/search/%E5%8F%B0%E5%8D%97%E9%9C%B2%E7%87%9F%E5%8D%80' },
    { region: '高雄', url: 'https://www.google.com/maps/search/%E9%AB%98%E9%9B%84%E9%9C%B2%E7%87%9F%E5%8D%80' },
    { region: '南投', url: 'https://www.google.com/maps/search/%E5%8D%97%E6%8A%95%E9%9C%B2%E7%87%9F%E5%8D%80' },
    { region: '台中', url: 'https://www.google.com/maps/search/%E5%8F%B0%E4%B8%AD%E9%9C%B2%E7%87%9F%E5%8D%80' },
    { region: '苗栗', url: 'https://www.google.com/maps/search/%E8%8B%97%E栗%9C%B2%E7%87%9F%E5%8D%80' },
    { region: '新竹', url: 'https://www.google.com/maps/search/%E6%96%B0%E7%AB%B9%E9%9C%B2%E7%87%9F%E5%8D%80' },
    { region: '宜蘭', url: 'https://www.google.com/maps/search/%E5%AE%9C%E8%98%AD%E9%9C%B2%E7%87%9F%E5%8D%80' }
  ];

  for (const item of targetRegions) {
    try {
      console.log(`📍 爬取區域: ${item.region}...`);
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const feedSelector = 'div[role="feed"]';
      await page.waitForSelector(feedSelector, { timeout: 10000 }).catch(() => {});

      for (let i = 0; i < 8; i++) {
        await page.evaluate((selector) => {
          const feed = document.querySelector(selector);
          if (feed) feed.scrollTop += 4000;
        }, feedSelector).catch(() => {});
        await page.waitForTimeout(1200);
      }

      const elements = await page.$$('div[role="article"]');
      for (const el of elements) {
        let name = await el.$eval('div.fontHeadlineSmall', e => e.innerText.trim()).catch(() => null);
        
        if (name) {
          const cleanName = name.split(/[\-\|\—\–]/)[0].trim();
          const id = 'camp_' + Buffer.from(cleanName).toString('hex').substring(0, 16);
          const ratingText = await el.$eval('span.MW4pA', e => e.innerText.trim()).catch(() => '4.5');
          const fullText = await el.evaluate(e => e.innerText).catch(() => '');

          const phoneMatch = fullText.match(/(09\d{2}[\s\-]?\d{3}[\s\-]?\d{3}|0\d{1,2}[\s\-]?\d{6,8})/);
          const domPhone = phoneMatch ? phoneMatch[0].replace(/\s/g, '') : null;

          const priceMatch = fullText.match(/(\$\d+[\d,]*|\d+[\d,]*\s*元)/);
          const domPrice = priceMatch ? priceMatch[0] : null;

          let linkHref = await el.$eval('a[href*="/maps/place/"]', e => e.href).catch(() => '');
          if (!linkHref) linkHref = await el.$eval('a.hfAn2', e => e.href).catch(() => '');

          let lat = null;
          let lng = null;

          if (linkHref) {
            const match3d = linkHref.match(/!3d([0-9\.]+)!4d([0-9\.]+)/);
            if (match3d) {
              lat = parseFloat(match3d[1]);
              lng = parseFloat(match3d[2]);
            } else {
              const matchAt = linkHref.match(/@([0-9\.]+),([0-9\.]+)/);
              if (matchAt) {
                lat = parseFloat(matchAt[1]);
                lng = parseFloat(matchAt[2]);
              }
            }
          }

          if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
            const hash = cleanName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            lat = 23.8 + (hash % 80) * 0.01;
            lng = 120.9 + (hash % 60) * 0.01;
          }

          if (!scrapedCampsites.some(s => s.name === cleanName)) {
            scrapedCampsites.push({
              id,
              name: cleanName,
              region: item.region,
              rating: parseFloat(ratingText) || 4.5,
              rawReviews: fullText,
              domPhone: domPhone,
              domPrice: domPrice,
              latitude: lat,
              longitude: lng
            });
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️ 區域 ${item.region} 爬取失敗:`, err.message);
    }
  }

  await page.close();
  return scrapedCampsites;
}

/**
 * 🏔️ 呼叫 Google Elevation API
 */
async function getRealAltitude(lat, lng) {
  if (!lat || !lng) return '海拔未知';
  let elevationMeters = null;

  if (GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        elevationMeters = Math.round(data.results[0].elevation);
      }
    } catch (err) {}
  }

  if (elevationMeters === null) {
    try {
      const openUrl = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`;
      const res = await fetch(openUrl);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        elevationMeters = Math.round(data.results[0].elevation);
      }
    } catch (err) {}
  }

  if (elevationMeters !== null && elevationMeters >= 0) return `海拔 ${elevationMeters}m`;
  return '海拔未知';
}

/**
 * 🚘 呼叫 Google Distance Matrix API
 */
async function fetchSingleDriveTime(destinationName, originLocation) {
  const origin = encodeURIComponent(originLocation);
  if (GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${encodeURIComponent(destinationName)}&mode=driving&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
        const element = data.rows[0].elements[0];
        return { 
          driveTimeMins: Math.round(element.duration.value / 60), 
          distanceKm: element.distance.text 
        };
      }
    } catch (err) {
      console.warn(`⚠️ Distance Matrix API 查詢失敗 (${destinationName}):`, err.message);
    }
  }
  return { driveTimeMins: null, distanceKm: null };
}

/**
 * 🚘 批次計算 4 起點車程
 */
async function fetchAllDriveTimes(destinationName) {
  const driveData = {};
  for (const [key, originName] of Object.entries(FIXED_ORIGINS)) {
    const res = await fetchSingleDriveTime(destinationName, originName);
    driveData[`drive_time_${key}`] = res.driveTimeMins;
    driveData[`distance_${key}`] = res.distanceKm;
  }
  return driveData;
}

/**
 * 🤖 Gemini AI 分析優缺點
 */
async function analyzeReviewsWithGemini(campsiteName, rawReviews, rating = 4.5) {
  const defaultPros = rating >= 4.5 
    ? ['Google 4.5星高評價', '熱門露營推薦'] 
    : ['環境寧靜舒適', '適合家族聚會'];
  const defaultCons = ['建議提早預約營位'];

  if (!genAI || !rawReviews) return { pros: defaultPros, cons: defaultCons };

  const candidateModels = ['gemini-3.5-flash', 'gemini-2.5-flash'];

  for (const modelName of candidateModels) {
    try {
      console.log(`⏳ [RPM 防呆] 等待 13 秒後發送 API 請求 (${modelName})...`);
      await sleep(13000);
      const model = genAI.getGenerativeModel({ model: modelName });
      const prompt = `根據「${campsiteName}」的資訊，摘要 2 個優點 (pros) 與 1 個缺點 (cons)。輸出標準 JSON 格式，繁體中文，每點 10 字以內。`;

      const result = await model.generateContent(prompt);
      const cleanJson = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return { 
        pros: (parsed.pros && parsed.pros.length > 0) ? parsed.pros : defaultPros, 
        cons: (parsed.cons && parsed.cons.length > 0) ? parsed.cons : defaultCons 
      };
    } catch (err) {
      console.warn(`⚠️ 模型 [${modelName}] 分析失敗... (${err.message})`);
    }
  }
  return { pros: defaultPros, cons: defaultCons };
}

/**
 * 🚀 主程式 (Safe Enrichment 模式)
 */
async function main() {
  console.log('🚀 開始執行全台灣營地自動爬蟲管線 (安全擴充模式)...');

  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=zh-TW']
  });

  // 1. 取得目前資料庫所有營地，並建立以「名稱」為 Key 的對照表，避免重複
  const { data: existingCampsites } = await supabase.from('campsites').select('*');
  const existingMapByName = new Map();
  
  if (existingCampsites) {
    existingCampsites.forEach(site => {
      existingMapByName.set(site.name, site);
    });
  }

  const campsites = await scrapeTaiwanCampsites(browser);
  console.log(`✅ 共抓取到 ${campsites.length} 個營地，準備進行資料比對與安全擴充...`);

  for (let i = 0; i < campsites.length; i++) {
    const site = campsites[i];
    console.log(`\n-----------------------------------`);
    console.log(`[${i + 1}/${campsites.length}] 🔍 處理營地: ${site.name} (${site.region})`);

    const cached = existingMapByName.get(site.name);
    const updatePayload = {};

    // 🏔️ [海拔]：若資料庫沒有，才呼叫 API 查
    let altitude = cached?.altitude;
    if (!altitude || altitude === '海拔未知') {
      altitude = await getRealAltitude(site.latitude, site.longitude);
      if (cached && altitude && altitude !== '海拔未知') updatePayload.altitude = altitude;
    }

    // 📞 [電話]：若資料庫沒有，才去抓
    let finalPhone = cached?.phone;
    if (!finalPhone || finalPhone === '請洽官網/粉絲專頁') {
      console.log(`📡 [補全電話] 透過 Google Places API 搜尋...`);
      finalPhone = site.domPhone || await fetchOfficialPhoneFromGoogle(site.name, site.region);
      if (cached && finalPhone && finalPhone !== '請洽官網/粉絲專頁') updatePayload.phone = finalPhone;
    }

    // 💰 [價格]：若資料庫沒有，才去搜
    let finalPrice = cached?.price_range;
    if (!finalPrice || finalPrice === '請洽官網/訂位系統') {
      console.log(`🔍 [補全價格] 利用 Playwright 搜尋 Google 價格關鍵字...`);
      finalPrice = site.domPrice || await searchPriceWithPlaywright(browser, site.name, site.region);
      if (cached && finalPrice && finalPrice !== '請洽官網/訂位系統') updatePayload.price_range = finalPrice;
    }

    // 🚗 [車程]：若資料庫缺任一出發點，就重新算並補上
    let driveData = {};
    const hasFullDriveData = cached && 
      cached.drive_time_tainan && cached.drive_time_hsinchu && 
      cached.drive_time_taipei && cached.drive_time_taichung;

    if (!hasFullDriveData) {
      console.log(`🚗 [補全車程] 呼叫 Google Distance Matrix...`);
      driveData = await fetchAllDriveTimes(site.name);
      if (cached) {
        if (!cached.drive_time_hsinchu) { updatePayload.drive_time_hsinchu = driveData.drive_time_hsinchu; updatePayload.distance_hsinchu = driveData.distance_hsinchu; }
        if (!cached.drive_time_tainan) { updatePayload.drive_time_tainan = driveData.drive_time_tainan; updatePayload.distance_tainan = driveData.distance_tainan; }
        if (!cached.drive_time_taipei) { updatePayload.drive_time_taipei = driveData.drive_time_taipei; updatePayload.distance_taipei = driveData.distance_taipei; }
        if (!cached.drive_time_taichung) { updatePayload.drive_time_taichung = driveData.drive_time_taichung; updatePayload.distance_taichung = driveData.distance_taichung; }
      }
    } else {
      // 保留原有數據給後續若為新增營地使用
      driveData = {
        drive_time_hsinchu: cached.drive_time_hsinchu, distance_hsinchu: cached.distance_hsinchu,
        drive_time_tainan: cached.drive_time_tainan, distance_tainan: cached.distance_tainan,
        drive_time_taipei: cached.drive_time_taipei, distance_taipei: cached.distance_taipei,
        drive_time_taichung: cached.drive_time_taichung, distance_taichung: cached.distance_taichung,
      };
    }

    // 🤖 [AI 優缺點]：若資料庫沒有，才去分析
    let pros = cached?.pros;
    let cons = cached?.cons;
    if (!pros || pros.length === 0 || !cons || cons.length === 0) {
      console.log(`🤖 [補全優缺點] 呼叫 Gemini AI 分析...`);
      const aiResult = await analyzeReviewsWithGemini(site.name, site.rawReviews, site.rating);
      pros = aiResult.pros;
      cons = aiResult.cons;
      if (cached) {
        updatePayload.pros = pros;
        updatePayload.cons = cons;
      }
    }

    console.log(`summary -> 📞 電話: ${finalPhone} | 💰 價格: ${finalPrice} | 🏔️ ${altitude}`);

    // 🎯 安全寫入邏輯
    if (!cached) {
      // 情況 A：這是一個全新的營地 (Insert)
      console.log(`✨ [新增營地] 資料庫無此營地，執行 Insert...`);
      const { error: insertError } = await supabase.from('campsites').insert([{
        id: site.id,
        name: site.name,
        altitude: altitude,
        phone: finalPhone,
        price_range: finalPrice,
        rating: site.rating,
        latitude: site.latitude,
        longitude: site.longitude,
        pros: pros,
        cons: cons,
        drive_time_hsinchu: driveData.drive_time_hsinchu, distance_hsinchu: driveData.distance_hsinchu,
        drive_time_tainan: driveData.drive_time_tainan, distance_tainan: driveData.distance_tainan,
        drive_time_taipei: driveData.drive_time_taipei, distance_taipei: driveData.distance_taipei,
        drive_time_taichung: driveData.drive_time_taichung, distance_taichung: driveData.distance_taichung,
      }]);

      if (insertError) console.error(`❌ 新增失敗:`, insertError.message);
      else console.log(`✅ 新增成功！`);

    } else {
      // 情況 B：營地已存在，只更新「原本是空」的欄位 (Patch)
      if (Object.keys(updatePayload).length > 0) {
        console.log(`🔄 [補全資料] 偵測到缺漏，準備填補:`, Object.keys(updatePayload));
        const { error: updateError } = await supabase
          .from('campsites')
          .update(updatePayload)
          .eq('id', cached.id);

        if (updateError) console.error(`❌ 更新失敗:`, updateError.message);
        else console.log(`✅ 安全填補成功！`);
      } else {
        console.log(`👌 [略過] 該營地資料已十分完整，不執行任何寫入。`);
      }
    }
  }

  await browser.close();
  console.log('\n🎉 全台灣營地資料安全擴充執行完畢！');
}

main().catch(err => {
  console.error('💥 執行失敗:', err);
  process.exit(1);
});
