"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X, MoreVertical, ImagePlus } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { getImage } from "@/lib/dexieStore";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PromptBox = () => {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [promptValue, setPromptValue] = useState('');
  const [generating, setGenerating] = useState(false);
  const eventSourceRef = useRef(null);
  const fileInputRef = useRef(null);

  const {
    selectedNodeId,
    selectedNodeIds,
    createBaseNode,
    createUploadedNode,
    addVariationNodes,
    updateNodeImage,
    setGenerationActive,
    setPlannerSource,
    addEventDetail,
    setPlans,
    updateVariationProgress,
    clearExecution,
    generateVariationIds,
    viewport,
    getNodePosition,
    requestFocusNode,
    setSelectedNode,
    setSelectedNodes,
    removeSelectedNode,
    connectParentsToChild,
  } = useGraphStore();

  // Load thumbnails for all selected nodes
  const [selectedThumbs, setSelectedThumbs] = useState([]); // [{id,url}]
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0
        ? selectedNodeIds
        : (selectedNodeId ? [selectedNodeId] : []);
      const results = [];
      for (const id of ids) {
        const img = useGraphStore.getState().getNodeImage(id) || (await getImage(id));
        results.push({ id, url: img || null });
      }
      if (!cancelled) setSelectedThumbs(results);
    })();
    return () => { cancelled = true; };
  }, [selectedNodeId, selectedNodeIds]);

  const handleEvent = (eventData) => {
    if (eventData.event === 'planner-source') {
      try { console.info('[Client] planner-source:', eventData.source); } catch {}
      setPlannerSource(eventData.source);
    } else if (eventData.event === 'plans') {
      try {
        const planCounts = Object.fromEntries(Object.entries(eventData.plans || {}).map(([k, v]) => [k, (v || []).length]));
        console.info('[Client] plans received:', planCounts);
      } catch {}
      if (selectedNodeId) {
        // Variation case, nodes already added
        setPlans(eventData.plans);
      } else {
        // Base case
        setPlans(eventData.plans);
      }
    } else if (eventData.event === 'step-result') {
      try { console.debug('[Client] step-result:', { v: eventData.variationId, i: eventData.stepIndex }); } catch {}
      // Fetch the image data using the key
      fetch(`/api/images/${eventData.key}`)
        .then(res => res.text())
        .then(dataUrl => {
          updateNodeImage(eventData.variationId, dataUrl);
        })
        .catch(err => console.error('Failed to fetch image key:', eventData.key, err));
      updateVariationProgress(eventData.variationId, eventData.stepIndex);
    } else if (eventData.event === 'googleedit') {
      try { console.info('[Client] googleedit:', { v: eventData.variationId, i: eventData.stepIndex }); } catch {}
      addEventDetail(eventData.variationId, eventData.stepIndex, {
        type: 'googleedit',
        model: eventData.model,
        prompt: eventData.prompt,
      });
    } else if (eventData.event === 'end') {
      try { console.info('[Client] end:', eventData.message); } catch {}
      setGenerating(false);
      setGenerationActive(false);
    } else if (eventData.event === 'error') {
      console.error('SSE error:', eventData.message);
      setGenerating(false);
      setGenerationActive(false);
    }
  };

  const handleGenerate = async () => {
    if (!promptValue.trim() || generating) return;

    setGenerating(true);
    setGenerationActive(true);

    let response;
    if (Array.isArray(selectedNodeIds) && selectedNodeIds.length === 1) {
      const onlyId = selectedNodeIds[0];
      // Variation case: generate 5 variations
      const variationIds = generateVariationIds(5);
      const imageData = await getImage(onlyId);

      if (!imageData) {
        alert('Selected node has no saved image');
        setGenerating(false);
        setGenerationActive(false);
        return;
      }

      const formData = new FormData();
      formData.append('prompt', promptValue);
      const blob = new Blob([Uint8Array.from(atob(imageData.split(',')[1]), c => c.charCodeAt(0))], { type: 'image/jpeg' });
      formData.append('image', blob);
      formData.append('variationIds', JSON.stringify(variationIds));

      response = await fetch('/api/generate-variations', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        // Add pending nodes directly under the selected parent
        const parentPos = getNodePosition(onlyId) || { x: 0, y: 0 };
        const count = variationIds.length;
        const nodeW = 120; // approximate node width for layout
        const gapX = 40;   // horizontal gap between variations
        const rowY = parentPos.y + 180; // vertical spacing below parent
        const totalW = count * nodeW + (count - 1) * gapX;
        const parentCenterX = parentPos.x + nodeW / 2;
        const startX = parentCenterX - totalW / 2;
        const positions = variationIds.map((_, i) => ({ x: Math.round(startX + i * (nodeW + gapX)), y: rowY }));
        addVariationNodes(variationIds, onlyId, positions);
      } else {
        setGenerating(false);
        setGenerationActive(false);
        return;
      }
    } else if (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 1) {
      // Multi-select mashup
      const { x = 0, y = 0, zoom = 1 } = viewport || {};
      const width = typeof window !== 'undefined' ? window.innerWidth : 0;
      const height = typeof window !== 'undefined' ? window.innerHeight : 0;
      const centerPos = {
        x: (-x + width / 2) / zoom - 50,
        y: (-y + height / 2) / zoom - 60,
      };
      const newNodeId = createBaseNode('Mashup', centerPos);
      // Connect all selected images as parents to the new mashup node
      connectParentsToChild(selectedNodeIds, newNodeId);

      const formData = new FormData();
      formData.append('prompt', promptValue);
      formData.append('nodeId', newNodeId);
      for (const id of selectedNodeIds) {
        const dataUrl = useGraphStore.getState().getNodeImage(id) || (await getImage(id));
        if (!dataUrl) continue;
        const base64 = dataUrl.split(',')[1];
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        formData.append('images', blob, `img-${id}.jpg`);
      }

      response = await fetch('/api/generate-multi-edit', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        setGenerating(false);
        setGenerationActive(false);
        return;
      }
    } else {
      // Base case
      // Compute center of current viewport in graph coordinates
      const { x = 0, y = 0, zoom = 1 } = viewport || {};
      const width = typeof window !== 'undefined' ? window.innerWidth : 0;
      const height = typeof window !== 'undefined' ? window.innerHeight : 0;
      const centerPos = {
        // Subtract half of typical node size to visually center the node
        x: (-x + width / 2) / zoom - 50,
        y: (-y + height / 2) / zoom - 60,
      };

      const newNodeId = createBaseNode(undefined, centerPos);
      response = await fetch('/api/generate-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptValue, nodeId: newNodeId }),
      });

      if (!response.ok) {
        setGenerating(false);
        setGenerationActive(false);
        return;
      }
    }

    // Handle SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.trim() && line.startsWith('data:')) {
          try {
            const eventData = JSON.parse(line.replace('data:', '').trim());
            handleEvent(eventData);
          } catch (e) {
            console.error('Failed to parse SSE data:', line);
          }
        }
      }
    }
  };

  const handleMouseDown = (e) => {
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
    setIsDragging(true);
  };

  // Attach global listeners while dragging for a smoother UX
  useEffect(() => {
    if (!isDragging) return;
    const move = (e) => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [isDragging, dragOffset]);

  // Set default position: bottom-center on initial mount
  useEffect(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 0;
    const height = typeof window !== 'undefined' ? window.innerHeight : 0;
    // Approx known width ~520px; center horizontally. Place ~96px from bottom.
    const defaultX = Math.max(12, Math.round(width / 2 - 520 / 2));
    const defaultY = Math.max(12, Math.round(height - 96));
    setPosition({ x: defaultX, y: defaultY });
  }, []);

  return (
    <div
      className={cn(
        "fixed z-50",
        "rounded-xl bg-neutral-950/95 backdrop-blur px-4 py-3 min-w-[520px]",
        "border border-white/25 focus-within:border-white/60 transition-colors duration-150",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_10px_30px_rgba(0,0,0,0.45)]"
      )}
      style={{ top: position.y, left: position.x }}
    >
      {/* Row: drag handle | thumbnail | input | icon button */}
      <div className="flex items-center gap-3">
        {/* Drag handle */}
        <button
          onMouseDown={handleMouseDown}
          className={cn(
            "shrink-0 w-6 h-9 grid place-items-center text-neutral-500 hover:text-neutral-300",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
          title="Drag"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {/* Selected thumbnails (supports multi-select) */}
        {Array.isArray(selectedThumbs) && selectedThumbs.length > 0 && (
          <div className="flex items-center gap-2 max-w-[124px] overflow-x-auto scrollbar-thin">
            {selectedThumbs.map(({ id, url }) => (
              <div key={id} className="relative group select-none shrink-0">
                <button
                  className="block w-9 h-9 rounded-md overflow-hidden shadow ring-1 ring-neutral-700 hover:ring-neutral-500"
                  onClick={() => requestFocusNode(id)}
                  title="Focus node"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="Selected" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-neutral-900 grid place-items-center">
                      <div className="w-3 h-3 border-2 border-neutral-500/70 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </button>
                <button
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-neutral-100 text-neutral-900 hidden group-hover:flex items-center justify-center shadow"
                  onClick={() => removeSelectedNode(id)}
                  title="Remove from selection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Input
          type="text"
          placeholder="Describe the change…"
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
          disabled={generating}
          className={cn(
            "w-[420px] h-10 bg-neutral-900/70 border-neutral-800 text-sm",
            "focus:outline-none focus:ring-0 focus-visible:ring-0 focus:border-neutral-800"
          )}
        />
        <Button
          size="icon"
          variant="secondary"
          onClick={handleGenerate}
          disabled={!promptValue.trim() || generating}
          className="h-10 w-10 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
          title={
            Array.isArray(selectedNodeIds) && selectedNodeIds.length > 1
              ? 'Generate mashup'
              : (Array.isArray(selectedNodeIds) && selectedNodeIds.length === 1) || selectedNodeId
              ? 'Generate variations'
              : 'Generate image'
          }
        >
          <RotateCcw className={cn("h-4 w-4", generating && "animate-spin")}/>
        </Button>

        {/* Upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async () => {
              const dataUrl = reader.result;
              // Compute center similar to base case placement
              const { x = 0, y = 0, zoom = 1 } = viewport || {};
              const width = typeof window !== 'undefined' ? window.innerWidth : 0;
              const height = typeof window !== 'undefined' ? window.innerHeight : 0;
              const centerPos = {
                x: (-x + width / 2) / zoom - 50,
                y: (-y + height / 2) / zoom - 60,
              };
              const id = await createUploadedNode(String(dataUrl), 'Uploaded Image', centerPos);
              setSelectedNode(id);
              // reset input to allow re-upload of the same file
              if (fileInputRef.current) fileInputRef.current.value = '';
            };
            reader.readAsDataURL(file);
          }}
        />
        <Button
          size="icon"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={generating}
          className="h-10 w-10 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
          title="Upload image"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default PromptBox;
