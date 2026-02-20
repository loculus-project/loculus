from io import BytesIO
from ncbi_tax_download.ncbi import extract_names_df, extract_ncbi_taxonomy_file

TEST_ZIP = "tests/taxdmp.zip"


def test_names_df_creation():
    with open(TEST_ZIP, "rb") as f:
        archive = BytesIO(f.read())
    df_names = extract_names_df(archive)

    expected_shape = (14, 3)
    expected_columns = ["tax_id", "common_name", "scientific_name"]
    expected_common_name = "bacteria; eubacteria"

    assert df_names.shape == expected_shape
    assert all([i == j for i, j in zip(df_names.columns, expected_columns)])
    assert df_names.set_index("tax_id").loc[2, "common_name"] == expected_common_name
