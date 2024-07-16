from unittest.mock import Mock, patch

import pytest
from submission import Config, create_assembly, create_project, create_sample

# Setup a mock configuration
test_config = Config(
    username="test_user",
    password="test_password",
    url="https://test.url"
)

# Example XML responses (simplified)
test_project_xml_response = """
<RECEIPT>
    <PROJECT accession="PRJ123456" alias="alias123" status="received"/>
</RECEIPT>
"""

test_sample_xml_response = """
<RECEIPT>
    <SAMPLE accession="SMP123456" alias="alias123" status="received"/>
</RECEIPT>
"""

@pytest.fixture
def mock_requests_post_success():
    with patch('submission.requests.post') as mock_post:
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = test_project_xml_response
        mock_post.return_value = mock_response
        yield mock_post

def test_create_project_success(mock_requests_post_success):
    # Testing successful project creation
    response = create_project(test_config)
    assert response['RECEIPT']['PROJECT']['@accession'] == 'PRJ123456'
    mock_requests_post_success.assert_called_once()

def test_create_sample_success(mock_requests_post_success):
    # Testing successful sample registration
    with patch('submission.xmltodict.parse') as mock_parse:
        mock_parse.return_value = {
            'RECEIPT': {
                'SAMPLE': {
                    '@accession': 'SMP123456'
                }
            }
        }
        response = create_sample(test_config)
        assert response['RECEIPT']['SAMPLE']['@accession'] == 'SMP123456'
        mock_requests_post_success.assert_called_once()

def test_create_project_failure(mock_requests_post_success):
    # Testing project creation failure due to API error
    mock_requests_post_success.return_value.status_code = 500
    mock_requests_post_success.return_value.text = "Internal Server Error"
    with pytest.raises(Exception) as exc_info:
        create_project(test_config)
    assert "Error:" in str(exc_info.value)
    mock_requests_post_success.assert_called_once()

# Additional tests for create_assembly can be designed similarly once its implementation details are known.
