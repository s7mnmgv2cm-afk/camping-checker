// 引入必要的套件
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// 1. 初始化金鑰與環境變數 (金鑰保存在環境變數中)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 設定出發地點：新竹高鐵站
const ORIGIN = '新竹高鐵站';

/**
 * 功能 A：計算從新竹高鐵站到營地的開車時間與距離
 */
async function getDriveTime(destinationName) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(ORIGIN)}&destinations=${encodeURIComponent(destinationName)}&mode=driving&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;
  
  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
    const element = data.rows[0].elements[0];
    const durationMins = Math.round(element.duration.value / 60); // 秒數轉分鐘
    const distanceKm = element.distance.text;                   // 例: "38.5 km"

    return { durationMins, distanceKm };
  }
  return { durationMins: 60, distanceKm: '未知' }; // 預設備用值
}

/**
 * 功能 B：利用 Gemini AI 分析 Google 評論並提取優缺點
 */
async function analyzeReviewsWithGemini(reviewsArray) {
  // 1. 選用快速且免費的 Gemini Flash 模型
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // 2. 組合給 AI 的提示詞 (Prompt)
  const prompt = `
你是一位專業的露營專家。請閱讀以下來自 Google 地圖對該露營區的真實網友評論：
${reviewsArray.join('\n')}

請根據評論內容，嚴格按照 JSON 格式輸出：
- "pros": 整理出 3 個主要的優點 (每個優點不超過 10 個字)
- "cons": 整理出 2 個主要的缺點 (每個缺點不超過 10 個字)

只輸出 JSON 格式，不要加任何其他文字，格式範例：
{"pros": ["夜景極佳", "衛浴乾淨", "有戲水池"], "cons": ["最後一段路較窄", "低海拔夏天較熱"]}
`;

  // 3. 呼叫 AI 產生回答
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  try {
    // 解析 AI 回傳的 JSON 資料
    const cleanJson = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error('AI 解析失敗:', e);
    return { pros: ['環境優美'], cons: ['山路較陡'] }; // 預設備用值
  }
}

/**
 * 主流程：將特定營地的車程與 AI 優缺點塞回 Supabase 資料庫
 */
async function processCampsite(campsiteId, campsiteName, mockReviews) {
  console.log(`正在處理營地：${campsiteName}...`);

  // 1. 算車程
  const { durationMins, distanceKm } = await getDriveTime(campsiteName);
  console.log(`➜ 車程計算完成：約 ${durationMins} 分鐘 (${distanceKm})`);

  // 2. 算 AI 優缺點
  const aiSummary = await analyzeReviewsWithGemini(mockReviews);
  console.log(`➜ AI 優缺點提取完成：`, aiSummary);

  // 3. 更新 Supabase 資料庫
  const { data, error } = await supabase
    .from('campsites')
    .update({
      drive_time_mins: durationMins,
      distance_km: distanceKm,
      pros: aiSummary.pros,
      cons: aiSummary.cons,
      updated_at: new Date()
    })
    .eq('id', campsiteId);

  if (error) {
    console.error('更新資料庫失敗:', error);
  } else {
    console.log(`✅ 營地 ${campsiteName} 資料更新成功！\n`);
  }
}

// 測試執行
const sampleReviews = [
  "這裡的夜景真的沒話說，可以看到百萬夜景！水槽和衛浴都維持得很乾淨。",
  "營主很親切，還送我們自家種的蔬菜。草皮保養得很好。",
  "最後上山那段產業道路有點窄，會車要小心，低海拔夏天小黑蚊有點多。"
];

processCampsite('camp_01', '尖石夢田景觀露營區', sampleReviews);
