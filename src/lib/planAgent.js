// Lightweight planning agent using OpenRouter tool-calling via fetch.
// Returns an array of plans (each plan = array of steps) for the given prompt+image.

import { PLANNER_SYSTEM_PROMPT } from '@/lib/prompts/planAgentPrompts.js';

const DEFAULT_MODEL = process.env.OPENROUTER_PLANNER_MODEL || 'openai/gpt-4o-mini';

function buildToolsSchema() {
  // Per-op minimal schemas to avoid undefined shapes and keep provider-compatible.
  const OpSchema = {
    anyOf: [
      {
        type: 'object',
        properties: {
          op: { const: 'brightness' },
          params: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] },
        },
        required: ['op', 'params'],
      },
      {
        type: 'object',
        properties: {
          op: { const: 'contrast' },
          params: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] },
        },
        required: ['op', 'params'],
      },
      {
        type: 'object',
        properties: {
          op: { const: 'saturation' },
          params: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] },
        },
        required: ['op', 'params'],
      },
      {
        type: 'object',
        properties: {
          op: { const: 'hue' },
          params: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] },
        },
        required: ['op', 'params'],
      },
      {
        type: 'object',
        properties: {
          op: { const: 'filter' },
          params: { type: 'object', properties: { type: { type: 'string', enum: ['grayscale', 'sepia'] } }, required: ['type'] },
        },
        required: ['op', 'params'],
      },
      {
        type: 'object',
        properties: {
          op: { const: 'tint' },
          params: { type: 'object', properties: { color: { type: 'string' }, strength: { type: 'number' } }, required: ['color', 'strength'] },
        },
        required: ['op', 'params'],
      },
      {
        type: 'object',
        properties: {
          op: { const: 'rotate' },
          params: { type: 'object', properties: { degrees: { type: 'number' } }, required: ['degrees'] },
        },
        required: ['op', 'params'],
      },
      {
        type: 'object',
        properties: {
          op: { const: 'googleEdit' },
          params: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
        },
        required: ['op', 'params'],
      },
    ],
  };

  return [
    {
      type: 'function',
      function: {
        name: 'plan_variations',
        description:
          'Return multiple complete variation plans. Each variation is a self-contained sequence of operations producing a final image for user selection.',
        parameters: {
          type: 'object',
          properties: {
            variations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  operations: { type: 'array', items: OpSchema },
                },
                required: ['operations'],
              },
            },
          },
          required: ['variations'],
        },
      },
    },
  ];
}


function buildUserContent(prompt, imageBuffer) {
  const content = [];
  if (prompt) content.push({ type: 'text', text: String(prompt) });
  if (imageBuffer) {
    const base64 = imageBuffer.toString('base64');
    // Provide both explicit note and input_image for broader model compatibility
    content.push({ type: 'text', text: 'Here is the source image (data URL below):' });    
    content.push({ type: 'image_url', image_url: {url: `data:image/jpeg;base64,${base64}`} });
  }
  return content;
}

async function callOpenRouterForPlans({ prompt, imageBuffer, count }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null; // No key => use fallback

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (process.env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_SITE_TITLE) headers['X-Title'] = process.env.OPENROUTER_SITE_TITLE;

  try {
    console.log('[Planner] OpenRouter request', {
      model: DEFAULT_MODEL,
      count,
      hasImage: Boolean(imageBuffer),
    });
  } catch {}

  const body = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildUserContent(
          `${prompt || ''}\n\nPlease propose ${count} diverse yet reasonable plans.`,
          imageBuffer,
        ),
      },
      {
        role: 'assistant',
        content: 'I will propose the plans as tool calls. No text.',
      },
    ],
    tools: buildToolsSchema(),
    tool_choice: 'required',
    parallel_tool_calls: true,
    // Ask the model to emit multiple tool calls in a single assistant message
    // by making the instruction explicit above. Some models may still produce one.
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error('[Planner] OpenRouter error', res.status, await safeText(res));
    return null;
  }
  const json = await res.json();
  console.log("[Planner] OpenRouter success", json)
  try {
    const toolCalls = json?.choices?.[0]?.message?.tool_calls || [];
    try { console.log('[Planner] OpenRouter parsed tool_calls', toolCalls.length); } catch {}
    const call = toolCalls.find((c) => c?.function?.name === 'plan_variations');
    if (call?.function?.arguments) {
      try {
        const args = JSON.parse(call.function.arguments);
        const vars = Array.isArray(args?.variations) ? args.variations : [];
        const plans = vars.map((v) => Array.isArray(v?.operations) ? v.operations : []).filter((p) => p.length);
        try { console.log('[Planner] plan_variations count', plans.length); } catch {}
        if (plans.length) return { plans: plans.slice(0, count), source: 'openrouter' };
      } catch (e) {
        console.error('[Planner] Failed to parse plan_variations args', e);
      }
    }
  } catch (e) {
    console.error('[Planner] Failed parsing OpenRouter response', e);
  }
  return { plans: null, source: 'openrouter' };
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function normalizePlanStep(step) {
  if (!step || typeof step !== 'object') return null;
  const { op } = step;
  if (!op) return null;
  // Normalize common parameter naming to match applyStep expectations
  const s = { ...step };
  if (op === 'brightness' && s.params?.factor != null && s.params.value == null) {
    s.params.value = Math.round((Number(s.params.factor) - 1) * 100);
  }
  if (op === 'saturation' && s.params?.factor != null && s.params.value == null) {
    s.params.value = Math.round((Number(s.params.factor) - 1) * 100);
  }
  if (op === 'contrast' && s.params?.strength != null && s.params.value == null) {
    s.params.value = Math.round((Number(s.params.strength) - 1) * 100);
  }
  if (op === 'hue' && s.params?.degrees != null && s.params.value == null) {
    s.params.value = Number(s.params.degrees);
  }
  if (op === 'filter' && typeof s.params === 'string') {
    s.params = { type: s.params };
  }
  return s;
}

export async function generatePlans(prompt, imageBuffer, count = 5) {
  // Try OpenRouter first if configured
  let plans = null;
  let source = 'fallback';
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      const res = await callOpenRouterForPlans({ prompt, imageBuffer, count });      
      plans = res?.plans;
      source = res?.source === 'openrouter' && plans ? 'openrouter' : 'fallback';
    }
  } catch (e) {
    console.error('[Planner] Planner call failed', e);
  }

  if (!plans || plans.length === 0) {
    // No fallback by request
    console.error('[Planner] No plans returned and fallback disabled');
    return { plans: [], source: 'none' };
  }

  // Normalize any plan steps for executor compatibility
  const normalized = plans.map((plan) => (Array.isArray(plan) ? plan.map(normalizePlanStep).filter(Boolean) : []));
  try { console.log('[Planner] Plans ready', { count: normalized.length, source }); } catch {}
  return { plans: normalized.slice(0, count), source };
}

export default generatePlans;
