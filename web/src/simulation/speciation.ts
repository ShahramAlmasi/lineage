/**
 * Speciation tracking: species assignment, divergence, extinction events.
 * Port of Python src/lineage/speciation.py — matches behavior exactly.
 */

import {
  type Species,
  type SpeciationEvent,
  type ExtinctionEvent,
  type Organism,
  type Genome,
  Shape,
} from "./types";
import { geneticDistance } from "./genome";

// ── Species helper ──────────────────────────────────────────────────────

/** Check if a species is extinct. */
function isExtinct(species: Species): boolean {
  return species.extinctAtTick !== null;
}

/** Get current population of a species. */
function population(species: Species): number {
  return species.memberIds.size;
}

/** Serialize a Species to a dict matching Python's Species.to_dict format. */
function speciesToDict(species: Species): Record<string, unknown> {
  return {
    id: species.id,
    member_count: species.memberIds.size,
    created_at_tick: species.createdAtTick,
    extinct_at_tick: species.extinctAtTick,
    parent_species_id: species.parentSpeciesId,
    generation_spawned: species.generationSpawned,
  };
}

// ── SpeciesTracker class ────────────────────────────────────────────────

export class SpeciesTracker {
  threshold: number;
  species: Map<number, Species> = new Map();
  nextSpeciesId: number = 1;
  speciationEvents: SpeciationEvent[] = [];
  extinctionEvents: ExtinctionEvent[] = [];
  phylogeny: Map<number, number | null> = new Map();

  constructor(threshold: number = 0.3) {
    this.threshold = threshold;
  }

  /**
   * Assign a species to an organism. Returns [species_id, is_new].
   * Matches Python assign_species exactly.
   */
  assignSpecies(organism: Organism, tick: number): [number, boolean] {
    const genome = organism.genome;

    let bestSpeciesId: number | null = null;
    let bestDistance = Infinity;

    for (const [speciesId, species] of this.species) {
      if (isExtinct(species)) continue;
      const dist = geneticDistance(genome, species.representativeGenome);
      if (dist < this.threshold && dist < bestDistance) {
        bestDistance = dist;
        bestSpeciesId = speciesId;
      }
    }

    if (bestSpeciesId !== null) {
      this.species.get(bestSpeciesId)!.memberIds.add(organism.id);
      organism.genome.speciesId = bestSpeciesId;
      return [bestSpeciesId, false];
    }

    const newId = this.createNewSpecies(genome, tick, null);
    this.species.get(newId)!.memberIds.add(organism.id);
    organism.genome.speciesId = newId;
    return [newId, true];
  }

  /**
   * Create a new species. Returns the new species ID.
   * Matches Python _create_new_species exactly.
   */
  createNewSpecies(
    genome: Genome,
    tick: number,
    parentId: number | null,
  ): number {
    const speciesId = this.nextSpeciesId;
    this.nextSpeciesId += 1;

    const species: Species = {
      id: speciesId,
      representativeGenome: genome,
      memberIds: new Set(),
      createdAtTick: tick,
      extinctAtTick: null,
      parentSpeciesId: parentId,
      generationSpawned: genome.generation,
    };
    this.species.set(speciesId, species);
    this.phylogeny.set(speciesId, parentId);

    this.speciationEvents.push({
      tick,
      newSpeciesId: speciesId,
      parentSpeciesId: parentId,
      reason: "genetic_divergence",
    });

    return speciesId;
  }

