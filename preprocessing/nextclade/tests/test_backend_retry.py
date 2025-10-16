# ruff: noqa: S101

import pytest
import requests
from unittest.mock import Mock, patch
from loculus_preprocessing.config import Config
from loculus_preprocessing.backend import fetch_unprocessed_sequences, submit_processed_sequences


def test_fetch_unprocessed_sequences_retry_timeout():
    """Test that fetch_unprocessed_sequences retries on timeout and eventually fails."""
    config = Config()
    config.backend_retry_attempts = 3
    config.backend_timeout_seconds = 1
    config.backend_retry_initial_wait = 0.1  # Fast for testing
    config.backend_retry_max_wait = 0.5
    config.backend_retry_multiplier = 2.0
    config.backend_host = "http://test-backend"
    config.batch_size = 10
    config.pipeline_version = 1

    # Mock get_jwt to avoid JWT issues
    with patch('loculus_preprocessing.backend.get_jwt', return_value='test-token'):
        # Mock time.sleep to speed up tests
        with patch('time.sleep'):
            # Mock requests.post to always timeout
            with patch('requests.post', side_effect=requests.exceptions.Timeout("Request timed out")):
                with pytest.raises(requests.exceptions.Timeout):
                    fetch_unprocessed_sequences(None, config)


def test_fetch_unprocessed_sequences_retry_success_after_failures():
    """Test that fetch_unprocessed_sequences succeeds after some failures."""
    config = Config()
    config.backend_retry_attempts = 3
    config.backend_timeout_seconds = 1
    config.backend_retry_initial_wait = 0.1  # Fast for testing
    config.backend_retry_max_wait = 0.5
    config.backend_retry_multiplier = 2.0
    config.backend_host = "http://test-backend"
    config.batch_size = 10
    config.pipeline_version = 1

    # Create a mock response for successful call
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.text = ""  # Empty response for no unprocessed sequences
    mock_response.headers = {"ETag": "test-etag"}

    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:  # Fail first two attempts
            raise requests.exceptions.Timeout("Request timed out")
        return mock_response  # Succeed on third attempt

    # Mock get_jwt to avoid JWT issues
    with patch('loculus_preprocessing.backend.get_jwt', return_value='test-token'):
        # Mock time.sleep to speed up tests
        with patch('time.sleep'):
            # Mock requests.post to fail twice then succeed
            with patch('requests.post', side_effect=side_effect):
                result = fetch_unprocessed_sequences(None, config)
                # Should return the successful response
                assert result is not None
                assert call_count == 3  # Should have made 3 calls total


def test_submit_processed_sequences_retry_timeout():
    """Test that submit_processed_sequences retries on timeout and eventually fails."""
    config = Config()
    config.backend_retry_attempts = 2
    config.backend_timeout_seconds = 1
    config.backend_retry_initial_wait = 0.1  # Fast for testing
    config.backend_retry_max_wait = 0.5
    config.backend_retry_multiplier = 2.0
    config.backend_host = "http://test-backend"
    config.pipeline_version = 1

    # Mock get_jwt to avoid JWT issues
    with patch('loculus_preprocessing.backend.get_jwt', return_value='test-token'):
        # Mock time.sleep to speed up tests
        with patch('time.sleep'):
            # Mock requests.post to always timeout
            with patch('requests.post', side_effect=requests.exceptions.Timeout("Request timed out")):
                with pytest.raises(requests.exceptions.Timeout):
                    submit_processed_sequences([], "/tmp", config)


def test_config_retry_defaults():
    """Test that the config has sensible retry defaults."""
    config = Config()
    
    assert config.backend_timeout_seconds == 30  # Increased from 10
    assert config.backend_retry_attempts == 10
    assert config.backend_retry_initial_wait == 1.0
    assert config.backend_retry_max_wait == 60.0
    assert config.backend_retry_multiplier == 2.0