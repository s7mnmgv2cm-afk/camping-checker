<div className="bg-white p-5 rounded-2xl shadow-md border border-gray-100">
  {/* 1. 營地名稱與空檔標籤 */}
  <div className="flex justify-between items-center mb-2">
    <h3 className="font-bold text-xl">{campsite.name}</h3>
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
      campsite.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
    }`}>
      {campsite.status === 'available' ? '🟢 有空位' : '🔴 已滿位'}
    </span>
  </div>

  {/* 2. 價格與距離 */}
  <div className="flex gap-4 text-sm text-gray-600 my-2">
    <p>💰 價格：<span className="font-semibold text-gray-800">{campsite.price}</span></p>
    <p>🚗 距離：<span className="font-semibold text-gray-800">{campsite.distance_km} ({campsite.drive_time_mins} 分鐘)</span></p>
  </div>

  {/* 3. 聯絡方式 */}
  <p className="text-sm text-gray-600 mb-3">📞 聯絡電話：<span className="font-medium text-blue-600">{campsite.phone}</span></p>

  {/* 4. AI 優缺點標籤 */}
  <div className="space-y-1.5 pt-2 border-t border-gray-100">
    <div className="flex flex-wrap gap-1.5">
      {campsite.pros?.map((pro, i) => (
        <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md">👍 {pro}</span>
      ))}
    </div>
    <div className="flex flex-wrap gap-1.5">
      {campsite.cons?.map((con, i) => (
        <span key={i} className="text-xs bg-orange-50 text-orange-700 px-2.5 py-1 rounded-md">👎 {con}</span>
      ))}
    </div>
  </div>
</div>
