import './tailwind.css';
import './globals.css';

export const metadata = {
  title: '全台露營區即時空位搜尋',
  description: '整合各大平台露營區空位、車程與 AI 評價',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '露營小幫手'
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fjalla+One&family=Michroma&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#f4f6f8' }}>
        {children}
      </body>
    </html>
  );
}