  /**
   * Update species membership, detect extinctions and new splits.
   * Returns list of event messages.
   * Matches Python update_species exactly.
   */
  updateSpecies(organisms: Organism[], tick: number): string[] {
    const events: string[] = [];
    const aliveIds = new Set(
      organisms.filter((o) => o.alive).map((o) => o.id),
    );

    // Phase 1 — Extinction detection
    for (const species of this.species.values()) {
      if (isExtinct(species)) continue;

      const oldMembers = species.memberIds;
      const newMembers = new Set<number>();
      for (const id of oldMembers) {
        if (aliveIds.has(id)) {
          newMembers.add(id);
        }
      }

      if (newMembers.size === 0) {
        species.extinctAtTick = tick;
        const lifespan = tick - species.createdAtTick;
        this.extinctionEvents.push({
          tick,
          speciesId: species.id,
          finalPopulation: 0,
          lifespanTicks: lifespan,
        });
        events.push(
          `Species ${species.id} went extinct (t=${tick}, lifespan=${lifespan})`,
        );
      } else {
        species.memberIds = newMembers;
      }
    }

    // Phase 2 — Divergence detection
    const speciesOrganisms: Map<number, Organism[]> = new Map();
    for (const org of organisms) {
      if (org.alive) {
        const sid = org.genome.speciesId;
        let list = speciesOrganisms.get(sid);
        if (!list) {
          list = [];
          speciesOrganisms.set(sid, list);
        }
        list.push(org);
      }
    }

    for (const [speciesId, members] of speciesOrganisms) {
      if (!this.species.has(speciesId)) continue;
      const species = this.species.get(speciesId)!;
      if (isExtinct(species)) continue;

      if (members.length < 2) continue;

      const rep = species.representativeGenome;
      const diverged: Organism[] = [];
      for (const org of members) {
        const dist = geneticDistance(org.genome, rep);
        if (dist >= this.threshold * 1.2) {
          diverged.push(org);
        }
      }

      if (diverged.length > 0 && diverged.length < members.length) {
        const newId = this.createNewSpecies(diverged[0]!.genome, tick, speciesId);
        for (const org of diverged) {
          this.species.get(speciesId)!.memberIds.delete(org.id);
          this.species.get(newId)!.memberIds.add(org.id);
          org.genome.speciesId = newId;
        }

        events.push(
          `New species ${newId} diverged from species ${speciesId} (t=${tick}, ${diverged.length} members)`,
        );
      } else if (members.length > 0 && tick % 100 === 0) {
        species.representativeGenome = members[0]!.genome;
      }
    }

    return events;
  }

  /**
   * Number of non-extinct species. Matches Python get_species_count.
   */
  getSpeciesCount(): number {
    let count = 0;
    for (const species of this.species.values()) {
      if (!isExtinct(species)) count++;
    }
    return count;
  }

  /**
   * Map of species_id → population count for non-extinct species.
   * Matches Python get_species_populations.
   */
  getSpeciesPopulations(): Map<number, number> {
    const result = new Map<number, number>();
    for (const species of this.species.values()) {
      if (!isExtinct(species)) {
        result.set(species.id, population(species));
      }
    }
    return result;
  }

  /**
   * Get the phylogenetic tree structure.
   * Returns map of species_id → { parent, species } for tree building.
   */
  getPhylogeneticTree(): Map<
    number,
    { species: Species; parentSpeciesId: number | null }
  > {
    const result = new Map<
      number,
      { species: Species; parentSpeciesId: number | null }
    >();
    for (const [speciesId, parentId] of this.phylogeny) {
      const species = this.species.get(speciesId);
      if (species) {
        result.set(speciesId, { species, parentSpeciesId: parentId });
      }
    }
    return result;
  }

  /**
   * Generate ASCII art phylogenetic tree. Matches Python get_phylogenetic_tree_ascii exactly.
   */
  getPhylogeneticTreeAscii(maxDepth: number = 5): string {
    const lines: string[] = [];
    lines.push("Phylogenetic Tree");
    lines.push("=".repeat(30));

    // Find roots — species with no parent
    const roots: number[] = [];
    for (const [sid, parent] of this.phylogeny) {
      if (parent === null) {
        roots.push(sid);
      }
    }

    const renderNode = (sid: number, depth: number, prefix: string): void => {
      if (depth > maxDepth) return;
      const species = this.species.get(sid);
      if (!species) return;
      const status = isExtinct(species)
        ? "EXTINCT"
        : `pop=${population(species)}`;
      lines.push(`${prefix}Species ${sid} [${status}]`);

      // Find children
      const children: number[] = [];
      for (const [child, parent] of this.phylogeny) {
        if (parent === sid) {
          children.push(child);
        }
      }

      for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        const isLast = i === children.length - 1;
        const childPrefix = prefix + (isLast ? "    " : "│   ");
        const branch = isLast ? "└── " : "├── ";
        renderNode(child, depth + 1, childPrefix.slice(0, -4) + branch);
      }
    };

