// ===== SAT-MAKON Rating Engine — Unit Tests =====
// Tests the tricky cases per the build prompt:
// - Replay correctness
// - EWMA α=0.4 blending
// - Freshman settling (both branches)
// - Transfer settles
// - Established skips settling
// - "Strong + thin = not yet ranked"
// - Tiebreaks
// - Soft-mask collisions
// - Full board against seed data edge cases

import { describe, it, expect } from 'vitest';
import {
    computeAssessmentMean,
    replayStream,
    buildStreams,
    computeMainRating,
    evaluateEligibility,
    computeEligibilityStart,
    formatMaskedNames,
    sortBoard,
    buildMainBoard,
    extractMonth,
    formatFailureReason,
} from '../index';
import seedData from '../../../src/data/satmakon-mock-data.json';
import type {
    Assessment,
    Config,
    Student,
    Enrollment,
    Scores,
    BoardEntry,
} from '../../types';

// ===== Test Config (§9 defaults) =====
const CONFIG: Config = {
    alpha: 0.4,
    mid_month_cutoff_day: 15,
    stream_min_assessments: 2,
    main_board_min_streams: 2,
    teacher_self_edit_window_days: 7,
    top_n_main_page: 30,
    timezone: 'Asia/Tashkent',
    mask_format: 'first_name_last_initial',
};

// ===== Helper: create a valid assessment =====
function makeAssessment(
    overrides: Partial<Assessment> & { scores: Scores },
): Assessment {
    return {
        id: `test_${Math.random().toString(36).slice(2, 8)}`,
        student_id: 'stu_test',
        subject_id: 'sub_test',
        teacher_id: 'tch_test',
        created_at: '2026-06-05T15:00:00+05:00',
        ...overrides,
    };
}

function makeScores(vals: [number, number, number, number, number]): Scores {
    return {
        homework: vals[0],
        progress: vals[1],
        activity: vals[2],
        attendance: vals[3],
        behavior: vals[4],
    };
}

// ===== §3.1 — Assessment Mean =====
describe('computeAssessmentMean', () => {
    it('computes arithmetic mean of five scores', () => {
        const scores = makeScores([9.0, 8.5, 8.5, 10.0, 7.5]);
        expect(computeAssessmentMean(scores)).toBeCloseTo(8.7, 2);
    });

    it('handles all zeros', () => {
        expect(computeAssessmentMean(makeScores([0, 0, 0, 0, 0]))).toBe(0);
    });

    it('handles all tens', () => {
        expect(computeAssessmentMean(makeScores([10, 10, 10, 10, 10]))).toBe(10);
    });

    it('handles 0.5 step values correctly', () => {
        const scores = makeScores([7.5, 8.0, 6.5, 9.5, 8.5]);
        expect(computeAssessmentMean(scores)).toBeCloseTo(8.0, 2);
    });
});

// ===== §3.2 — EWMA Stream Replay =====
describe('replayStream', () => {
    it('first assessment seeds the stream', () => {
        const assessments = [
            makeAssessment({ scores: makeScores([8, 8, 8, 8, 8]), created_at: '2026-06-01T10:00:00+05:00' }),
        ];
        const result = replayStream(assessments, 0.4);
        expect(result.rating).toBe(8.0);
        expect(result.assessment_count).toBe(1);
    });

    it('applies EWMA from the 2nd assessment', () => {
        const assessments = [
            makeAssessment({ scores: makeScores([8, 8, 8, 8, 8]), created_at: '2026-06-01T10:00:00+05:00' }),
            makeAssessment({ scores: makeScores([10, 10, 10, 10, 10]), created_at: '2026-06-08T10:00:00+05:00' }),
        ];
        const result = replayStream(assessments, 0.4);
        // First: 8.0 (seed)
        // Second: 0.4 * 10.0 + 0.6 * 8.0 = 4.0 + 4.8 = 8.8
        expect(result.rating).toBeCloseTo(8.8, 2);
    });

    it('chains EWMA across 3 assessments correctly', () => {
        const assessments = [
            makeAssessment({ scores: makeScores([6, 6, 6, 6, 6]), created_at: '2026-06-01T10:00:00+05:00' }),
            makeAssessment({ scores: makeScores([10, 10, 10, 10, 10]), created_at: '2026-06-08T10:00:00+05:00' }),
            makeAssessment({ scores: makeScores([8, 8, 8, 8, 8]), created_at: '2026-06-15T10:00:00+05:00' }),
        ];
        const result = replayStream(assessments, 0.4);
        // First: 6.0 (seed)
        // Second: 0.4 * 10 + 0.6 * 6 = 7.6
        // Third: 0.4 * 8 + 0.6 * 7.6 = 3.2 + 4.56 = 7.76
        expect(result.rating).toBeCloseTo(7.76, 2);
        expect(result.assessment_count).toBe(3);
    });

    it('order matters (path-dependent)', () => {
        const a1 = makeAssessment({ scores: makeScores([10, 10, 10, 10, 10]), created_at: '2026-06-01T10:00:00+05:00' });
        const a2 = makeAssessment({ scores: makeScores([6, 6, 6, 6, 6]), created_at: '2026-06-08T10:00:00+05:00' });

        const result1 = replayStream([a1, a2], 0.4);
        const result2 = replayStream([a2, a1], 0.4);

        // 10 then 6: 0.4*6 + 0.6*10 = 8.4
        // 6 then 10: 0.4*10 + 0.6*6 = 7.6
        expect(result1.rating).toBeCloseTo(8.4, 2);
        expect(result2.rating).toBeCloseTo(7.6, 2);
        expect(result1.rating).not.toBeCloseTo(result2.rating, 1);
    });

    it('returns empty result for no assessments', () => {
        const result = replayStream([], 0.4);
        expect(result.rating).toBe(0);
        expect(result.assessment_count).toBe(0);
    });
});

