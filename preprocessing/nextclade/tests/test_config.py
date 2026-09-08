import pytest
from pydantic import ValidationError

from loculus_preprocessing.config import Config


def test_nextclade_jobs_defaults_to_one():
    if Config().nextclade_jobs != 1:
        pytest.fail("nextclade_jobs must default to 1")


@pytest.mark.parametrize("invalid_jobs", [0, -1])
def test_nextclade_jobs_must_be_positive(invalid_jobs: int):
    with pytest.raises(ValidationError):
        Config(nextclade_jobs=invalid_jobs)
