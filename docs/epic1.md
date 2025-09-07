Here's the detailed breakdown for Epic 1.

## **Epic 1: The Visual Canvas Foundation**

**Goal:** To establish the core user interface, providing you with a functional, navigable graph canvas. This epic focuses on setting up the visual foundation and technical scaffolding without implementing the image generation logic.

**Rationale:** Before any editing can happen, you need a space to work. This epic delivers the foundational UI components and proves that our choice of the React Flow library is viable for the project.

**AT ANY POINT ASK ME FOR DOUBT REGARDING DOCS IF NOT SURE**

**APP THEME IS BLACK&WHITE**

---
### **User Story 1.2: Render the Graph Canvas**

* **Story:** As a **user**, I want to see an interactive graph canvas when the application loads, so I can pan and zoom to navigate my workspace.
* **Dependencies:** Story 1.1
* **Acceptance Criteria (AC):**
    * The main page (`/`) renders a full-screen React Flow canvas.
    * A set of hardcoded dummy nodes and edges are displayed on the initial load to prove functionality.
    * You can pan the canvas by clicking and dragging with the mouse.
    * You can zoom in and out using the mouse wheel or trackpad.
    * The default React Flow attribution and minimap are visible.
* **Technical Notes:**
    * Wrap the main page component with `<ReactFlowProvider>`.
    * Use the `<ReactFlow>` component as the main canvas.
    * Initialize the component with a simple array of `initialNodes` and `initialEdges`.

---

### **User Story 1.3: Custom Image Nodes**

* **Story:** As a **user**, I want graph nodes to be rendered as image thumbnails instead of generic boxes, so I can visually identify my edits at a glance.
* **Dependencies:** Story 1.2
* **Acceptance Criteria (AC):**
    * A new custom React component named `ImageNode` is created.
    * The `ImageNode` component accepts an `imageUrl` in its `data` prop and displays it as a thumbnail.
    * The React Flow canvas is configured to use `ImageNode` as a custom node type.
    * The initial dummy nodes from the previous story are now rendered using this custom component, showing placeholder images.
* **Technical Notes:**
    * Create a `nodeTypes` object that maps a name (e.g., 'imageNode') to your `ImageNode` component.
    * Pass this object to the `<ReactFlow>` component's `nodeTypes` prop.
    * Update your `initialNodes` to have `type: 'imageNode'` and include a `data: { imageUrl: '...' }` property.



---

### **User Story 1.4: Floating UI Elements**

* **Story:** As a **user**, I want to see draggable floating UI elements for the "Prompt Box" and "Steps Bar", so I can access the primary controls of the application.
* **Dependencies:** Story 1.1
* **Acceptance Criteria (AC):**
    * A `PromptBox` component is created and rendered on the screen.
    * A `StepsBar` component is created and rendered on the screen.
    * Both components have a high `z-index` and appear to "float" above the graph canvas.
    * Both components are independently draggable within the window bounds.
    * The components contain placeholder text and icons for now.
* **Technical Notes:**
    * Draggability can be implemented with a simple custom hook using `useState` for position and handling `onMouseDown`, `onMouseMove`, and `onMouseUp` events. A third-party library is not necessary.
    * Use `lucide-react` for any icons needed.
    * Leverage Tailwind CSS for styling and positioning.

---

### **User Story 1.5: Basic Graph State**

* **Story:** As a **developer**, I need a basic Zustand store to manage the graph's nodes and edges so that the UI can be driven by a central, reactive state model.
* **Dependencies:** Story 1.2
* **Acceptance Criteria (AC):**
    * A Zustand store is created at `/store/graphStore.js`.
    * The store holds state for `nodes`, `edges`, `onNodesChange`, and `onEdgesChange`.
    * The dummy nodes and edges are moved from the page component into the store as the initial state.
    * The `<ReactFlow>` component is now fully controlled by the Zustand store (its props are connected to the store's state and actions).
    * Dragging a node on the canvas correctly updates its position in the Zustand store.
* **Technical Notes:**
    * Zustand is very lightweight. The store will export a single hook, e.g., `useGraphStore`.
    * Implement the `onNodesChange` and `onEdgesChange` functions within the store's creator function, using the `applyNodeChanges` and `applyEdgeChanges` helpers provided by React Flow. This is the standard pattern for controlled components.