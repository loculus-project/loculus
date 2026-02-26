from io import BytesIO
from ncbi_tax_download.ncbi import (
    create_taxonomy_df,
    extract_names_df,
    extract_ncbi_taxonomy_file,
    extract_nodes_df,
)

TEST_ZIP = "tests/taxdmp.zip"
with open(TEST_ZIP, "rb") as f:
    ARCHIVE = BytesIO(f.read())


def test_names_df_creation():
    df_names = extract_names_df(ARCHIVE)

    expected_shape = (14, 3)
    expected_columns = ["tax_id", "common_name", "scientific_name"]
    expected_common_name = "bacteria; eubacteria"

    assert df_names.shape == expected_shape
    assert all([i == j for i, j in zip(df_names.columns, expected_columns)])
    assert df_names.set_index("tax_id").loc[2, "common_name"] == expected_common_name


def test_nodes_df_creation():
    df_nodes = extract_nodes_df(ARCHIVE)

    expected_shape = (8, 3)
    expected_columns = ["tax_id", "parent_id", "depth"]

    assert df_nodes.shape == expected_shape
    assert all([i == j for i, j in zip(df_nodes.columns, expected_columns)])


def test_taxonomy_df_creation():
    r""" Tree should have shape
                1
              /   \ 
            2      9
          /       / \
        6        10  11
      /
    7
    """
    df_taxonomy = create_taxonomy_df(ARCHIVE)

    expected_shape = (7, 5)
    expected_columns = ["tax_id", "common_name", "scientific_name", "parent_id", "depth"]
    expected_children = [10, 11]

    assert df_taxonomy.shape == expected_shape
    assert all([i == j for i, j in zip(df_taxonomy.columns, expected_columns)])
    assert all(df_taxonomy.loc[df_taxonomy["parent_id"] == 9, "tax_id"] == expected_children)
