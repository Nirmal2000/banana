import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { saveImage, clearImages, resetDatabase } from '@/lib/dexieStore';

const initialNodes = [
  // {
  //   id: '1',
  //   type: 'imageNode',
  //   position: { x: 100, y: 100 },
  //   data: { imageUrl: 'https://via.placeholder.com/80/000000/FFFFFF?text=1', title: 'Parent Image' },
  // },
  // {
  //   id: '2',
  //   type: 'imageNode',
  //   position: { x: 400, y: 200 },
  //   data: { imageUrl: 'https://via.placeholder.com/80/FFFFFF/000000?text=2', title: 'Edited Child 1' },
  // },
  // {
  //   id: '3',
  //   type: 'imageNode',
  //   position: { x: 200, y: 300 },
  //   data: { imageUrl: 'https://via.placeholder.com/80/CCCCCC/333333?text=3', title: 'Edited Child 2' },
  // },
];

const initialEdges = [
  // { id: 'e1-2', source: '1', target: '2' },
  // { id: 'e2-3', source: '2', target: '3' },
];

export const useGraphStore = create(
  persist(
    (set, get) => ({
      nodes: initialNodes,
      edges: initialEdges,
      selectedNodeId: null, // ID of selected node for variations
      viewport: { x: 0, y: 0, zoom: 1 }, // React Flow viewport
      lightboxNodeId: null, // node currently shown in lightbox
      focusNodeId: null, // request to center on a node
      generationActive: false, // True when SSE is streaming
      variationProgress: {}, // {variationId: currentStep}
      currentExecution: [], // Array of {variationId, plan} for progress bar

      onNodesChange: (changes) => {
        set((state) => {
          // Check if selected node is being deleted
          const selectedNodeToDelete = changes.find(
            change => change.type === 'remove' && change.id === state.selectedNodeId
          );

          return {
            nodes: applyNodeChanges(changes, state.nodes),
            // Clear selectedNodeId if the selected node is being deleted
            ...(selectedNodeToDelete && { selectedNodeId: null }),
          };
        });
      },

      onEdgesChange: (changes) => {
        set((state) => ({
          edges: applyEdgeChanges(changes, state.edges),
        }));
      },

      // Set selected node
      setSelectedNode: (nodeId) => {
        set({ selectedNodeId: nodeId });
      },

      // Track React Flow viewport
      setViewport: (viewport) => {
        set({ viewport });
      },

      // Lightbox controls
      openLightbox: (nodeId) => {
        set({ lightboxNodeId: nodeId });
      },
      closeLightbox: () => {
        set({ lightboxNodeId: null });
      },

      // Canvas focus controls
      requestFocusNode: (nodeId) => {
        set({ focusNodeId: nodeId });
      },
      clearFocusNode: () => {
        set({ focusNodeId: null });
      },

      // Add new node (for base case)
      addNode: (node) => {
        set((state) => ({
          nodes: [...state.nodes, node],
        }));
      },

      // Create new base node
      createBaseNode: (title = 'New Image', positionOverride) => {
        const newId = uuidv4();
        const newNode = {
          id: newId,
          type: 'imageNode',
          // Center on screen if provided, otherwise fall back to incremental
          position: positionOverride || { x: 100 + get().nodes.length * 50, y: 100 },
          data: { imageUrl: '', title, isLoading: true, variationId: newId },
        };
        get().addNode(newNode);
        return newId;
      },

      // Add variation nodes (pending)
      addVariationNodes: (variationIds, parentId, positions) => {
        const newNodes = variationIds.map((id, index) => ({
          id,
          type: 'imageNode',
          position: positions[index] || { x: 100 + index * 150, y: 400 + index * 50 },
          data: { imageUrl: '', title: `Variation ${index + 1}`, isLoading: true, variationId: id },
        }));
        const newEdges = variationIds.map(id => ({
          id: `e${parentId}-${id}`,
          source: parentId,
          target: id,
        }));
        set((state) => ({
          nodes: [...state.nodes, ...newNodes],
          edges: [...state.edges, ...newEdges],
        }));
      },

      // Update node image (from SSE step-result)
      updateNodeImage: async (nodeId, imageData) => {
        set((state) => ({
          nodes: state.nodes.map(node =>
            node.id === nodeId ? { ...node, data: { ...node.data, imageUrl: imageData, isLoading: false } } : node
          ),
        }));
        // Persist to Dexie
        await saveImage(nodeId, imageData);
      },

      // Set generation active flag
      setGenerationActive: (active) => {
        set({ generationActive: active });
      },

      // Set plans and current execution
      setPlans: (plans) => {
        const execution = Object.entries(plans).map(([id, plan]) => ({ variationId: id, plan }));
        set({ currentExecution: execution });
      },

      // Update progress for a variation
      updateVariationProgress: (variationId, stepIndex) => {
        set((state) => ({
          variationProgress: { ...state.variationProgress, [variationId]: stepIndex },
        }));
      },

      // Clear execution on end
      clearExecution: () => {
        set({ currentExecution: [], variationProgress: {} });
      },

      // Get node image URL by ID
      getNodeImage: (nodeId) => {
        const node = get().nodes.find(n => n.id === nodeId);
        return node ? node.data.imageUrl : null;
      },

      // Get node position by ID
      getNodePosition: (nodeId) => {
        const node = get().nodes.find(n => n.id === nodeId);
        return node ? node.position : null;
      },

      // Generate unique IDs for variations
      generateVariationIds: (count = 5) => {
        return Array.from({ length: count }, () => uuidv4());
      },

      // Clear all state (for development/testing)
      clearAll: () => {
        // Clear localStorage for persisted data
        localStorage.removeItem('graph-storage');

        // Clear images from Dexie
        clearImages();

        // Reset to initial state
        set({
          nodes: initialNodes,
          edges: initialEdges,
          selectedNodeId: null,
          generationActive: false,
          variationProgress: {},
          currentExecution: [],
        });
      },
    }),
    {
      name: 'graph-storage',
      // Avoid persisting large image data URLs in localStorage to prevent QuotaExceededError.
      // We still keep images in memory during a session and persist them to Dexie (IndexedDB).
      partialize: (state) => ({
        // Strip imageUrl from each node before persisting
        nodes: state.nodes.map((n) => {
          const { imageUrl, ...restData } = n.data || {};
          return { ...n, data: restData };
        }),
        edges: state.edges,
        selectedNodeId: state.selectedNodeId,
      }),
    }
  )
);
