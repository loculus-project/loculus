import logging

import click
import requests

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


def download_file(url: str, local_filename: str) -> None:
    try:
        # Send a GET request to the URL
        with requests.get(url, stream=True) as response:
            response.raise_for_status()  # Raise an HTTPError for bad responses (4xx and 5xx)

            # Open the local file in write-binary mode
            with open(local_filename, "wb") as file:
                # Stream the content in chunks
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:  # Filter out keep-alive chunks
                        file.write(chunk)

        logger.info(f"File downloaded successfully as {local_filename}")

    except requests.exceptions.RequestException as e:
        logger.error(f"An error occurred: {e}")


@click.command(help="Download minimizer")
@click.option("--input", required=True, type=str)
@click.option("--output", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    input: str,
    output: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)
    download_file(input, output)


if __name__ == "__main__":
    main()
