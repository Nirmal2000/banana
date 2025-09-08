# Epic 2 Implementation Summary

## Completed Server-Side Components

### Overview
Implementation of the core creative engine using Server-Sent Events (SSE) architecture for real-time image variation generation. Backend handles both base case (new image generation) and variation case (5 edits from an existing image). Images are cached temporarily in Redis and fetched by the client on demand.

### Key Components

#### 1. Plans Library (`src/lib/plans.js`)
- **Purpose**: Defines 5 fixed, hardcoded edit plans for image variations
- **Structure**: Each plan is an array of steps with `op`, `params` (e.g., {op: 'brightness', params: {value: 20}})
- **Plans Include**:
  - Brightness/Contrast adjustments
  - Saturation and Hue shifts
  - Filter effects (grayscale, sepia)
  - Tint applications
  - Rotation
  - Google AI-powered enhancements
- **Usage**: Plans are applied sequentially to generate variations
  

#### 2. Image Processor (`src/lib/imageProcessor.js`)
- **Core Function**: `applyStep(buffer, step)` - processes individual edit steps
- **Local Operations**: Uses Sharp library for fast image manipulation
  - Brightness: `modulate({ brightness: factor })`
  - Contrast: `linear(multiplier, offset)`
  - Saturation: `modulate({ saturation: factor })`
  - Hue: `modulate({ hue: degrees })`
  - Grayscale: `grayscale()`
  - Tint: overlay via `composite` with alpha strength
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
  - `step-result`: For each step, contains `variationId`, `stepIndex`, and a Redis `key`
  - `end`: Final event on completion
  - `error`: On failures
- **Architecture**: Uses ReadableStream for server-side streaming
- **Environment**: Requires GOOGLE_API_KEY for AI calls

#### 4. Ephemeral Image Cache (Redis)
- **Module**: `src/lib/redis.js`
- **Purpose**: Store step result images as Data URLs temporarily to keep SSE payloads small and avoid localStorage limits.
- **Keys**: `image:${variationId}:${stepIndex}`
- **TTL**: 3600 seconds (1 hour) per image (`EX: 3600`)
- **Usage in SSE Route**: After each step, the server stores the Data URL in Redis and emits the `key` via SSE. The client then fetches the image by key.

#### 5. Images API (`src/app/api/images/[key]/route.js`)
- **Path**: `/api/images/[key]`
- **Method**: GET
- **Behavior**: Reads the Data URL from Redis and responds with `text/plain`. Used by the client to retrieve each step image using the emitted key.

### Technical Architecture

#### Image Processing Pipeline
1. Receive image buffer and plan sequence
2. Apply each step sequentially using Sharp for local ops
3. For `googleEdit` steps, convert to base64 and call Google AI
4. Store Data URLs in Redis, stream lightweight `key` references via SSE
5. Handle errors gracefully without breaking stream

#### Dependencies
- `sharp`: Fast image processing
- `@langchain/google-genai`: Google Gemini AI integration
- `redis`: Node Redis client for ephemeral image cache
- `uuid`: For generating IDs (frontend)

### Integration Points with Epic 1

- **Zustand Store**: Tracks variation nodes and progress
- **Frontend Components**:
  - `PromptBox`: Initiate SSE requests
  - `ImageNode`: Display generated variations
  - `StepsBar`: Show real-time progress
- **Dexie**: Persistent image storage for variation case (IndexedDB)

#### Persistence & Storage
- **Graph State**: Persisted with Zustand `persist` middleware to `localStorage` (`graph-storage`). To avoid quota errors, `imageUrl` fields are stripped before persisting.
- **Images**: Persisted in Dexie (`IndexedDB`) per node for cross-session availability.
- **Ephemeral Step Results**: Cached in Redis and fetched via `/api/images/[key]` during a generation session.

### Remaining Frontend Work

1. **Zustand Store Updates**:
   - Add variation node tracking
   - Progress state management
   - Real-time image updates

2. **PromptBox Modifications**:
   - Base case: Send JSON with new nodeId
   - Variation case: Send FormData with selected image and 5 variationIds
   - Client consumes SSE, then fetches each step image via `/api/images/[key]`

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
npm install sharp @langchain/google-genai redis uuid dexie

# Environment variables
GOOGLE_API_KEY=your_google_ai_key_here
GOOGLE_IMAGE_MODEL=gemini-2.5-flash-image-preview
REDIS_URL=redis://localhost:6379
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
✅ State persistence implemented (images excluded from localStorage)
✅ Dexie image storage integrated
✅ Redis cache for step images integrated

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
