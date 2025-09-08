import { NextResponse } from 'next/server';
import getRedisClient from '@/lib/redis';

export async function GET(request, { params }) {
  try {
    // In newer Next.js, params may be a Promise
    const { key } = await params;
    const redis = await getRedisClient();
    const dataUrl = await redis.get(key);
    if (!dataUrl) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    return new Response(dataUrl, {
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
