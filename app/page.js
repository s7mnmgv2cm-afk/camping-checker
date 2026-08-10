<div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
  <div className="flex justify-between items-start">
    <div>
      <h3 className="font-bold text-lg text-gray-900">{campsite.name}</h3>
      {/* 🏔️ 海拔高度標籤 */}
      <span className="inline-block mt-1 text-xs bg-sky-50 text-sky-700 font-medium px-2 py-0.5 rounded-md border border-sky-100">
        ⛰️ {campsite.altitude || '海拔 800m'}
      </span>
    </div>
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
      campsite.status === 'available' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
    }`}>
      {campsite.status === 'available' ? '🟢 有空位' : '🔴 已滿位'}
    </span>
  </div>

  {/* 車程、距離與評分 */}
  <div className="flex gap-4 text-sm text-gray-600 bg-gray-50 p-2.5 rounded-xl">
    <div>⭐ 評分：<span className="font-semibold text-gray-800">{campsite.rating || 4.5}</span></div>
    <div>🚗 車程：<span className="font-semibold text-gray-800">{campsite.drive_time_mins} 分鐘</span></div>
    <div>📍 距離：<span className="font-semibold text-gray-800">{campsite.distance_km}</span></div>
  </div>

  {/* AI 優缺點 */}
  <div className="pt-2 border-t border-gray-100 space-y-1">
    <div className="flex flex-wrap gap-1">
      {campsite.pros?.map((pro, i) => (
        <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">👍 {pro}</span>
      ))}
    </div>
    <div className="flex flex-wrap gap-1">
      {campsite.cons?.map((con, i) => (
        <span key={i} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">👎 {con}</span>
      ))}
    </div>
  </div>
</div>
