Here’s a tight, end-to-end blueprint for your agentic editor—covering **capabilities**, an **ops DSL + tools**, a **decision policy (Sharp vs Google)**, a **system/developer prompt**, and **execution wiring** with SSE. It’s exhaustive yet compact so you can implement directly.

# 1) Agent capabilities (what it must do)

* **See & understand the image**: Infer content, lighting, composition, defects, artifacts, text regions, faces/skin, edges.
* **Goal decomposition**: Convert user intent → a **minimal** ordered plan of ops (pre → gen/AI → post). Prefer local ops first.
* **Tool choice & parameterization**: Pick Sharp ops with concrete numbers; call Google only for **generative** needs (in/out-painting, content/style synthesis, photoreal upscales beyond simple resize).
* **Quality & safety gates**: Keep within bounds (no over-sharpening, banding, crushed blacks, clipped highlights, over-saturation).
* **Determinism control**: Keep results reproducible where possible; annotate any stochastic steps.
* **Cost/latency budget**: Avoid unnecessary AI calls; batch local ops; cap image sizes.
* **Explainability for logging**: Each step has a short `why` note (ignored by executor) to help debug.
* **Streaming-friendly**: Plan first, then stepwise execution so your SSE stays rich (`plans` → `step-result` … → `end`).
* **Failure handling**: On any step error, **fallback to previous buffer** and continue; emit `error` event but don’t break stream.

# 2) Tools + Operation DSL (single plan tool, plus Google)

Use one **primary tool** the LLM calls once per request: it receives an **ordered list of operations**. Your executor runs them in order, streaming after each step.

## 2.1 Operation schema (DSL)

```ts
// keep JSON-safe, small, and directly mappable to Sharp/your code
type Op =
  | { op: 'exposure'; params: { stops: number } }                       // linear() offset
  | { op: 'contrast'; params: { strength: number } }                    // linear(multiplier)
  | { op: 'brightness'; params: { factor: number } }                    // modulate({ brightness })
  | { op: 'saturation'; params: { factor: number } }                    // modulate({ saturation })
  | { op: 'hue'; params: { degrees: number } }                          // modulate({ hue })
  | { op: 'temperature'; params: { warm: boolean; strength?: number } } // tint + modulate combo
  | { op: 'grayscale' }
  | { op: 'sepia'; params?: { strength?: number } }                     // tint + desat
  | { op: 'rotate'; params: { degrees: number } }
  | { op: 'resize'; params: { width?: number; height?: number; fit?: 'cover'|'contain'|'inside'|'outside' } }
  | { op: 'crop'; params: { x: number; y: number; width: number; height: number } }
  | { op: 'blur'; params: { sigma: number } }
  | { op: 'sharpen'; params: { sigma?: number } }
  | { op: 'vignette'; params: { strength: number } }                    // composite radial
  | { op: 'tint'; params: { hex: string; alpha: number } }              // composite overlay
  | { op: 'levels'; params: { gamma?: number } }
  | { op: 'googleEdit'; params: {
        prompt: string;
        mode?: 'edit'|'generate';
        // Optional helpers for predictable outcomes:
        guidance?: { keepLayout?: boolean; keepColors?: boolean; style?: string; strength?: number };
        mask?: { // optional soft mask (future)
          x: number; y: number; width: number; height: number; feather?: number;
        }
      }}
```

> Optional per-step metadata for logs (ignored by executor but kept in SSE `plans`):
> `why?: string`, `note?: string`, `expects?: string[]` (e.g., `['less noise','warmer skin']`)

## 2.2 Tools surface to the LLM

* **apply\_operations(operations: Op\[])**
  *Executes the ordered plan.* Your current `applyStep` already maps these nicely to Sharp/Google.

* **(Optional) get\_image\_metadata()**
  Returns width/height/format/exif/orientation to help the agent size decisions before planning. If you skip this tool, the agent should still plan conservatively (e.g., default to max 2048px longest side unless the user demands print size).

# 3) Decision policy (Sharp vs Google)

**Use Sharp (local) when**: color/exposure/contrast/white-balance, crop/rotate/resize, blur/sharpen, simple tints/filters, vignettes, mild cleanup.
**Use Google when**: adding/removing objects, scene/style transformations, inpainting/outpainting, text-to-image base case, strong denoise/deband beyond classic filters, photoreal hallucination (sky replacement, hair fill, garment changes), or when local ops cannot reach the user’s intent.

