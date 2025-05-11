import logging

from flask import Flask, jsonify
from flask_restx import Api, Resource, fields
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool

from .config import Config
from .submission_db_helper import (
    db_init,
)

logger = logging.getLogger(__name__)

app = Flask(__name__)
api = Api(app, title="Ena Deposition Pod API", description="API for Ena Deposition Pod")


insdc_accession_response = api.model(
    "InsdcAccessionResponse",
    {
        "status": fields.String(example="ok", description="Request status"),
        "db_result": fields.Raw(
            example={"LOC_123.1": ["SAME123", "SAME124"], "LOC_456.1": ["SAME999"]},
            description="Map of Loculus AccessionVersion to list of INSDC accessions",
        ),
    },
)

biosample_accession_response = api.model(
    "BiosampleAccessionResponse",
    {
        "status": fields.String(example="ok", description="Request status"),
        "db_result": fields.Raw(
            example={"LOC_123.1": "SAME123", "LOC_456.1": "SAME999"},
            description="Map of Loculus AccessionVersion to Biosample accession",
        ),
    },
)


def get_bio_sample_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Result is a jsonb column
            query = "SELECT accession, result FROM sample_table WHERE STATUS = 'SUBMITTED'"

            cur.execute(query)

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    if not results:
        return {}

    return {result["accession"]: result["result"]["biosample_accession"] for result in results}


def get_insdc_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Result is a jsonb column
            query = "SELECT accession, result FROM assembly_table WHERE STATUS IN ('SUBMITTED', 'WAITING')"

            cur.execute(query)

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    if not results:
        return {}

    return {
        result["accession"]: [
            result["result"][key]
            for key in result["result"]
            if key.startswith("insdc_accession_full")
        ]
        for result in results
    }


@api.route("/submitted/insdc_accessions")
class SubmittedINSDCAccessions(Resource):
    @api.doc(
        description="Fetch all INSDC accessions submitted via Loculus.",
        responses={200: "Success", 500: "Internal Server Error"},
    )
    @api.marshal_with(insdc_accession_response)
    def get(self):
        try:
            insdc_accessions_submitted_by_loculus = get_insdc_accessions(db_conn_pool)
            return {
                "status": "ok",
                "db_result": insdc_accessions_submitted_by_loculus,
            }
        except Exception as e:
            logger.error("An error occurred while fetching INSDC accessions: %s", str(e))
            return {"status": "error", "message": "An internal error has occurred."}, 500


@api.route("/submitted/biosample_accessions")
class SubmittedBiosampleAccessions(Resource):
    @api.doc(
        description="Fetch all Biosample accessions submitted via Loculus.",
        responses={200: "Success", 500: "Internal Server Error"},
    )
    @api.marshal_with(biosample_accession_response)
    def get(self):
        try:
            biosample_accessions_submitted_by_loculus = get_bio_sample_accessions(db_conn_pool)
            return {
                    "status": "ok",
                    "db_result": biosample_accessions_submitted_by_loculus,
                }
        except Exception as e:
            logger.error("An error occurred while fetching Biosample accessions: %s", str(e))
            return {"status": "error", "message": "An internal error has occurred."}, 500


def start_api(config: Config, port: int = 5000):
    global db_conn_pool
    db_conn_pool = db_init(config.db_password, config.db_username, config.db_url)
    logger.info("Starting ENA Deposition Pod API on port %d", port)
    app.run(debug=False, port=port, host="0.0.0.0", use_reloader=False)
