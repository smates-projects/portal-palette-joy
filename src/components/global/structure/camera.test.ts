import { describe, expect, it } from "vitest";
import { centerOn, clampScale, fitCamera, MAX_SCALE, MIN_SCALE, panBy, scaleAfterWheel, zoomAround } from "./camera";

const panel = { width: 1000, height: 600 };
const toPanel = (c: { x: number; y: number; scale: number }, world: { x: number; y: number }) => ({ x: world.x * c.scale + c.x, y: world.y * c.scale + c.y });

describe("diagram camera", () => {
  it("clamps the zoom between 30% and 150%", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(9)).toBe(MAX_SCALE);
    expect(clampScale(0.8)).toBe(0.8);
  });

  it("fits a wide tree into the panel, centered", () => {
    const camera = fitCamera({ width: 2000, height: 500 }, panel, 0);
    expect(camera.scale).toBeCloseTo(0.5);
    expect(camera.x).toBeCloseTo(0);
    expect(camera.y).toBeCloseTo((600 - 250) / 2);
  });

  it("does not enlarge a small tree and centers it", () => {
    const camera = fitCamera({ width: 400, height: 200 }, panel);
    expect(camera.scale).toBe(1);
    expect(camera).toMatchObject({ x: 300, y: 200 });
  });

  it("never goes under the minimum zoom, even if the tree does not fit", () => {
    expect(fitCamera({ width: 20000, height: 500 }, panel).scale).toBe(MIN_SCALE);
  });

  it("zooms around a point: the tree point under the pointer does not move", () => {
    const camera = { x: 40, y: -20, scale: 0.6 };
    const anchor = { x: 300, y: 250 };
    const world = { x: (anchor.x - camera.x) / camera.scale, y: (anchor.y - camera.y) / camera.scale };
    for (const next of [0.9, 1.4, 0.35]) {
      const zoomed = zoomAround(camera, next, anchor);
      expect(zoomed.scale).toBeCloseTo(next);
      const after = toPanel(zoomed, world);
      expect(after.x).toBeCloseTo(anchor.x);
      expect(after.y).toBeCloseTo(anchor.y);
    }
  });

  it("clamps the zoom around a point too", () => {
    expect(zoomAround({ x: 0, y: 0, scale: 1 }, 5, { x: 10, y: 10 }).scale).toBe(MAX_SCALE);
  });

  it("pans without touching the zoom", () => {
    expect(panBy({ x: 10, y: 10, scale: 0.7 }, -4, 6)).toEqual({ x: 6, y: 16, scale: 0.7 });
  });

  it("centers a tree point in the panel", () => {
    const camera = centerOn({ x: 800, y: 300 }, 0.5, panel);
    expect(toPanel(camera, { x: 800, y: 300 })).toEqual({ x: 500, y: 300 });
  });

  it("zooms in with a negative wheel delta and out with a positive one, within the limits", () => {
    expect(scaleAfterWheel(1, -100)).toBeGreaterThan(1);
    expect(scaleAfterWheel(1, 100)).toBeLessThan(1);
    expect(scaleAfterWheel(1, -5)).toBeGreaterThan(1);
    expect(scaleAfterWheel(1.5, -1000)).toBe(MAX_SCALE);
    expect(scaleAfterWheel(0.3, 1000)).toBe(MIN_SCALE);
  });
});
