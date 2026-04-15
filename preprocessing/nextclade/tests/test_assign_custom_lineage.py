# ruff: noqa: S101
"""Tests for ProcessingFunctions.assign_custom_lineage and is_variant."""

from loculus_preprocessing.processing_functions import ProcessingFunctions

ARGS: dict[str, list[str] | str | bool | int | float | None] = {
    "capture_group": "info",
    "pattern": "^(?:.*_)?(?P<info>[^_]+)$",
    "uppercase": True,
}


def make_flu_input(  # noqa: PLR0913, PLR0917
    ha_subtype: str | None = "H1",
    na_subtype: str | None = "N1",
    seg4_ref: str = "h1_h1n1pdm",
    seg6_ref: str = "n1_h1n1pdm",
    other_ref: str = "h1n1pdm",
    variants: dict[str, bool] | None = None,
) -> dict:
    """Build a flat input_data dict as assign_custom_lineage expects."""
    data: dict = {}
    for i in range(1, 9):
        ref = seg4_ref if i == 4 else seg6_ref if i == 6 else other_ref
        data[f"reference_seg{i}"] = ref
        data[f"variant_seg{i}"] = (variants or {}).get(f"seg{i}", False)
    if ha_subtype is not None:
        data["subtype_seg4"] = ha_subtype
    if na_subtype is not None:
        data["subtype_seg6"] = na_subtype
    return data


def assign_custom_lineage(input_data: dict) -> str | int | float | bool | None:
    return ProcessingFunctions.assign_custom_lineage(
        input_data=input_data,
        output_field="lineage",
        input_fields=list(input_data.keys()),
        args=ARGS,
    ).datum


class TestH1N1pdm:
    """H1N1pdm lineage: seg4 ref is h1_h1n1pdm, seg6 ref is n1_h1n1pdm."""

    @staticmethod
    def test_h1n1pdm_assigned_when_subtypes_match():
        """All 8 segments reference h1n1pdm lineage (with HA/NA prefixes on seg4/6)."""
        input_data = make_flu_input()
        assert assign_custom_lineage(input_data) == "H1N1pdm"

    @staticmethod
    def test_h1n1pdm_with_variant_flag():
        input_data = make_flu_input(
            variants={"seg4": True},
        )
        assert assign_custom_lineage(input_data) == "H1N1pdm (variant)"

    @staticmethod
    def test_h1n1pdm_reassortant_when_one_segment_differs():
        """If one internal segment has a different lineage, result is reassortant."""
        input_data = make_flu_input()
        # Override seg2 to a different lineage
        input_data["reference_seg2"] = "h3n2"
        assert assign_custom_lineage(input_data) == "H1N1pdm reassortant"

    @staticmethod
    def test_partial_genome_no_false_reassortant():
        input_data = make_flu_input()
        del input_data["reference_seg2"]  # simulate missing segment
        assert assign_custom_lineage(input_data) == "H1N1pdm"


class TestH1N1Seasonal:
    """Seasonal H1N1: all references are plain h1n1 (no prefix)."""

    @staticmethod
    def test_h1n1_seasonal_assigned():
        input_data = make_flu_input(
            ha_subtype="H1",
            na_subtype="N1",
            seg4_ref="h1n1",
            seg6_ref="h1n1",
            other_ref="h1n1",
        )
        assert assign_custom_lineage(input_data) == "H1N1"

    @staticmethod
    def test_h1n1_seasonal_reassortant():
        input_data = make_flu_input(
            ha_subtype="H1",
            na_subtype="N1",
            seg4_ref="h1n1",
            seg6_ref="h1n1",
            other_ref="h1n1",
        )
        input_data["reference_seg3"] = "h3n2"
        assert assign_custom_lineage(input_data) == "H1N1 reassortant"

    @staticmethod
    def test_h1n1_seasonal_with_variant():
        input_data = make_flu_input(
            ha_subtype="H1",
            na_subtype="N1",
            seg4_ref="h1n1",
            seg6_ref="h1n1",
            other_ref="h1n1",
            variants={"seg1": True},
        )
        assert assign_custom_lineage(input_data) == "H1N1 (variant)"


