import { NextResponse } from 'next/server';
import { PLANS } from '@/lib/plans.js';
import { applyStep } from '@/lib/imageProcessor.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import getRedisClient from '@/lib/redis.js';

export async function POST(request) {
  try {
    let prompt, imageBuffer, variationIds, nodeId;

    if (request.headers.get('content-type').includes('multipart/form-data')) {
      const formData = await request.formData();
      prompt = formData.get('prompt');
      variationIds = JSON.parse(formData.get('variationIds') || '[]');
      const imageFile = formData.get('image');
      if (imageFile) {
        imageBuffer = Buffer.from(await imageFile.arrayBuffer());
      }
    } else {
      const { prompt: p, nodeId: n } = await request.json();
      prompt = p;
      nodeId = n;
      variationIds = [nodeId]; // for base case, single variation id
    }

    // SSE setup
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const redis = await getRedisClient();
          if (!imageBuffer) {
            // Base case: generate single image
            const llm = new ChatGoogleGenerativeAI({
              model: process.env.GOOGLE_IMAGE_MODEL || 'gemini-2.5-flash-image-preview',
              temperature: 0
            });
            const messages = [{ role: 'user', content: prompt }];
            const aiMessage = await llm.invoke(messages, { response_modalities: ['IMAGE'] });
            const dataUrl = extractImageDataUrl(aiMessage);
            if (dataUrl) {
              const key = `image:${nodeId}:0`;
              await redis.set(key, dataUrl, { EX: 3600 });
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'plans', plans: { [nodeId]: [] } })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'step-result', variationId: nodeId, stepIndex: 0, key })}\n\n`));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'end', message: 'Generation complete' })}\n\n`));
          } else {
            // Variation case: process 10 variations with sent IDs
            const plans = {};
            for (let i = 0; i < variationIds.length; i++) {
              plans[variationIds[i]] = PLANS[i];
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'plans', plans })}\n\n`));

            for (let i = 0; i < variationIds.length; i++) {
              let currentBuffer = imageBuffer;
              for (let stepIndex = 0; stepIndex < PLANS[i].length; stepIndex++) {
                currentBuffer = await applyStep(currentBuffer, PLANS[i][stepIndex]);
                const dataUrl = `data:image/jpeg;base64,${currentBuffer.toString('base64')}`;
                const key = `image:${variationIds[i]}:${stepIndex}`;
                await redis.set(key, dataUrl, { EX: 3600 });
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  event: 'step-result',
                  variationId: variationIds[i],
                  stepIndex,
                  key })}\n\n`));
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'end', message: 'All variations complete' })}\n\n`));
          }
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'error', message: error.message })}\n\n`));
        } finally {
          controller.close();
        }
      }
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