"""Error management endpoints for the ENA Deposition API."""

import logging
import math
from datetime import datetime
from typing import Any

import pytz
from fastapi import APIRouter, HTTPException, Query
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool

from ..submission_db_helper import (
    StatusAll,
    TableName,
    find_conditions_in_db,
    update_db_where_conditions,
)
from .schemas import (
    ActionResponse,
    ErrorItem,
    PaginatedErrors,
    RetryRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/errors", tags=["errors"])


def get_db_pool() -> SimpleConnectionPool:
    """Get database connection pool from app state."""
    from .app import get_db_conn_pool

    return get_db_conn_pool()


def _get_error_status_condition() -> str:
    """Get SQL condition for error statuses."""
    error_statuses = [
        "HAS_ERRORS_PROJECT",
        "HAS_ERRORS_SAMPLE",
        "HAS_ERRORS_ASSEMBLY",
        "HAS_ERRORS_EXT_METADATA_UPLOAD",
    ]
    return "status_all IN (" + ",".join([f"'{s}'" for s in error_statuses]) + ")"


def _determine_table_from_status(status_all: str) -> str:
    """Determine which table the error is in based on status."""
    if status_all == "HAS_ERRORS_PROJECT":
        return "project"
    if status_all == "HAS_ERRORS_SAMPLE":
        return "sample"
    if status_all == "HAS_ERRORS_ASSEMBLY":
        return "assembly"
    return "submission"


def _get_retry_status(current_status: str) -> str | None:
    """Get the status to reset to for retry."""
    status_map = {
        "HAS_ERRORS_PROJECT": StatusAll.READY_TO_SUBMIT,
        "HAS_ERRORS_SAMPLE": StatusAll.SUBMITTED_PROJECT,
        "HAS_ERRORS_ASSEMBLY": StatusAll.SUBMITTED_SAMPLE,
        "HAS_ERRORS_EXT_METADATA_UPLOAD": StatusAll.SUBMITTED_ALL,
    }
    return status_map.get(current_status)


@router.get("", response_model=PaginatedErrors)
def list_errors(
    table: str | None = Query(None, description="Filter by table (project/sample/assembly)"),
    organism: str | None = Query(None, description="Filter by organism"),
    group_id: int | None = Query(None, description="Filter by group ID"),
    page: int = Query(0, ge=0, description="Page number (0-indexed)"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
) -> PaginatedErrors:
    """List all submissions with errors."""
    db_pool = get_db_pool()
    con = db_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Build query
            query = f"SELECT * FROM submission_table WHERE {_get_error_status_condition()}"
            count_query = (
                f"SELECT COUNT(*) FROM submission_table WHERE {_get_error_status_condition()}"
            )
            params: list[Any] = []

            # Add filters
            if table:
                status_filter = {
                    "project": "HAS_ERRORS_PROJECT",
                    "sample": "HAS_ERRORS_SAMPLE",
                    "assembly": "HAS_ERRORS_ASSEMBLY",
                }.get(table)
                if status_filter:
                    query += " AND status_all = %s"
                    count_query += " AND status_all = %s"
                    params.append(status_filter)

            if organism:
                query += " AND organism = %s"
                count_query += " AND organism = %s"
                params.append(organism)

            if group_id is not None:
                query += " AND group_id = %s"
                count_query += " AND group_id = %s"
                params.append(group_id)

            # Get count
            cur.execute(count_query, params)
            total = cur.fetchone()["count"]

            # Add pagination
            query += " ORDER BY started_at DESC LIMIT %s OFFSET %s"
            params.extend([size, page * size])

            cur.execute(query, params)
            rows = cur.fetchall()
    finally:
        db_pool.putconn(con)

    items = [
        ErrorItem(
            accession=row["accession"],
            version=row["version"],
            organism=row["organism"],
            group_id=row["group_id"],
            table=_determine_table_from_status(row["status_all"]),
            error_messages=row.get("errors") or ["Unknown error"],
            status=row["status_all"],
            started_at=row["started_at"],
            can_retry=True,
        )
        for row in rows
    ]

    return PaginatedErrors(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if size > 0 else 0,
    )


@router.get("/{accession}/{version}", response_model=ErrorItem)
def get_error_details(accession: str, version: int) -> ErrorItem:
    """Get detailed error information for a submission."""
    db_pool = get_db_pool()

    results = find_conditions_in_db(
        db_pool,
        TableName.SUBMISSION_TABLE,
        {"accession": accession, "version": version},
    )

    if not results:
        raise HTTPException(status_code=404, detail="Submission not found")

    row = results[0]
    status_all = row["status_all"]

    if not status_all.startswith("HAS_ERRORS"):
        raise HTTPException(status_code=400, detail="Submission does not have errors")

    return ErrorItem(
        accession=row["accession"],
        version=row["version"],
        organism=row["organism"],
        group_id=row["group_id"],
        table=_determine_table_from_status(status_all),
        error_messages=row.get("errors") or ["Unknown error"],
        status=status_all,
        started_at=row["started_at"],
        can_retry=True,
    )


@router.post("/{accession}/{version}/retry", response_model=ActionResponse)
def retry_submission(
    accession: str,
    version: int,
    request: RetryRequest | None = None,
) -> ActionResponse:
    """Retry a failed submission."""
    db_pool = get_db_pool()

    # Get current submission
    results = find_conditions_in_db(
        db_pool,
        TableName.SUBMISSION_TABLE,
        {"accession": accession, "version": version},
    )

    if not results:
        raise HTTPException(status_code=404, detail="Submission not found")

    row = results[0]
    current_status = row["status_all"]

    if not current_status.startswith("HAS_ERRORS"):
        raise HTTPException(status_code=400, detail="Submission does not have errors")

    # Determine new status
    new_status = _get_retry_status(current_status)
    if not new_status:
        raise HTTPException(status_code=400, detail=f"Cannot retry from status {current_status}")

    # Update values
    update_values: dict[str, Any] = {
        "status_all": new_status,
        "errors": None,
        "started_at": datetime.now(tz=pytz.utc),
    }

    # Apply edited metadata if provided
    if request and request.edited_metadata:
        update_values["metadata"] = request.edited_metadata

    # Reset the submission
    updated = update_db_where_conditions(
        db_pool,
        TableName.SUBMISSION_TABLE,
        {"accession": accession, "version": version},
        update_values,
    )

    if updated:
        # Also clear errors in the related table
        table_name = {
            "HAS_ERRORS_PROJECT": TableName.PROJECT_TABLE,
            "HAS_ERRORS_SAMPLE": TableName.SAMPLE_TABLE,
            "HAS_ERRORS_ASSEMBLY": TableName.ASSEMBLY_TABLE,
        }.get(current_status)

        if table_name and table_name != TableName.PROJECT_TABLE:
            update_db_where_conditions(
                db_pool,
                table_name,
                {"accession": accession, "version": version},
                {"status": "READY", "errors": None},
            )

        logger.info(f"Reset submission {accession}.{version} from {current_status} to {new_status}")
        return ActionResponse(
            success=True,
            message=f"Submission reset to {new_status}",
        )

    return ActionResponse(
        success=False,
        message="Failed to update submission",
    )
