"""
Upload / Ingestion endpoints.
POST /api/ingest/upload – accepts CSV files (loan_tape, servicer_update, document_manifest).

Routes all uploads to the hardened streaming ingestion functions which include:
- try/except crash guards per row
- source-file dedup guards
- within-file dedup
- blank-row filtering
- dirty data sanitization (currency, rate, null sentinels)
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import UserRole, get_current_user, require_role
from app.schemas.loan import IngestionResult
from app.services.ingestion import (
    ingest_loan_tape_streaming,
    ingest_servicer_update_streaming,
    ingest_document_manifest_streaming,
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

    All uploads use the hardened streaming parsers with crash guards,
    dedup, and dirty-data sanitization.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are accepted. Please upload a .csv file.",
        )

    # ── Sequence Guard ──
    # Ensure a primary loan tape is uploaded before secondary files
    if source_type in ["servicer_update", "document_manifest"]:
        from app.models.event import EventType, LoanEvent
        has_loans = db.query(LoanEvent.id).filter(LoanEvent.event_type == EventType.LOAN_IMPORTED).first()
        if not has_loans:
            raise HTTPException(
                status_code=400,
                detail="Sequence Error: You must upload a primary loan_tape.csv first to establish the loan database before uploading secondary files."
            )

    user_id = current_user["user_id"]
    filename = file.filename or "upload.csv"

    try:
        content = await file.read()

        if source_type == "servicer_update":
            result = ingest_servicer_update_streaming(db, content, filename, user_id)
        elif source_type == "document_manifest":
            result = ingest_document_manifest_streaming(db, content, filename, user_id)
        else:
            result = ingest_loan_tape_streaming(db, content, filename, user_id)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ingestion failed: {str(e)}",
        )

    return IngestionResult(**result)
