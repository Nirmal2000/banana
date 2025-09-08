'use client';

import { useState, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { useGraphStore } from '@/store/graphStore';
import { getImage } from '@/lib/dexieStore';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const PromptBox = () => {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [promptValue, setPromptValue] = useState('');
  const [generating, setGenerating] = useState(false);
  const eventSourceRef = useRef(null);

  const {
    selectedNodeId,
    createBaseNode,
    addVariationNodes,
    updateNodeImage,
    setGenerationActive,
    setPlans,
    updateVariationProgress,
    clearExecution,
    generateVariationIds,
    viewport,
    getNodePosition,
  } = useGraphStore();

  const handleEvent = (eventData) => {
    if (eventData.event === 'plans') {
      if (selectedNodeId) {
        // Variation case, nodes already added
        setPlans(eventData.plans);
      } else {
        // Base case
        setPlans(eventData.plans);
      }
    } else if (eventData.event === 'step-result') {
      // Fetch the image data using the key
      fetch(`/api/images/${eventData.key}`)
        .then(res => res.text())
        .then(dataUrl => {
          updateNodeImage(eventData.variationId, dataUrl);
        })
        .catch(err => console.error('Failed to fetch image key:', eventData.key, err));
      updateVariationProgress(eventData.variationId, eventData.stepIndex);
    } else if (eventData.event === 'end') {
      setGenerating(false);
      setGenerationActive(false);
      clearExecution();
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
    if (selectedNodeId) {
      // Variation case: generate 5 variations
      const variationIds = generateVariationIds(5);
      const imageData = await getImage(selectedNodeId);

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
        const parentPos = getNodePosition(selectedNodeId) || { x: 0, y: 0 };
        const count = variationIds.length;
        const nodeW = 120; // approximate node width for layout
        const gapX = 40;   // horizontal gap between variations
        const rowY = parentPos.y + 180; // vertical spacing below parent
        const totalW = count * nodeW + (count - 1) * gapX;
        const parentCenterX = parentPos.x + nodeW / 2;
        const startX = parentCenterX - totalW / 2;
        const positions = variationIds.map((_, i) => ({ x: Math.round(startX + i * (nodeW + gapX)), y: rowY }));
        addVariationNodes(variationIds, selectedNodeId, positions);
      } else {
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

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <Card
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp} // To handle release outside
      className={cn(
        "fixed z-50 min-w-[300px] min-h-[100px] cursor-grab",
        isDragging && "cursor-grabbing"
      )}
      style={{
        top: position.y,
        left: position.x,
      }}
    >
      <CardHeader>
        <CardTitle>Prompt Box</CardTitle>
        {selectedNodeId && <div className="text-sm text-muted-foreground">Selected: {selectedNodeId}</div>}
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          type="text"
          placeholder="Enter your prompt here"
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
          disabled={generating}
        />
        <Button
          onClick={handleGenerate}
          disabled={!promptValue.trim() || generating}
        >
          {generating ? 'Generating...' : selectedNodeId ? 'Generate Variations' : 'Generate New Image'}
          {!generating && <RotateCcw />}
        </Button>
      </CardContent>
    </Card>
  );
};

export default PromptBox;
