"""
Upload / Ingestion endpoints.
POST /api/ingest/upload – accepts CSV files (loan_tape, servicer_update, document_manifest).

Supports background processing for large files (1M+ rows) to avoid HTTP timeouts.
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Query, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.database import get_db, SessionLocal
from app.core.security import UserRole, get_current_user, require_role
from app.schemas.loan import IngestionResult
from app.services.ingestion import (
    ingest_document_manifest,
    ingest_loan_tape,
    ingest_servicer_update,
)

router = APIRouter()


def _run_ingestion_background(content: bytes, filename: str, source_type: str, user_id: int):
    """Run ingestion in a background thread with its own DB session."""
    db = SessionLocal()
    try:
        import io
        if source_type == "servicer_update":
            ingest_servicer_update_sync(db, content, filename, user_id)
        elif source_type == "document_manifest":
            ingest_document_manifest_sync(db, content, filename, user_id)
        else:
            ingest_loan_tape_sync(db, content, filename, user_id)
    finally:
        db.close()


def ingest_loan_tape_sync(db: Session, content: bytes, filename: str, user_id: int):
    """Synchronous wrapper for background task."""
    import asyncio
    from fastapi import UploadFile as _UP
    import io

    from app.services.ingestion import ingest_loan_tape as _ingest
    # For background tasks, call the streaming version directly
    from app.services.ingestion import ingest_loan_tape_streaming
    ingest_loan_tape_streaming(db, content, filename, user_id)


def ingest_servicer_update_sync(db: Session, content: bytes, filename: str, user_id: int):
    from app.services.ingestion import ingest_servicer_update_streaming
    ingest_servicer_update_streaming(db, content, filename, user_id)


def ingest_document_manifest_sync(db: Session, content: bytes, filename: str, user_id: int):
    from app.services.ingestion import ingest_document_manifest_streaming
    ingest_document_manifest_streaming(db, content, filename, user_id)


@router.post(
    "/upload",
    response_model=IngestionResult,
    dependencies=[Depends(require_role(UserRole.DATA_OPERATOR, UserRole.REVIEWER, UserRole.ADMIN))],
)
async def upload_csv(
    file: UploadFile = File(...),
    source_type: str = Query(
        default="loan_tape",
        description="Type of CSV: 'loan_tape', 'servicer_update', or 'document_manifest'",
    ),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """
    Upload and ingest a CSV file.

    Source types:
    - **loan_tape**: Primary loan data (creates LOAN_IMPORTED events)
    - **servicer_update**: Servicer updates (detects conflicts with existing data)
    - **document_manifest**: Document checklist (flags missing documents)

    For files >50,000 rows, processing is done in the background.
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
