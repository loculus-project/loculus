#!/usr/bin/env python3
"""
Unit test for the ENA assembly alias timestamp collision fix.
This test can be added to the existing test suite.
"""
import unittest
import re
import time
from unittest.mock import patch

# Import the functions we need to test
# Note: This assumes the test is run from the ena-submission directory
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../src'))

class TestTimestampCollisionFix(unittest.TestCase):
    """Test the timestamp collision fix for ENA assembly aliases"""
    
    def test_make_assembly_name_non_test_mode(self):
        """Test that non-test mode behavior is unchanged"""
        from ena_deposition.create_assembly import make_assembly_name
        
        result = make_assembly_name("LOC_0001TLY", "1", test=False)
        expected = "LOC_0001TLY.1"
        self.assertEqual(result, expected)
    
    def test_make_assembly_name_test_mode_format(self):
        """Test that test mode generates correctly formatted names"""
        from ena_deposition.create_assembly import make_assembly_name
        
        result = make_assembly_name("LOC_0001TLY", "1", test=True)
        
        # Should start with the base name
        self.assertTrue(result.startswith("LOC_0001TLY.1_"))
        
        # Should contain timestamp and random component
        # Format: LOC_0001TLY.1_YYYYMMDD_HHMMSS###RRRRR
        # Where ### are 3 digits of microseconds and RRRRR is 5-digit random number
        pattern = r'^LOC_0001TLY\.1_\d{8}_\d{6}\d{3}\d{5}$'
        self.assertRegex(result, pattern)
    
    def test_make_assembly_name_uniqueness(self):
        """Test that test mode generates unique names"""
        from ena_deposition.create_assembly import make_assembly_name
        
        names = []
        for _ in range(20):
            name = make_assembly_name("LOC_0001TLY", "1", test=True)
            names.append(name)
            time.sleep(0.001)  # Small delay to ensure different timestamps
        
        # All names should be unique
        self.assertEqual(len(names), len(set(names)))
    
    def test_get_alias_non_test_mode(self):
        """Test that non-test mode behavior is unchanged"""
        from ena_deposition.ena_submission_helper import get_alias
        
        result = get_alias("prefix", test=False)
        self.assertEqual(str(result), "prefix")
    
    def test_get_alias_test_mode_format(self):
        """Test that test mode generates correctly formatted aliases"""
        from ena_deposition.ena_submission_helper import get_alias
        
        result = get_alias("webin-genome-LOC_0001TLY.1", test=True)
        result_str = str(result)
        
        # Should start with prefix
        self.assertTrue(result_str.startswith("webin-genome-LOC_0001TLY.1:"))
        
        # Should contain timestamp with milliseconds and random component
        # Format: prefix:YYYY-MM-DD HH:MM:SS.mmm.RRRRR
        pattern = r'^webin-genome-LOC_0001TLY\.1:\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\.\d{5}$'
        self.assertRegex(result_str, pattern)
    
    def test_get_alias_uniqueness(self):
        """Test that test mode generates unique aliases"""
        from ena_deposition.ena_submission_helper import get_alias
        
        aliases = []
        for _ in range(20):
            alias = get_alias("webin-genome-LOC_0001TLY.1", test=True)
            aliases.append(str(alias))
            time.sleep(0.001)  # Small delay to ensure different timestamps
        
        # All aliases should be unique
        self.assertEqual(len(aliases), len(set(aliases)))
    
    def test_get_alias_set_suffix_behavior(self):
        """Test that set_alias_suffix parameter still works correctly"""
        from ena_deposition.ena_submission_helper import get_alias
        
        result = get_alias("prefix", test=True, set_alias_suffix="custom_suffix")
        self.assertEqual(str(result), "prefix:custom_suffix")
        
        # Should work regardless of test parameter when suffix is set
        result2 = get_alias("prefix", test=False, set_alias_suffix="custom_suffix")
        self.assertEqual(str(result2), "prefix:custom_suffix")

if __name__ == '__main__':
    # Simple test runner that doesn't require pytest
    unittest.main(verbosity=2)