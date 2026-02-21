FROM rust:1.93-slim AS builder
RUN apt-get update && apt-get install -y pkg-config libssl-dev build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/sequlus /usr/local/bin/sequlus
ENTRYPOINT ["sequlus"]
