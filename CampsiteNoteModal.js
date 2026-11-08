'use client';

import React, { useState } from 'react';

const QUICK_WEATHER_OPTIONS = [
  { label: '☀️ 晴朗艷陽', val: '晴天 ☀️' },
  { label: '⛅ 多雲涼爽', val: '多雲 ⛅' },
  { label: '☁️ 陰天舒適', val: '陰天 ☁️' },
  { label: '🌧️ 陣雨/陰雨', val: '陰雨 🌧️' },
  { label: '💨 強風/落山風', val: '強風 💨' },
  { label: '🌫️ 山區起霧', val: '起霧 🌫️' },
  { label: '❄️ 寒冬低溫', val: '寒冷 ❄️' }
];

export default function CampsiteNoteModal({
  campsite,
  notes = [],
  isOpen,
  onClose,
  onSaveNote,
  onDeleteNote,
  isFavorite,
  onToggleFavorite
}) {
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [weather, setWeather] = useState('晴天 ☀️');
  const [customWeather, setCustomWeather] = useState('');
  const [rating, setRating] = useState(5);
  const [precautions, setPrecautions] = useState('');
  const [comment, setComment] = useState('');
  const [showAddForm, setShowAddForm] = useState(notes.length === 0);

  if (!isOpen || !campsite) return null;

  const resetForm = () => {
    setEditingId(null);
    setDate(new Date().toISOString().split('T')[0]);
    setWeather('晴天 ☀️');
    setCustomWeather('');
    setRating(5);
    setPrecautions('');
    setComment('');
  };

  const handleStartEdit = (note) => {
    setEditingId(note.id);
    setDate(note.date || new Date().toISOString().split('T')[0]);
    const matched = QUICK_WEATHER_OPTIONS.find(w => w.val === note.weather);
    if (matched) {
      setWeather(note.weather);
      setCustomWeather('');
    } else {
      setWeather('other');
      setCustomWeather(note.weather || '');
    }
    setRating(note.rating || 5);
    setPrecautions(note.precautions || '');
    setComment(note.comment || '');
    setShowAddForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalWeather = weather === 'other' ? (customWeather.trim() || '晴天 ☀️') : weather;
    
    onSaveNote(campsite.id, {
      id: editingId,
      date,
      weather: finalWeather,
      rating: Number(rating),
      precautions: precautions.trim(),
      comment: comment.trim()
    });

    resetForm();
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onToggleFavorite && onToggleFavorite(null, campsite.id)}
              className="text-2xl hover:scale-125 transition-transform"
              title={isFavorite ? '從我的最愛移除' : '加入我的最愛'}
            >
              {isFavorite ? '❤️' : '🤍'}
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                📝 {campsite.name} - 露營註解與紀錄
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {campsite.region || campsite.location || '台灣露營區'} {campsite.altitude ? `| ⛰️ ${campsite.altitude}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-sm shadow-sm transition-colors"
          >
            ✕ 關閉
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* Top Actions: Toggle Form */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-700">
                📚 歷史露營紀錄 ({notes.length} 筆)
              </span>
              {isFavorite && (
                <span className="text-xs bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full border border-rose-200 flex items-center gap-1">
                  ❤️ 我的最愛營地
                </span>
              )}
            </div>
            {!showAddForm && (
              <button
                onClick={() => {
                  resetForm();
                  setShowAddForm(true);
                }}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center gap-1"
              >
                ➕ 新增露營紀錄 / 筆記
              </button>
            )}
          </div>

          {/* Form to Add / Edit Note */}
          {showAddForm && (
            <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  {editingId ? '✏️ 編輯露營註解' : '➕ 填寫本次露營註解'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowAddForm(false);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  取消
                </button>
              </div>

              {/* 1. 露營時間 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  📅 露營時間 (日期)：
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl p-2.5 font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>

              {/* 2. 天氣狀況 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  🌤️ 天氣狀況：
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {QUICK_WEATHER_OPTIONS.map((w) => (
                    <button
                      key={w.val}
                      type="button"
                      onClick={() => {
                        setWeather(w.val);
                        setCustomWeather('');
                      }}
                      className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                        weather === w.val
                          ? 'bg-blue-600 text-white border-blue-700 shadow-sm scale-105'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setWeather('other')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                      weather === 'other'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    ✏️ 其他自訂
                  </button>
                </div>
                {weather === 'other' && (
                  <input
                    type="text"
                    placeholder="請輸入天氣狀況 (例如：午後微雷雨但夜晚滿天星斗)"
                    value={customWeather}
                    onChange={(e) => setCustomWeather(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl p-2.5 font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm mt-1"
                  />
                )}
              </div>

              {/* 3. 營地評價 (星級) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ⭐ 個人綜合評價：
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center text-2xl gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className={`transition-transform hover:scale-125 focus:outline-none ${
                          star <= rating ? 'text-amber-400' : 'text-slate-200'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <span className="text-sm font-black text-amber-600 ml-2">
                    {rating} 顆星 ({rating === 5 ? '絕佳激推！' : rating === 4 ? '很滿意' : rating === 3 ? '普通尚可' : rating === 2 ? '略有缺憾' : '不推薦'})
                  </span>
                </div>
              </div>

              {/* 4. 注意事項 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ⚠️ 注意事項 / 避坑指南：
                </label>
                <textarea
                  rows={2}
                  placeholder="例如：需自備30cm大黑釘、最後3公里髮夾彎會車難、低海拔夏季小黑蚊較多需備防蚊液、A區離衛浴較近..."
                  value={precautions}
                  onChange={(e) => setPrecautions(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>

              {/* 5. 心得或備忘 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  💬 露營心得與生活點滴 (選填)：
                </label>
                <textarea
                  rows={2}
                  placeholder="例如：營主親切熱情、草皮厚實踩起來很舒服、晚上夜景超美非常適合放空..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowAddForm(false);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center gap-1.5"
                >
                  💾 {editingId ? '更新紀錄' : '儲存這筆露營註解'}
                </button>
              </div>
            </form>
          )}

          {/* List of Existing Notes */}
          {notes.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
              <span className="text-3xl block mb-2">🏕️</span>
              <p className="text-sm font-bold text-slate-600 mb-1">尚未有此營地的露營紀錄</p>
              <p className="text-xs text-slate-400 mb-4">點擊上方「新增露營紀錄 / 筆記」來記錄露營時間、天氣與注意事項吧！</p>
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition-colors"
                >
                  馬上建立第一筆註解
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-white border border-slate-200 hover:border-slate-300 p-4 rounded-2xl shadow-sm transition-all"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100 flex items-center gap-1">
                        📅 {note.date}
                      </span>
                      <span className="text-xs font-bold bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-100">
                        {note.weather}
                      </span>
                      <span className="text-xs font-black text-amber-500">
                        {'★'.repeat(note.rating || 5)}{'☆'.repeat(5 - (note.rating || 5))}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartEdit(note)}
                        className="text-xs text-slate-500 hover:text-blue-600 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        ✏️ 編輯
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('確定要刪除這筆露營註解紀錄嗎？')) {
                            onDeleteNote(campsite.id, note.id);
                          }
                        }}
                        className="text-xs text-slate-400 hover:text-rose-600 font-semibold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        🗑️ 刪除
                      </button>
                    </div>
                  </div>

                  {note.precautions && (
                    <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-3 my-2 text-xs text-rose-800">
                      <span className="font-bold flex items-center gap-1 mb-1 text-rose-900">
                        ⚠️ 注意事項：
                      </span>
                      <p className="whitespace-pre-line leading-relaxed">{note.precautions}</p>
                    </div>
                  )}

                  {note.comment && (
                    <div className="text-xs text-slate-700 mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-500 block mb-1">💬 心得回饋：</span>
                      <p className="whitespace-pre-line leading-relaxed">{note.comment}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <span>💡 您的露營註解與我的最愛會自動儲存在本機瀏覽器中</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-sm transition-colors"
          >
            完成
          </button>
        </div>

      </div>
    </div>
  );
}
