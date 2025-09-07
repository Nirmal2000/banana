Yes — you’re describing a node‑graph editor (like ComfyUI) where:



Each image is a node in a DAG.

A draggable prompt box generates 10 child variations via “plans” that mix your local sliders and at most one Google edit.

A floating steps bar shows live execution.

Selecting a node makes it the parent for new children.

Below is a concrete, hackathon‑ready way to build this on your current stack.

Frameworks



React/Next.js: you already use it — keep it.

Graph UI: React Flow (stable, easy, great DX for node graphs).

State: Zustand for the graph, selection, tasks, and prompts.

Execution: XState per-plan or a tiny async queue + event emitter; run heavy ops in a Web Worker via Comlink.

Storage: Dexie (IndexedDB) for images/blobs/plans locally; optional Supabase/S3 for persistence after demo.

Layout: Tailwind (you already have it); lucide-react for icons.

LLM/Editing: Gemini 2.5 Flash Image (Google edit, consistency/fusion/editing); Fal (optional) for heavy outpainting/relight.

Core Architecture



Graph Store (Zustand)Nodes: { id, parentId, imageUrl | blobId, plan, toolParams, meta, createdAt }

Edges: { id, source, target }

Selection: selectedNodeId

Tool Plugin RegistryEach tool exposes a pure function: apply(imageData, params) -> imageData

Existing tools (brightness/contrast/hue/sat/rotate/tint/filters) become plugins; Google edit is a remote plugin.

Planner + ExecutorPlanner API: input { prompt, parentImage?, numPlans=10, allowGoogleOnce=true } → output [Plan]

Plan: [{ op: 'brightness'|'contrast'|'tint'|...|'googleEdit', params, region? }]

Executor: sequentially apply steps; if a googleEdit step exists, call your /api/google-edit-image; the rest run locally in a Worker.

Floating UIPromptBox (draggable): when submittedNo selection → generate new root nodes

Selected node → generate children under it

StepsBar (draggable): subscribes to the active plan run; shows step name, progress, thumbnails per step.

AssetsCache intermediate results in Dexie as Blobs; store the chosen result back on the node; keep small thumbnails for graph.

Why React Flow



Node/edge model, panning/zoom, controlled layout.

Simple custom node renderer: thumbnail + badges (plan size, has Google step) + quick actions (compare, fork).

Minimal Data Shapes



Node: { id, parentId?, imageBlobId, thumbBlobId, planApplied?, toolParams?, meta }

PlanStep: { id, op, params, region? } with invariant: at most one op === 'googleEdit'

RunEvent: { planId, stepId, status: 'queued'|'running'|'done'|'error', previewBlobId? }

Execution Flow



User types prompt in PromptBox.

Planner (Gemini) returns 10 diverse plans (enforce “≤1 googleEdit”).

For each plan:Create “pending child node” under the selected node.

Execute steps in a Worker; emit events for StepsBar and live preview.

On completion, update child node image and metadata.

User clicks a child node to select; PromptBox now branches from this node.

Planner Prompting Hints (Gemini)



System constraints: “Return JSON array of at most 10 plans. Each plan is ≤6 steps. Use at most one googleEdit step per plan. Prefer local ops for linear adjustments.”

Diversity knobs: vary strength ranges, sequences, and optional region masks (subject/background/skin/sky).

If parent image present, bias toward corrective/creative mixes; otherwise allow generative style/fusion + local tone mapping.

Worker Execution (fast, responsive)



Web Worker holds a Canvas + ImageData buffer.

Each tool plugin transforms pixels (you already have the code); reuse it with minor wrapping.

Google step posts to Next API, waits for the edited image, then resumes local steps.

UI Components To Add



GraphCanvas (React Flow)Node renderer: image thumbnail, title, small badges

Auto layout: dagre top→down for parent→children

FloatingPrompt (draggable, z-index high)Input + “Generate 10” button; respects selection

StepsBar (draggable)Shows active plan execution, step progress, and quick cancel

VariationOverlay (optional)Grid preview while children generate; click to accept/focus

Backend Endpoints



/api/plan → returns [Plan] for a prompt (+ parent image context)

/api/execute-google-edit → your current Google editor route; input: image blob + prompt + constraints

Optional /api/batch for album consistency later

Scaffolding Order (1–2 days)



Add React Flow and GraphCanvas with dummy nodes/edges.

Create FloatingPrompt and wire it to the selected node from the graph store.

Define Plan schema and planner API returning mock plans first; then switch to Gemini.

Build a Worker runner that:Loads parent image into ImageData

Applies tool steps from registry

Calls Google step via API when present

Wire StepsBar to runner events.

Persist node images in Dexie (thumb + full) and store blob IDs in nodes.

Polishing: compare A/B, re-run a plan with nudges, and branch labels.

Tech Tips



Use createImageBitmap + OffscreenCanvas where available for speedy ImageData.

Keep thumbnails ≤512px on the graph; lazy-load full res when node focused.

Debounce UI on many concurrent children (limit to 4 running; queue rest).

Memoize tool steps per plan if multiple child variants share early steps.

Demo Story (for judges)



Select a parent photo → type “cinematic warm portrait with soft background.”

10 children appear progressively; StepsBar narrates plan execution.

Pick one; show sliders synchronized to the chosen look (explainability).

Add another prompt: “Brighter subject, cooler background.” Branch and compare.

Drop a reference image; run style fusion at 30% strength; keep one.

Finish by showing the branchable graph and one‑click shareable “Look.”

If you want, I can scaffold React Flow + a basic graph store and stubs for FloatingPrompt, StepsBar, and a Worker-based plan runner that wraps your existing tools.