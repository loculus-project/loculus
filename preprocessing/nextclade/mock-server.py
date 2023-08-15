"""
Testing server for processing pipeline
Run as `python mock-server.py`
Test with:
```bash
curl -X POST -sS -d "numberOfSequences=5" http://127.0.0.1:8079/extract-unprocessed-data 
```
"""
from flask import Flask, request, Response
import random
import ndjson

app = Flask(__name__)

mock_sequence = open("mock-unaligned.txt", "r").read().strip()


@app.route("/extract-unprocessed-data", methods=["POST"])
def extract_unprocessed_data():
    number_of_sequences = int(request.form.get("numberOfSequences", 0))

    data = []
    for _ in range(random.randint(0, number_of_sequences)):
        sequence_data = {
            "sequenceId": random.randint(1, 100000000),
            "data": {"unalignedNuc": mock_sequence, "extraData": "lorem ipsum"},
        }
        data.append(sequence_data)

    response = Response(ndjson.dumps(data))
    response.headers["Content-Type"] = "application/x-ndjson"

    return response


@app.route("/submit-processed-data", methods=["POST"])
def submit_processed_data():
    # Extract the NDJSON data from the incoming request
    data = request.data.decode("utf-8")

    # Printing the received NDJSON data to stdout
    print(data)

    # Return a success response
    return Response("Data received", status=200)


if __name__ == "__main__":
    app.run(debug=True, port=8079)
