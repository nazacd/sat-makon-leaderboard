// ===== SAT-MAKON Data Types =====
// Matches spec §10 — Data model (forced by the decisions above)

/** Five criterion scores, each 0–10 in 0.5 steps */
export interface Scores {
    homework: number;
    progress: number;
    activity: number;
    attendance: number;
    behavior: number;
}

/** The five criterion keys */
export type CriterionKey = keyof Scores;

export const CRITERION_LABELS: Record<CriterionKey, string> = {
    homework: 'Full homework done',
    progress: 'Learning progress',
    activity: 'Activity in the lesson',
    attendance: 'Attendance',
    behavior: 'Behavior',
};

/** Enrollment status set at add-time — drives how eligibility_start is computed */
export type EnrollmentStatus = 'new' | 'established';

/** Staff roles */
export type StaffRole = 'teacher' | 'admin' | 'super_admin';

/** Year-month string, e.g. "2026-06" */
export type YearMonth = string;

// ===== Entities =====

export interface Student {
    id: string;
    full_name: string;
    enrollment_date: string; // ISO date
    enrollment_status: EnrollmentStatus;
    eligibility_start: YearMonth;
    archived: boolean;
}

export interface Subject {
    id: string;
    name: string;
    archived: boolean;
}

export interface Teacher {
    id: string;
    full_name: string;
    username: string;
    password: string; // MOCK ONLY — replaced by real auth before launch
    role: StaffRole;
    archived: boolean;
}

export interface Enrollment {
    student_id: string;
    subject_id: string;
    teacher_id: string | null; // null = enrolled but unassigned → Unassigned view
}

export interface Assessment {
    id: string;
    student_id: string;
    subject_id: string;
    teacher_id: string;
    created_at: string; // ISO datetime w/ timezone
    scores: Scores;
}

// ===== Config (§9 knobs) =====

export interface Config {
    alpha: number;                        // EWMA recency weight, default 0.4
    mid_month_cutoff_day: number;         // Day ≤ cutoff → eligible M+1; > → M+2
    stream_min_assessments: number;       // For a stream to qualify
    main_board_min_streams: number;       // Qualifying streams to appear on main board
    teacher_self_edit_window_days: number; // Days a teacher can self-edit
    top_n_main_page: number;             // TOP-N on main page before "see more"
    timezone: string;                     // Monthly reset boundary
    mask_format: string;                  // Soft mask format
}

// ===== Mock data file shape =====

export interface MockDataMeta {
    current_month: YearMonth;
    previous_month: YearMonth;
    timezone: string;
    note: string;
    mock_auth_password: string;
    edge_cases: Record<string, string>;
}

export interface MockDataFile {
    _meta: MockDataMeta;
    config: Config;
    subjects: Subject[];
    teachers: Teacher[];
    students: Student[];
    enrollments: Enrollment[];
    assessments: Assessment[];
}

// ===== Derived types (computed by engine, never stored in JSON) =====

export interface StreamResult {
    student_id: string;
    subject_id: string;
    month: YearMonth;
    rating: number;
    assessment_count: number;
    qualifies: boolean; // ≥ stream_min_assessments
}

export type EligibilityFailureReason =
    | 'settling'        // eligibility_start > current_month
    | 'single_subject'  // enrolled in < main_board_min_streams subjects
    | 'insufficient_data' // < main_board_min_streams qualifying streams
    | 'archived';       // student is archived

export interface EligibilityResult {
    eligible: boolean;
    failure_reasons: EligibilityFailureReason[];
    eligibility_start: YearMonth;
}

export interface BoardEntry {
    rank: number;
    student_id: string;
    student_name: string;
    masked_name: string;
    rating: number;
    assessment_count: number; // total assessments this month
    streams: StreamResult[];
    eligibility: EligibilityResult;
}
