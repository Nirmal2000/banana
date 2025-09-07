# Node-Graph Image Editor - Codebase Overview

## Project Description

This is a node-graph editor application for image editing, built with React/Next.js. It provides an interactive canvas where images are represented as nodes in a directed acyclic graph (DAG). Users can generate variations of images through prompts, with the graph showing parent-child relationships between image edits.

## Architecture Overview

The application follows a component-based architecture with:
- **Frontend**: Next.js 13 (App Router) with React 18
- **State Management**: Zustand for global graph state
- **UI Library**: React Flow for interactive graph canvas
- **Styling**: Tailwind CSS with black & white theme
- **Icons**: Lucide React

## File Structure

```
src/
├── app/                              # Next.js App Router
│   ├── layout.js                    # Root layout with ReactFlowProvider
│   ├── page.js                      # Main page - canvas implementation
│   └── globals.css                  # Global styles (black & white theme)
├── components/                      # React components
│   ├── ImageNode.js                # Custom node component for images
│   ├── PromptBox.js                # Draggable floating prompt input
│   └── StepsBar.js                 # Draggable floating progress bar
├── store/
│   └── graphStore.js               # Zustand state management
├── components/ui/                # Shadcn/UI components
│   ├── card.jsx                    # Card component
│   ├── input.jsx                   # Input component
│   └── button.jsx                  # Button component
├── lib/
│   └── utils.js                    # Utility functions (cn helper)
docs/
├── epic1.md                        # Epic 1: Visual Canvas Foundation
├── rough_idea.md                   # Rough idea and technical framework
└── codebase_overview.md           # This documentation
```

## Components

### ImageNode (`src/components/ImageNode.js`)
- **Purpose**: Custom React Flow node for displaying image thumbnails
- **Props**: Receives `data` prop with `imageUrl` and `title`
- **Features**:
  - Displays image thumbnail (80x80px)
  - Shows node title
  - Includes connection handles (source/bottom, target/top)
  - Styled with borders and background
- **Client Component**: Marked with `'use client'` (memoized for performance)

### PromptBox (`src/components/PromptBox.js`)
- **Purpose**: Draggable floating UI for user prompts
- **Features**:
  - Shadcn Input component for prompts
  - Shadcn Button for "Generate 10" (placeholder for now)
  - Fully draggable within window bounds
  - Position state managed with React hooks
  - Wrapped in Shadcn Card for dark-compatible styling
- **Styling**: Shadcn themes with Tailwind, black background in dark mode
- **Client Component**: Uses `useState` for drag state

### StepsBar (`src/components/StepsBar.js`)
- **Purpose**: Draggable floating UI for execution progress
- **Features**:
  - Shows current execution step
  - Shadcn Button for Play and Cancel (placeholders)
  - Fully draggable within window bounds
  - Position state managed with React hooks
  - Wrapped in Shadcn Card for dark-compatible styling
- **Styling**: Shadcn themes with Tailwind, black background in dark mode
- **Client Component**: Uses `useState` for drag state

### UI Components (Shadcn)
- **Location**: `src/components/ui/`
- **Purpose**: Pre-built components for consistent, accessible UI
- **Components Used**: Card, CardContent, CardHeader, CardTitle, Input, Button
- **Integration**: Used in PromptBox and StepsBar for dark theme compatibility

### Main Page (`src/app/page.js`)
- **Purpose**: Main application page with the graph canvas
- **Integration**:
  - Uses Zustand store hook for state management
  - Renders ReactFlow with custom ImageNode type
  - Includes Shadcn-styled floating components (PromptBox, StepsBar)
  - Custom dark theme props for Background, MiniMap, and Controls
- **React Flow Customizations**:
  - MiniMap: Black background, grey nodes with stroke
  - Controls: Dark-themed zoom buttons
  - Background: Dark grid pattern
- **Client Component**: Uses React Flow hooks and Zustand

## State Management (Zustand)

### GraphStore (`src/store/graphStore.js`)
- **Purpose**: Centralized state management for the graph
- **State Structure**:
  ```javascript
  {
    nodes: [Node],     // Array of ReactFlow nodes
    edges: [Edge],     // Array of ReactFlow edges
  }
  ```
- **Methods**:
  - `onNodesChange(changes)`: Handles node position/element changes
  - `onEdgesChange(changes)`: Handles edge modifications
- **Integration**: Connected to ReactFlow component for controlled behavior
- **Initialization**: Pre-populated with dummy image nodes for testing

## Dependencies

### Core Dependencies
- `next`: 13.x (React framework)
- `react-dom`: React rendering
- `@xyflow/react`: React Flow library for graph canvas
- `zustand`: State management
- `lucide-react`: Icon library
- `@radix-ui/react-slot`: Radix UI for shadcn Button
- `class-variance-authority`: for shadcn Button variants
- `clsx` & `tailwind-merge`: for utility cn function

### Development Dependencies
- `tailwindcss`: Utility-first CSS framework
- `eslint`: Code linting
- `postcss`: CSS processing

## Styling & Theme
## Recent Updates

- **Dark Mode Implementation**: Enabled full dark theme via CSS variables and `class="dark"` on html element
- **Shadcn UI Integration**: Added Card, Input, Button components; refactored PromptBox and StepsBar for consistent dark styling
- **React Flow Customizations**: Dark-themed Controls buttons and MiniMap with black background and grey nodes
- **Component Refactoring**: Converted inline styled divs to Shadcn Card-based layouts for better theme consistency


### Dark Theme (Controlled by Shadcn Variables)
- **Root Variables**: Dark mode CSS variables in `src/app/globals.css`
- **Activation**: App set to dark mode via `class="dark"` on html element
- **Theme**: Black background (`hsl(0 0% 3.9%)`) with white text and grey accents
- **Shadcn Integration**: Components use theme-aware CSS variables for consistent dark styling

### Component-Specific Styling
- Shadcn UI components for draggable elements (PromptBox, StepsBar)
- Tailwind utilities for positioning and responsive design
- Custom CSS overrides for React Flow Controls and MiniMap dark theming
- Fixed positioning with full dark background compatibility

## Usage

### Running the Application
1. Install dependencies: `npm install`
2. Start development server: `npm run dev`
3. Open browser to `http://localhost:3000`

### Development
- **Hot Reload**: Next.js supports automatic reloading on code changes
- **Build**: `npm run build` for production build
- **Linting**: `npm run lint` for code quality checks

## Next Steps

Based on `rough_idea.md`, the application is designed to evolve into a full image generation pipeline with:
- LLM-powered plan generation (Gemini)
- Web Worker execution for image processing
- IndexedDB storage for images
- API integrations for image editing

Current implementation covers Epic 1: Visual Canvas Foundation, providing the base UI for all future features.

## Notes

- All components are client components due to React Flow and hook requirements
- Positioning logic for floating UI uses window-relative coordinates
- Initial dummy data uses placeholder images for testing layout
- State persistence not yet implemented (future: IndexedDB integration)

For detailed requirements and roadmap, see `docs/epic1.md` and `docs/rough_idea.md`.