### Why not “Google for everything” (emphasize this in the prompt)

1. **Determinism & control**: Sharp ops are predictable and reversible; AI is stochastic.
2. **Latency & cost**: Local ops are cheap and fast; AI calls are slower/costly.
3. **Fidelity**: For small tonal tweaks, generative models can introduce artifacts; local ops preserve details.
4. **Composability**: Pre/post local ops give finer control around a single AI step (e.g., denoise → AI inpaint → color match).
5. **Privacy & governance**: Less external data transfer when local edits suffice.

# 4) Prompting (system + developer templates)

You’ll bind **one** planning prompt to your LLM that always yields a single call to `apply_operations` containing the ordered plan. The agent “sees” the image (no separate analyzer tool).

### 4.1 System prompt (core rules)

```
Role: Senior photo editor and tool orchestrator.

You receive: (a) the user’s request text, and (b) an image (optionally none for base-case generation).
Goal: Produce ONE call to apply_operations with an ordered, minimal set of steps.
Plan shape: [local-preprocess → (optional) single googleEdit → local-postprocess].
- Prefer local (Sharp) operations for tone, color, crop/resize, geometric transforms, mild cleanup.
- Use googleEdit ONLY when the request needs generative changes: add/remove objects, style transfer, in/outpainting, text-to-image base case, or advanced restoration beyond classic filters.
- If text-only and no image is provided, generate with googleEdit(mode="generate") then consider minimal post-local fixes (e.g., exposure).
- Be deterministic: pick specific numeric parameters (sane bounds). Avoid redundant steps. Cap longest side to 2048 unless user needs print/resolution upgrades.
- Keep plans short. Never chain multiple googleEdit steps unless strictly necessary. Prefer one strong googleEdit with clear prompt.
- For skin, avoid oversharpen or oversaturation. Keep natural tones unless requested.
- Budget: Minimize or eliminate googleEdit if local ops can achieve the goal with high fidelity.
- Output ONLY the tool call. No extra commentary.

For each step, include a brief "why" note (string) to aid logging (executor will ignore it).
```

### 4.2 Developer prompt (execution constraints)

```
Environment:
- Local ops are Sharp-backed, synchronous per step.
- googleEdit may be slow; assume stochastic outputs. Temperature kept low by default.
- The executor streams an image after each step.

Constraints:
- Steps must be JSON-serializable, small, and use the provided Op schema.
- Invalid params cause fallback to previous buffer; keep params within documented bounds:
  brightness/saturation/contrast factor: 0.1–3.0
  hue: -180–180
  blur sigma: 0.3–10
  rotate degrees: -180–180
  resize max side default: 2048 unless specified
- If resizing up, prefer googleEdit for super-resolution-like effects; otherwise keep bicubic local.
- If user asks for “make warmer”, prefer temperature/tint + slight saturation; avoid hue shifts that break brand colors.
- If user asks for “cinematic”, consider subtle contrast curve (contrast & levels) and vignette; only use googleEdit when they mean stylize or scene changes.

Return:
- EXACTLY one tool call: apply_operations(operations=[...]).
```

### 4.3 Few-shot references (compact)

**A) Local-only color tweak**

> “Make it warmer and slightly punchier; keep original framing.”

```json
{
  "tool_name": "apply_operations",
  "operations": [
    {"op":"temperature","params":{"warm":true,"strength":0.4},"why":"warmer white balance"},
    {"op":"saturation","params":{"factor":1.08},"why":"slight pop"},
    {"op":"contrast","params":{"strength":1.05},"why":"gentle contrast"}
  ]
}
```

**B) Inpaint object removal**

> “Remove the person in the background; keep colors and composition.”

```json
{
  "tool_name": "apply_operations",
  "operations": [
    {"op":"resize","params":{"width":2048,"fit":"inside"},"why":"consistent working size"},
    {"op":"googleEdit","params":{
      "prompt":"Remove the person in the back-left and reconstruct the background naturally; keep the scene, perspective, and color palette.",
      "mode":"edit",
      "guidance":{"keepLayout":true,"keepColors":true,"strength":0.75}
    },"why":"generative inpaint"},
    {"op":"levels","params":{"gamma":0.98},"why":"micro contrast finishing"}
  ]
}
```

**C) Base-case text-to-image**

> “A product shot of a black sneaker on white seamless, soft studio lighting, 1:1.”

