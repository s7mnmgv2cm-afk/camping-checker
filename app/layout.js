import './globals.css';

export const metadata = {
  title: '台灣露營地研究中心',
  description: '整合各大平台露營區、車程與 AI 評價',
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
