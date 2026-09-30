import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "seed", Path(__file__).parent / "loculus/files/seed-preview-contributor.py"
)
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)
NAME = "Contributor Preview Testing"
INGEST = {"groupId": 1, "groupName": seed.INGEST_NAME}
CONTRIBUTOR = {"groupId": 2, "groupName": NAME}


class SeedTests(unittest.TestCase):
    def run_seed(self, responses):
        with patch.object(seed, "token", return_value="test"), patch.object(
            seed, "request", side_effect=responses
        ) as request:
            result = seed.seed(NAME)
            return result, request.call_args_list

    def test_waits_without_writing(self):
        result, calls = self.run_seed([[]])
        self.assertFalse(result)
        self.assertEqual(len(calls), 1)

    def test_creates_then_adds_and_verifies_membership(self):
        result, calls = self.run_seed([[INGEST], CONTRIBUTOR, [], None, [CONTRIBUTOR]])
        self.assertTrue(result)
        self.assertEqual(calls[1].args[1], "POST")
        self.assertEqual(calls[3].args, (f"{seed.BACKEND}/groups/2/users/testcontributor", "PUT"))

    def test_repeat_is_read_only(self):
        result, calls = self.run_seed([[INGEST, CONTRIBUTOR], [CONTRIBUTOR], [CONTRIBUTOR]])
        self.assertTrue(result)
        self.assertTrue(all(len(call.args) == 1 for call in calls))

    def test_restores_missing_membership(self):
        result, calls = self.run_seed([[INGEST, CONTRIBUTOR], [], None, [CONTRIBUTOR]])
        self.assertTrue(result)
        self.assertEqual(calls[2].args[1], "PUT")

    def test_wrong_group_one_fails_without_writing(self):
        with self.assertRaisesRegex(RuntimeError, "not the expected"):
            self.run_seed([[{"groupId": 1, "groupName": NAME}]])

    def test_occupied_group_two_fails(self):
        with self.assertRaisesRegex(RuntimeError, "Other groups"):
            self.run_seed([[INGEST, {"groupId": 2, "groupName": "Other"}]])

    def test_wrong_fixture_id_fails(self):
        with self.assertRaisesRegex(RuntimeError, "unexpected IDs"):
            self.run_seed([[INGEST, {"groupId": 3, "groupName": NAME}]])

    def test_unexpected_allocated_id_fails(self):
        with self.assertRaisesRegex(RuntimeError, "Allocated"):
            self.run_seed([[INGEST], {"groupId": 3}])


if __name__ == "__main__":
    unittest.main()