```json
{
  "tool_name": "apply_operations",
  "operations": [
    {"op":"googleEdit","params":{
      "prompt":"Ultra-clean studio photo of a single black sneaker on pure white seamless background, soft even lighting, subtle shadow, 1:1 composition.",
      "mode":"generate",
      "guidance":{"keepLayout":true,"style":"clean studio"}
    },"why":"text-to-image"},
    {"op":"resize","params":{"width":1536,"height":1536,"fit":"cover"},"why":"deliver exact 1:1 size"},
    {"op":"brightness","params":{"factor":1.03},"why":"minor lift for web"}
  ]
}
```

# 5) Execution wiring (LangChain/Next, SSE-ready)

**Define tool schema** (example TypeScript):

```ts
import { z } from 'zod';

const OpSchema = z.union([
  z.object({ op: z.literal('exposure'),    params: z.object({ stops: z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('contrast'),    params: z.object({ strength: z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('brightness'),  params: z.object({ factor: z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('saturation'),  params: z.object({ factor: z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('hue'),         params: z.object({ degrees: z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('temperature'), params: z.object({ warm: z.boolean(), strength: z.number().optional() }), why: z.string().optional() }),
  z.object({ op: z.literal('grayscale'),   why: z.string().optional() }),
  z.object({ op: z.literal('sepia'),       params: z.object({ strength: z.number().optional() }).optional(), why: z.string().optional() }),
  z.object({ op: z.literal('rotate'),      params: z.object({ degrees: z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('resize'),      params: z.object({ width: z.number().optional(), height: z.number().optional(), fit: z.enum(['cover','contain','inside','outside']).optional() }), why: z.string().optional() }),
  z.object({ op: z.literal('crop'),        params: z.object({ x:z.number(), y:z.number(), width:z.number(), height:z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('blur'),        params: z.object({ sigma: z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('sharpen'),     params: z.object({ sigma: z.number().optional() }), why: z.string().optional() }),
  z.object({ op: z.literal('vignette'),    params: z.object({ strength: z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('tint'),        params: z.object({ hex: z.string(), alpha: z.number() }), why: z.string().optional() }),
  z.object({ op: z.literal('levels'),      params: z.object({ gamma: z.number().optional() }), why: z.string().optional() }),
  z.object({ op: z.literal('googleEdit'),  params: z.object({
    prompt: z.string(),
    mode: z.enum(['edit','generate']).optional(),
    guidance: z.object({ keepLayout: z.boolean().optional(), keepColors: z.boolean().optional(), style: z.string().optional(), strength: z.number().optional() }).optional(),
    mask: z.object({ x:z.number(), y:z.number(), width:z.number(), height:z.number(), feather:z.number().optional() }).optional()
  }), why: z.string().optional() }),
]);

export const ApplyOperationsArgs = z.object({
  operations: z.array(OpSchema).min(1).max(32)
});
```

**Bind tool to LLM** (pseudo):

```ts
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { zodToJsonSchema } from 'zod-to-json-schema';

const llm = new ChatGoogleGenerativeAI({ model: process.env.GOOGLE_IMAGE_MODEL ?? 'gemini-2.5-flash-image-preview', temperature: 0 });

const tools = [{
  type: 'function',
  function: {
    name: 'apply_operations',
    description: 'Execute an ordered edit plan. Prefer local ops; use googleEdit only for generative tasks.',
    parameters: zodToJsonSchema(ApplyOperationsArgs)
  }
}];

const chain = llm.bind({ tools });
```

**Invocation** (image + user text → tool call):

* Pass the image as inline data (base64) alongside the user’s text.
* Use the **system + developer prompts** above.
* Expect the model to **call `apply_operations`** with the array. Your existing SSE executor runs exactly as now (each step via `applyStep`, cache to Redis, emit `step-result`).

# 6) Execution details & guardrails

* **Plan first → emit `plans`**: Before execution, emit the received operations list as your `plans` payload for that `variationId`.
* **Step emission**: After each op, store to Redis and emit `step-result` (you already do this).
* **Bounds & clamping**: Clamp inputs (e.g., brightness 0.1–3.0). If out of range, adjust and add a `note` in logs.
* **Idempotency**: Hash `{imageHash, opsHash}` to dedupe repeated requests.
* **Resume/cancel**: Keep `currentStepIndex` in Redis to resume after network blips; respect your existing Cancel button.
* **Post-AI color match**: After `googleEdit`, run a tiny local post step (e.g., `levels.gamma≈0.98` or mild `contrast`) to harmonize.

