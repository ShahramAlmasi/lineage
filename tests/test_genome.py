"""Tests for genome module."""
import random

import pytest

from lineage.genome import (
    BehaviorAction,
    BehaviorNode,
    BehaviorNodeType,
    Genome,
    Shape,
    crossover,
    mutate,
    random_genome,
)


class TestGenomeBasics:
    def test_random_genome_creation(self):
        g = random_genome(seed=42)
        assert g.size > 0
        assert 0 <= g.color_hue < 360
        assert g.behavior_tree

    def test_genetic_distance_self(self):
        g = random_genome(seed=42)
        assert g.genetic_distance(g) == 0.0

    def test_genetic_distance_symmetry(self):
        a = random_genome(seed=1)
        b = random_genome(seed=2)
        assert a.genetic_distance(b) == pytest.approx(b.genetic_distance(a))

    def test_can_interbreed_same_genome(self):
        g = random_genome(seed=42)
        g.sexual_reproduction = True
        assert g.can_interbreed(g)

    def test_can_interbreed_different_sexual_mode(self):
        a = random_genome(seed=42)
        a.sexual_reproduction = True
        b = random_genome(seed=42)
        b.sexual_reproduction = False
        assert not a.can_interbreed(b)


class TestCrossover:
    def test_crossover_produces_child(self):
        a = random_genome(seed=1)
        b = random_genome(seed=2)
        child = crossover(a, b)
        assert child is not None
        assert child.generation == 1

    def test_crossover_inherits_traits(self):
        a = random_genome(seed=1)
        b = random_genome(seed=2)
        child = crossover(a, b)
        assert min(a.size, b.size) * 0.5 <= child.size <= max(a.size, b.size) * 1.5

    def test_crossover_preserves_sexual_mode(self):
        a = random_genome(seed=1)
        b = random_genome(seed=2)
        child = crossover(a, b)
        assert child.sexual_reproduction in [a.sexual_reproduction, b.sexual_reproduction]


class TestMutation:
    def test_mutation_changes_genome(self):
        g = random_genome(seed=42)
        mutated = mutate(g, global_mutation_rate=1.0)
        assert mutated.size != pytest.approx(g.size, abs=0.001) or mutated.color_hue != pytest.approx(g.color_hue, abs=0.1)

    def test_mutation_respects_bounds(self):
        g = random_genome(seed=42)
        g.mutation_rate = 1.0
        g.mutation_magnitude = 10.0
        mutated = mutate(g)
        assert 0.001 <= mutated.mutation_rate <= 0.5
        assert 0.01 <= mutated.mutation_magnitude <= 1.0

    def test_mutation_rate_evolves(self):
        g = random_genome(seed=42)
        original_rate = g.mutation_rate
        mutated = mutate(g, global_mutation_rate=1.0)
        assert mutated.mutation_rate != pytest.approx(original_rate, abs=0.0001)


class TestSerialization:
    def test_to_from_dict_roundtrip(self):
        g = random_genome(seed=42)
        d = g.to_dict()
        restored = Genome.from_dict(d)
        assert restored.size == pytest.approx(g.size)
        assert restored.color_hue == pytest.approx(g.color_hue)
        assert restored.behavior_tree == g.behavior_tree
