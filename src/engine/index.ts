// ===== SAT-MAKON Rating Engine =====
// Pure, framework-agnostic TypeScript — no React imports.
// Everything visible (boards, ranks, eligibility) is derived from
// the immutable assessment log by replay, exactly as spec §3–4 require.
//
// This module is the canonical reference implementation.

import type {
    Assessment,
    Config,
    Student,
    Enrollment,
    StreamResult,
    EligibilityResult,
    EligibilityFailureReason,
    BoardEntry,
    Scores,
    YearMonth,
    CriterionKey,
} from '@/data/types';

// ===== §3.1 — Assessment Mean =====

const CRITERION_KEYS: CriterionKey[] = [
    'homework',
    'progress',
    'activity',
    'attendance',
    'behavior',
];

/** Compute the arithmetic mean of the five criterion scores */
export function computeAssessmentMean(scores: Scores): number {
    const sum = CRITERION_KEYS.reduce((acc, key) => acc + scores[key], 0);
    return sum / CRITERION_KEYS.length;
}

// ===== §3.2 — EWMA Stream Replay =====

/**
 * Replay a single stream for (student, subject) in a given month.
 * Assessments MUST be pre-sorted by created_at (ascending = chronological order).
 *
 * §3.2: First assessment seeds the stream (stream = that assessment mean).
 * Then blending begins: new_rating = α · mean + (1 − α) · previous_rating
 * Weighting is by assessment ORDER, not calendar days.
 */
export function replayStream(
    assessments: Assessment[],
    alpha: number,
): StreamResult & { assessmentMeans: number[] } {
    if (assessments.length === 0) {
        return {
            student_id: '',
            subject_id: '',
            month: '',
            rating: 0,
            assessment_count: 0,
            qualifies: false,
            assessmentMeans: [],
        };
    }

    const first = assessments[0];
    const assessmentMeans: number[] = [];
    let rating = 0;

    for (let i = 0; i < assessments.length; i++) {
        const mean = computeAssessmentMean(assessments[i].scores);
        assessmentMeans.push(mean);

        if (i === 0) {
            // First assessment seeds the stream
            rating = mean;
        } else {
            // EWMA blending from the 2nd assessment onwards
            rating = alpha * mean + (1 - alpha) * rating;
        }
    }

    return {
        student_id: first.student_id,
        subject_id: first.subject_id,
        month: extractMonth(first.created_at),
        rating: roundTo2(rating),
        assessment_count: assessments.length,
        qualifies: false, // Set by caller based on config
        assessmentMeans,
    };
}

// ===== §3.3 — Build All Streams for a Month =====

/**
 * Build all streams for all (student, subject) pairs in a given month.
 * Returns a Map keyed by `${student_id}::${subject_id}`.
 */
export function buildStreams(
    assessments: Assessment[],
    month: YearMonth,
    config: Config,
): Map<string, StreamResult> {
    // Filter to the target month and sort by created_at (order-based weighting)
    const monthAssessments = assessments
        .filter((a) => extractMonth(a.created_at) === month)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));

    // Group by (student, subject)
    const groups = new Map<string, Assessment[]>();
    for (const a of monthAssessments) {
        const key = `${a.student_id}::${a.subject_id}`;
        const group = groups.get(key) ?? [];
        group.push(a);
        groups.set(key, group);
    }

    // Replay each group
    const streams = new Map<string, StreamResult>();
    for (const [key, group] of groups) {
        const result = replayStream(group, config.alpha);
        result.qualifies = result.assessment_count >= config.stream_min_assessments;
        streams.set(key, result);
    }

    return streams;
}

// ===== §3.3 — Main Rating (mean of qualifying streams) =====

/**
 * Compute the main rating for a student: mean of their qualifying streams.
 * Returns null if not enough qualifying streams.
 */
export function computeMainRating(
    studentId: string,
    streams: Map<string, StreamResult>,
    config: Config,
): { rating: number; qualifyingStreams: StreamResult[]; totalAssessments: number } | null {
    const studentStreams: StreamResult[] = [];
    let totalAssessments = 0;

    for (const [key, stream] of streams) {
        if (key.startsWith(`${studentId}::`)) {
            studentStreams.push(stream);
            totalAssessments += stream.assessment_count;
        }
    }

    const qualifying = studentStreams.filter((s) => s.qualifies);
    if (qualifying.length < config.main_board_min_streams) {
        return null;
    }

    const rating = qualifying.reduce((sum, s) => sum + s.rating, 0) / qualifying.length;
    return {
        rating: roundTo2(rating),
        qualifyingStreams: qualifying,
        totalAssessments,
    };
}

