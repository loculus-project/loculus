# Dummy Preprocessing Pipeline

This SARS-CoV-2 preprocessing pipeline is only for demonstration purposes. It returns a fixed aligned nucleotide
sequence and fixed amino acid sequences for S and ORF1a. As lineage, it returns randomly A.1, A.1.1, or A.2.

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
