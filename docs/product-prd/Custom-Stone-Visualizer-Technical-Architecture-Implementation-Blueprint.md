# Technical Implementation & Architecture Blueprint: Custom Stone Visualizer

## 1\. Architectural Vision and High-Level Overview

This blueprint defines a strategic shift from fragmented, multi-model pipelines toward a unified, generative AI architecture leveraging Gemini 3.7 Flash and 3 Pro (which is to be referred to as the "Nano Banana" architecture). Our architecture collapses requirements for scene classification, semantic segmentation, and depth estimation into a single inference layer.

By utilizing the Nano Banana architecture’s native spatial representations, we eliminate the need for explicit 3D homography. This approach ensures stone textures are realistically synthesized within the scene’s existing physical context, accounting for semantic occlusions and complex lighting.

### Technical Mission Statement

To architect a high-fidelity visualization engine that delivers photorealistic material transformations in under 3 seconds, using generative inpainting to solve complex occlusion and lighting challenges.

| Problem to Solve           | Architectural Solution                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| **Decision Fatigue**       | Real-time, context-aware visualization using high-resolution, tileable stone assets.          |
| **Perspective Geometry**   | The Nano Banana architecture’s native spatial understanding and automated perspective tiling. |
| **Occlusion**              | Latent depth representation and semantic masking, removing separate depth models.             |
| **Lighting Inconsistency** | Diffusion-based inpainting preserving ambient occlusion and original contact shadows.         |

This foundational infrastructure bridges the gap between raw property imagery and immersive design, powered by a modern, decoupled technology stack.

## 2\. System Architecture & Component Stack

We deploy a decoupled architecture to isolate GPU-intensive AI inference from the user interface request-response cycle, ensuring the frontend remains performant and non-blocking.

- **Frontend:** Next.js manages state for toggles and galleries, providing robust image optimization and complex client-side state management.
- **Backend Orchestration:** Python/FastAPI handles the orchestration layer, offering superior Pydantic-based validation and direct AI library integration.
- **AI Engine:** Gemini 3.7 Flash and 3 Pro (Nano Banana) serve as the primary inference layer for scene-aware inpainting and material editing.

### Non-Functional Requirements

| Requirement      | Metric           | Strategy                                                |
| :--------------- | :--------------- | :------------------------------------------------------ |
| **Performance**  | \< 3s Feedback   | Edge caching via CDN and WebSockets for status updates. |
| **Scalability**  | Dynamic Handling | Kubernetes HPA and regional-locked GPU instances.       |
| **Availability** | 99.9% Uptime     | Multi-region deployment and circuit breaker patterns.   |

This infrastructure provides the stability required to support the sophisticated logic of the automated AI pipeline.

## 3\. The Core AI Inpainting Pipeline

- The architecture prioritizes generative inpainting over traditional graphics techniques. By using semantic awareness, the pipeline "paints" stone textures around and under objects realistically, preserving the scene's physical integrity.
- **Step 0: Scene Categorization:** A lightweight classifier categorizes the scene as Interior or Exterior to inform segmentation granularity.
- **Step 1: Semantic Masking:** The system targets specific semantic classes (e.g., 'floors' or 'pavements') using MASK_MODE_SEMANTIC for precise isolation.
- **Step 2: Inpainting Execution:** The backend constructs a dynamic prompt combining stone selection with environmental context.
- _Payload Logic:_ photorealistic Stone_Type Surface_Type, 8k resolution, maintaining existing shadows and ambient occlusion.
- **Step 3: Rendering Intelligence:** Native depth understanding handles perspective tiling and occlusion, ensuring textures extend correctly beneath furniture.

## 4\. Texture Catalog & Prompt Strategy

High-resolution, tileable textures are stored with "Physical Scale Metadata." A Prompt Translation Framework converts these selections into technical instructions to ensure the AI renders materials at the correct physical scale relative to perspective.

- _Example:_ If a user selects "Large Flagstone," the metadata injects "large 12x12 inch irregular slabs" into the prompt to ensure the AI renders the stones at the correct physical scale relative to the room's perspective.

## 5\. Privacy, Security, and Governance

As users upload private property photos, a "Privacy-First" architecture is non-negotiable. **Secure Processing Protocols**

- **In-Flight Security:** Data transmissions are enforced via TLS 1.3 protocols.
- **At-Rest Security:** Buffered data is encrypted using AES-256 standards.
- **Auto-Deletion:** S3 Lifecycle Policies (TTL) ensure all user-uploaded images and temporary data are purged within 24 hours.

## 6\. Strategic Implementation Roadmap

### Milestone 1: Core API & Pipeline Integration

- Establish Nano Banana (Gemini 3.7 Flash and 3 Pro) API connectivity and perform latency benchmarking.
- Validate semantic masking accuracy across diverse interior and exterior scenes.
- Implement initial scene categorization logic.

### Milestone 2: UI/UX Interaction Layer

- Develop Next.js frontend with "Before/After" comparison tools.
- Build the Texture Catalog and Prompt Translation Framework.
- Integrate WebSocket-based progress indicators.

### Milestone 3: Production Scale & Optimization

- Deploy Kubernetes HPA for automated orchestration scaling.
- Implement Super-Resolution upscaling for 4K final renderings.
- Conduct final security audits and penetration testing.

## Pricing for Image Generation Mode

- **Trial:** 50 generations (14-day)
- **Starter:** 200 generations ($19/mo)
- **Growth:** 600 generations ($49/mo)
- **Pro:** 1500 generations ($99/mo)
- **Overage:** $0.08 per generation
