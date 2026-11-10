import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * AI 模型階梯備援順位序列 (依照官方免費配額 RPD & 響應速度與推理能力排序)
 * 1. 首選主力：Gemini 3.5 Flash Lite (RPD 500 次/天，1.4秒秒開極速回應，格式精確)
 * 2. 第一備援：Gemma 4 31B (RPD 14,400 次/天，31B 旗艦參數與最高推理品質，海量免費額度)
 * 3. 第二備援：Gemma 4 26B (RPD 14,400 次/天，26B 輕量版快速接應)
 * 4. 第三備援：Gemini 3.8 Flash (RPD 20 次/天，最新旗艦模型應急兜底)
 */
export const AI_MODEL_CASCADE = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    quota: '500 次/天',
    desc: '首選主力：高配額、超低延遲 (1.4s)'
  },
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B',
    quota: '14,400 次/天',
    desc: '第一備援：31B 旗艦級推理能力、海量 1.44 萬次額度'
  },
  {
    id: 'gemma-4-26b-a4b-it',
    name: 'Gemma 4 26B',
    quota: '14,400 次/天',
    desc: '第二備援：26B 輕量級海量額度接應'
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    quota: '20 次/天',
    desc: '第三備援：最新旗艦應急兜底'
  }
];

let genAIInstance = null;

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(apiKey);
  }
  return genAIInstance;
}

/**
 * 具備自動降級與配額平滑切換的 AI 生成函式
 * @param {string} prompt - 提示詞
 * @param {object} options - 額外參數 (如 systemInstruction, temperature)
 * @returns {Promise<{ text: string, modelUsed: string, attempts: string[] }>}
 */
export async function generateContentWithCascade(prompt, options = {}) {
  const genAI = getGenAI();
  if (!genAI) {
    throw new Error('未設定 GEMINI_API_KEY 環境變數');
  }

  const attempts = [];
  let lastError = null;

  for (const modelConfig of AI_MODEL_CASCADE) {
    const { id, name, quota } = modelConfig;
    attempts.push(id);
    try {
      const model = genAI.getGenerativeModel({
        model: id,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxOutputTokens ?? 1024
        }
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (text && text.trim().length > 0) {
        return {
          success: true,
          text: text.trim(),
          modelUsed: id,
          modelName: name,
          quota,
          attempts
        };
      }
    } catch (err) {
      lastError = err;
      const isQuotaExceeded = err.message?.includes('429') || err.message?.includes('ResourceExhausted');
      const isOverloaded = err.message?.includes('503') || err.message?.includes('high demand');
      console.warn(
        `[AI Cascade] 模型 ${name} (${id}) 調用失敗 [${isQuotaExceeded ? '配額用盡 429' : isOverloaded ? '伺服器尖峰 503' : '異常'}]，自動切換至下一順位備援...`
      );
    }
  }

  // 若所有模型均無法使用，拋出最後一個錯誤讓上層執行程式碼離線兜底（如本地知識庫）
  throw new Error(`所有階梯備援 AI 模型均無法使用: ${lastError?.message || '未知錯誤'}`);
}