# 7) Testing matrix (quick)

* Local-only edits (WB/contrast/crop/resize).
* Single googleEdit inpaint (remove object).
* Style transfer request (force googleEdit).
* Large input → resize down → edit → resize to target.
* Edge formats (PNG transparency, EXIF orientation).
* Failure injection (invalid params, AI timeout) → fallback path.

---

## Planner v2 Update (plan_variations)

This updates the agentic planner and execution wiring to simplify tool-calling, ensure complete variation plans, and improve streaming traceability.

Key changes
- Single tool call: The planner now responds with exactly one tool call named `plan_variations` that returns N complete variation plans. No multiple tool calls and no fallback to static plans.
- Complete variations: Each variation is a self-contained sequence of operations that produces a final image candidate for user selection.
- Per-op minimal schemas: The tool schema defines a strict, per-op parameter shape that matches the current executor. Only supported ops are permitted.
- Planner-source event: The SSE route emits `{ event: 'planner-source', source }` to help identify if OpenRouter produced plans.
- System prompt: Moved to `src/lib/prompts/planAgentPrompts.js` and updated to require a single `plan_variations` tool call and complete variations.

Tool schema (summary)
```
plan_variations(parameters: {
  variations: Array<{
    operations: Array<
      | { op: 'brightness',  params: { value: number } }
      | { op: 'contrast',    params: { value: number } }
      | { op: 'saturation',  params: { value: number } }
      | { op: 'hue',         params: { value: number } }
      | { op: 'filter',      params: { type: 'grayscale' | 'sepia' } }
      | { op: 'tint',        params: { color: string, strength: number } }
      | { op: 'rotate',      params: { degrees: number } }
      | { op: 'googleEdit',  params: { prompt: string } }
    >
  }>
})
```

Notes
- googleEdit requires `params.prompt`. Other ops do not accept `prompt` and use only their specific params.
- The executor normalizes some planner-friendly fields: e.g., `contrast.strength`→`value`, `hue.degrees`→`value`, string `filter`→`{ type }`.
- If the planner returns zero variations, the server logs an error and emits `source: 'none'`; there is no static fallback by design.


## TL;DR (principles to enforce in the prompt)

* **Local first**, **AI only when necessary**.
* **One googleEdit max** per plan in most cases.
* **Minimal, parameterized, deterministic** steps.
* **Stream after every step**, never block the SSE.
* **Explain each step in `why`** (for logs), but return **only** the tool call.

---

Great question. Don’t spawn 5 separate agent runs. Make **one agent planning pass** that returns **five distinct plans** (variation candidates), then execute them concurrently in your SSE pipeline. This gives you:

* a single, consistent understanding of the user goal/image
* cheaper + faster planning
* explicit diversity control across the five plans
* simpler SSE wiring (one `plans` event → many step streams)

Below is the **updated design**: schema, routing, and prompts.

---

# 1) One-shot planning → five plans

## New tool (agent output)

Introduce a single tool the agent must call exactly once:

```ts
// Tool: plan_variations
type Variation = {
  id?: string;                // optional; server will map/generate UUIDs if missing
  label?: string;             // short name e.g., "Warm Pop", "Clean Studio"
  strategy?: string;          // human-readable rationale (for logs, not executed)
  operations: Op[];           // from the Op DSL defined earlier
};

type PlanVariationsArgs = {
  variations: Variation[];    // MUST be length 5
  diversity_axes?: string[];  // (optional) logged: what was varied (WB, contrast curve, crop, AI usage, etc.)
};
```

> Executor behavior:
>
> * Emit `plans` with `{ [variationId]: operations }`.
> * Run each variation in a small worker pool (e.g., concurrency=2–3) → interleave `step-result` SSE events.
> * Keep your existing Redis keying: `image:${variationId}:${stepIndex}`.

**Why not 5 tool calls?**
Parallel agent calls are slower, costlier, and can disagree on intent. A single plan ensures coherence and lets you **systematically diversify** the five outputs.

---

# 2) Diversity policy (what the agent should vary)

Tell the agent to produce 5 **meaningfully different** plans along **controlled axes**, while respecting your “local-first, one-`googleEdit`-max” policy.

Suggested axes (agent may mix 2–3 per plan):

