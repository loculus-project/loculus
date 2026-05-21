import importlib.util
import os
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "config_processor",
    Path(__file__).with_name("config-processor.py"),
)
config_processor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config_processor)


class CopyStructureTest(unittest.TestCase):
    def test_copies_visible_tree_from_kubernetes_projected_volume(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            input_dir = Path(temp_dir) / "input"
            output_dir = Path(temp_dir) / "output"
            data_dir = input_dir / "..2026_05_21_11_23_27.000000000"
            organisms_dir = data_dir / "organisms"

            organisms_dir.mkdir(parents=True)
            (data_dir / "website_config.json").write_text('{"organisms": {}}')
            (organisms_dir / "cchf.json").write_text('{"schema": {"organismName": "CCHF"}}')

            os.symlink(data_dir.name, input_dir / "..data")
            os.symlink("..data/website_config.json", input_dir / "website_config.json")
            os.symlink("..data/organisms", input_dir / "organisms")

            config_processor.copy_structure(input_dir, output_dir)

            self.assertEqual((output_dir / "website_config.json").read_text(), '{"organisms": {}}')
            self.assertEqual(
                (output_dir / "organisms" / "cchf.json").read_text(),
                '{"schema": {"organismName": "CCHF"}}',
            )
            self.assertFalse((output_dir / data_dir.name).exists())


if __name__ == "__main__":
    unittest.main()
