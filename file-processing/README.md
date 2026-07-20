# File Processing Service

## Local development

Create an activate the micromamba environment using:
```
micromamba create -f environment.yaml
micromamba activate loculus-file-processing
pip install -e .
```

Download validation jar using:

```
curl -L -o readtools.jar \
  https://github.com/loculus-project/readtools/releases/download/v1.0.0/readtools-2.15.1-all.jar
READTOOLS_JAR="readtools.jar"
```

## Raw Reads Validation

In order to submit raw reads to ENA we need to ensure the files are of the correct format, we use ENA's validation tool to ensure this: https://github.com/loculus-project/readtools.
```
docker build \
  --build-arg VALIDATOR_VERSION=2.15.1 \
  --build-arg READTOOLS_REPO=https://github.com/YOUR_ORG/readtools.git \
  -t your-app .
```

```
java -jar /opt/app/lib/readtools.jar
```

Additionally, we use deacon for flagging if reads have not been properly dehosted.