# Dummy Preprocessing Pipeline

This preprocessing pipeline is for demonstration and test purposes. 
It returns fixed SARS-CoV-2 sequences and the metadata that was provided by the submitter.
As lineage, it returns randomly A.1, A.1.1, or A.2.

It shows the easiest possible implementation of a preprocessing pipeline.
Note that a real-world implementation needs to validate the data.

This is also supposed to be used for local testing.
It can be used to prepare sequences to a desired state, e.g. with processing errors or warnings.

## Setup

### Start directly

Make sure that Python is installed. Here are the commands for getting the program running with a virtual environment on
a Unix system.

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Start from Docker

Build the image:

```bash
docker build -t pathoplexus-dummy-preprocessing .
```

Run on Mac and Windows:

```bash
docker run --rm pathoplexus-dummy-preprocessing --backend-host host.docker.internal
```

Run on Linux:

```bash
docker run --rm --network host pathoplexus-dummy-preprocessing
```

Run with `--help` to see available options.
