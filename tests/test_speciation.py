"""Tests for speciation module."""
import pytest

from lineage.genome import Genome, random_genome
from lineage.speciation import SpeciesTracker
from lineage.world import Organism, Position


class TestSpeciesTracker:
    def test_assign_species_new_organism(self):
        tracker = SpeciesTracker(threshold=0.3)
        genome = random_genome(seed=42)
        org = Organism(id=1, genome=genome, position=Position(0, 0))
        sid = tracker.assign_species(org, tick=0)
        assert sid == 1
        assert tracker.get_species_count() == 1

    def test_similar_organisms_same_species(self):
        tracker = SpeciesTracker(threshold=0.3)
        genome = random_genome(seed=42)
        org1 = Organism(id=1, genome=genome, position=Position(0, 0))
        org2 = Organism(id=2, genome=genome, position=Position(1, 1))
        sid1 = tracker.assign_species(org1, tick=0)
        sid2 = tracker.assign_species(org2, tick=0)
        assert sid1 == sid2

    def test_different_organisms_different_species(self):
        tracker = SpeciesTracker(threshold=0.3)
        g1 = random_genome(seed=1)
        g2 = random_genome(seed=999)
        org1 = Organism(id=1, genome=g1, position=Position(0, 0))
        org2 = Organism(id=2, genome=g2, position=Position(1, 1))
        sid1 = tracker.assign_species(org1, tick=0)
        sid2 = tracker.assign_species(org2, tick=0)
        assert sid1 != sid2

    def test_extinction_detection(self):
        tracker = SpeciesTracker(threshold=0.3)
        genome = random_genome(seed=42)
        org = Organism(id=1, genome=genome, position=Position(0, 0))
        tracker.assign_species(org, tick=0)
        org.mark_dead()
        events = tracker.update_species([org], tick=10)
        assert len(events) == 1
        assert "extinct" in events[0]
        assert tracker.get_species_count() == 0

    def test_phylogenetic_tree(self):
        tracker = SpeciesTracker(threshold=0.3)
        g1 = random_genome(seed=1)
        g2 = random_genome(seed=999)
        org1 = Organism(id=1, genome=g1, position=Position(0, 0))
        org2 = Organism(id=2, genome=g2, position=Position(1, 1))
        tracker.assign_species(org1, tick=0)
        tracker.assign_species(org2, tick=0)
        tree = tracker.get_phylogenetic_tree_ascii()
        assert "Phylogenetic Tree" in tree
        assert "Species 1" in tree
