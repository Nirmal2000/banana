# Epic 2 Implementation Summary

## Completed Server-Side Components

### Overview
Implementation of the core creative engine using Server-Sent Events (SSE) architecture for real-time image variation generation. Backend handles both base case (new image generation) and variation case (5 edits from an existing image).

### Key Components

#### 1. Plans Library (`src/lib/plans.js`)
- **Purpose**: Defines 5 fixed, hardcoded edit plans for image variations
- **Structure**: Each plan is an array of steps with `op`, `params` (e.g., {op: 'brightness', params: {value: 20}})
- **Plans Include**:
  - Brightness/Contrast adjustments
  - Saturation and Hue shifts
  - Filter effects (grayscale, sepia, negative)
  - Tint applications
  - Rotation
  - Google AI-powered enhancements
- **Usage**: Plans are applied sequentially to generate variations

#### 2. Image Processor (`src/lib/imageProcessor.js`)
- **Core Function**: `applyStep(buffer, step)` - processes individual edit steps
- **Local Operations**: Uses Sharp library for fast image manipulation
  - Brightness: `sharp().brightness(factor)`
  - Contrast: `sharp().contrast(factor)`
  - Saturation: `modulate({saturation: factor})`
  - Hue: `modulate({hue: degrees})`
  - Grayscale: `grayscale()`
  - Tint: `tint(color).opcacity(alpha)`
  - Rotate: `rotate(degrees)`
- **Google AI Integration**:
  - Using @langchain/google-genai ChatGoogleGenerativeAI
  - Converts image buffer to base64, sends prompt + image
  - Extracts generated image from AI response
  - Environment: GOOGLE_API_KEY required
- **Error Handling**: Falls back to original buffer on errors

#### 3. SSE Generation Endpoint (`src/app/api/generate-variations/route.js`)
- **Path**: `/api/generate-variations`
- **Method**: POST
- **Request Handling**:
  - Base Case: JSON {prompt, nodeId}
  - Variation Case: FormData {prompt, image, variationIds: JSON.stringify([id1,id2,...,id5])}
- **SSE Stream Events**:
  - `plans`: Sent first, contains variationId to plan mapping
  - `step-result`: For each step completion, contains variationId, stepIndex, image (base64)
  - `end`: Final event on completion
  - `error`: On failures
- **Architecture**: Uses ReadableStream for server-side streaming
- **Environment**: Requires GOOGLE_API_KEY for AI calls

### Technical Architecture

#### Image Processing Pipeline
1. Receive image buffer and plan sequence
2. Apply each step sequentially using Sharp for local ops
3. For `googleEdit` steps, convert to base64 and call Google AI
4. Stream Base64-encoded results via SSE
5. Handle errors gracefully without breaking stream

#### Dependencies
- `sharp`: Fast image processing (already installed)
- `@langchain/google-genai`: Google Gemini AI integration
- `uuid`: For generating IDs (if needed)
- `formidable`: Multipart form parsing (if needed)

### Integration Points with Epic 1

- **Zustand Store**: Will be updated to track variation nodes and progress
- **Frontend Components**:
  - `PromptBox`: Initiate SSE requests
  - `ImageNode`: Display generated variations
  - `StepsBar`: Show real-time progress
- **Dexie**: Persistent image storage for variation case

### Remaining Frontend Work

1. **Zustand Store Updates**:
   - Add variation node tracking
   - Progress state management
   - Real-time image updates

2. **PromptBox Modifications**:
   - Base case: Send JSON with new nodeId
   - Variation case: Send FormData with selected image and 5 variationIds

3. **SSE Client Integration**:
   - EventSource connection
   - Parse events: plans, step-result, end, error
   - Update store with progress and images

4. **StepsBar Enhancement**:
   - Track server-side step completion
   - UI updates for focused/single variation vs overview

5. **Dexie Integration**:
   - Store/retrieve images from local IndexedDB
   - Enable variation case image sending

### Environmental Setup

```bash
# Install dependencies
npm install sharp @langchain/google-genai uuid formidable

# Environment variables
GOOGLE_API_KEY=your_google_ai_key_here
```

### Testing Strategy

- **Base Case**: Generate new image, confirm SSE stream and image display
- **Variation Case**: Select existing node, generate 5 variations, verify streaming
- **Error Handling**: Invalid prompts, AI failures, network issues
- **Performance**: Monitor stream latency, image processing times
- **Compatibility**: Test with different image formats and sizes

## Current Status

✅ Server-side SSE architecture implemented
✅ Image processing pipeline ready
✅ Google AI integration complete
✅ Real-time streaming events defined
✅ Frontend integration complete
✅ State persistence implemented
✅ Dexie image storage integrated

This implementation provides the complete Epic 2 experience - real-time, server-driven image generation with transparent progress updates, persistent state, and cross-session data retention.

## Chat Log Summary & Implementation Notes

### Key Discussions During Development:

**1. StepsBar Play/Pause/Cancel Functionality:**
- **Play Button**: Currently placeholder (onClick empty) - intended for future pause/resume functionality
- **Pause Button**: Not rendered in UI (imported but unused) - potential for buffering stream during pause
- **Cancel/Square Button**: Functional - stops generation, sets generationActive=false, clears execution state
- **Current Behavior**: Generation runs continuously until completion or cancellation

**2. Dexie Purpose & Architecture:**
- **Primary Role**: IndexedDB wrapper for image persistence (handles large binary data)
- **Vs localStorage**: Dexie can store images as blobs/arrays; localStorage is text-only with size limits
- **Usage Pattern**: Save image on generation (`updateNodeImage`), retrieve for variations (`getImage`)
- **Integration**: Seamlessly with Zustand store for cross-session data

**3. Graph State Persistence:**
- **Implementation**: Zustand persist middleware with localStorage
- **What Gets Saved**: Nodes, edges, selectedNodeId
- **What Doesn't Get Saved**: Transient states (generationActive, currentExecution, variationProgress)
- **Effect**: Graph structure survives page reloads, images reload from Dexie

**4. Implementation Highlights:**
- **SSE Handling**: Manual stream consumption due to POST endpoint structure
- **Dark Theme**: Consistent black/white theme across all components
- **Error Handling**: Graceful fallbacks for failed image operations
- **Node Selection**: Direct ReactFlow integration for selecting variation targets
- **Loading States**: Visual feedback during image generation
- **Performance**: ImageStorage optimized with IndexedDB, lazy loading where needed

### Environment Setup:
```bash
# Additional dependencies installed:
npm install dexie

# Environment variables:
GOOGLE_API_KEY=your_google_ai_key_here
GOOGLE_IMAGE_MODEL=gemini-2.5-flash-image-preview
```

### Testing Considerations:
- Base/Variation case workflows
- SSE stream reliability and error recovery
- State persistence across browser sessions
- Image loading from Dexie on reload
- Performance with multiple generations
- Error handling for invalid image data or API failures