'use client';

import { useState } from 'react';
import { Play, Pause, Square } from 'lucide-react';
import { useGraphStore } from '@/store/graphStore';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const StepsBar = () => {
  const [position, setPosition] = useState({ x: 500, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const { generationActive, currentExecution, variationProgress, setGenerationActive, clearExecution } = useGraphStore();

  const handleCancel = () => {
    setGenerationActive(false);
    clearExecution();
  };

  // Get current progress display
  const getCurrentStepText = () => {
    if (!generationActive || currentExecution.length === 0) {
      return "Ready";
    }
    const exec = currentExecution[0]; // Focus on first variation
    const currentStep = variationProgress[exec.variationId] || 0;
    if (currentStep < exec.plan.length) {
      const op = exec.plan[currentStep].op;
      return `Variation 1 of ${currentExecution.length}: Step ${currentStep + 1} of ${exec.plan.length}: ${op}`;
    } else {
      return `Variation 1: Completed`;
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
      onMouseLeave={handleMouseUp}
      className={cn(
        "fixed z-50 min-w-[300px] min-h-[80px] cursor-grab",
        isDragging && "cursor-grabbing"
      )}
      style={{
        top: position.y,
        left: position.x,
      }}
    >
      <CardHeader>
        <CardTitle>Steps Bar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          {getCurrentStepText()}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!generationActive}
            onClick={() => {}} // For future play/pause
          >
            <Play />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!generationActive}
            onClick={handleCancel}
          >
            <Square />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default StepsBar;