* **Tone/Color**: warm vs cool, low vs medium contrast, gentle film-like gamma, subtle saturation differences.
* **Geometry**: original vs slight crop/rotate; safe headroom (no critical content loss).
* **Local vs AI**: mostly local; at most **2/5** plans may include `googleEdit` (cost guardrail). If AI is used, keep a clear `prompt` and single AI step.
* **Stylistic finish**: clean product, soft vignette, subtle tint, mild sharpen vs soft blur for mood.
* **Size/Framing**: consistent working size (e.g., longest side 2048), with one plan exploring a tighter crop if safe.

Guardrails:

* **One `googleEdit` step max** per plan; **≤2 plans** use it overall.
* Numeric params must be realistic; no redundant steps.
* Don’t clip highlights or crush shadows; skin stays natural unless asked.

---

# 3) Updated prompts

## System prompt (replace earlier)

```
Role: Senior photo editor & orchestrator.

Input: user text + optional image.
Output: EXACTLY ONE call to plan_variations with 5 distinct variations. Each variation is an ordered list of operations (Op DSL).
Plan form: [local-pre → (optional single googleEdit) → local-post].
Principles:
- Local-first. Use googleEdit ONLY for generative needs (in/outpainting, style transfer, object addition/removal, text-to-image).
- At most 2 of the 5 variations may include googleEdit. Others must be local-only.
- One googleEdit step MAX per variation. Prefer one strong AI step, then local finishing.
- Keep numeric parameters concrete, bounded, and sensible. Keep plans short and non-redundant.
- Longest side defaults to 2048 unless user demands a larger deliverable. Resize early for consistency.
- Ensure diversity across the 5 plans along tone/color, geometry/crop, and finishing looks; avoid trivial duplicates.
- Preserve content unless the user explicitly asks to change it.
- Include `label` and short `strategy` for each variation (for logs only). The executor ignores them.

Return ONLY the tool call to plan_variations. No extra commentary.
```

## Developer prompt (tight constraints)

```
Environment:
- Local ops: Sharp-backed; fast and deterministic.
- googleEdit: slow/stochastic; use sparingly and only when necessary.
- SSE streams after each executed step.

Constraints:
- Use the Op schema provided (JSON-serializable).
- Bounds: brightness/saturation/contrast factor 0.1–3.0; hue -180..180; blur sigma 0.3–10; rotate -180..180.
- Never chain multiple googleEdit steps in a single variation.
- For “warmer/punchier” requests: prefer temperature/tint + light saturation + mild contrast; avoid large hue shifts.
- For “cinematic”: micro-contrast (contrast + levels.gamma), optional gentle vignette; googleEdit only if explicit stylization is requested.
- Provide exactly 5 variations. Ensure 3+ are local-only.

Return:
- ONE call: plan_variations({ variations: [...5 items...], diversity_axes: [...] }).
```

## Few-shot (compact)

**A) Local-only set for “warmer & punchier; keep framing”**

```json
{
  "tool_name": "plan_variations",
  "variations": [
    {
      "label":"Warm Pop",
      "strategy":"Temp warm + slight sat + gentle contrast; keep geometry",
      "operations":[
        {"op":"resize","params":{"width":2048,"fit":"inside"}},
        {"op":"temperature","params":{"warm":true,"strength":0.4}},
        {"op":"saturation","params":{"factor":1.08}},
        {"op":"contrast","params":{"strength":1.05}}
      ]
    },
    {
      "label":"Clean Neutral",
      "strategy":"Neutral WB; micro-contrast; gamma polish",
      "operations":[
        {"op":"resize","params":{"width":2048,"fit":"inside"}},
        {"op":"contrast","params":{"strength":1.04}},
        {"op":"levels","params":{"gamma":0.98}}
      ]
    },
    {
      "label":"Cool Modern",
      "strategy":"Slight cool tint + clarity",
      "operations":[
        {"op":"resize","params":{"width":2048,"fit":"inside"}},
        {"op":"tint","params":{"hex":"#DDE8FF","alpha":0.08}},
        {"op":"contrast","params":{"strength":1.06}},
        {"op":"saturation","params":{"factor":0.98}}
      ]
    },
    {
      "label":"Soft Film",
      "strategy":"Lower contrast, mild warm, soft vignette",
      "operations":[
        {"op":"resize","params":{"width":2048,"fit":"inside"}},
        {"op":"contrast","params":{"strength":0.97}},
        {"op":"temperature","params":{"warm":true,"strength":0.25}},
        {"op":"vignette","params":{"strength":0.12}}
      ]
    },
    {
      "label":"Tight Crop Punch",
      "strategy":"Safe tighter crop + punchy finish",
      "operations":[
        {"op":"resize","params":{"width":2048,"fit":"inside"}},
        {"op":"crop","params":{"x":64,"y":64,"width":1920,"height":1280}},
        {"op":"contrast","params":{"strength":1.07}},
        {"op":"saturation","params":{"factor":1.06}}
      ]
    }
  ],
  "diversity_axes":["WB","contrast curve","crop/framing","finishing vignette","tint"]
}
```

