'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import DatePicker from 'react-datepicker';

// 引入 DatePicker 與 Leaflet 的全域 CSS 樣式
import 'react-datepicker/dist/react-datepicker.css';
import 'leaflet/dist/leaflet.css';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 💡 動態載入 Leaflet 地圖組件，避免 Next.js 伺服器端渲染 (SSR) 報錯
const MapWithNoSSR = dynamic(() => import('../components/CampsiteMap'), {
  ssr: false,
  loading: () => (
    <div className="h-80 bg-slate-800 rounded-2xl flex items-center justify-center text-white font-medium">
      🗺️ 地圖與標記載入中...
    </div>
  )
});

export default function Home() {
  // 取得下一個星期六作為預設日期
  const getNextSaturday = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    return d;
  };

  const [campsites, setCampsites] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getNextSaturday());
  const [maxDriveTime, setMaxDriveTime] = useState(60);
  const [mapMode, setMapMode] = useState('2d'); // '2d' 平面 | '3d' 衛星高程
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCampsites() {
      setLoading(true);
      const { data, error } = await supabase.from('campsites').select('*');
      if (!error) setCampsites(data || []);
      setLoading(false);
    }
    fetchCampsites();
  }, [selectedDate]);

  // 篩選車程時間上限內的營地
  const filteredCampsites = campsites.filter(
    (site) => (site.drive_time_mins || 0) <= maxDriveTime
  );

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-8 max-w-6xl mx-auto font-sans">
      {/* 頁面標題與地圖切換按鈕 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-2">
          <span>🏕️</span> 全台露營區即時空位與 3D 地形搜尋
        </h1>
        <div className="bg-slate-200 p-1 rounded-xl flex gap-1 self-start sm:self-auto">
          <button
            onClick={() => setMapMode('2d')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              mapMode === '2d' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
            }`}
          >
            🗺️ 2D 平面圖
          </button>
          <button
            onClick={() => setMapMode('3d')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              mapMode === '3d' ? 'bg-blue-600 text-white shadow' : 'text-slate-600'
            }`}
          >
            ⛰️ 衛星高程圖
          </button>
        </div>
      </div>

      {/* 搜尋與篩選控制面板 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 📅 巨型放大版日期選擇器 */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            📅 選擇露營日期：
          </label>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            dateFormat="yyyy / MM / dd"
            className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-lg rounded-xl p-3 font-bold outline-none cursor-pointer shadow-inner"
            calendarClassName="custom-big-calendar"
          />
        </div>

        {/* 🚗 車程滑桿 */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-bold text-slate-700">
              🚗 新竹高鐵出發時間上限：
            </label>
            <span className="text-sm font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
              {maxDriveTime} 分鐘
            </span>
          </div>
          <input
            type="range"
            min="20"
            max="120"
            step="5"
            value={maxDriveTime}
            onChange={(e) => setMaxDriveTime(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-3"
          />
        </div>
      </div>

      {/* 🗺️ 互動式地圖：根據篩選結果即時標註營地紅點 */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 mb-8 h-80 relative">
        <MapWithNoSSR campsites={filteredCampsites} mapMode={mapMode} />
      </div>

      {/* 營地卡片列表 */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 font-medium">🔄 載入營地資料中...</div>
      ) : filteredCampsites.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500">
          😔 沒有找到 {maxDriveTime} 分鐘車程內的營地，請試著拉長車程上限。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCampsites.map((site) => (
            <div
              key={site.id}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:shadow-md transition-all"
            >
              <div>
                {/* 頂部營地名稱與狀態 */}
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{site.name}</h2>
                    {site.altitude && (
                      <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-md border border-sky-100">
                        ⛰️ {site.altitude}
                      </span>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      site.status === 'available'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {site.status === 'available' ? '有空位' : '已滿位'}
                  </span>
                </div>

                {/* 評分與車程 */}
                <p className="text-sm text-slate-600 mb-3">
                  ⭐ Google 評分: {site.rating || 4.5} | 🚗 車程: 約 {site.drive_time_mins} 分鐘 ({site.distance_km})
                </p>

                {/* 💰 價格與 📞 聯絡電話 */}
                <div className="bg-slate-50 p-3 rounded-xl mb-3 border border-slate-100 flex justify-between text-xs font-semibold text-slate-700">
                  <span>💰 預估價格: <strong className="text-emerald-600">{site.price_range || '$1,000 - $1,500 / 帳'}</strong></span>
                  <span>📞 營主電話: <strong className="text-blue-600">{site.phone || '0912-345-678'}</strong></span>
                </div>

                {/* 👍👎 AI 優缺點標籤 */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  {site.pros && site.pros.length > 0 && (
                    <div>
                      <span className="text-xs font-bold text-slate-500 block mb-1">👍 AI 整理優點：</span>
                      <div className="flex flex-wrap gap-1.5">
                        {site.pros.map((pro, i) => (
                          <span
                            key={i}
                            className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-0.5 rounded-md border border-emerald-100"
                          >
                            {pro}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {site.cons && site.cons.length > 0 && (
                    <div className="mt-1">
                      <span className="text-xs font-bold text-slate-500 block mb-1">👎 AI 整理缺點：</span>
                      <div className="flex flex-wrap gap-1.5">
                        {site.cons.map((con, i) => (
                          <span
                            key={i}
                            className="text-xs bg-rose-50 text-rose-700 font-medium px-2.5 py-0.5 rounded-md border border-rose-100"
                          >
                            {con}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
