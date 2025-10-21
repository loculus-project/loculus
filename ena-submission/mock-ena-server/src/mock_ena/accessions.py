"""Generate mock ENA accession numbers."""

import random
import string
from typing import Literal

AccessionType = Literal["PROJECT", "SAMPLE", "BIOSAMPLE", "ASSEMBLY", "SUBMISSION", "GCA"]


class AccessionGenerator:
    """Generate mock ENA-style accession numbers."""

    def __init__(self, seed: int = 42):
        """Initialize accession generator.

        Args:
            seed: Random seed for reproducible accession generation
        """
        self.random = random.Random(seed)
        self._counters = {
            "PROJECT": 1000,
            "SAMPLE": 2000,
            "BIOSAMPLE": 3000,
            "ASSEMBLY": 4000,
            "SUBMISSION": 5000,
            "GCA": 6000,
        }

    def generate(self, accession_type: AccessionType) -> str:
        """Generate a mock accession number.

        Args:
            accession_type: Type of accession to generate

        Returns:
            Mock accession string in ENA format
        """
        if accession_type == "PROJECT":
            # Format: PRJEB + 6 digits
            counter = self._counters["PROJECT"]
            self._counters["PROJECT"] += 1
            return f"PRJEB{counter:06d}"

        elif accession_type == "SAMPLE":
            # Format: ERS + 7 digits
            counter = self._counters["SAMPLE"]
            self._counters["SAMPLE"] += 1
            return f"ERS{counter:07d}"

        elif accession_type == "BIOSAMPLE":
            # Format: SAMEA + 7 digits
            counter = self._counters["BIOSAMPLE"]
            self._counters["BIOSAMPLE"] += 1
            return f"SAMEA{counter:07d}"

        elif accession_type == "ASSEMBLY":
            # Format: ERZ + 7 digits
            counter = self._counters["ASSEMBLY"]
            self._counters["ASSEMBLY"] += 1
            return f"ERZ{counter:07d}"

        elif accession_type == "GCA":
            # Format: GCA_ + 9 digits + .1 (version)
            counter = self._counters["GCA"]
            self._counters["GCA"] += 1
            return f"GCA_{counter:09d}.1"

        elif accession_type == "SUBMISSION":
            # Format: ERA-SUBMIT- + random alphanumeric
            random_id = ''.join(self.random.choices(
                string.ascii_uppercase + string.digits, k=12
            ))
            return f"ERA-SUBMIT-{random_id}"

        else:
            raise ValueError(f"Unknown accession type: {accession_type}")