**B) Mixed set where 2 use googleEdit (e.g., remove background person; add gentle style)**

```json
{
  "tool_name": "plan_variations",
  "variations": [
    { "label":"Local Natural", "strategy":"Local-only natural polish",
      "operations":[{"op":"resize","params":{"width":2048,"fit":"inside"}},
                    {"op":"temperature","params":{"warm":true,"strength":0.3}},
                    {"op":"contrast","params":{"strength":1.04}}] },
    { "label":"Local Clean High-Key", "strategy":"Brighter, soft contrast",
      "operations":[{"op":"resize","params":{"width":2048,"fit":"inside"}},
                    {"op":"brightness","params":{"factor":1.05}},
                    {"op":"contrast","params":{"strength":0.98}},
                    {"op":"levels","params":{"gamma":1.02}}] },
    { "label":"Local Cool Minimal", "strategy":"Cool tint + micro-contrast",
      "operations":[{"op":"resize","params":{"width":2048,"fit":"inside"}},
                    {"op":"tint","params":{"hex":"#E6F0FF","alpha":0.07}},
                    {"op":"contrast","params":{"strength":1.05}}] },
    { "label":"AI Inpaint Clean BG", "strategy":"Remove background person with AI; color match post",
      "operations":[{"op":"resize","params":{"width":2048,"fit":"inside"}},
                    {"op":"googleEdit","params":{
                      "prompt":"Remove the person in the back-left and reconstruct the original background seamlessly. Keep layout, perspective, and colors.",
                      "mode":"edit","guidance":{"keepLayout":true,"keepColors":true,"strength":0.75}}},
                    {"op":"levels","params":{"gamma":0.99}}] },
    { "label":"AI Subtle Style", "strategy":"Gentle stylistic clean-up; keep composition",
      "operations":[{"op":"resize","params":{"width":2048,"fit":"inside"}},
                    {"op":"googleEdit","params":{
                      "prompt":"Apply a clean, natural photographic grade with soft contrast and neutral colors; preserve subject identity and composition.",
                      "mode":"edit","guidance":{"keepLayout":true,"keepColors":true,"strength":0.6}}},
                    {"op":"contrast","params":{"strength":1.03}}] }
  ],
  "diversity_axes":["WB","contrast","AI inpaint","AI mild style","neutral vs warm vs cool"]
}
```

---

# 4) Server/SSE wiring (concise)

1. **Agent call (once)**

* Provide user text + (optional) image.
* Expect a single `plan_variations` tool call with 5 plans.

2. **Map plans → IDs**

* If the tool didn’t include `id`, map your `variationIds[i]` to `variations[i]`.

3. **Emit `plans` SSE**

```js
controller.enqueue(encoder.encode(
  `data: ${JSON.stringify({ event:'plans', plans: { [vid1]: ops1, ... } })}\n\n`
));
```

4. **Execute with a worker pool**

* `Promise.allSettled` with concurrency=2–3.
* After each step: store to Redis → emit `step-result`.
* On per-step error: fallback to prior buffer, log error, continue.
* When all done: emit `end`.

---

# 5) Minimal code deltas

* **New tool**: `plan_variations` schema & binding (similar to your earlier `apply_operations`, but returns 5 arrays).
* **Route**: In `/api/generate-variations`, when `imageBuffer` exists, call planner once, not per variation.
* **Executor**: accept an array of {variationId, operations\[]} and run with limited concurrency.

---

## TL;DR

* **One agent run** → **five diversified plans** (`plan_variations`).
* Enforce **local-first** and **≤2 AI plans** for cost/latency.
* Stream exactly as you do now; just execute the 5 plans in a small pool.
* Updated prompts above guarantee distinct yet controlled outputs.
