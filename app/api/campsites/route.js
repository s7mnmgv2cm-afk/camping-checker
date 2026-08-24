import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const STRICT_ORIGIN_REGION_MAP = {
  tainan: ['台南'],
  hsinchu: ['新竹'],
  taipei: ['台北', '新北'],
  taichung: ['台中']
};


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// 使用 SERVICE_ROLE_KEY 以便讀寫 rate_limits 表 (繞過 RLS 或作為管理員)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const searchName = searchParams.get('searchName') || '';
    const searchRegion = searchParams.get('searchRegion') || '';
    const originKey = searchParams.get('originKey') || '';
    
    // 簡易防機器人：檢查 User-Agent
    const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
    const isBot = !userAgent || userAgent.includes('curl') || userAgent.includes('python') || userAgent.includes('bot') || userAgent.includes('spider') || userAgent.includes('postman') || userAgent.includes('wget');
    if (isBot) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const limit = 20; // 統一放寬額度
    
    // 取得 IP 或識別碼
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown-ip';
    const identifier = `ip-${ip}`;

    // 實作 Rate Limiting
    const { data: limitData, error: limitError } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('identifier', identifier)
      .single();

    if (limitError && limitError.code !== 'PGRST116') {
      // 其他非「找不到資料」的錯誤
      console.error('Rate limit query error:', limitError);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    const now = new Date();
    
    if (!limitData) {
      // 第一次請求
      await supabase.from('rate_limits').insert({
        identifier,
        count: 1,
        last_reset: now.toISOString()
      });
    } else {
      const lastReset = new Date(limitData.last_reset);
      const diffSeconds = (now - lastReset) / 1000;
      
      if (diffSeconds > 60) {
        // 超過一分鐘，重置計數
        await supabase.from('rate_limits').update({
          count: 1,
          last_reset: now.toISOString()
        }).eq('identifier', identifier);
      } else {
        // 一分鐘內
        if (limitData.count >= limit) {
          return NextResponse.json(
            { error: '太多次搜尋請求，請稍後再試。' },
            { status: 429 }
          );
        }
        // 未達上限，增加計數
        await supabase.from('rate_limits').update({
          count: limitData.count + 1
        }).eq('identifier', identifier);
      }
    }

    // 通過頻率限制，開始查詢營地資料
    let query = supabase.from('campsites').select('*');
    
    if (searchName) {
      query = query.ilike('name', `%${searchName}%`);
    }
    
    if (searchRegion) {
      query = query.or(`region.ilike.%${searchRegion}%,location.ilike.%${searchRegion}%`);
    }

    // 統一放寬至 1000 筆，確保前端地圖能獲得完整資料進行全台車程篩選
    query = query.limit(1000);

    const { data: campsites, error } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    return NextResponse.json(campsites);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
