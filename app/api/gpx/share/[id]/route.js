import { NextResponse } from 'next/server';
import { generatePresetGPX, PRESET_HIKING_TRAILS } from '@/lib/gpx';

globalThis.gpxShareStore = globalThis.gpxShareStore || new Map();

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  });
}

export async function GET(request, { params }) {
  try {
    const rawId = (params?.id || '').replace(/\.gpx$/i, '');

    // 1. Check in-memory store
    const item = globalThis.gpxShareStore.get(rawId);
    if (item && item.gpxXml) {
      return new NextResponse(item.gpxXml, {
        status: 200,
        headers: {
          'Content-Type': 'application/gpx+xml; charset=utf-8',
          'Content-Disposition': `inline; filename="${encodeURIComponent(item.name || 'track')}.gpx"`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // 2. Check preset hiking trails
    const preset = PRESET_HIKING_TRAILS.find(p => p.id === rawId);
    if (preset) {
      const xml = generatePresetGPX(preset.id);
      return new NextResponse(xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/gpx+xml; charset=utf-8',
          'Content-Disposition': `inline; filename="${encodeURIComponent(preset.name)}.gpx"`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=604800'
        }
      });
    }

    return new NextResponse('GPX file not found or expired', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new NextResponse(err.message, { status: 500 });
  }
}