// ===== §3.3 — Build Streams =====
describe('buildStreams', () => {
    it('builds separate streams per (student, subject)', () => {
        const assessments = [
            makeAssessment({
                student_id: 's1', subject_id: 'math',
                scores: makeScores([8, 8, 8, 8, 8]), created_at: '2026-06-01T10:00:00+05:00',
            }),
            makeAssessment({
                student_id: 's1', subject_id: 'eng',
                scores: makeScores([6, 6, 6, 6, 6]), created_at: '2026-06-01T10:00:00+05:00',
            }),
            makeAssessment({
                student_id: 's1', subject_id: 'math',
                scores: makeScores([9, 9, 9, 9, 9]), created_at: '2026-06-08T10:00:00+05:00',
            }),
            makeAssessment({
                student_id: 's1', subject_id: 'eng',
                scores: makeScores([7, 7, 7, 7, 7]), created_at: '2026-06-08T10:00:00+05:00',
            }),
        ];

        const streams = buildStreams(assessments, '2026-06', CONFIG);
        expect(streams.size).toBe(2);

        const mathStream = streams.get('s1::math')!;
        expect(mathStream.assessment_count).toBe(2);
        expect(mathStream.qualifies).toBe(true);
        // Math: seed 8, then 0.4*9 + 0.6*8 = 8.4
        expect(mathStream.rating).toBeCloseTo(8.4, 2);

        const engStream = streams.get('s1::eng')!;
        expect(engStream.assessment_count).toBe(2);
        expect(engStream.qualifies).toBe(true);
        // Eng: seed 6, then 0.4*7 + 0.6*6 = 6.4
        expect(engStream.rating).toBeCloseTo(6.4, 2);
    });

    it('filters to the correct month only', () => {
        const assessments = [
            makeAssessment({
                student_id: 's1', subject_id: 'math',
                scores: makeScores([10, 10, 10, 10, 10]), created_at: '2026-05-01T10:00:00+05:00',
            }),
            makeAssessment({
                student_id: 's1', subject_id: 'math',
                scores: makeScores([5, 5, 5, 5, 5]), created_at: '2026-06-01T10:00:00+05:00',
            }),
        ];

        const juneStreams = buildStreams(assessments, '2026-06', CONFIG);
        expect(juneStreams.size).toBe(1);
        expect(juneStreams.get('s1::math')!.rating).toBe(5);
        expect(juneStreams.get('s1::math')!.qualifies).toBe(false); // only 1 assessment
    });

    it('marks stream as not qualifying with < 2 assessments', () => {
        const assessments = [
            makeAssessment({
                student_id: 's1', subject_id: 'math',
                scores: makeScores([8, 8, 8, 8, 8]), created_at: '2026-06-01T10:00:00+05:00',
            }),
        ];
        const streams = buildStreams(assessments, '2026-06', CONFIG);
        expect(streams.get('s1::math')!.qualifies).toBe(false);
    });
});

