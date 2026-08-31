/* ── TypeScript interfaces matching backend Pydantic schemas ── */

export interface User {
  user_id: number;
  username: string;
  email: string;
  role: 'DATA_OPERATOR' | 'REVIEWER' | 'DATA_CONSUMER';
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  username: string;
  role: string;
}

// ── The 21-field loan schema (PDF Section 6) ─────────────────
export interface LoanFields {
  loan_id: string | null;
  borrower_id: string | null;
  loan_type: string | null;
  origination_date: string | null;
  maturity_date: string | null;
  original_principal: number | null;
  current_balance: number | null;
  interest_rate: number | null;
  term_months: number | null;
  borrower_state: string | null;
  loan_purpose: string | null;
  credit_grade: string | null;
  employment_length: string | null;
  income_band: string | null;
  payment_status: string | null;
  days_past_due: number | null;
  servicer_name: string | null;
  last_payment_date: string | null;
  last_updated_at: string | null;
  document_status: string | null;
  source_system: string | null;
}

export interface LoanState extends LoanFields {
  event_count: number;
  last_event_type: string | null;
  last_event_at: string | null;
  has_exceptions: boolean;
  is_verified: boolean;
  record_hash: string | null;
}

export interface LoanListResponse {
  loans: LoanState[];
  total: number;
  page: number;
  page_size: number;
}

export interface LoanDetailResponse {
  loan: LoanState;
  events: LoanEvent[];
  exceptions: ExceptionRecord[];
}

// ── Events ───────────────────────────────────────────────────
export type EventType =
  | 'LOAN_IMPORTED'
  | 'VALIDATION_FAILED'
  | 'AI_PATCH_SUGGESTED'
  | 'HUMAN_EDIT_APPLIED'
  | 'AI_SUGGESTION_APPLIED'
  | 'LOAN_VERIFIED'
  | 'COMMENT_ADDED'
  | 'CONFLICT_DETECTED'
  | 'DOCUMENT_MISSING'
  | 'RULE_GENERATED'
  | 'EXCEPTION_RETURNED'
  | 'EXCEPTION_RESOLVED'
  | 'LOAN_REJECTED';

export interface LoanEvent {
  id: number;
  loan_id: string;
  event_type: EventType;
  payload: Record<string, unknown>;
  timestamp: string;
  user_id: number | null;
  username?: string;
  event_hash: string;
  source_file: string | null;
  source_line: number | null;
}

export interface AuditTrailResponse {
  loan_id: string;
  events: LoanEvent[];
  total_events: number;
  hash_chain_valid: boolean;
}

// ── Exceptions ───────────────────────────────────────────────
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ExceptionStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED';

export interface AISuggestion {
  suggested_patch: Record<string, unknown>;
  explanation: string;
  confidence: number;
  severity_assessment: string;
  model_name: string;
  generated_at: string;
  agentic_trace?: Array<{
    step: string;
    label: string;
    content: string;
    status: string;
  }>;
}

export interface ExceptionRecord {
  id: number;
  loan_id: string;
  rule_id: string;
  field_name: string;
  expected_value: string | null;
  actual_value: string | null;
  description: string | null;
  severity: Severity;
  status: ExceptionStatus;
  ai_suggestion?: Record<string, any> | null;
  reviewer_comment?: string | null;
  resolved_by?: number | null;
  resolved_by_username?: string | null;
  resolved_at?: string | null;
  resolution_type?: string | null;
  created_at: string;
}

export interface ExceptionListResponse {
  exceptions: ExceptionRecord[];
  total: number;
  page: number;
  page_size: number;
}

// ── Verified ─────────────────────────────────────────────────
export interface VerifiedLoanResponse {
  loan: LoanState;
  record_hash: string;
  verified_by: string | null;
  verified_at: string | null;
  hash_chain_valid: boolean;
}

export interface VerifiedLoanListResponse {
  loans: VerifiedLoanResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ── Audit / Time Travel ─────────────────────────────────────
export interface RewindResponse {
  loan_id: string;
  target_timestamp: string;
  projected_state: Record<string, unknown>;
  events_replayed: number;
  events_skipped: number;
  state_hash: string;
}

// ── AI ───────────────────────────────────────────────────────
export interface AIExplainResponse {
  exception_id: number;
  explanation: string;
  severity_assessment: string;
  suggestion: AISuggestion | null;
  model_name: string;
  generated_at: string;
}

export interface SuggestRuleResponse {
  rule_name: string;
  field_name: string;
  condition_json: Record<string, unknown> | null;
  transformation_json: Record<string, unknown> | null;
  error_message: string;
  severity: string;
  source_pattern: Record<string, unknown>;
  model_name: string;
  generated_at: string;
  auto_activated: boolean;
}

// ── Summary ──────────────────────────────────────────────────
export interface SummaryResponse {
  total_loans: number;
  total_events: number;
  total_exceptions: number;
  exceptions_by_severity: Record<Severity, number>;
  exceptions_by_status: Record<ExceptionStatus, number>;
  verified_loans: number;
  resolution_rate: number;
  ai_suggestions_generated: number;
  ai_suggestions_accepted: number;
  self_healing_rules: number;
  recent_uploads: Array<{
    filename: string;
    records: number;
    exceptions?: number;
    uploaded_at: string | null;
  }>;
  data_quality_score: number;
  clean_rows: number;
  loans_with_open_exceptions: number;
}

// ── Rules Engine ─────────────────────────────────────────────
export interface ValidationRule {
  id: number;
  rule_name: string;
  source: 'HARDCODED' | 'AI_SUGGESTED' | 'MANUAL';
  field_name: string;
  condition_json: string | null;
  transformation_json: string | null;
  logic_payload: string | null;
  error_message: string | null;
  severity: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED';
  created_by: string | null;
}

export interface RuleCreate {
  field_name: string;
  condition: string;
  transformation: string;
}

// ── Ingestion ────────────────────────────────────────────────
export interface IngestionResult {
  filename: string;
  total_rows: number;
  imported_count: number;
  failed_count: number;
  failed_rows: Array<Record<string, unknown>>;
  validation_exceptions: number;
  conflicts_detected: number;
  source_type: string;
}
