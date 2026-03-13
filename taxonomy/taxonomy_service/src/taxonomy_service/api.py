import logging
import sqlite3

from fastapi import FastAPI, HTTPException
import uvicorn

from .config import Config, DbColumnMapping

logger = logging.getLogger()

app = FastAPI(title="Taxonomy service", description="Loculus taxonomy API for hostname validation")


def init_app(config: Config):
    app.state.config = config


def db_row_to_dict(db_column_mapping: dict[str, DbColumnMapping], row) -> dict[str, str]:
    if len(db_column_mapping) != len(row):
        raise ValueError(
            "DB row did not contain the expected number of columns. This may be configuration error"
        )
    return {k: row[v.idx] for k, v in db_column_mapping.items()}


@app.get("/")
def read_root():
    return {"message": "Taxonomy service is running"}


@app.get("/taxa")
def get_tax_id(scientific_name: str | None):
    config = app.state.config
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        taxa = conn.execute(
            "SELECT * FROM taxonomy WHERE scientific_name = ?", (scientific_name,)
        ).fetchall()
        if len(taxa) == 0:
            raise HTTPException(
                status_code=404, detail=f"Scientific name '{scientific_name}' not found"
            )
        taxon = max(taxa, key=lambda x: x["depth"])

        return dict(taxon)


@app.get("/taxa/{tax_id}")
def get_taxon(tax_id: int):
    config = app.state.config
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        taxon = conn.execute("SELECT * FROM taxonomy WHERE tax_id = ?", (tax_id,)).fetchone()
        if not taxon:
            raise HTTPException(status_code=404, detail=f"Taxon {tax_id} not found")
        return dict(taxon)


def start_api(config: Config):
    init_app(config)
    host = config.tax_service_host or "127.0.0.1"
    port = config.tax_service_port or 5000
    logger.info(f"Starting taxonomy service API on port {port}")

    uvicorn_config = uvicorn.Config(app, host=host, port=port, log_level="info", workers=1)
    server = uvicorn.Server(uvicorn_config)

    server.run()
