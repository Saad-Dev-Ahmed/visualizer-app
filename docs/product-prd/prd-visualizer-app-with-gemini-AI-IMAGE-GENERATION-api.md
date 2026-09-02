## Product Overview & Core Flow

The custom stone visualizer application empowers users to seamlessly blend various stone textures onto existing floors or exterior walkways. By leveraging a single foundational AI model(Gemini-Image-Generation Model: Google Imagen 3), the application minimizes infrastructure overhead while delivering photorealistic, perspective-accurate renderings.

- **Image Upload & Scene Processing:** Users upload interior or exterior property images directly into the visualizer interface.
- **Stone Selection Gallery:** An integrated library allows users to select from a variety of high-resolution stone textures.
- **Automated Editing Pipeline:** The system automatically masks the target surface and applies the chosen stone, preserving original lighting, shadows, and occluding objects like furniture or curbs.

## Technical Architecture

To handle rapid image processing and maintain a robust application structure, the technology stack must prioritize scalability and performance.

- **Frontend Environment:** A Next.js application will manage the user interface, providing swift rendering for the stone selection gallery and before/after comparison views.
- **Backend Orchestration:** A backend built with Node.js and Express, or Python and FastAPI, will securely handle image payloads, authenticate requests, and route them to external AI services.
- **State Management:** The architecture will ensure non-blocking UI updates while waiting for asynchronous image generation tasks to complete.

## API Integration Strategy

Using the Google Imagen 3 API simplifies the blending mechanism by replacing multiple custom machine learning models with native, multimodal AI endpoints.

- **Target Masking:** Utilize the `MaskReferenceImage` configuration with `MASK_MODE_SEMANTIC` to automatically isolate specific classes like a floor or walkway without requiring manual user masking.
- **Inpainting Execution:** Send the original image, the semantic mask, and a highly descriptive prompt detailing the chosen stone texture via the API's inpainting editing mode.
- **Perspective & Lighting Retention:** Rely on the diffusion model's native spatial understanding to automatically calculate realistic perspective tiling, ambient occlusion, and contact shadows beneath foreground elements.

## UI/UX & Non-Functional Goals

To ensure the visualizer is intuitive and responsive, specific experience and performance metrics must be prioritized.

- **Rapid Feedback Loop:** Optimize network calls to ensure the visualizer returns the generated image within a few seconds of a user's selection.
- **Responsive Layout:** Provide a clean, minimal canvas area that scales flawlessly across desktop and mobile devices.
- **Secure Processing:** Enforce strict data handling policies for user-uploaded property photos, ensuring temporary memory storage and automatic deletion protocols are actively maintained.

What specific latency threshold do you want to define for the round-trip API processing time to ensure the best experience for your users?