// ===== §3.3 — Main Rating =====
describe('computeMainRating', () => {
    it('computes mean of qualifying streams', () => {
        const streams = new Map([
            ['s1::math', { student_id: 's1', subject_id: 'math', month: '2026-06', rating: 8.4, assessment_count: 3, qualifies: true }],
            ['s1::eng', { student_id: 's1', subject_id: 'eng', month: '2026-06', rating: 7.2, assessment_count: 2, qualifies: true }],
        ]);
        const result = computeMainRating('s1', streams, CONFIG);
        expect(result).not.toBeNull();
        expect(result!.rating).toBeCloseTo(7.8, 2);
        expect(result!.totalAssessments).toBe(5);
    });

    it('returns null with only 1 qualifying stream ("strong + thin")', () => {
        const streams = new Map([
            ['s1::math', { student_id: 's1', subject_id: 'math', month: '2026-06', rating: 9.0, assessment_count: 4, qualifies: true }],
            ['s1::eng', { student_id: 's1', subject_id: 'eng', month: '2026-06', rating: 8.0, assessment_count: 1, qualifies: false }],
        ]);
        const result = computeMainRating('s1', streams, CONFIG);
        expect(result).toBeNull();
    });

    it('returns null with no qualifying streams', () => {
        const streams = new Map([
            ['s1::math', { student_id: 's1', subject_id: 'math', month: '2026-06', rating: 8.0, assessment_count: 1, qualifies: false }],
        ]);
        const result = computeMainRating('s1', streams, CONFIG);
        expect(result).toBeNull();
    });
});

// ===== §4.1 — Settling Rule =====
describe('computeEligibilityStart', () => {
    it('new student, joined day ≤15 → eligible M+1', () => {
        // Joined June 10 (day ≤ 15) → eligible July 2026
        expect(computeEligibilityStart('2026-06-10', 'new', '2026-06', 15)).toBe('2026-07');
    });

    it('new student, day =15 itself counts as ≤15 → eligible M+1', () => {
        expect(computeEligibilityStart('2026-06-15', 'new', '2026-06', 15)).toBe('2026-07');
    });

    it('new student, joined day >15 → eligible M+2', () => {
        // Joined June 20 (day > 15) → eligible August 2026
        expect(computeEligibilityStart('2026-06-20', 'new', '2026-06', 15)).toBe('2026-08');
    });

    it('established student → eligible from current month', () => {
        expect(computeEligibilityStart('2026-06-20', 'established', '2026-06', 15)).toBe('2026-06');
    });

    it('handles December → January rollover for ≤15', () => {
        // Joined Dec 10 (day ≤ 15) → eligible Jan next year
        expect(computeEligibilityStart('2026-12-10', 'new', '2026-12', 15)).toBe('2027-01');
    });

    it('handles November → January rollover for >15', () => {
        // Joined Nov 20 (day > 15) → eligible Jan next year
        expect(computeEligibilityStart('2026-11-20', 'new', '2026-11', 15)).toBe('2027-01');
    });
});

