/**
 * Grid-based spatial hash for fast neighbor queries.
 *
 * Ported from Python src/lineage/world.py SpatialHash (lines 159-191).
 *
 * LIMITATION: This spatial hash does NOT handle toroidal wrapping.
 * It operates as a simple rectangular grid. Callers (nearbyFood,
 * nearbyOrganisms) are responsible for filtering results by toroidal
 * distance. This matches the Python implementation exactly.
 */
export class SpatialHash<T = unknown> {
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
  private readonly cells: Map<string, T[]>;

  constructor(cellSize: number, width: number, height: number) {
    this.cellSize = cellSize;
    this.width = width;
    this.height = height;
    this.cells = new Map();
  }


  private cellKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }


  add(obj: T, x: number, y: number): void {
    const key = this.cellKey(x, y);
    let bucket = this.cells.get(key);
    if (bucket === undefined) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(obj);
  }

  clear(): void {
    this.cells.clear();
  }

  query(x: number, y: number, radius: number): T[] {
    const results: T[] = [];
    const rCells = Math.floor(radius / this.cellSize) + 1;
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);

    for (let dx = -rCells; dx <= rCells; dx++) {
      for (let dy = -rCells; dy <= rCells; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        const bucket = this.cells.get(key);
        if (bucket !== undefined) {
          for (let i = 0; i < bucket.length; i++) {
            results.push(bucket[i]);
          }
        }
      }
    }

    return results;
  }
}
