import pytest
from test_deacon import _config

from raw_reads_processing import deacon
from raw_reads_processing.bam_preparation import DeaconInputBatch, PreparedBamReads
from raw_reads_processing.datatypes import DeaconSummary
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure


def _summary(reads, host_reads, bases, host_bases):
    return DeaconSummary(
        time=1,
        seqs_in=reads,
        seqs_out=host_reads,
        seqs_out_proportion=host_reads / reads if reads else 0,
        bp_in=bases,
        bp_out=host_bases,
        bp_out_proportion=host_bases / bases if bases else 0,
    )


@pytest.mark.parametrize("singleton_host_reads", [0, 5])
def test_bam_qc_combines_counts_and_uses_one_read_length_threshold(
    tmp_path, monkeypatch, singleton_host_reads
):
    paths = tuple(tmp_path / name for name in ("first.fa", "second.fa", "single.fa"))
    for path, length in zip(paths, (150, 150, 75), strict=True):
        path.write_text(f">read\n{'A' * length}\n")
    prepared = PreparedBamReads(
        "original.bam",
        (DeaconInputBatch(paths[:2], 2), DeaconInputBatch(paths[2:], 98)),
        100,
    )
    summaries = iter(
        (
            _summary(2, 1, 300, 150),
            _summary(98, singleton_host_reads, 7350, singleton_host_reads * 75),
        )
    )
    thresholds, combined = [], []

    def run(paths, names, summary_path, threshold, config, **kwargs):
        thresholds.append(threshold)
        return next(summaries)

    monkeypatch.setattr(deacon, "_run_deacon_filter", run)
    monkeypatch.setattr(
        deacon, "log_deacon_summary", lambda summary, config: combined.append(summary)
    )
    if singleton_host_reads:
        with pytest.raises(InvalidSubmission) as error:
            deacon.validate_bam_with_deacon(prepared, str(tmp_path), _config())
        assert error.value.error.fileNames == ["original.bam"]
    else:
        deacon.validate_bam_with_deacon(prepared, str(tmp_path), _config())
    assert thresholds == [1, 1]
    assert combined[0].seqs_in == 100
    assert combined[0].seqs_out_proportion == (1 + singleton_host_reads) / 100
    assert combined[0].bp_in == 7650
    assert combined[0].bp_out_proportion == (150 + singleton_host_reads * 75) / 7650


@pytest.mark.parametrize("reads,bases", [(0, 150), (1, 0)])
def test_incomplete_deacon_screening_cannot_pass(tmp_path, monkeypatch, reads, bases):
    path = tmp_path / "reads.fa"
    path.write_text(">read\nAAAA\n")
    prepared = PreparedBamReads("original.bam", (DeaconInputBatch((path,), 1),), 1)
    monkeypatch.setattr(
        deacon, "_run_deacon_filter", lambda *a, **kw: _summary(reads, 0, bases, 0)
    )
    with pytest.raises(ProcessingFailure, match="original.bam"):
        deacon.validate_bam_with_deacon(prepared, str(tmp_path), _config())


def test_bam_batches_share_deadline_including_sampling(tmp_path, monkeypatch):
    clock, budgets = [100.0], []
    monkeypatch.setattr(deacon.time, "monotonic", lambda: clock[0])
    batches = tuple(DeaconInputBatch((tmp_path / str(i),), 1) for i in range(3))
    prepared = PreparedBamReads("original.bam", batches, 3)

    def sample(*args, **kwargs):
        clock[0] += 1
        return 150

    def run(*args, timeout_seconds):
        budgets.append(timeout_seconds)
        clock[0] += 3 if len(budgets) == 1 else 5
        return _summary(1, 0, 150, 0)

    monkeypatch.setattr(deacon, "median_read_length", sample)
    monkeypatch.setattr(deacon, "_run_deacon_filter", run)
    with pytest.raises(ProcessingFailure, match="original.bam.*10 seconds"):
        deacon.validate_bam_with_deacon(prepared, str(tmp_path), _config())
    assert budgets == [7, 4]