// ===== §4 — Eligibility Model =====
describe('evaluateEligibility', () => {
    const makeStudent = (overrides: Partial<Student>): Student => ({
        id: 'stu_test',
        full_name: 'Test Student',
        enrollment_date: '2025-09-02',
        enrollment_status: 'established',
        eligibility_start: '2025-10',
        archived: false,
        ...overrides,
    });

    it('eligible: settled + ≥2 subjects + ≥2 qualifying streams + not archived', () => {
        const student = makeStudent({});
        const enrollments: Enrollment[] = [
            { student_id: 'stu_test', subject_id: 'math', teacher_id: 't1' },
            { student_id: 'stu_test', subject_id: 'eng', teacher_id: 't2' },
        ];
        const streams = new Map([
            ['stu_test::math', { student_id: 'stu_test', subject_id: 'math', month: '2026-06', rating: 8, assessment_count: 3, qualifies: true }],
            ['stu_test::eng', { student_id: 'stu_test', subject_id: 'eng', month: '2026-06', rating: 7, assessment_count: 2, qualifies: true }],
        ]);
        const result = evaluateEligibility(student, enrollments, streams, '2026-06', CONFIG);
        expect(result.eligible).toBe(true);
        expect(result.failure_reasons).toEqual([]);
    });

    it('settling freshman (joined ≤15) fails settling gate', () => {
        const student = makeStudent({
            id: 'stu_freshman',
            enrollment_status: 'new',
            eligibility_start: '2026-07', // Not yet eligible in June 2026
        });
        const enrollments: Enrollment[] = [
            { student_id: 'stu_freshman', subject_id: 'math', teacher_id: 't1' },
            { student_id: 'stu_freshman', subject_id: 'eng', teacher_id: 't2' },
        ];
        const streams = new Map([
            ['stu_freshman::math', { student_id: 'stu_freshman', subject_id: 'math', month: '2026-06', rating: 8, assessment_count: 3, qualifies: true }],
            ['stu_freshman::eng', { student_id: 'stu_freshman', subject_id: 'eng', month: '2026-06', rating: 7, assessment_count: 2, qualifies: true }],
        ]);
        const result = evaluateEligibility(student, enrollments, streams, '2026-06', CONFIG);
        expect(result.eligible).toBe(false);
        expect(result.failure_reasons).toContain('settling');
    });

    it('transfer student (joined >15) also settles', () => {
        const student = makeStudent({
            id: 'stu_transfer',
            enrollment_status: 'new',
            eligibility_start: '2026-08', // Joined Jun 20, eligible Aug
        });
        const enrollments: Enrollment[] = [
            { student_id: 'stu_transfer', subject_id: 'math', teacher_id: 't1' },
            { student_id: 'stu_transfer', subject_id: 'eng', teacher_id: 't2' },
        ];
        const streams = new Map([
            ['stu_transfer::math', { student_id: 'stu_transfer', subject_id: 'math', month: '2026-06', rating: 8, assessment_count: 2, qualifies: true }],
            ['stu_transfer::eng', { student_id: 'stu_transfer', subject_id: 'eng', month: '2026-06', rating: 7, assessment_count: 2, qualifies: true }],
        ]);
        const result = evaluateEligibility(student, enrollments, streams, '2026-06', CONFIG);
        expect(result.eligible).toBe(false);
        expect(result.failure_reasons).toContain('settling');
    });

    it('single-subject student fails multi-subject gate', () => {
        const student = makeStudent({ id: 'stu_single' });
        const enrollments: Enrollment[] = [
            { student_id: 'stu_single', subject_id: 'math', teacher_id: 't1' },
        ];
        const streams = new Map([
            ['stu_single::math', { student_id: 'stu_single', subject_id: 'math', month: '2026-06', rating: 9, assessment_count: 4, qualifies: true }],
        ]);
        const result = evaluateEligibility(student, enrollments, streams, '2026-06', CONFIG);
        expect(result.eligible).toBe(false);
        expect(result.failure_reasons).toContain('single_subject');
        expect(result.failure_reasons).toContain('insufficient_data');
    });

    it('archived student fails archived gate', () => {
        const student = makeStudent({ archived: true });
        const enrollments: Enrollment[] = [
            { student_id: 'stu_test', subject_id: 'math', teacher_id: 't1' },
            { student_id: 'stu_test', subject_id: 'eng', teacher_id: 't2' },
        ];
        const streams = new Map([
            ['stu_test::math', { student_id: 'stu_test', subject_id: 'math', month: '2026-06', rating: 8, assessment_count: 3, qualifies: true }],
            ['stu_test::eng', { student_id: 'stu_test', subject_id: 'eng', month: '2026-06', rating: 7, assessment_count: 2, qualifies: true }],
        ]);
        const result = evaluateEligibility(student, enrollments, streams, '2026-06', CONFIG);
        expect(result.eligible).toBe(false);
        expect(result.failure_reasons).toContain('archived');
    });

    it('"strong + thin" — one qualifying stream, one not → insufficient data', () => {
        const student = makeStudent({ id: 'stu_thin' });
        const enrollments: Enrollment[] = [
            { student_id: 'stu_thin', subject_id: 'math', teacher_id: 't1' },
            { student_id: 'stu_thin', subject_id: 'eng', teacher_id: 't2' },
        ];
        const streams = new Map([
            ['stu_thin::math', { student_id: 'stu_thin', subject_id: 'math', month: '2026-06', rating: 9.2, assessment_count: 4, qualifies: true }],
            ['stu_thin::eng', { student_id: 'stu_thin', subject_id: 'eng', month: '2026-06', rating: 8.0, assessment_count: 1, qualifies: false }],
        ]);
        const result = evaluateEligibility(student, enrollments, streams, '2026-06', CONFIG);
        expect(result.eligible).toBe(false);
        expect(result.failure_reasons).toContain('insufficient_data');
    });
});

