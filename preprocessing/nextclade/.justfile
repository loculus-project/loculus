all: ruff_format ruff_check run_mypy

create_env:
    micromamba create -f environment.yml --rc-file .mambarc

install:
    pip install -e .

install_test:
    pip install -e .[test]

r: ruff

ruff: ruff_check ruff_format

ruff_format:
    ruff format

ruff_check:
    ruff check --fix

run_mypy:
    mypy -p src --python-version 3.12 --pretty

install_dev_deps:
    micromamba install -f dev_dependencies.txt --rc-file .mambarc --platform osx-64

