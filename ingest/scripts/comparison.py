"""
Use to compare geoLocAdmin output of single-segmented viruses for now:
for organism in ebola-zaire west-nile; do
    for subdomain in main use-pycountry add-country-metadata; do
        output=metadata_${subdomain}_${organism}.tsv
        curl "https://lapis-${subdomain}.loculus.org/${organism}/sample/details?downloadAsFile=true&versionStatus=LATEST_VERSION&isRevocation=false&dataUseTerms=OPEN&compression=zstd&dataFormat=TSV" | zstdcat > $output
    done
    cp metadata_add-country-metadata_${organism}.tsv metadata_auspice-curate_${organism}.tsv
    python scripts/comparison.py --file1 metadata_main_${organism}.tsv --file2 metadata_use-pycountry_${organism}.tsv --file3 metadata_auspice-curate_${organism}.tsv --output metadata_merged_${organism}.tsv
done
"""

import logging
import os

import click
import pandas as pd

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


# Function to extract suffix from the filename
def get_suffix(file):
    base_name = os.path.basename(file)
    return base_name.split("_")[1].replace(".tsv", "")


@click.command()
@click.option("--file1", required=True, type=click.Path(exists=True))
@click.option("--file2", required=True, type=click.Path(exists=True))
@click.option("--file3", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
def main(
    file1: str,
    file2: str,
    file3: str | None,
    output: str,
) -> None:
    # Extract suffixes from file names
    logger.setLevel("DEBUG")
    suffix1 = get_suffix(file1)
    suffix2 = get_suffix(file2)
    suffix3 = get_suffix(file3)

    logger.debug("starting")

    # Load the TSV files
    df1 = pd.read_csv(file1, sep="\t")
    df2 = pd.read_csv(file2, sep="\t")
    df3 = pd.read_csv(file3, sep="\t")

    # Filter out rows where 'country' field is empty
    df1 = df1[df1["geoLocCountry"].notna() & (df1["geoLocCountry"] != "")]
    # df2 = df2[df2["geoLocCountry"].notna() & (df2["geoLocCountry"] != "")]
    # df3 = df3[df3["geoLocCountry"].notna() & (df3["geoLocCountry"] != "")]

    # Merge the dataframes on 'insdcAccessionBase' and 'version', adding dynamic suffixes
    merged_df = df1.merge(df3, on=["insdcAccessionBase"], suffixes=(f"_{suffix1}", f"_{suffix3}"))
    # Explicitly add suffixes to the columns of the second dataframe
    df2 = df2.rename(columns={col: col + f"_{suffix2}" for col in df2.columns if col != "insdcAccessionBase"})
    merged_full = pd.merge(left=merged_df, right=df2, on=["insdcAccessionBase"], suffixes=(None, f"_{suffix2}"))

    # Select the desired columns using the dynamically assigned suffixes
    result_df = merged_full[
        [
            f"insdcAccessionBase",
            f"geoLocCountry_{suffix1}",
            f"geoLocAdmin1_{suffix1}",
            f"geoLocAdmin2_{suffix1}",
            f"geoLocCountry_{suffix2}",
            f"geoLocAdmin1_{suffix2}",
            f"geoLocAdmin2_{suffix2}",
            f"geoLocCountry_{suffix3}",
            f"geoLocAdmin1_{suffix3}",
            f"geoLocAdmin2_{suffix3}",
        ]
    ]

    result_df = result_df.sort_values(by=f"geoLocCountry_{suffix1}")

    # Save the result to a new TSV file
    result_df.to_csv(output, sep="\t", index=False)

    print(f"Merging complete! Output saved as {output}.")
    unique_file_name = output.replace(".tsv", "") + "_unique.tsv"
    results_df_unique = result_df.drop(columns=['insdcAccessionBase'])
    df_unique = results_df_unique.drop_duplicates().sort_values(by=f"geoLocCountry_{suffix1}")
    df_unique.to_csv(unique_file_name, sep="\t", index=False)

    print(f"Made results unique! Output saved as {unique_file_name}.")



if __name__ == "__main__":
    main()