// ===== §5.2 — Masked Names =====
describe('formatMaskedNames', () => {
    it('formats "FirstName L." for non-colliding names', () => {
        const students = [
            { id: 's1', full_name: 'Aziz Karimov' },
            { id: 's2', full_name: 'Malika Yusupova' },
        ];
        const masks = formatMaskedNames(students);
        expect(masks.get('s1')).toBe('Aziz K.');
        expect(masks.get('s2')).toBe('Malika Y.');
    });

    it('adds trailing digits on collision', () => {
        const students = [
            { id: 's1', full_name: 'Aziz Karimov' },
            { id: 's2', full_name: 'Aziz Khorezmi' },
        ];
        const masks = formatMaskedNames(students);
        // Both map to "Aziz K." — collision
        // First (by id sort) keeps "Aziz K.", second gets "Aziz K. 2"
        expect(masks.get('s1')).toBe('Aziz K.');
        expect(masks.get('s2')).toBe('Aziz K. 2');
    });

    it('handles three-way collision', () => {
        const students = [
            { id: 's1', full_name: 'Aziz Karimov' },
            { id: 's2', full_name: 'Aziz Khorezmi' },
            { id: 's3', full_name: 'Aziz Kim' },
        ];
        const masks = formatMaskedNames(students);
        expect(masks.get('s1')).toBe('Aziz K.');
        expect(masks.get('s2')).toBe('Aziz K. 2');
        expect(masks.get('s3')).toBe('Aziz K. 3');
    });

    it('handles single-word name', () => {
        const students = [{ id: 's1', full_name: 'Aziz' }];
        const masks = formatMaskedNames(students);
        expect(masks.get('s1')).toBe('Aziz .');
    });
});

// ===== §3.7 — Tiebreaks =====
describe('sortBoard', () => {
    const makeEntry = (overrides: Partial<BoardEntry>): BoardEntry => ({
        rank: 0,
        student_id: 'test',
        student_name: 'Test',
        masked_name: 'Test T.',
        rating: 8.0,
        assessment_count: 4,
        streams: [],
        eligibility: { eligible: true, failure_reasons: [], eligibility_start: '2025-10' },
        ...overrides,
    });

    it('sorts by rating descending', () => {
        const entries = [
            makeEntry({ student_id: 'a', rating: 7.0 }),
            makeEntry({ student_id: 'b', rating: 9.0 }),
            makeEntry({ student_id: 'c', rating: 8.0 }),
        ];
        const sorted = sortBoard(entries);
        expect(sorted[0].student_id).toBe('b');
        expect(sorted[1].student_id).toBe('c');
        expect(sorted[2].student_id).toBe('a');
    });

    it('breaks rating tie by more assessments first', () => {
        const entries = [
            makeEntry({ student_id: 'a', rating: 8.0, assessment_count: 4 }),
            makeEntry({ student_id: 'b', rating: 8.0, assessment_count: 8 }),
        ];
        const sorted = sortBoard(entries);
        expect(sorted[0].student_id).toBe('b');
    });

    it('breaks full tie by alphabetical name', () => {
        const entries = [
            makeEntry({ student_id: 'a', student_name: 'Zara', rating: 8.0, assessment_count: 4 }),
            makeEntry({ student_id: 'b', student_name: 'Amir', rating: 8.0, assessment_count: 4 }),
        ];
        const sorted = sortBoard(entries);
        expect(sorted[0].student_name).toBe('Amir');
    });
});

