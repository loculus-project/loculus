import io
import http.client
import unittest
import urllib.error
from unittest import mock

import enrich_genbank


EMPTY_RESPONSE = b"<GBSet />"


class FetchBatchRetryTest(unittest.TestCase):
    @mock.patch.object(enrich_genbank.random, "uniform", return_value=0)
    @mock.patch.object(enrich_genbank.time, "sleep")
    @mock.patch.object(enrich_genbank.urllib.request, "urlopen")
    def test_retries_429_with_exponential_backoff(
        self, urlopen, sleep, _uniform
    ):
        urlopen.side_effect = [
            urllib.error.HTTPError(
                "https://example.test", 429, "Too Many Requests", {}, None
            ),
            urllib.error.HTTPError(
                "https://example.test", 429, "Too Many Requests", {}, None
            ),
            io.BytesIO(EMPTY_RESPONSE),
        ]

        self.assertEqual(enrich_genbank.fetch_batch(["AB123.1"], "me@example.test", None), {})
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])

    @mock.patch.object(enrich_genbank.random, "uniform", return_value=0)
    @mock.patch.object(enrich_genbank.time, "sleep")
    @mock.patch.object(enrich_genbank.urllib.request, "urlopen")
    def test_honors_retry_after_header(self, urlopen, sleep, _uniform):
        urlopen.side_effect = [
            urllib.error.HTTPError(
                "https://example.test",
                429,
                "Too Many Requests",
                {"Retry-After": "12"},
                None,
            ),
            io.BytesIO(EMPTY_RESPONSE),
        ]

        enrich_genbank.fetch_batch(["AB123.1"], "me@example.test", "api-key")
        sleep.assert_called_once_with(12)

    @mock.patch.object(enrich_genbank.random, "uniform", return_value=0)
    @mock.patch.object(enrich_genbank.time, "sleep")
    @mock.patch.object(enrich_genbank.urllib.request, "urlopen")
    def test_retries_truncated_response(self, urlopen, sleep, _uniform):
        truncated = mock.MagicMock()
        truncated.__enter__.return_value.read.side_effect = http.client.IncompleteRead(
            b"<GBSet>"
        )
        urlopen.side_effect = [truncated, io.BytesIO(EMPTY_RESPONSE)]

        self.assertEqual(enrich_genbank.fetch_batch(["AB123.1"], "me@example.test", None), {})
        sleep.assert_called_once_with(1)

    @mock.patch.object(enrich_genbank.time, "sleep")
    @mock.patch.object(enrich_genbank.urllib.request, "urlopen")
    def test_does_not_retry_other_http_errors(self, urlopen, sleep):
        error = urllib.error.HTTPError(
            "https://example.test", 400, "Bad Request", {}, None
        )
        urlopen.side_effect = error

        with self.assertRaises(urllib.error.HTTPError) as raised:
            enrich_genbank.fetch_batch(["AB123.1"], "me@example.test", None)

        self.assertIs(raised.exception, error)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
