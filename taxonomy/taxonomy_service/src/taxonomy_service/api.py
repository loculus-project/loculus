import logging
import sqlite3

from fastapi import FastAPI, HTTPException
import uvicorn

from .config import Config

logger = logging.getLogger()

app = FastAPI(title="Taxonomy service", description="Loculus taxonomy API for hostname validation")


@app.get("/")
def read_root():
    return {"message": "Taxonomy service is running"}


def fetch_by_sci_name(db_path: str, name: str):
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        taxa = conn.execute("SELECT * FROM taxonomy WHERE scientific_name = ?", (name,)).fetchall()

        if not taxa:
            return None

        return dict(max(taxa, key=lambda x: x["depth"]))


def fetch_by_id(db_path: str, tax_id: int):
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        taxon = conn.execute("SELECT * FROM taxonomy WHERE tax_id = ?", (tax_id,)).fetchone()
        if not taxon:
            return None
        return dict(taxon)


def fetch_common_name(db_path: str, tax_id: int):
    """Return a taxon with a common name

    If the supplied `tax_id` is associated with a common name, return the taxon.

    If there is no common name associated with the taxon, keep stepping up the taxonomy until
    a taxon is found with a common name, and return that
    """

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        while tax_id > 0:
            taxon = cursor.execute("SELECT * FROM taxonomy WHERE tax_id = ?", (tax_id,)).fetchone()
            if taxon is None:
                raise HTTPException(status_code=404, detail=f"Taxon {tax_id} not found")
            elif taxon["common_name"] is not None:
                return dict(taxon)
            tax_id = taxon["parent_id"]
        return None


@app.get("/taxa")
def query_taxa(scientific_name: str):
    """Very basic for the moment, only support scientific name queries.

    Could consider adding support for common name queries as well.
    """
    taxon = fetch_by_sci_name(app.state.config.db_path, scientific_name)

    if taxon is None:
        raise HTTPException(status_code=404, detail=f"'{scientific_name}' not found")

    return taxon


@app.get("/taxa/{tax_id}")
def get_taxon(tax_id: int):
    taxon = fetch_by_id(app.state.config.db_path, tax_id)

    if taxon is None:
        raise HTTPException(status_code=404, detail=f"'{tax_id}' not found")

    return taxon


@app.get("/taxa/{tax_id}/common_name")
def get_common_name(tax_id: int):
    taxon = fetch_common_name(app.state.config.db_path, tax_id)

    if taxon is None:
        raise HTTPException(
            status_code=404, detail=f"Unable to find common name for taxon {tax_id}"
        )

    return taxon


def init_app(config: Config):
    app.state.config = config


def start_api(config: Config):
    init_app(config)
    host = config.tax_service_host or "127.0.0.1"
    port = config.tax_service_port or 5000
    logger.info(f"Starting taxonomy service API on port {port}")

    uvicorn_config = uvicorn.Config(app, host=host, port=port, log_level="info", workers=1)
    server = uvicorn.Server(uvicorn_config)

    server.run()
