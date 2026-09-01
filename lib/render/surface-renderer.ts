/**
 * Composites a synthetic surface into a photograph.
 *
 * The trick that makes this read as real rather than as a sticker is that the
 * new surface only supplies *colour*. All of the light — the sun, the shadow
 * cast by the hedge, the fall-off toward the house — is lifted straight out of
 * the original photograph and multiplied back over the aggregate. Perspective
 * comes from a homography between the ground plane and the image.
 */

import {
  homographyFromQuad,
  invert3,
  apply3,
  toColumnMajor,
  negate3,
  type Mat3,
  type Quad,
} from "./homography";
import { FLOOR_TILE_METRES } from "@/lib/texture/aggregate";

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_photo;   // original, full resolution
uniform sampler2D u_light;   // heavily downsampled photo = the lighting field
uniform sampler2D u_mask;    // 1 where the surface may be replaced
uniform sampler2D u_tex;     // tiling aggregate, mipmapped, repeating

uniform mat3  u_hinv;        // image uv -> unit square on the ground plane
uniform vec2  u_planeMetres; // real size of that unit square
uniform float u_tileMetres;  // real size the aggregate tile covers
uniform float u_scale;       // user zoom on the aggregate
uniform float u_rot;
uniform vec2  u_offset;

uniform float u_refLuma;     // mean brightness of the original surface
uniform float u_shading;     // contrast of the transferred light
uniform float u_colorCast;   // how much ambient colour to carry over
uniform float u_detail;      // how much original micro-contrast to keep
uniform float u_macro;       // patchiness of the laid surface
uniform float u_strength;
uniform float u_split;       // compare wipe position, in image uv
uniform float u_splitOn;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
  vec3 photo = texture(u_photo, v_uv).rgb;

  vec3 q = u_hinv * vec3(v_uv, 1.0);
  float m = texture(u_mask, v_uv).r * u_strength;

  // Points at or beyond the horizon have no valid ground position.
  if (q.z <= 1e-5) m = 0.0;
  if (u_splitOn > 0.5 && v_uv.x < u_split) m = 0.0;

  if (m <= 0.001) {
    fragColor = vec4(photo, 1.0);
    return;
  }

  vec2 plane = (q.xy / q.z) * u_planeMetres;
  float c = cos(u_rot), s = sin(u_rot);
  vec2 rotated = vec2(plane.x * c - plane.y * s, plane.x * s + plane.y * c);
  vec2 uv = rotated / (u_tileMetres * u_scale) + u_offset;

  // A little negative mip bias keeps the grain legible under the heavy
  // minification perspective forces at the far end of a driveway.
  vec3 tex = texture(u_tex, uv, -0.6).rgb;

  // Laid aggregate is never perfectly even: the colour drifts in patches over
  // half a metre or so. Reading the same tile at a fraction of the rate is a
  // cheap and still-seamless way to get that drift back.
  float macro = dot(texture(u_tex, uv * 0.13).rgb, LUMA);
  tex *= mix(1.0, 0.74 + macro * 0.58, u_macro);

  vec3 light = texture(u_light, v_uv).rgb;
  float ll = dot(light, LUMA);
  float ratio = clamp(ll / max(u_refLuma, 0.001), 0.16, 2.8);
  float shade = pow(ratio, u_shading);

  // Chromaticity of the light falling on this spot: warm sun, cool shade.
  vec3 tint = light / max(ll, 0.001);
  vec3 lit = tex * shade * mix(vec3(1.0), tint, u_colorCast);

  // Put back the fine detail the downsample threw away — the crisp edges of
  // leaf shadows, tyre marks, the darkening where the surface meets a kerb.
  float detail = dot(photo, LUMA) - ll;
  lit += detail * u_detail;

  fragColor = vec4(mix(photo, clamp(lit, 0.0, 1.0), m), 1.0);
}`;

export type SceneGeometry = {
  /** Ground-plane reference rectangle, in normalised image coordinates. */
  quad: Quad;
  /** Real-world size of that rectangle, in metres. */
  planeMetres: [number, number];
};

export type SurfaceParams = {
  scale: number;
  rotation: number;
  offset: [number, number];
  shading: number;
  colorCast: number;
  detail: number;
  /** 0-1. How patchy the laid surface looks. */
  macro: number;
  strength: number;
  /** Null hides the wipe; otherwise the split position in 0..1. */
  split: number | null;
};

export const DEFAULT_PARAMS: SurfaceParams = {
  scale: 1,
  rotation: 0,
  offset: [0, 0],
  shading: 1.0,
  colorCast: 0.32,
  detail: 0.35,
  macro: 0.5,
  strength: 1,
  split: null,
};

export class SurfaceRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private texPhoto: WebGLTexture;
  private texLight: WebGLTexture;
  private texMask: WebGLTexture;
  private texAgg: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private buffer: WebGLBuffer;
  private maxAniso = 1;

  private geometry: SceneGeometry | null = null;
  private hinv: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private refLuma = 0.5;
  private params: SurfaceParams = { ...DEFAULT_PARAMS };
  private hasTexture = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 is required for the visualizer.");
    // A canvas hands back the same context object forever, including after that
    // context has been lost, and every call on a lost context fails silently.
    if (gl.isContextLost()) {
      throw new Error("The graphics context for this canvas was lost.");
    }
    this.gl = gl;

    this.program = link(gl, VERT, FRAG);
    gl.useProgram(this.program);
    for (const name of [
      "u_photo", "u_light", "u_mask", "u_tex", "u_hinv", "u_planeMetres",
      "u_tileMetres", "u_scale", "u_rot", "u_offset", "u_refLuma", "u_shading",
      "u_colorCast", "u_detail", "u_macro", "u_strength", "u_split", "u_splitOn",
    ]) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(this.program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    if (aniso) {
      this.maxAniso = Math.min(
        8,
        gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
      );
      this.anisoExt = aniso;
    }

    this.texPhoto = this.makeTexture(gl.CLAMP_TO_EDGE, false);
    this.texLight = this.makeTexture(gl.CLAMP_TO_EDGE, false);
    this.texMask = this.makeTexture(gl.CLAMP_TO_EDGE, false);
    this.texAgg = this.makeTexture(gl.REPEAT, true);

    gl.uniform1i(this.uniforms.u_photo, 0);
    gl.uniform1i(this.uniforms.u_light, 1);
    gl.uniform1i(this.uniforms.u_mask, 2);
    gl.uniform1i(this.uniforms.u_tex, 3);
  }

  private anisoExt: EXT_texture_filter_anisotropic | null = null;

  private makeTexture(wrap: number, mip: boolean): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR
    );
    return t;
  }

  /** Loads the photograph plus its mask, and derives the lighting field. */
  setScene(
    photo: HTMLImageElement | HTMLCanvasElement,
    mask: HTMLImageElement | HTMLCanvasElement,
    geometry: SceneGeometry
  ) {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.bindTexture(gl.TEXTURE_2D, this.texPhoto);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo);

    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);

    const { light, refLuma } = buildLightingField(photo, mask);
    gl.bindTexture(gl.TEXTURE_2D, this.texLight);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, light);
    this.refLuma = refLuma;

    this.setGeometry(geometry);
  }

  setGeometry(geometry: SceneGeometry) {
    this.geometry = geometry;
    const h = homographyFromQuad(geometry.quad);
    let hinv = invert3(h);
    // Orient the inverse so the ground in front of the camera has positive w;
    // everything at or past the horizon is then rejected by a single test.
    const cx = (geometry.quad[0][0] + geometry.quad[2][0]) / 2;
    const cy = (geometry.quad[0][1] + geometry.quad[2][1]) / 2;
    if (apply3(hinv, [cx, cy])[2] < 0) hinv = negate3(hinv);
    this.hinv = hinv;
  }

  setAggregate(tile: ImageData) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texAgg);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tile);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (this.anisoExt) {
      gl.texParameterf(
        gl.TEXTURE_2D,
        this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,
        this.maxAniso
      );
    }
    this.hasTexture = true;
  }

  setParams(patch: Partial<SurfaceParams>) {
    this.params = { ...this.params, ...patch };
  }

  getParams(): SurfaceParams {
    return this.params;
  }

  resize(width: number, height: number) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  render() {
    const gl = this.gl;
    const p = this.params;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texPhoto);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texLight);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.texAgg);

    gl.uniformMatrix3fv(this.uniforms.u_hinv, false, toColumnMajor(this.hinv));
    const metres = this.geometry?.planeMetres ?? [1, 1];
    gl.uniform2f(this.uniforms.u_planeMetres, metres[0], metres[1]);
    gl.uniform1f(this.uniforms.u_tileMetres, FLOOR_TILE_METRES);
    gl.uniform1f(this.uniforms.u_scale, p.scale);
    gl.uniform1f(this.uniforms.u_rot, p.rotation);
    gl.uniform2f(this.uniforms.u_offset, p.offset[0], p.offset[1]);
    gl.uniform1f(this.uniforms.u_refLuma, this.refLuma);
    gl.uniform1f(this.uniforms.u_shading, p.shading);
    gl.uniform1f(this.uniforms.u_colorCast, p.colorCast);
    gl.uniform1f(this.uniforms.u_detail, p.detail);
    gl.uniform1f(this.uniforms.u_macro, p.macro);
    gl.uniform1f(this.uniforms.u_strength, this.hasTexture ? p.strength : 0);
    gl.uniform1f(this.uniforms.u_split, p.split ?? 0);
    gl.uniform1f(this.uniforms.u_splitOn, p.split === null ? 0 : 1);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Releases the objects this renderer allocated, but deliberately leaves the
   * context alive: the canvas would keep handing the lost context back to the
   * next renderer built on it. React Strict Mode mounts, unmounts and remounts
   * in development, so that path is hit on every page load.
   */
  dispose() {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.texPhoto);
    gl.deleteTexture(this.texLight);
    gl.deleteTexture(this.texMask);
    gl.deleteTexture(this.texAgg);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
  }
}

/* ------------------------------------------------------------------ */

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // A lost context reports every query as null, so name that case rather
    // than blaming the shader source for it.
    const log = gl.getShaderInfoLog(sh);
    throw new Error(
      log ||
        (gl.isContextLost()
          ? "The graphics context was lost while starting up."
          : "The surface shader could not be compiled.")
    );
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
  }
  return p;
}

/**
 * Downsampling *is* the low-pass: the small canvas keeps the sun, shadows and
 * vignetting but drops the texture of whatever surface is currently there, so
 * the old aggregate's grain is not printed on top of the new one.
 */
function buildLightingField(
  photo: HTMLImageElement | HTMLCanvasElement,
  mask: HTMLImageElement | HTMLCanvasElement
): { light: HTMLCanvasElement; refLuma: number } {
  const srcW = "naturalWidth" in photo ? photo.naturalWidth : photo.width;
  const srcH = "naturalHeight" in photo ? photo.naturalHeight : photo.height;
  const w = 96;
  const h = Math.max(1, Math.round((w * srcH) / srcW));

  const light = document.createElement("canvas");
  light.width = w;
  light.height = h;
  const lc = light.getContext("2d", { willReadFrequently: true })!;
  lc.imageSmoothingEnabled = true;
  lc.imageSmoothingQuality = "high";
  lc.drawImage(photo, 0, 0, w, h);

  const mc = document.createElement("canvas");
  mc.width = w;
  mc.height = h;
  const mctx = mc.getContext("2d", { willReadFrequently: true })!;
  mctx.drawImage(mask, 0, 0, w, h);

  const lp = lc.getImageData(0, 0, w, h).data;
  const mp = mctx.getImageData(0, 0, w, h).data;

  let sum = 0;
  let weight = 0;
  for (let i = 0; i < w * h; i++) {
    const a = mp[i * 4] / 255;
    if (a < 0.5) continue;
    const l =
      (0.2126 * lp[i * 4] + 0.7152 * lp[i * 4 + 1] + 0.0722 * lp[i * 4 + 2]) / 255;
    sum += l * a;
    weight += a;
  }

  return { light, refLuma: weight > 0 ? sum / weight : 0.5 };
}