// ===== §4 — Eligibility Model =====

/**
 * Evaluate eligibility for the main board.
 * Gates (ALL must hold): settled, ≥2 subjects, ≥2 qualifying streams, not archived.
 */
export function evaluateEligibility(
    student: Student,
    enrollments: Enrollment[],
    streams: Map<string, StreamResult>,
    currentMonth: YearMonth,
    config: Config,
): EligibilityResult {
    const reasons: EligibilityFailureReason[] = [];

    // Gate: not archived
    if (student.archived) {
        reasons.push('archived');
    }

    // Gate: settled — eligibility_start ≤ current_month
    if (student.eligibility_start > currentMonth) {
        reasons.push('settling');
    }

    // Gate: multi-subject — enrolled in ≥2 subjects
    const studentEnrollments = enrollments.filter(
        (e) => e.student_id === student.id
    );
    const activeSubjectCount = new Set(studentEnrollments.map((e) => e.subject_id)).size;
    if (activeSubjectCount < config.main_board_min_streams) {
        reasons.push('single_subject');
    }

    // Gate: data-sufficient — ≥2 qualifying streams
    const qualifyingStreamCount = countQualifyingStreams(student.id, streams);
    if (qualifyingStreamCount < config.main_board_min_streams) {
        reasons.push('insufficient_data');
    }

    return {
        eligible: reasons.length === 0,
        failure_reasons: reasons,
        eligibility_start: student.eligibility_start,
    };
}

function countQualifyingStreams(
    studentId: string,
    streams: Map<string, StreamResult>,
): number {
    let count = 0;
    for (const [key, stream] of streams) {
        if (key.startsWith(`${studentId}::`) && stream.qualifies) {
            count++;
        }
    }
    return count;
}

// ===== §4.1 — Settling / Eligibility Start Computation =====

/**
 * Compute eligibility_start from enrollment date and status.
 * - New student, joined day ≤ cutoff → eligible M+1
 * - New student, joined day > cutoff → eligible M+2
 * - Established student → eligible from current month
 */
export function computeEligibilityStart(
    enrollmentDate: string,
    enrollmentStatus: 'new' | 'established',
    currentMonth: YearMonth,
    midMonthCutoffDay: number,
): YearMonth {
    if (enrollmentStatus === 'established') {
        return currentMonth;
    }

    const date = new Date(enrollmentDate);
    const day = date.getDate();
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed

    if (day <= midMonthCutoffDay) {
        // Eligible M+1
        const nextMonth = month + 1;
        if (nextMonth > 11) {
            return `${year + 1}-01`;
        }
        return `${year}-${String(nextMonth + 1).padStart(2, '0')}`;
    } else {
        // Eligible M+2
        const futureMonth = month + 2;
        if (futureMonth > 11) {
            const overflow = futureMonth - 11;
            return `${year + 1}-${String(overflow).padStart(2, '0')}`;
        }
        return `${year}-${String(futureMonth + 1).padStart(2, '0')}`;
    }
}

// ===== §5.2 — Soft Mask Name Formatter =====

/**
 * Format a masked name: "FirstName L." with trailing digit on collision.
 * Collisions are scoped across all provided names.
 */
export function formatMaskedNames(
    students: { id: string; full_name: string }[],
): Map<string, string> {
    // Step 1: Generate base masks
    const baseMasks = new Map<string, string>();
    for (const s of students) {
        const parts = s.full_name.trim().split(/\s+/);
        const firstName = parts[0];
        const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : '';
        baseMasks.set(s.id, `${firstName} ${lastInitial}.`);
    }

    // Step 2: Detect collisions and add trailing digits
    const maskCounts = new Map<string, string[]>(); // mask → [student_ids]
    for (const [id, mask] of baseMasks) {
        const existing = maskCounts.get(mask) ?? [];
        existing.push(id);
        maskCounts.set(mask, existing);
    }

    const result = new Map<string, string>();
    for (const [mask, ids] of maskCounts) {
        if (ids.length === 1) {
            result.set(ids[0], mask);
        } else {
            // Collision — add trailing digits (1-indexed)
            // Sort by student id for deterministic ordering
            ids.sort();
            for (let i = 0; i < ids.length; i++) {
                // First occurrence gets no digit, subsequent get 2, 3, ...
                // Actually spec says "trailing digit for collisions" → "Aziz K. 2"
                // The first one is unmarked, second gets 2, third gets 3
                if (i === 0) {
                    result.set(ids[i], mask);
                } else {
                    result.set(ids[i], `${mask.slice(0, -1)}. ${i + 1}`);
                }
            }
        }
    }

    return result;
}

