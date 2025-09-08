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
