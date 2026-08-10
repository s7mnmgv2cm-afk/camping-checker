'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const [campsites, setCampsites] = useState([]);
  const [maxDriveTime, setMaxDriveTime] = useState(60); // 預設篩選 60 分鐘內

  // 1. 頁面載入時去 Supabase 撈資料
  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase.from('campsites').select('*');
      if (data) setCampsites(data);
    }
    fetchData();
  }, []);

  // 2. 根據開車時間滑桿進行過濾
  const filteredSites = campsites.filter(
    (site) => site.drive_time_mins <= maxDriveTime
  );

  return (
    <main style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>⛺ 全台露營區即時空位搜尋</h1>
      
      {/* 車程篩選器 */}
      <div style={{ background: '#f0f4f8', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <label>
          <strong>🚗 從新竹高鐵出發時間上限：</strong> {maxDriveTime} 分鐘
        </label>
        <input
          type="range"
          min="10"
          max="120"
          value={maxDriveTime}
          onChange={(e) => setMaxDriveTime(Number(e.target.value))}
          style={{ width: '100%', marginTop: '10px' }}
        />
      </div>

      {/* 營地卡片清單 */}
      <div style={{ display: 'grid', gap: '15px' }}>
        {filteredSites.map((site) => (
          <div key={site.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: '0 0 5px 0' }}>{site.name}</h2>
              {/* 空位標籤 */}
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
              ⭐ Google 評分: {site.rating} | 🚘 開車車程:約 {site.drive_time_mins} 分鐘 ({site.distance_km})
            </p>

            {/* AI 優缺點標籤 */}
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
