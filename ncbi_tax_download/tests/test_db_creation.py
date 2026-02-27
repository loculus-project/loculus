from io import BytesIO
from pathlib import Path

import pytest

from ncbi_tax_download.ncbi import (
    create_taxonomy_df,
    extract_names_df,
    extract_nodes_df,
)

TEST_ZIP = Path(__file__).parent / "taxdmp.zip"


@pytest.fixture
def archive():
    with open(TEST_ZIP, "rb") as f:
        return BytesIO(f.read())


def test_names_df_creation(archive: BytesIO):
    df_names = extract_names_df(archive)

    expected_shape = (14, 3)
    expected_columns = ["tax_id", "common_name", "scientific_name"]

    assert df_names.shape == expected_shape
    assert all([i == j for i, j in zip(df_names.columns, expected_columns)])


def test_nodes_df_creation(archive: BytesIO):
    df_nodes = extract_nodes_df(archive)

    expected_shape = (8, 3)
    expected_columns = ["tax_id", "parent_id", "depth"]

    assert df_nodes.shape == expected_shape
    assert all([i == j for i, j in zip(df_nodes.columns, expected_columns)])


def test_taxonomy_df_creation(archive: BytesIO):
    r""" Tree should have shape
                1
              /   \ 
            2      9
          /       / \
        6        10  11
      /
    7
    """
    df_taxonomy = create_taxonomy_df(archive)

    expected_shape = (7, 5)
    expected_columns = ["tax_id", "common_name", "scientific_name", "parent_id", "depth"]
    expected_partents = [1, 1, 2, 6, 1, 9, 9]
    expected_depths = [0, 1, 2, 3, 1, 2, 2]
    expected_common_name = "bacteria; eubacteria"

    assert df_taxonomy.shape == expected_shape
    assert all([i == j for i, j in zip(df_taxonomy.columns, expected_columns)])

    assert all(df_taxonomy["parent_id"] == expected_partents)
    assert all(df_taxonomy["depth"] == expected_depths)
    assert df_taxonomy.set_index("tax_id").loc[2, "common_name"] == expected_common_name
