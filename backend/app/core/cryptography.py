"""
Cryptographic utilities for record integrity.
  - compute_record_hash:  SHA-256 of a canonicalized JSON payload
  - compute_event_hash:   Chained hash (includes previous event hash)
"""

import hashlib
import json
from typing import Optional


def _canonicalize(data: dict) -> str:
    """Deterministic JSON serialization (sorted keys, no whitespace)."""
    return json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)


def compute_record_hash(data: dict) -> str:
    """
    SHA-256 hash of a canonicalized dict.
    Used to create the cryptographic fingerprint for verified loan records.
    """
    canonical = _canonicalize(data)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_event_hash(
    payload: dict,
    previous_hash: Optional[str] = None,
) -> str:
    """
    Chained SHA-256 hash for event integrity.
    Each event's hash includes the previous event's hash, forming a
    tamper-evident chain similar to a blockchain ledger.
    """
    raw = _canonicalize(payload)
    if previous_hash:
        raw = previous_hash + raw
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
