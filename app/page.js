'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import DatePicker from 'react-datepicker';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

import 'react-datepicker/dist/react-datepicker.css';
import 'leaflet/dist/leaflet.css';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MapWithNoSSR = dynamic(() => import('../components/CampsiteMap'), {
  ssr: false,
  loading: () => (
    <div className="h-80 bg-slate-800 rounded-2xl flex items-center justify-center text-white font-medium">
      🗺️ 地圖與標記載入中...
    </div>
  )
});

export default function Home() {
  const getNextSaturday = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    return d;
  };

  const [campsites, setCampsites] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getNextSaturday());
  const [maxDriveTime, setMaxDriveTime] = useState(90);
  const [minAltitude, setMinAltitude] = useState(300);
  const [mapMode, setMapMode] = useState('2d');
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

  const parseAltitudeNum = (altStr) => {
    if (!altStr) return 0;
    const match = altStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const parseDistanceNum = (distStr) => {
    if (!distStr) return 0;
    const match = distStr.match(/[\d\.]+/);
    return match ? parseFloat(match[0]) : 0;
  };

  const filteredCampsites = campsites.filter((site) => {
    const driveOk = (site.drive_time_mins || 0) <= maxDriveTime;
    const altOk = parseAltitudeNum(site.altitude) >= minAltitude;
    return driveOk && altOk;
  });

  // 📊 Recharts 數據
  const chartData = filteredCampsites
    .filter((site) => site.altitude && site.distance_km)
    .map((site) => ({
      name: site.name,
      x: parseDistanceNum(site.distance_km),
      y: parseAltitudeNum(site.altitude),
      altitude: site.altitude,
      status: site.status,
      phone: site.phone,
      price: site.price_range
    }));

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-8 max-w-6xl mx-auto font-sans">
      {/* 頂部標題與模式切換 */}
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

      {/* 搜尋控制面板 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-30">
        <div className="relative z-50">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            📅 選擇露營日期：
          </label>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            dateFormat="yyyy / MM / dd"
            className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-lg rounded-xl p-3 font-bold outline-none cursor-pointer shadow-inner"
            calendarClassName="custom-big-calendar"
            popperPlacement="bottom-start"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-bold text-slate-700">⛰️ 最低海拔限制：</label>
            <span className="text-sm font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
              ≥ {minAltitude} 公尺
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1500"
            step="50"
            value={minAltitude}
            onChange={(e) => setMinAltitude(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 mt-3"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-bold text-slate-700">🚗 車程時間上限：</label>
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

      {/* 🗺️ 地圖模組 */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 mb-8 h-80 relative z-10">
        <MapWithNoSSR campsites={filteredCampsites} mapMode={mapMode} />
      </div>

      {/* 📊 散佈圖 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>📍</span> 營地分佈座標圖 (Y: 海拔高度 vs X: 開車距離)
          </h3>
          <span className="text-xs text-slate-500 font-medium">💡 滑鼠移至點上可檢視營地詳情</span>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                type="number"
                dataKey="x"
                name="距離"
                unit=" km"
                label={{ value: '開車距離 (公里)', position: 'insideBottom', offset: -10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="海拔高度"
                unit="m"
                domain={['auto', 'auto']}
                label={{ value: '海拔高度 (公尺)', angle: -90, position: 'insideLeft', offset: -5 }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900/95 backdrop-blur text-white p-3.5 rounded-xl text-xs shadow-xl border border-slate-700">
                        <p className="font-bold text-sm text-amber-400 mb-1">{data.name}</p>
                        <p>⛰️ 海拔高度: <strong className="text-emerald-300">{data.y} m</strong></p>
                        <p>🚗 開車距離: <strong>{data.x} 公里</strong></p>
                        <p className="mt-1 text-slate-300">💰 價格: {data.price || '未標示'}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter
                name="營地"
                data={chartData}
                fill="#059669"
                fillOpacity={0.7}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 📋 營地卡片與線上預約動作區域 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-900">
          🏕️ 營地清單 (共 {filteredCampsites.length} 個符合條件)
        </h3>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 font-medium">🔄 載入營地資料中...</div>
      ) : filteredCampsites.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500">
          😔 沒有找到海拔 ≥ {minAltitude}m 且車程在 {maxDriveTime} 分鐘內的營地。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {filteredCampsites.map((site) => (
            <div
              key={site.id}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:shadow-md transition-all"
            >
              <div>
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

                <p className="text-sm text-slate-600 mb-3">
                  ⭐ Google 評分: {site.rating || 4.5} | 🚗 車程: 約 {site.drive_time_mins} 分鐘 ({site.distance_km})
                </p>

                <div className="bg-slate-50 p-3 rounded-xl mb-3 border border-slate-100 flex justify-between items-center text-xs font-semibold text-slate-700">
                  <span>💰 預估價格: <strong className="text-emerald-600">{site.price_range || '$1,000 - $1,500 / 帳'}</strong></span>
                  <span>📞 電話: <strong className="text-blue-600">{site.phone || '0912-345-678'}</strong></span>
                </div>

                {/* 👍👎 AI 優缺點標籤 */}
                <div className="space-y-2 pt-2 border-t border-slate-100 mb-4">
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

              {/* 🔗 直達主流預約平台與觀光署查詢按鈕 */}
              <div className="pt-3 border-t border-slate-100 mt-2">
                <span className="text-xs font-bold text-slate-500 block mb-2">🔗 直達訂位平台與合法查詢：</span>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`https://www.easycamp.com.tw/search?SearchKey=${encodeURIComponent(site.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    🏕️ 露營樂
                  </a>
                  <a
                    href={`https://m.icamping.app`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center bg-orange-500 hover:bg-orange-600 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    ⛺ 愛露營
                  </a>
                  <a
                    href={`https://www.kkday.com/zh-tw/product/productlist?keyword=${encodeURIComponent(site.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center bg-sky-500 hover:bg-sky-600 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    🎒 KKday
                  </a>
                  <a
                    href={`https://camp.tad.gov.tw/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center bg-slate-700 hover:bg-slate-800 text-white font-bold py-1.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    🏛️ 觀光署合法專區
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 📋 下方精簡露營區預約對照表格 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-12">
        <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 text-sm">
          📋 營地快速預約與合法性對照表
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                <th className="p-3.5 font-bold">營地名稱</th>
                <th className="p-3.5 font-bold">真實海拔</th>
                <th className="p-3.5 font-bold">車程 / 距離</th>
                <th className="p-3.5 font-bold">預算區間</th>
                <th className="p-3.5 font-bold">預約與合法查詢動作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCampsites.map((site) => (
                <tr key={site.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900">{site.name}</td>
                  <td className="p-3.5 text-slate-600">{site.altitude || '標示中'}</td>
                  <td className="p-3.5 text-slate-600">{site.drive_time_mins} 分鐘 ({site.distance_km})</td>
                  <td className="p-3.5 text-emerald-600 font-medium">{site.price_range || '$1,000 - $1,500'}</td>
                  <td className="p-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      <a
                        href={`https://www.easycamp.com.tw/search?SearchKey=${encodeURIComponent(site.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2 py-1 rounded transition-colors"
                      >
                        露營樂
                      </a>
                      <a
                        href={`https://m.icamping.app`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-2 py-1 rounded transition-colors"
                      >
                        愛露營
                      </a>
                      <a
                        href={`https://camp.tad.gov.tw/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-2 py-1 rounded transition-colors"
                      >
                        合法查詢
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
