import { NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import getRedisClient from '@/lib/redis.js';
// removed debug file writes

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const formData = await request.formData();
    const prompt = formData.get('prompt') || '';
    const nodeId = formData.get('nodeId');
    const imageFiles = formData.getAll('images');

    if (!nodeId) {
      return NextResponse.json({ error: 'Missing nodeId' }, { status: 400 });
    }
    if (!imageFiles || imageFiles.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const redis = await getRedisClient();
          const model = process.env.GOOGLE_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';
          const llm = new ChatGoogleGenerativeAI({ model, temperature: 0 });

          // Build a single user message with prompt + multiple images
          const content = [];
          if (prompt) content.push({ type: 'text', text: prompt });
          try { console.log('[multi-edit] start', { nodeId, images: imageFiles.length, prompt }); } catch {}
          for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];
            if (!file) continue;
            try { console.log('[multi-edit] image file', { name: file?.name, size: file?.size, index: i }); } catch {}
            const buf = Buffer.from(await file.arrayBuffer());
            const base64 = buf.toString('base64');
            content.push({ type: 'image_url', image_url: `data:image/jpeg;base64,${base64}` });
          }
          const messages = [{ role: 'user', content }];

          // Debug SSE event (optional client-side visibility)
          const debugPayload = { event: 'debug', images: imageFiles.length, prompt: String(prompt).slice(0, 280) };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(debugPayload)}\n\n`));

          // Emit planner source + single-step plan for UX parity
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'planner-source', source: `google:${model}` })}\n\n`));
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ event: 'plans', plans: { [nodeId]: [{ op: 'googleEdit', params: { prompt } }] } })}\n\n`
            )
          );

          try { console.log('[multi-edit] invoking model', { model, images: imageFiles.length }); } catch {}
          const aiMessage = await llm.invoke(messages, { response_modalities: ['IMAGE'] });
          const dataUrl = extractImageDataUrl(aiMessage);
          if (dataUrl) {
            const key = `image:${nodeId}:0`;
            await redis.set(key, dataUrl, { EX: 3600 });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'step-result', variationId: nodeId, stepIndex: 0, key })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'end', message: 'Generation complete' })}\n\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'error', message: error.message })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

function extractImageDataUrl(aiMessage) {
  const blocks = Array.isArray(aiMessage?.content) ? aiMessage.content : [];
  for (const block of blocks) {
    if (block?.image_url && typeof block.image_url === 'string' && block.image_url.startsWith('data:image/')) {
      return block.image_url;
    }
    if (block?.inlineData?.data) {
      return `data:${block.inlineData.mimeType || 'image/png'};base64,${block.inlineData.data}`;
    }
  }
  return null;
}
