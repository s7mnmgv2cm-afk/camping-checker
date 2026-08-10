'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Home() {
  const getNextSaturday = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    return d.toISOString().split('T')[0];
  };

  const [campsites, setCampsites] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getNextSaturday());
  const [maxDriveTime, setMaxDriveTime] = useState(60);
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

  const filteredCampsites = campsites.filter(
    (site) => (site.drive_time_mins || 0) <= maxDriveTime
  );

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-8 max-w-4xl mx-auto font-sans">
      <h1 className="text-3xl font-extrabold text-slate-900 mb-8 flex items-center gap-2">
        <span>🏕️</span> 全台露營區即時空位搜尋
      </h1>

      {/* 控制面板 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 📅 日期選擇器 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              📅 選擇露營日期：
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl p-3 font-semibold outline-none"
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
      </div>

      {/* 營地清單 */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 font-medium">🔄 載入營地資料中...</div>
      ) : filteredCampsites.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500">
          😔 沒有找到 {maxDriveTime} 分鐘車程內的營地，請拉長車程上限。
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCampsites.map((site) => (
            <div
              key={site.id}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
            >
              {/* 頂部營地名稱與狀態 */}
              <div className="flex justify-between items-start mb-3">
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
              <p className="text-sm text-slate-600 mb-4 flex items-center gap-1">
                <span>⭐ Google 評分: {site.rating || 4.5}</span>
                <span className="mx-1">|</span>
                <span>🚗 開車車程: 約 {site.drive_time_mins} 分鐘 ({site.distance_km})</span>
              </p>

              {/* 👍👎 AI 優缺點膠囊標籤 */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                {site.pros && site.pros.length > 0 && (
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">👍 AI 整理優點：</span>
                    <div className="flex flex-wrap gap-2">
                      {site.pros.map((pro, i) => (
                        <span
                          key={i}
                          className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 rounded-md border border-emerald-100"
                        >
                          {pro}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {site.cons && site.cons.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-bold text-slate-500 block mb-1">👎 AI 整理缺點：</span>
                    <div className="flex flex-wrap gap-2">
                      {site.cons.map((con, i) => (
                        <span
                          key={i}
                          className="text-xs bg-rose-50 text-rose-700 font-medium px-2.5 py-1 rounded-md border border-rose-100"
                        >
                          {con}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