// ===== Full Board Against Seed Data Edge Cases =====
describe('buildMainBoard with seed data', () => {
    const mockData = seedData as unknown as import('../../types').MockDataFile;

    const students = mockData.students;
    const enrollments = mockData.enrollments;
    const assessments = mockData.assessments;
    const config = mockData.config;
    const currentMonth = mockData._meta.current_month;

    it('produces a board with ranked students', () => {
        const { board } = buildMainBoard(students, enrollments, assessments, currentMonth, config);
        expect(board.length).toBeGreaterThan(0);
        // Ranks should be sequential
        for (let i = 0; i < board.length; i++) {
            expect(board[i].rank).toBe(i + 1);
        }
    });

    it('stu_freshman is NOT on the main board (settling until 2026-07)', () => {
        const { board, ineligible } = buildMainBoard(students, enrollments, assessments, currentMonth, config);
        expect(board.find((e) => e.student_id === 'stu_freshman')).toBeUndefined();
        const freshman = ineligible.find((e) => e.student_id === 'stu_freshman');
        expect(freshman).toBeDefined();
        expect(freshman!.eligibility.failure_reasons).toContain('settling');
    });

    it('stu_transfer is NOT on the main board (settling until 2026-08)', () => {
        const { board, ineligible } = buildMainBoard(students, enrollments, assessments, currentMonth, config);
        expect(board.find((e) => e.student_id === 'stu_transfer')).toBeUndefined();
        const transfer = ineligible.find((e) => e.student_id === 'stu_transfer');
        expect(transfer).toBeDefined();
        expect(transfer!.eligibility.failure_reasons).toContain('settling');
    });

    it('stu_single is NOT on the main board (single subject)', () => {
        const { board, ineligible } = buildMainBoard(students, enrollments, assessments, currentMonth, config);
        expect(board.find((e) => e.student_id === 'stu_single')).toBeUndefined();
        const single = ineligible.find((e) => e.student_id === 'stu_single');
        expect(single).toBeDefined();
        expect(single!.eligibility.failure_reasons).toContain('single_subject');
    });

    it('stu_thin is NOT on the main board (strong + thin = not ranked)', () => {
        const { board, ineligible } = buildMainBoard(students, enrollments, assessments, currentMonth, config);
        expect(board.find((e) => e.student_id === 'stu_thin')).toBeUndefined();
        const thin = ineligible.find((e) => e.student_id === 'stu_thin');
        expect(thin).toBeDefined();
        expect(thin!.eligibility.failure_reasons).toContain('insufficient_data');
    });

    it('stu_archived is NOT on the main board (archived)', () => {
        const { board, ineligible } = buildMainBoard(students, enrollments, assessments, currentMonth, config);
        expect(board.find((e) => e.student_id === 'stu_archived')).toBeUndefined();
        const archived = ineligible.find((e) => e.student_id === 'stu_archived');
        expect(archived).toBeDefined();
        expect(archived!.eligibility.failure_reasons).toContain('archived');
    });

    it('stu_unassigned is NOT on the main board (only Math qualifies, English unassigned)', () => {
        const { board, ineligible } = buildMainBoard(students, enrollments, assessments, currentMonth, config);
        expect(board.find((e) => e.student_id === 'stu_unassigned')).toBeUndefined();
        const unassigned = ineligible.find((e) => e.student_id === 'stu_unassigned');
        expect(unassigned).toBeDefined();
        expect(unassigned!.eligibility.failure_reasons).toContain('insufficient_data');
    });

    it('established students with ≥2 qualifying streams ARE on the board', () => {
        const { board } = buildMainBoard(students, enrollments, assessments, currentMonth, config);
        // stu_01 through stu_22 should generally be eligible (established, 2 subjects, June assessments)
        expect(board.find((e) => e.student_id === 'stu_01')).toBeDefined();
        expect(board.find((e) => e.student_id === 'stu_02')).toBeDefined();
        expect(board.find((e) => e.student_id === 'stu_03')).toBeDefined();
    });

    it('board ratings are in descending order', () => {
        const { board } = buildMainBoard(students, enrollments, assessments, currentMonth, config);
        for (let i = 1; i < board.length; i++) {
            expect(board[i - 1].rating).toBeGreaterThanOrEqual(board[i].rating);
        }
    });
});

// ===== Utility =====
describe('utility functions', () => {
    it('extractMonth extracts YYYY-MM from ISO string', () => {
        expect(extractMonth('2026-06-05T15:00:00+05:00')).toBe('2026-06');
        expect(extractMonth('2026-12-31T23:59:59+05:00')).toBe('2026-12');
    });

    it('formatFailureReason produces human-readable strings', () => {
        expect(formatFailureReason('settling', '2026-07')).toBe('Settling until 2026-07');
        expect(formatFailureReason('single_subject')).toBe('Needs 2nd subject');
        expect(formatFailureReason('insufficient_data')).toBe('Needs more assessments');
        expect(formatFailureReason('archived')).toBe('Archived');
    });
});
