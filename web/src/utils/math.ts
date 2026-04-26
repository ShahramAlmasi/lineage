export interface Position {
  x: number;
  y: number;
}

export interface Direction {
  dx: number;
  dy: number;
}

export function distanceTo(
  pos1: Position,
  pos2: Position,
  width: number,
  height: number,
): number {
  const dx = Math.abs(pos1.x - pos2.x);
  const dy = Math.abs(pos1.y - pos2.y);
  return Math.hypot(
    Math.min(dx, width - dx),
    Math.min(dy, height - dy),
  );
}

export function directionTo(
  from: Position,
  to: Position,
  width: number,
  height: number,
): Direction {
  let dx = to.x - from.x;
  let dy = to.y - from.y;

  if (dx > width / 2) dx -= width;
  else if (dx < -width / 2) dx += width;

  if (dy > height / 2) dy -= height;
  else if (dy < -height / 2) dy += height;

  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { dx: 0, dy: 0 };
  return { dx: dx / dist, dy: dy / dist };
}

export function move(
  pos: Position,
  dx: number,
  dy: number,
  width: number,
  height: number,
): void {
  pos.x = ((pos.x + dx) % width + width) % width;
  pos.y = ((pos.y + dy) % height + height) % height;
}

/**
 * Deterministic circular mean of two angles in degrees.
 * Matches Python's _blend_angle: cos/sin decomposition + atan2.
 * NOT a random blend — purely deterministic from the two inputs.
 */
export function blendAngle(a: number, b: number): number {
  const ra = (a * Math.PI) / 180;
  const rb = (b * Math.PI) / 180;
  const x = Math.cos(ra) + Math.cos(rb);
  const y = Math.sin(ra) + Math.sin(rb);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
