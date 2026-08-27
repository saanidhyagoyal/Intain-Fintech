"""
Upload / Ingestion endpoints.
POST /api/ingest/upload – accepts CSV files (loan_tape, servicer_update, document_manifest).
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import UserRole, get_current_user, require_role
from app.schemas.loan import IngestionResult
from app.services.ingestion import (
    ingest_document_manifest,
    ingest_loan_tape,
    ingest_servicer_update,
)

router = APIRouter()


@router.post(
    "/upload",
    response_model=IngestionResult,
    dependencies=[Depends(require_role(UserRole.DATA_OPERATOR, UserRole.REVIEWER))],
)
async def upload_csv(
    file: UploadFile = File(...),
    source_type: str = Query(
        default="loan_tape",
        description="Type of CSV: 'loan_tape', 'servicer_update', or 'document_manifest'",
    ),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload and ingest a CSV file.

    Source types:
    - **loan_tape**: Primary loan data (creates LOAN_IMPORTED events)
    - **servicer_update**: Servicer updates (detects conflicts with existing data)
    - **document_manifest**: Document checklist (flags missing documents)
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are accepted. Please upload a .csv file.",
        )

    user_id = current_user["user_id"]

    try:
        if source_type == "servicer_update":
            result = await ingest_servicer_update(db, file, user_id)
        elif source_type == "document_manifest":
            result = await ingest_document_manifest(db, file, user_id)
        else:
            result = await ingest_loan_tape(db, file, user_id)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ingestion failed: {str(e)}",
        )

    return IngestionResult(**result)