// ===== §3.7 — Tiebreaks =====

/**
 * Sort board entries by: rating DESC, then total assessments DESC, then alphabetical ASC.
 */
export function sortBoard(entries: BoardEntry[]): BoardEntry[] {
    return [...entries].sort((a, b) => {
        // Higher rating first
        if (b.rating !== a.rating) return b.rating - a.rating;
        // More assessments first
        if (b.assessment_count !== a.assessment_count) return b.assessment_count - a.assessment_count;
        // Alphabetical by full name
        return a.student_name.localeCompare(b.student_name);
    });
}

// ===== Full Board Builder =====

/**
 * Build the complete main board for a given month.
 * This is the top-level function that combines all engine pieces.
 */
export function buildMainBoard(
    students: Student[],
    enrollments: Enrollment[],
    assessments: Assessment[],
    currentMonth: YearMonth,
    config: Config,
): { board: BoardEntry[]; ineligible: BoardEntry[] } {
    // 1. Build all streams for the month
    const streams = buildStreams(assessments, currentMonth, config);

    // 2. Get masked names for all active students
    const activeStudents = students.filter((s) => !s.archived);
    const maskedNames = formatMaskedNames(activeStudents);

    // 3. Evaluate each student
    const boardEntries: BoardEntry[] = [];
    const ineligibleEntries: BoardEntry[] = [];

    for (const student of students) {
        const eligibility = evaluateEligibility(
            student,
            enrollments,
            streams,
            currentMonth,
            config,
        );

        // Collect this student's streams
        const studentStreams: StreamResult[] = [];
        let totalAssessments = 0;
        for (const [key, stream] of streams) {
            if (key.startsWith(`${student.id}::`)) {
                studentStreams.push(stream);
                totalAssessments += stream.assessment_count;
            }
        }

        // Compute main rating (only from qualifying streams)
        const mainRatingResult = computeMainRating(student.id, streams, config);

        const entry: BoardEntry = {
            rank: 0, // Will be assigned after sorting
            student_id: student.id,
            student_name: student.full_name,
            masked_name: maskedNames.get(student.id) ?? student.full_name,
            rating: mainRatingResult?.rating ?? 0,
            assessment_count: totalAssessments,
            streams: studentStreams,
            eligibility,
        };

        if (eligibility.eligible && mainRatingResult) {
            boardEntries.push(entry);
        } else {
            ineligibleEntries.push(entry);
        }
    }

    // 4. Sort and assign ranks
    const sorted = sortBoard(boardEntries);
    for (let i = 0; i < sorted.length; i++) {
        sorted[i].rank = i + 1;
    }

    return { board: sorted, ineligible: ineligibleEntries };
}

// ===== Utility Functions =====

/** Extract month (YYYY-MM) from an ISO datetime string */
export function extractMonth(dateStr: string): YearMonth {
    return dateStr.slice(0, 7);
}

/** Round to 2 decimal places */
function roundTo2(num: number): number {
    return Math.round(num * 100) / 100;
}

/**
 * Compute the plain arithmetic mean of all assessment means for a student in a month.
 * This is the optional "month average" secondary display mentioned in §5.4.
 */
export function computePlainMonthAverage(
    assessments: Assessment[],
    studentId: string,
    month: YearMonth,
): number | null {
    const relevant = assessments.filter(
        (a) => a.student_id === studentId && extractMonth(a.created_at) === month,
    );
    if (relevant.length === 0) return null;

    const sum = relevant.reduce((acc, a) => acc + computeAssessmentMean(a.scores), 0);
    return roundTo2(sum / relevant.length);
}

/**
 * Format a failure reason for display.
 */
export function formatFailureReason(reason: EligibilityFailureReason, eligibilityStart?: YearMonth): string {
    switch (reason) {
        case 'settling':
            return eligibilityStart ? `Settling until ${eligibilityStart}` : 'Still settling';
        case 'single_subject':
            return 'Needs 2nd subject';
        case 'insufficient_data':
            return 'Needs more assessments';
        case 'archived':
            return 'Archived';
    }
}
