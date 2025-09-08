'use client';

import { useMemo, useState } from 'react';
import { useGraphStore } from '@/store/graphStore';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// No action buttons for now; display-only panel

const StepsBar = () => {
  const [position, setPosition] = useState({ x: 500, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const {
    nodes,
    selectedNodeId,
    generationActive,
    currentExecution,
    variationProgress,
    plannerSource,
    eventDetails,
    setGenerationActive,
    clearExecution,
  } = useGraphStore();

  // Action buttons removed; panel is display-only

  // Derive execution data for selected image
  const selectedExec = useMemo(() => {
    if (!selectedNodeId) return null;
    return currentExecution.find(e => e.variationId === selectedNodeId) || null;
  }, [selectedNodeId, currentExecution]);

  const currentIndex = selectedExec ? (variationProgress[selectedExec.variationId] ?? -1) : -1;
  const totalSteps = selectedExec ? (selectedExec.plan?.length || 0) : 0;
  const isComplete = selectedExec ? (totalSteps > 0 && currentIndex >= totalSteps - 1) : false;

  const headerText = useMemo(() => {
    if (!selectedNodeId) return '';
    if (!generationActive && !selectedExec) return 'No active plan for this image';
    if (selectedExec && totalSteps === 0) return 'Base generation (no steps)';
    if (selectedExec && totalSteps > 0) {
      if (isComplete) return `Completed ${totalSteps} steps`;
      const nextStep = Math.max(0, currentIndex + 1);
      const label = selectedExec.plan?.[nextStep]?.op || '…';
      return `Step ${Math.min(nextStep + 1, totalSteps)} of ${totalSteps}: ${label}`;
    }
    return 'Ready';
  }, [selectedNodeId, generationActive, selectedExec, totalSteps, isComplete, currentIndex]);

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

  // Hide when no image is selected or selected is an uploaded node
  if (!selectedNodeId) return null;
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  if (!selectedNode || selectedNode?.data?.isUploaded) return null;

  return (
    <Card
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={cn(
        "fixed z-50 w-[260px] cursor-grab",
        isDragging && "cursor-grabbing"
      )}
      style={{
        top: position.y,
        left: position.x,
      }}
    >
      <CardHeader>
        <CardTitle className="text-sm">Selected Image Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary line */}
        <div className="text-sm text-muted-foreground">{headerText}</div>

        {/* Planner source if available */}
        {/* {plannerSource && (
          <div className="text-[11px] text-muted-foreground/80">
            Planner: <span className="font-mono">{plannerSource}</span>
          </div>
        )} */}

        {/* Plan steps for selected image */}
        {selectedExec && totalSteps > 0 && (
          <div className="rounded-md border p-2 max-h-48 overflow-auto">
            {selectedExec.plan.map((step, idx) => {
              const done = currentIndex >= idx;
              return (
                <div key={idx} className={cn("flex items-start gap-2 py-1 text-xs", done ? "opacity-100" : "opacity-80")}
                >
                  <div className={cn(
                    "h-5 w-5 shrink-0 inline-flex items-center justify-center rounded-sm text-[10px] font-mono leading-none",
                    done ? "bg-green-600 text-white" : "bg-neutral-200 text-neutral-700"
                  )}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">
                      {step.op}
                      {done && <span className="ml-2 text-[10px] text-green-600">done</span>}
                    </div>
                    {step.params && (
                      <div className="font-mono text-[10px] text-neutral-500 break-words">
                        {JSON.stringify(step.params)}
                      </div>
                    )}
                    {eventDetails?.[selectedExec.variationId]?.[idx] && (
                      <div className="mt-1 text-[10px] text-neutral-500">
                        <div className="font-mono">{JSON.stringify(eventDetails[selectedExec.variationId][idx])}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions removed: display-only */}
      </CardContent>
    </Card>
  );
};

export default StepsBar;
