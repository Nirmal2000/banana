import { NextResponse } from 'next/server';
import { PLANS } from '@/lib/plans.js';
import { applyStep } from '@/lib/imageProcessor.js';
import { generatePlans } from '@/lib/planAgent.js';
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
            try { console.log('[SSE] Base case generation start'); } catch {}
            // Base case: treat as a single-step googleEdit plan
            const model = process.env.GOOGLE_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';
            const llm = new ChatGoogleGenerativeAI({ model, temperature: 0 });

            // Emit planner source + single-step plan before execution for consistent UX
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'planner-source', source: `google:${model}` })}\n\n`));
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ event: 'plans', plans: { [nodeId]: [{ op: 'googleEdit', params: { prompt } }] } })}\n\n`)
              )
            // );

            const messages = [{ role: 'user', content: prompt }];
            const aiMessage = await llm.invoke(messages, { response_modalities: ['IMAGE'] });
            const dataUrl = extractImageDataUrl(aiMessage);
            if (dataUrl) {
              const key = `image:${nodeId}:0`;
              await redis.set(key, dataUrl, { EX: 3600 });
              // Only emit the standard step-result; omit extra googleedit event for basegen
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'step-result', variationId: nodeId, stepIndex: 0, key })}\n\n`));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'end', message: 'Generation complete' })}\n\n`));
          } else {
            // Variation case: ask the planner for plan variations and stream execution in parallel
            const count = variationIds.length;
            try { console.log('[SSE] Variations generation start', { count }); } catch {}
            const { plans: planArrays, source } = await generatePlans(prompt, imageBuffer, count);

            const plans = {};
            for (let i = 0; i < variationIds.length; i++) {
              plans[variationIds[i]] = Array.isArray(planArrays?.[i]) ? planArrays[i] : [];
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'planner-source', source })}\n\n`));
            try { console.log('[SSE] Planner source', source); } catch {}
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'plans', plans })}\n\n`));

            // Execute each variation plan in parallel, steps sequentially
            await Promise.all(
              variationIds.map(async (vid, i) => {
                let currentBuffer = imageBuffer;
                const steps = Array.isArray(plans[vid]) ? plans[vid] : [];
                try { console.log('[SSE] Variation start', { vid, steps: steps.length }); } catch {}
                for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
                  try {
                    const step = steps[stepIndex];
                    try { console.log('[SSE] Step apply', { vid, stepIndex, op: step?.op }); } catch {}
                    currentBuffer = await applyStep(currentBuffer, step);
                  } catch (e) {
                    // On failure, keep previous buffer but continue
                    // eslint-disable-next-line no-console
                    console.error('applyStep failed', e);
                  }
                  const dataUrl = `data:image/jpeg;base64,${currentBuffer.toString('base64')}`;
                  const key = `image:${vid}:${stepIndex}`;
                  await redis.set(key, dataUrl, { EX: 3600 });
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ event: 'step-result', variationId: vid, stepIndex, key })}\n\n`
                    )
                  );
                }
                try { console.log('[SSE] Variation done', { vid }); } catch {}
              })
            );

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'end', message: 'All variations complete' })}\n\n`));
            try { console.log('[SSE] Variations generation done'); } catch {}
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
