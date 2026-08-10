/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',       // 👈 關鍵：告訴 Tailwind 掃描 app 目錄下的所有頁面與組件
    './pages/**/*.{js,ts,jsx,tsx,mdx}',     // 掃描 pages 目錄 (若有使用 Pages Router)
    './components/**/*.{js,ts,jsx,tsx,mdx}',// 掃描 components 目錄
    './src/**/*.{js,ts,jsx,tsx,mdx}',       // 若你的專案有使用 src/ 目錄結構
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
