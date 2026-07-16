# File Processing Service

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