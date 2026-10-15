/**
 * Camera of the structure diagram: pure math, no DOM. The tree is drawn in a layer moved with
 * `translate(x, y) scale(scale)` from its top-left corner, so a point of the tree (world) lands on the panel at
 * `world * scale + (x, y)`.
 */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 1.5;
/** Each press of + or - multiplies the zoom by this. */
export const ZOOM_STEP = 1.2;

export const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Camera that fits the whole content inside the panel, centered. Never enlarges past 100%. */
export function fitCamera(content: Size, panel: Size, margin = 16): Camera {
  if (content.width <= 0 || content.height <= 0) return { x: 0, y: 0, scale: 1 };
  const fit = Math.min((panel.width - 2 * margin) / content.width, (panel.height - 2 * margin) / content.height);
  const scale = clampScale(Math.min(1, fit));
  return { scale, x: (panel.width - content.width * scale) / 2, y: (panel.height - content.height * scale) / 2 };
}

/** Changes the zoom keeping the tree point under `anchor` (in panel pixels) where it is. */
export function zoomAround(camera: Camera, nextScale: number, anchor: Point): Camera {
  const scale = clampScale(nextScale);
  const ratio = scale / camera.scale;
  return { scale, x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio };
}

export const panBy = (camera: Camera, dx: number, dy: number): Camera => ({ ...camera, x: camera.x + dx, y: camera.y + dy });

/** Camera with the tree point `world` in the middle of the panel. */
export const centerOn = (world: Point, scale: number, panel: Size): Camera => {
  const next = clampScale(scale);
  return { scale: next, x: panel.width / 2 - world.x * next, y: panel.height / 2 - world.y * next };
};

/** Zoom after one wheel event: trackpad pinch sends small deltas, a mouse wheel sends big notches. */
export const scaleAfterWheel = (scale: number, delta: number): number =>
  clampScale(scale * Math.exp(-delta * (Math.abs(delta) < 50 ? 0.01 : 0.0015)));
