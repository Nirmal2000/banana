'use client';

import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ImageNode from '../components/ImageNode';
import PromptBox from '../components/PromptBox';
import StepsBar from '../components/StepsBar';
import { useGraphStore } from '../store/graphStore';

const nodeTypes = {
  imageNode: ImageNode,
};

export default function Home() {
  const { nodes, edges, onNodesChange, onEdgesChange, setSelectedNode, clearAll } = useGraphStore();

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <PromptBox />
      <StepsBar />
      <button
        onClick={() => clearAll()}
        className="fixed top-4 right-4 z-50 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow-lg transition-colors duration-200 font-medium"
        title="Clear all data and reset to initial state"
      >
        🔄 Clear All
      </button>
      <ReactFlow
        className="dark"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(event, node) => setSelectedNode(node.id)}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#111" gap={12} />
        <Controls className="bg-background border border-border text-foreground" />
        <MiniMap
          className="rf-minimap"
          nodeColor="#999"
          nodeStrokeColor="#333"
          nodeStrokeWidth={1}
          zoomable
          pannable
          maskColor="rgba(0, 0, 0, 0.5)"
        />
      </ReactFlow>
    </div>
  );
}
