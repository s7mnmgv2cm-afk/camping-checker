import { NextResponse } from 'next/server';

// In-memory LRU store for shared GPX files
globalThis.gpxShareStore = globalThis.gpxShareStore || new Map();

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, gpxXml } = body;

    if (!gpxXml || typeof gpxXml !== 'string') {
      return NextResponse.json({ error: 'Missing gpxXml' }, { status: 400 });
    }

    const id = `cc_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString(36)}`;
    const cleanName = (name || 'track').replace(/[/\\?%*:|"<>]/g, '_');

    // Keep memory bounded to 300 recent tracks
    if (globalThis.gpxShareStore.size > 300) {
      const oldestKey = globalThis.gpxShareStore.keys().next().value;
      globalThis.gpxShareStore.delete(oldestKey);
    }

    globalThis.gpxShareStore.set(id, {
      id,
      name: cleanName,
      gpxXml,
      createdAt: Date.now()
    });

    const host = request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const shareUrl = `${proto}://${host}/api/gpx/share/${id}.gpx`;

    // 依據 gpx.studio 官方規範 (https://gpx.studio/help/integration)：
    // App 端支援 ?files=["url"]，Embed 端支援 ?options={"files":["url"]}，且需伺服器 CORS 標頭
    const gpxStudioUrl = `https://gpx.studio/app?files=${encodeURIComponent(JSON.stringify([shareUrl]))}`;
    const gpxStudioEmbedUrl = `https://gpx.studio/embed?options=${encodeURIComponent(JSON.stringify({ files: [shareUrl] }))}`;

    return NextResponse.json({
      success: true,
      id,
      name: cleanName,
      shareUrl,
      gpxStudioUrl,
      gpxStudioEmbedUrl
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
