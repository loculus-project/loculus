import logging

import click

logger = logging.getLogger(__name__)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
def run():
    pass


if __file__ == "__main__":
    run()
