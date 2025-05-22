# Makefile for Loculus Query Engine

.PHONY: help build run test test-components test-api clean logs

help:
	@echo "Available commands:"
	@echo "  build         - Build the Docker image"
	@echo "  run           - Run with docker-compose"
	@echo "  test          - Run all tests"
	@echo "  test-components - Test individual components"
	@echo "  test-api      - Test API endpoints"
	@echo "  logs          - Show service logs"
	@echo "  clean         - Clean up containers and volumes"

build:
	docker-compose build

run:
	docker-compose up -d
	@echo "Query engine starting at http://localhost:8080"
	@echo "Run 'make logs' to see the logs"

test: test-components test-api

test-components:
	python3 test_query_engine.py

test-api:
	@echo "Waiting for service to be ready..."
	@sleep 5
	python3 test_api.py

logs:
	docker-compose logs -f query-engine

clean:
	docker-compose down -v
	docker-compose rm -f

dev:
	uvicorn src.main:app --host 0.0.0.0 --port 8080 --reload

install:
	pip install -r requirements.txt