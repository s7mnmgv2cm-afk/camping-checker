'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function Home() {
  const [campsites, setCampsites] = useState([]);
  const [maxDriveTime, setMaxDriveTime] = useState(60);
  
  // 1. 新增預設日期狀態 (預設選取下週六，或今天)
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);

  // 2. 當選擇的「日期」變更時，重新查詢該日期的營地狀態
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const supabase = createClient(supabaseUrl, supabaseKey);

      // 同時讀取營地資訊與特定日期的空位狀態
      const { data, error } = await supabase
        .from('campsites')
        .select(`
          *,
          campsite_availability(status, date)
        `)
        .eq('campsite_availability.date', selectedDate);

      if (error) {
        console.error('讀取失敗:', error);
      } else if (data) {
        // 將撈出來的 availability status 整理進營地物件
        const formatted = data.map(site => ({
          ...site,
          status: site.campsite_availability[0]?.status || 'unknown'
        }));
        setCampsites(formatted);
      }
      setLoading(false);
    }

    fetchData();
  }, [selectedDate]); // 當 selectedDate 改變時自動觸發

  // 3. 依車程過濾營地
  const filteredSites = campsites.filter(
    (site) => (site.drive_time_mins ?? 0) <= maxDriveTime
  );

  return (
    <main style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>⛺ 全台露營區即時空位搜尋</h1>
      
      {/* 搜尋條件面板 */}
      <div style={{ background: '#f0f4f8', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
        
        {/* 新增：指定日期選擇器 */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
            📅 請選擇欲入住日期：
          </label>
          <input
            type="date"
            value={selectedDate}
            min={todayStr}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '16px', borderRadius: '6px', border: '1px solid #ccc' }}
          />
        </div>

        {/* 車程上限滑桿 */}
        <div>
          <label>
            <strong>🚗 從新竹高鐵出發車程上限：</strong> {maxDriveTime} 分鐘
          </label>
          <input
            type="range"
            min="10"
            max="120"
            value={maxDriveTime}
            onChange={(e) => setMaxDriveTime(Number(e.target.value))}
            style={{ width: '100%', marginTop: '8px' }}
          />
        </div>
      </div>

      {loading && <p>⏳ 正在查詢 {selectedDate} 的營地空位...</p>}

      {/* 營地列表卡片 */}
      <div style={{ display: 'grid', gap: '15px' }}>
        {!loading && filteredSites.length === 0 && (
          <p style={{ color: '#888' }}>{selectedDate} 當天沒有符合車程限制的營地資料。</p>
        )}

        {filteredSites.map((site) => (
          <div key={site.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: '0 0 5px 0' }}>{site.name}</h2>
              
              {/* 動態空位標籤 */}
              <span style={{
                background: site.status === 'available' ? '#2e7d32' : '#c62828',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                {site.status === 'available' ? '有空位' : '已滿位'}
              </span>
            </div>

            <p style={{ color: '#555', fontSize: '14px' }}>
              ⭐ Google 評分: {site.rating} | 🚘 開車車程: 約 {site.drive_time_mins} 分鐘 ({site.distance_km})
            </p>

            <div style={{ marginTop: '10px' }}>
              <strong>👍 AI 整理優點：</strong>
              <ul>
                {site.pros?.map((p, i) => <li key={i} style={{ color: '#2e7d32' }}>{p}</li>)}
              </ul>
              <strong>👎 AI 整理缺點：</strong>
              <ul>
                {site.cons?.map((c, i) => <li key={i} style={{ color: '#c62828' }}>{c}</li>)}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
