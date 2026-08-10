export const metadata = {
  title: '全台露營區即時空位搜尋',
  description: '整合各大平台露營區空位、車程與 AI 評價',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#f4f6f8' }}>
        {children}
      </body>
    </html>
  );
}
