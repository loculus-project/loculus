import shutil
from io import BytesIO
from pathlib import Path

import pytest
from ncbi_tax_download.ncbi import (
    create_taxonomy_df,
    extract_names_df,
    extract_nodes_df,
)

CORRECT_DATA = Path(__file__).parent / "correct"
# has tax_ids that exist in names.dmp but not in nodes.dmp, which should cause create_taxonomy_df to error
INCORRECT_DATA = Path(__file__).parent / "incorrect"


@pytest.fixture
def archive_correct():
    shutil.make_archive("correct", "zip", CORRECT_DATA)
    with open("correct.zip", "rb") as f:
        return BytesIO(f.read())


@pytest.fixture
def archive_incorrect():
    shutil.make_archive("incorrect", "zip", INCORRECT_DATA)
    with open("incorrect.zip", "rb") as f:
        return BytesIO(f.read())


def test_names_df_creation(archive_correct: BytesIO):
    df_names = extract_names_df(archive_correct)

    expected_shape = (7, 3)
    expected_columns = ["tax_id", "common_name", "scientific_name"]

    assert df_names.shape == expected_shape
    assert list(df_names.columns) == expected_columns


def test_nodes_df_creation(archive_correct: BytesIO):
    df_nodes = extract_nodes_df(archive_correct)

    expected_shape = (8, 2)
    expected_columns = ["tax_id", "parent_id"]

    assert df_nodes.shape == expected_shape
    assert list(df_nodes.columns) == expected_columns


def test_taxonomy_df_creation(archive_correct: BytesIO, archive_incorrect: BytesIO):
    r""" Tree should have shape
                1
              /   \ 
            2      9
          /       / \
        6        10  11
      /
    7
    """
    with pytest.raises(ValueError):
        df_taxonomy = create_taxonomy_df(archive_incorrect)

    df_taxonomy = create_taxonomy_df(archive_correct)

    expected_shape = (7, 5)
    expected_columns = ["tax_id", "common_name", "scientific_name", "parent_id", "depth"]
    expected_parents = [1, 1, 2, 6, 1, 9, 9]
    expected_depths = [0, 1, 2, 3, 1, 2, 2]
    expected_common_name = "bacteria; eubacteria"

    assert df_taxonomy.shape == expected_shape
    assert list(df_taxonomy.columns) == expected_columns

    assert all(df_taxonomy["parent_id"] == expected_parents)
    assert all(df_taxonomy["depth"] == expected_depths)
    assert df_taxonomy.set_index("tax_id").loc[2, "common_name"] == expected_common_name
