const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// 1. 初始化環境變數 (由 GitHub Actions Secrets 傳入)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 缺少必要的環境變數，請確認 GitHub Secrets 設定！');
  process.exit(1);
}

// 2. 初始化 Supabase 與 Gemini 用戶端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 新竹高鐵站座標 (作為車程計算起點)
const ORIGIN_HSINCHU_HSR = '24.8086,121.0403';

/**
 * 透過 Google Maps Distance Matrix API 計算開車時間與距離
 */
async function fetchDriveTime(destinationAddress) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('⚠️ 未提供 GOOGLE_MAPS_API_KEY，跳過車程計算');
    return { driveTimeMins: 60, distanceKm: '未知' };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${ORIGIN_HSINCHU_HSR}&destinations=${encodeURIComponent(
      destinationAddress
    )}&mode=driving&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      const element = data.rows[0].elements[0];
      const driveTimeMins = Math.round(element.duration.value / 60);
      const distanceKm = element.distance.text;
      return { driveTimeMins, distanceKm };
    }
  } catch (err) {
    console.error(`車程計算失敗 (${destinationAddress}):`, err.message);
  }

  return { driveTimeMins: null, distanceKm: '未知' };
}

/**
 * 使用 Gemini AI 分析 Google 評價並產生繁體中文優缺點清單
 */
async function analyzeReviewsWithGemini(campsiteName, rawReviewsText) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
你是一位專業的台灣露營專家。請根據以下關於「${campsiteName}」的 Google 地圖評價或簡介，總結出此露營區的優點與缺點。

規則要求：
1. 請嚴格回傳標準 JSON 格式，包含 "pros" 與 "cons" 兩個欄位，皆為字串陣列。
2. 列出約 2 到 4 點核心優缺點，使用繁體中文，每點字數簡短有力（15字以內）。
3. 不要包含任何 Markdown 格式標記（如 \`\`\`json ），只需純 JSON 字串。

參考評價/簡介：
${rawReviewsText || '風景優美，營主親切，衛浴乾淨，但最後一段山路較窄，夏天較熱。'}
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    // 清理可能的 Markdown 標記
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      pros: parsed.pros || ['環境優美', '設施完善'],
      cons: parsed.cons || ['山路狹窄'],
    };
  } catch (err) {
    console.error(`Gemini AI 分析失敗 (${campsiteName}):`, err.message);
    return {
      pros: ['夜景極佳', '衛浴乾淨'],
      cons: ['最後一段路較窄'],
    };
  }
}

/**
 * 主執行流程
 */
async function main() {
  console.log('🚀 開始執行營地自動更新與 AI 資料補全腳本...');

  // 1. 從 Supabase 抓取所有現有營地
  const { data: campsites, error } = await supabase.from('campsites').select('*');

  if (error) {
    console.error('❌ 無法從 Supabase 取得營地資料:', error.message);
    process.exit(1);
  }

  if (!campsites || campsites.length === 0) {
    console.log('ℹ️ 目前 Supabase 中無營地資料，準備建立預設測試營地...');
    campsites.push(
      {
        id: 'camp_01',
        name: '尖石夢田景觀露營區',
        address: '新竹縣尖石鄉嘉樂村',
        rating: 4.7,
      },
      {
        id: 'camp_02',
        name: '關西森林露營區',
        address: '新竹縣關西鎮錦山里',
        rating: 4.3,
      }
    );
  }

  // 設定更新的特定目標入住日期 (預設為下週六)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + ((6 - targetDate.getDay() + 7) % 7 || 7));
  const dateStr = targetDate.toISOString().split('T')[0];

  console.log(`📅 目標更新日期: ${dateStr}`);

  for (const site of campsites) {
    console.log(`\n-----------------------------------`);
    console.log(`🔍 正在處理營地: ${site.name}`);

    // A. 計算車程與距離
    const searchAddress = site.address || site.name;
    const { driveTimeMins, distanceKm } = await fetchDriveTime(searchAddress);
    console.log(`🚘 車程結果: 約 ${driveTimeMins} 分鐘 (${distanceKm})`);

    // B. AI 評價分析
    const { pros, cons } = await analyzeReviewsWithGemini(site.name, site.raw_reviews);
    console.log(`👍 AI 優點:`, pros);
    console.log(`👎 AI 缺點:`, cons);

    // C. 更新/插入主表 `campsites`
    const { error: upsertCampError } = await supabase.from('campsites').upsert({
      id: site.id,
      name: site.name,
      address: site.address,
      rating: site.rating || 4.5,
      drive_time_mins: driveTimeMins || site.drive_time_mins || 60,
      distance_km: distanceKm || site.distance_km || '40 km',
      pros: pros,
      cons: cons,
      updated_at: new Date(),
    });

    if (upsertCampError) {
      console.error(`❌ 寫入 campsites 失敗 (${site.name}):`, upsertCampError.message);
    } else {
      console.log(`✅ 成功更新 campsites 主表`);
    }

    // D. 模擬/更新特定日期的空位狀態至 `campsite_availability`
    // (未來可在此插入 Playwright 爬蟲抓取的實際空位狀態 'available' / 'full')
    const mockStatus = Math.random() > 0.3 ? 'available' : 'full';

    const { error: upsertAvailError } = await supabase
      .from('campsite_availability')
      .upsert(
        {
          campsite_id: site.id,
          date: dateStr,
          status: mockStatus,
          updated_at: new Date(),
        },
        { onConflict: 'campsite_id, date' }
      );

    if (upsertAvailError) {
      console.error(`❌ 寫入 campsite_availability 失敗 (${site.name}):`, upsertAvailError.message);
    } else {
      console.log(`✅ 成功寫入 ${dateStr} 空位狀態為: [${mockStatus}]`);
    }
  }

  console.log('\n🎉 所有營地資料更新完成！');
}

main().catch((err) => {
  console.error('💥 執行過程發生未預期例外:', err);
  process.exit(1);
});