class TestH3N2:
    @staticmethod
    def test_h3n2_assigned():
        input_data = make_flu_input(
            ha_subtype="H3",
            na_subtype="N2",
            seg4_ref="h3_h3n2",
            seg6_ref="n2_h3n2",
            other_ref="h3n2",
        )
        assert assign_custom_lineage(input_data) == "H3N2"

    @staticmethod
    def test_h3n2_reassortant():
        input_data = make_flu_input(
            ha_subtype="H3",
            na_subtype="N2",
            seg4_ref="h3_h3n2",
            seg6_ref="n2_h3n2",
            other_ref="h3n2",
        )
        input_data["reference_seg1"] = "h1n1pdm"
        assert assign_custom_lineage(input_data) == "H3N2 reassortant"


class TestNonHumanLineage:
    """Non-human lineages (e.g. H5N1, H7N9) should return None."""

    @staticmethod
    def test_h5n1_returns_none():
        input_data = make_flu_input(
            ha_subtype="H5",
            na_subtype="N1",
            seg4_ref="h5_h5n1",
            seg6_ref="n1_h5n1",
            other_ref="h5n1",
        )
        assert assign_custom_lineage(input_data) is None

    @staticmethod
    def test_h7n9_returns_none():
        input_data = make_flu_input(
            ha_subtype="H7",
            na_subtype="N9",
            seg4_ref="h7_h7n9",
            seg6_ref="n9_h7n9",
            other_ref="h7n9",
        )
        assert assign_custom_lineage(input_data) is None


class TestMissingData:
    @staticmethod
    def test_empty_input_returns_none():
        assert assign_custom_lineage({}) is None

    @staticmethod
    def test_missing_ha_subtype_returns_none():
        input_data = make_flu_input(ha_subtype=None, na_subtype="N1")
        assert assign_custom_lineage(input_data) is None

    @staticmethod
    def test_missing_na_subtype_returns_none():
        input_data = make_flu_input(ha_subtype="H1", na_subtype=None)
        assert assign_custom_lineage(input_data) is None

    @staticmethod
    def test_both_subtypes_missing_returns_none():
        input_data = make_flu_input(ha_subtype=None, na_subtype=None)
        assert assign_custom_lineage(input_data) is None


def assign_custom_lineage_is_variant(length, num_mutations, mu="0.01"):
    return ProcessingFunctions.is_variant(
        input_data={"length": length, "numMutations": num_mutations},
        output_field="variant",
        input_fields=["length", "numMutations"],
        args={"mu": mu},
    )


class TestIsVariant:
    @staticmethod
    def test_above_threshold_is_true():
        # 150 mutations, length 1000, mu=0.1 → threshold=100, 150>100 → True
        result = assign_custom_lineage_is_variant(length="1000", num_mutations="150", mu="0.1")
        assert result.datum is True
        assert result.errors == []

    @staticmethod
    def test_below_threshold_is_false():
        # 50 mutations, length 1000, mu=0.1 → threshold=100, 50<100 → False
        result = assign_custom_lineage_is_variant(length="1000", num_mutations="50", mu="0.1")
        assert result.datum is False
        assert result.errors == []

    @staticmethod
    def test_exactly_at_threshold_is_false():
        # 100 mutations, length 1000, mu=0.1 → threshold=100, 100 is not > 100 → False
        result = assign_custom_lineage_is_variant(length="1000", num_mutations="100", mu="0.1")
        assert result.datum is False

    @staticmethod
    def test_missing_length_returns_none():
        result = assign_custom_lineage_is_variant(length=None, num_mutations="50")
        assert result.datum is None
        assert result.errors == []

    @staticmethod
    def test_missing_num_mutations_returns_none():
        result = assign_custom_lineage_is_variant(length="1000", num_mutations=None)
        assert result.datum is None
        assert result.errors == []

    @staticmethod
    def test_missing_mu_arg_returns_error():
        result = ProcessingFunctions.is_variant(
            input_data={"length": "1000", "numMutations": "50"},
            output_field="variant",
            input_fields=["length", "numMutations"],
            args={},
        )
        assert result.datum is None
        assert len(result.errors) == 1
        assert "missing mu argument" in result.errors[0].message

    @staticmethod
    def test_non_numeric_inputs_return_error():
        result = assign_custom_lineage_is_variant(length="not_a_number", num_mutations="50")
        assert result.datum is None
        assert len(result.errors) == 1
