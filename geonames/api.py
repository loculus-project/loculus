import csv
import os
import sqlite3

import yaml
from flask import Flask, request
from flask_restx import Api, Resource

app = Flask(__name__)
api = Api(app, title="Geoname API", description="A simple API to manage geoname data")
DB_PATH = "geonames_database.db"
SCHEMA_PATH = "schema.sql"
UPLOAD_FOLDER = "uploads"

# Ensure the upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

search = api.namespace("search", description="Geoname search operations")


# Initialize SQLite database from schema file
def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        with open(SCHEMA_PATH, "r") as schema_file:
            conn.executescript(schema_file.read())


@search.route("/get-admin1")
class SearchAdmin1(Resource):
    @api.doc(params={"query": "Get list of all admin1_codes for a given INSDC country"})
    def get(self):
        """Get list of all admin1_codes for a given country_code"""
        query = request.args.get("query", "")
        if not query:
            return {"error": "Query parameter is required"}, 400

        country_code = app.config["insdc_country_code_mapping"].get(query, None)

        if not country_code:
            return {"error": "Invalid country code"}, 400

        try:
            with sqlite3.connect(DB_PATH) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                SELECT asciiname
                FROM administrative_regions
                WHERE feature_code = 'ADM1' AND country_code = ?""",
                    (country_code,),
                )
                results = cursor.fetchall()
            return [row[0] for row in results]
        except Exception as e:
            return {"error": str(e)}, 500


@search.route("/get-admin2")
class SearchAdmin2(Resource):
    @api.doc(params={"query": "Get list of all admin1_codes for a given INSDC country"})
    def get(self):
        """Get list of all admin1_codes for a given country_code"""
        query = request.args.get("query", "")
        if not query:
            return {"error": "Query parameter is required"}, 400

        country_code = app.config["insdc_country_code_mapping"].get(query, None)

        if not country_code:
            return {"error": "Invalid country code"}, 400

        try:
            with sqlite3.connect(DB_PATH) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                SELECT asciiname
                FROM administrative_regions
                WHERE feature_code = 'ADM2' AND country_code = ?""",
                    (country_code,),
                )
                results = cursor.fetchall()
            return [row[0] for row in results]
        except Exception as e:
            return {"error": str(e)}, 500


def insert_tsv_to_db(tsv_file_path):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()

            # Open the TSV file for reading
            with open(tsv_file_path, "r") as file:
                tsv_reader = csv.reader(file, delimiter="\t")

                # Begin a transaction for bulk inserts
                cursor.execute("BEGIN TRANSACTION;")

                # Loop through each row in the TSV and insert into the database
                for row in tsv_reader:
                    # Adjust the SQL INSERT statement according to your table structure
                    cursor.execute(
                        """
                INSERT INTO administrative_regions 
                (geonameid, name, asciiname, latitude, longitude, feature_code, country_code, cc2, admin1_code, admin2_code, admin3_code) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        row,
                    )  # Pass the row as a tuple of values

                # Commit the transaction
                cursor.execute("COMMIT;")
            print("Data inserted successfully!")

    except Exception as e:
        print(f"An error occurred: {e}")
        return False
    return True


upload = api.namespace("upload", description="Geoname upload operations")


# Define the endpoint to handle file uploads
@upload.route("/upload-tsv", methods=["POST"])
class UploadTSV(Resource):
    @api.doc(params={"file": "tsv file to upload"})
    def post(self):
        if "file" not in request.files:
            return {"error": "No file part"}, 400

        file = request.files["file"]

        if not file.filename:
            return {"error": "No selected file"}, 400

        if file and file.filename.endswith(".tsv"):
            # Save the file to the uploads directory
            file_path = os.path.normpath(os.path.join(app.config["UPLOAD_FOLDER"], file.filename))
            if not file_path.startswith(app.config["UPLOAD_FOLDER"]):
                return {"error": "Invalid file path."}, 400
            file.save(file_path)

            # Insert data from the TSV file into the database
            if insert_tsv_to_db(file_path):
                return {"message": "File successfully uploaded and data inserted."}, 200
            return {"error": "Failed to insert data into the database."}, 500
        else:
            return {"error": "Invalid file format. Please upload a .tsv file."}, 400


if __name__ == "__main__":
    init_db()
    config = yaml.safe_load(open("config/default.yaml", encoding="utf-8"))
    app.config["insdc_country_code_mapping"] = config.get("insdc_country_code_mapping", {})
    debug_mode = os.getenv("FLASK_DEBUG", "False").lower() in ("true", "1", "t")
    app.run(debug=debug_mode)
