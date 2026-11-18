// FRAME original shader: no third-party noise or shader source is copied here.
// The vertex shader stretches one triangle over the canvas; no scene or camera.
export const ambientVertex = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

export const ambientFragment = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uStars;
uniform vec3 uBlue;
uniform vec3 uPurple;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(83.17, 219.43))) * 17683.71);
}
// Smoothly interpolate a deterministic grid, then add only four cloud scales.
float noise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell), hash(cell + vec2(1., 0.)), s.x),
             mix(hash(cell + vec2(0., 1.)), hash(cell + 1.), s.x), s.y);
}
float cloud(vec2 p) {
  float sum = 0., weight = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += weight * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.7;
    weight *= 0.5;
  }
  return sum;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float t = uTime * 0.035;
  vec2 warp = vec2(cloud(p * 1.7 + vec2(t, 0.)), cloud(p * 1.7 - vec2(0., t)));
  float field = cloud(p * 3.2 + (warp - 0.5) * 1.3 + vec2(t * 0.3, -t * 0.2));
  float wisps = smoothstep(0.24, 0.79, field);
  float center = smoothstep(0.12, 0.8, length(p * vec2(0.8, 1.3)));
  vec3 color = vec3(0.006, 0.012, 0.027);
  color += mix(uBlue, uPurple, cloud(p * 1.9 - t * 0.2)) * wisps * center * uIntensity;
  // Stars are fixed in space and time; density changes only the selection mask.
  vec2 grid = uv * vec2(uResolution.x / uResolution.y, 1.) * 85.;
  vec2 cell = floor(grid);
  vec2 point = vec2(hash(cell + 11.), hash(cell + 27.));
  float star = (1. - smoothstep(0.01, 0.09, length(fract(grid) - point)));
  star *= step(1. - uStars * 0.012, hash(cell + 49.)) * step(0.001, uStars);
  color += vec3(0.55, 0.64, 0.8) * star * center * 0.65;
  gl_FragColor = vec4(color, 1.0);
}
`;