    for (const root of roots) {
      renderNode(root, 0, "");
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Serialize tracker state to dict. Matches Python to_dict exactly.
   */
  toDict(): Record<string, unknown> {
    const speciesDict: Record<string, unknown> = {};
    for (const [sid, s] of this.species) {
      speciesDict[sid] = speciesToDict(s);
    }

    // Convert phylogeny Map to plain object
    const phylogenyObj: Record<string, unknown> = {};
    for (const [sid, parentId] of this.phylogeny) {
      phylogenyObj[sid] = parentId;
    }

    return {
      threshold: this.threshold,
      species: speciesDict,
      speciation_events: this.speciationEvents.map((e) => ({
        tick: e.tick,
        new_species_id: e.newSpeciesId,
        parent_species_id: e.parentSpeciesId,
        reason: e.reason,
      })),
      extinction_events: this.extinctionEvents.map((e) => ({
        tick: e.tick,
        species_id: e.speciesId,
        final_population: e.finalPopulation,
        lifespan_ticks: e.lifespanTicks,
      })),
      phylogeny: phylogenyObj,
    };
  }

  /**
   * Deserialize tracker state from dict. Matches Python from_dict pattern.
   * Note: Python doesn't have a from_dict on SpeciesTracker, but we need
   * it for loading recordings.
   */
  static fromDict(d: Record<string, unknown>): SpeciesTracker {
    const tracker = new SpeciesTracker(d["threshold"] as number);

    // Restore species
    const speciesData = d["species"] as Record<string, Record<string, unknown>>;
    for (const [sidStr, sData] of Object.entries(speciesData)) {
      const sid = Number(sidStr);
      // We need a placeholder genome since to_dict doesn't store it
      // The full genome would come from organism data
      const placeholderGenome: Genome = {
        size: 0,
        shape: Shape.CIRCLE,
        colorHue: 0,
        colorSat: 0,
        colorVal: 0,
        baseMetabolism: 0,
        photosynthesisRate: 0,
        movementSpeed: 0,
        foodDetectionRadius: 0,
        predatorDetectionRadius: 0,
        mateDetectionRadius: 0,
        reproductionThreshold: 0,
        reproductionCost: 0,
        sexualReproduction: false,
        crossoverPreference: 0,
        mutationRate: 0,
        mutationMagnitude: 0,
        behaviorTree: [],
        speciesId: sid,
        generation: (sData["generation_spawned"] as number) ?? 0,
        parentIds: [],
      };
      tracker.species.set(sid, {
        id: sid,
        representativeGenome: placeholderGenome,
        memberIds: new Set<number>(), // member_ids not stored in to_dict
        createdAtTick: (sData["created_at_tick"] as number) ?? 0,
        extinctAtTick: (sData["extinct_at_tick"] as number | null) ?? null,
        parentSpeciesId:
          (sData["parent_species_id"] as number | null) ?? null,
        generationSpawned: (sData["generation_spawned"] as number) ?? 0,
      });
      tracker.nextSpeciesId = Math.max(tracker.nextSpeciesId, sid + 1);
    }

    // Restore speciation events
    const specEvents = d["speciation_events"] as Record<string, unknown>[];
    if (specEvents) {
      tracker.speciationEvents = specEvents.map((e) => ({
        tick: e["tick"] as number,
        newSpeciesId: e["new_species_id"] as number,
        parentSpeciesId: e["parent_species_id"] as number | null,
        reason: e["reason"] as string,
      }));
    }

    // Restore extinction events
    const extEvents = d["extinction_events"] as Record<string, unknown>[];
    if (extEvents) {
      tracker.extinctionEvents = extEvents.map((e) => ({
        tick: e["tick"] as number,
        speciesId: e["species_id"] as number,
        finalPopulation: e["final_population"] as number,
        lifespanTicks: e["lifespan_ticks"] as number,
      }));
    }

    // Restore phylogeny
    const phylogenyData = d["phylogeny"] as Record<string, unknown>;
    if (phylogenyData) {
      for (const [sidStr, parentId] of Object.entries(phylogenyData)) {
        tracker.phylogeny.set(Number(sidStr), parentId as number | null);
      }
    }

    return tracker;
  }
}
