'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function Home() {
  const [campsites, setCampsites] = useState([]);
  const [maxDriveTime, setMaxDriveTime] = useState(60);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        // 除錯檢查：如果找不到變數，會在前端畫面上警示
        if (!supabaseUrl || !supabaseKey) {
          setErrorMsg('未偵測到 Supabase 環境變數，請確認 Vercel 設定！');
          setLoading(false);
          return;
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data, error } = await supabase.from('campsites').select('*');

        if (error) {
          console.error('Supabase 讀取錯誤:', error);
          setErrorMsg(`讀取失敗: ${error.message}`);
        } else if (data) {
          setCampsites(data);
        }
      } catch (err) {
        console.error('系統例外:', err);
        setErrorMsg('連線時發生未知錯誤');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredSites = campsites.filter(
    (site) => (site.drive_time_mins ?? 0) <= maxDriveTime
  );

  return (
    <main style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>⛺ 全台露營區即時空位搜尋</h1>
      
      {/* 錯誤或載入提示 */}
      {loading && <p style={{ color: '#666' }}>⏳ 資料載入中...</p>}
      {errorMsg && <p style={{ color: 'red', background: '#ffebee', padding: '10px', borderRadius: '4px' }}>⚠️ {errorMsg}</p>}

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
      {!loading && !errorMsg && filteredSites.length === 0 && (
        <p style={{ color: '#888' }}>查無符合時間（{maxDriveTime} 分鐘內）的露營區。</p>
      )}

      <div style={{ display: 'grid', gap: '15px' }}>
        {filteredSites.map((site) => (
          <div key={site.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: '0 0 5px 0' }}>{site.name}</h2>
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
