"""Submission endpoints for the ENA Deposition API."""

import logging
import math
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool

from ..call_loculus import fetch_released_entries
from ..submission_db_helper import (
    StatusAll,
    SubmissionTableEntry,
    TableName,
    add_to_submission_table,
    find_conditions_in_db,
    in_submission_table,
)
from .schemas import (
    PaginatedReadyToSubmit,
    PaginatedSubmissions,
    PreviewRequest,
    PreviewResponse,
    ReadyToSubmitItem,
    SubmissionDetail,
    SubmissionPreviewItem,
    SubmissionStatusAll,
    SubmissionSummary,
    SubmitError,
    SubmitRequest,
    SubmitResponse,
    TableStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


def get_db_pool() -> SimpleConnectionPool:
    """Get database connection pool from app state. Set by dependency injection."""
    from .app import get_db_conn_pool

    return get_db_conn_pool()


def _has_error_status(status_all: str) -> bool:
    """Check if status indicates an error."""
    return status_all.startswith("HAS_ERRORS") or status_all == "CANCELLED"


def _count_errors(submission: dict[str, Any]) -> int:
    """Count errors in a submission."""
    errors = submission.get("errors")
    if errors and isinstance(errors, list):
        return len(errors)
    return 1 if _has_error_status(submission.get("status_all", "")) else 0


def _get_table_status(
    db_pool: SimpleConnectionPool,
    table_name: TableName,
    accession: str,
    version: int,
) -> tuple[TableStatus | None, dict[str, Any] | None]:
    """Get status and result from a table for a given accession/version."""
    results = find_conditions_in_db(
        db_pool,
        table_name,
        {"accession": accession, "version": version},
    )
    if results:
        row = results[0]
        status = TableStatus(row["status"]) if row.get("status") else None
        result = row.get("result")
        return status, result
    return None, None


@router.get("", response_model=PaginatedSubmissions)
def list_submissions(
    status: str | None = Query(None, description="Filter by status"),
    organism: str | None = Query(None, description="Filter by organism"),
    group_id: int | None = Query(None, description="Filter by group ID"),
    page: int = Query(0, ge=0, description="Page number (0-indexed)"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
) -> PaginatedSubmissions:
    """List all submissions with pagination and filtering."""
    db_pool = get_db_pool()
    con = db_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Build query with filters
            query = "SELECT * FROM submission_table"
            count_query = "SELECT COUNT(*) FROM submission_table"
            conditions = []
            params: list[Any] = []

            if status:
                conditions.append("status_all = %s")
                params.append(status)
            if organism:
                conditions.append("organism = %s")
                params.append(organism)
            if group_id is not None:
                conditions.append("group_id = %s")
                params.append(group_id)

            if conditions:
                where_clause = " WHERE " + " AND ".join(conditions)
                query += where_clause
                count_query += where_clause

            # Get total count
            cur.execute(count_query, params)
            total = cur.fetchone()["count"]

            # Add pagination and ordering
            query += " ORDER BY started_at DESC LIMIT %s OFFSET %s"
            params.extend([size, page * size])

            cur.execute(query, params)
            rows = cur.fetchall()
    finally:
        db_pool.putconn(con)

    items = [
        SubmissionSummary(
            accession=row["accession"],
            version=row["version"],
            organism=row["organism"],
            group_id=row["group_id"],
            status_all=SubmissionStatusAll(row["status_all"]),
            started_at=row["started_at"],
            finished_at=row.get("finished_at"),
            has_errors=_has_error_status(row["status_all"]),
            error_count=_count_errors(row),
        )
        for row in rows
    ]

    return PaginatedSubmissions(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if size > 0 else 0,
    )


@router.get("/{accession}/{version}", response_model=SubmissionDetail)
def get_submission(accession: str, version: int) -> SubmissionDetail:
    """Get detailed information about a specific submission."""
    db_pool = get_db_pool()

    results = find_conditions_in_db(
        db_pool,
        TableName.SUBMISSION_TABLE,
        {"accession": accession, "version": version},
    )

    if not results:
        raise HTTPException(status_code=404, detail="Submission not found")

    row = results[0]

    # Get statuses from related tables
    project_status, project_result = None, None
    sample_status, sample_result = _get_table_status(
        db_pool, TableName.SAMPLE_TABLE, accession, version
    )
    assembly_status, assembly_result = _get_table_status(
        db_pool, TableName.ASSEMBLY_TABLE, accession, version
    )

    # For project, we need to look up by group_id and organism
    project_results = find_conditions_in_db(
        db_pool,
        TableName.PROJECT_TABLE,
        {"group_id": row["group_id"], "organism": row["organism"]},
    )
    if project_results:
        project_row = project_results[0]
        project_status = TableStatus(project_row["status"]) if project_row.get("status") else None
        project_result = project_row.get("result")

    return SubmissionDetail(
        accession=row["accession"],
        version=row["version"],
        organism=row["organism"],
        group_id=row["group_id"],
        status_all=SubmissionStatusAll(row["status_all"]),
        metadata=row.get("metadata") or {},
        unaligned_nucleotide_sequences=row.get("unaligned_nucleotide_sequences") or {},
        errors=row.get("errors"),
        warnings=row.get("warnings"),
        started_at=row["started_at"],
        finished_at=row.get("finished_at"),
        external_metadata=row.get("external_metadata"),
        project_status=project_status,
        sample_status=sample_status,
        assembly_status=assembly_status,
        project_result=project_result,
        sample_result=sample_result,
        assembly_result=assembly_result,
    )


@router.post("/preview", response_model=PreviewResponse)
def generate_preview(request: PreviewRequest) -> PreviewResponse:
    """Generate a preview of what will be submitted to ENA.

    Returns the submission data that can be edited before actual submission.
    """
    db_pool = get_db_pool()
    previews: list[SubmissionPreviewItem] = []

    for acc_ver in request.accessions:
        parts = acc_ver.split(".")
        if len(parts) != 2:
            continue

        accession, version_str = parts
        try:
            version = int(version_str)
        except ValueError:
            continue

        # Get submission data from database
        results = find_conditions_in_db(
            db_pool,
            TableName.SUBMISSION_TABLE,
            {"accession": accession, "version": version},
        )

        if results:
            row = results[0]
            validation_errors: list[str] = []
            validation_warnings: list[str] = []

            # Basic validation
            metadata = row.get("metadata") or {}
            sequences = row.get("unaligned_nucleotide_sequences") or {}

            if not metadata:
                validation_errors.append("Missing metadata")
            if not sequences:
                validation_errors.append("Missing nucleotide sequences")

            previews.append(
                SubmissionPreviewItem(
                    accession=accession,
                    version=version,
                    organism=row["organism"],
                    group_id=row["group_id"],
                    metadata=metadata,
                    unaligned_nucleotide_sequences=sequences,
                    validation_errors=validation_errors,
                    validation_warnings=validation_warnings,
                )
            )

    return PreviewResponse(previews=previews)


@router.post("/submit", response_model=SubmitResponse)
def submit_to_ena(request: SubmitRequest) -> SubmitResponse:
    """Submit sequences to ENA.

    Accepts the (possibly edited) submission data and queues it for ENA submission.
    """
    db_pool = get_db_pool()
    submitted: list[str] = []
    errors: list[SubmitError] = []

    for item in request.submissions:
        acc_ver = f"{item.accession}.{item.version}"

        # Check if already in submission table
        if in_submission_table(
            db_pool, {"accession": item.accession, "version": item.version}
        ):
            errors.append(
                SubmitError(
                    accession=item.accession,
                    version=item.version,
                    message="Submission already exists",
                )
            )
            continue

        # Validate required fields
        if not item.metadata:
            errors.append(
                SubmitError(
                    accession=item.accession,
                    version=item.version,
                    message="Missing metadata",
                )
            )
            continue

        if not item.unaligned_nucleotide_sequences:
            errors.append(
                SubmitError(
                    accession=item.accession,
                    version=item.version,
                    message="Missing nucleotide sequences",
                )
            )
            continue

        # Create submission entry
        entry = SubmissionTableEntry(
            accession=item.accession,
            version=item.version,
            organism=item.organism,
            group_id=item.group_id,
            metadata=item.metadata,
            unaligned_nucleotide_sequences=item.unaligned_nucleotide_sequences,
            status_all=StatusAll.READY_TO_SUBMIT,
        )

        if add_to_submission_table(db_pool, entry):
            submitted.append(acc_ver)
            logger.info(f"Queued submission {acc_ver} for ENA deposition")
        else:
            errors.append(
                SubmitError(
                    accession=item.accession,
                    version=item.version,
                    message="Failed to create submission entry",
                )
            )

    return SubmitResponse(submitted=submitted, errors=errors)


def get_app_config():
    """Get application config from app state."""
    from .app import get_config

    return get_config()


def _has_insdc_accession(metadata: dict[str, Any]) -> bool:
    """Check if the sequence already has an INSDC accession."""
    # Check for any insdcAccessionFull field that is not None/empty
    for key, value in metadata.items():
        if key.startswith("insdcAccessionFull") and value:
            return True
    return False


@router.get("/ready", response_model=PaginatedReadyToSubmit)
def list_ready_to_submit(
    organism: str | None = Query(None, description="Filter by organism"),
    group_id: int | None = Query(None, description="Filter by group ID"),
    page: int = Query(0, ge=0, description="Page number (0-indexed)"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
) -> PaginatedReadyToSubmit:
    """List sequences that are ready to be submitted to ENA.

    Fetches released sequences from the Loculus backend that don't have
    INSDC accessions yet and are not already in the submission queue.
    """
    config = get_app_config()
    db_pool = get_db_pool()

    # Get list of configured organisms for ENA deposition
    ena_organisms = list(config.enaOrganisms.keys())

    # Filter by organism if specified
    if organism:
        if organism not in ena_organisms:
            return PaginatedReadyToSubmit(
                items=[], total=0, page=page, size=size, pages=0
            )
        ena_organisms = [organism]

    all_items: list[ReadyToSubmitItem] = []

    for org in ena_organisms:
        try:
            for entry in fetch_released_entries(config, org):
                metadata = entry.get("metadata", {})

                # Skip if already has INSDC accession
                if _has_insdc_accession(metadata):
                    continue

                accession = metadata.get("accession")
                version = metadata.get("version")

                if not accession or version is None:
                    continue

                # Skip if already in submission table
                if in_submission_table(
                    db_pool, {"accession": accession, "version": version}
                ):
                    continue

                # Filter by group_id if specified
                entry_group_id = metadata.get("groupId")
                if group_id is not None and entry_group_id != group_id:
                    continue

                all_items.append(
                    ReadyToSubmitItem(
                        accession=accession,
                        version=version,
                        organism=org,
                        group_id=entry_group_id or 0,
                        group_name=metadata.get("groupName", ""),
                        submitted_date=metadata.get("submittedDate", ""),
                        metadata=metadata,
                        unaligned_nucleotide_sequences=entry.get(
                            "unalignedNucleotideSequences", {}
                        ),
                    )
                )
        except Exception as e:
            logger.warning(f"Failed to fetch released entries for {org}: {e}")
            continue

    # Sort by submitted date descending
    all_items.sort(key=lambda x: x.submitted_date, reverse=True)

    # Paginate
    total = len(all_items)
    start = page * size
    end = start + size
    paginated_items = all_items[start:end]

    return PaginatedReadyToSubmit(
        items=paginated_items,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if size > 0 else 0,
    )
