import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useData } from '@/services/DataProvider';
import { buildMainBoard, computePlainMonthAverage, computeAssessmentMean } from '@shared/engine';
import type { Assessment } from '@shared/types';
import { CRITERION_LABELS } from '@shared/types';

export default function StudentProfile() {
    const { id } = useParams<{ id: string }>();
    const data = useData();
    const config = data.getConfig();
    const currentMonth = data.getCurrentMonth();

    const student = data.getStudent(id ?? '');
    if (!student) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-20 text-center animate-fade-in">
                <div className="text-5xl mb-4">🔍</div>
                <h2 className="text-2xl font-bold text-neutral-800">Student not found</h2>
                <Link to="/" className="mt-6 inline-block text-primary-600 hover:text-primary-700 font-semibold">
                    ← Back to Leaderboard
                </Link>
            </div>
        );
    }

    const allStudents = data.getStudents();
    const allEnrollments = data.getEnrollments();
    const allAssessments = data.getAssessments();

    // Compute live board to find this student's rank
    const { board, ineligible } = useMemo(() => {
        return buildMainBoard(allStudents, allEnrollments, allAssessments, currentMonth, config);
    }, [allStudents, allEnrollments, allAssessments, currentMonth, config]);

    const boardEntry = [...board, ...ineligible].find(e => e.student_id === student.id);
    const isEligible = boardEntry?.eligibility.eligible ?? false;
    const rank = isEligible ? boardEntry?.rank : null;
    const rating = boardEntry?.rating ?? null;

    // Plain month average (§5.4)
    const plainAvg = useMemo(() => {
        return computePlainMonthAverage(allAssessments, student.id, currentMonth);
    }, [allAssessments, student.id, currentMonth]);

    // Student enrollments → teachers per subject (§5.4)
    const studentEnrollments = data.getEnrollmentsForStudent(student.id);
    const subjects = data.getSubjects();
    const allTeachers = data.getTeachers(true);

    const subjectTeacherList = useMemo(() => {
        return studentEnrollments.map(e => {
            const subject = subjects.find(s => s.id === e.subject_id);
            const teacher = e.teacher_id ? allTeachers.find(t => t.id === e.teacher_id) : null;
            return {
                subjectName: subject?.name ?? e.subject_id,
                teacherName: teacher?.full_name ?? (e.teacher_id ? 'Unknown' : 'Unassigned'),
            };
        });
    }, [studentEnrollments, subjects, allTeachers]);

    // Full assessment history — ALL months, newest first (§5.4: permanent archive)
    const allStudentAssessments = useMemo(() => {
        return data.getAssessmentsForStudent(student.id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }, [student.id]);

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
            <Link to="/" className="text-neutral-400 hover:text-primary-600 flex items-center gap-1 text-sm font-medium mb-6 transition-colors">
                ← Back to Leaderboard
            </Link>

            {/* Header Card */}
            <div className="bg-white rounded-3xl shadow-elevated border border-neutral-100 overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-primary-800 to-primary-600 px-8 py-6">
                    <h1 className="text-3xl font-extrabold text-white">{student.full_name}</h1>
                    <p className="text-primary-100 mt-1 text-sm">
                        Enrolled {student.enrollment_date} · {student.enrollment_status === 'new' ? 'New Student' : 'Established'}
                    </p>
                </div>

                {/* Freshman / Ineligible Banner (§5.4) */}
                {!isEligible && boardEntry && (
                    <div className="bg-warning-50 border-b border-warning-200 px-8 py-4">
                        <p className="text-warning-700 font-semibold flex items-center gap-2">⚠️ Not Ranked</p>
                        <p className="text-warning-600 text-sm mt-1">
                            {boardEntry.eligibility.failure_reasons.map(r => {
                                if (r === 'settling') return `Eligible from ${boardEntry.eligibility.eligibility_start}`;
                                if (r === 'single_subject') return 'Needs enrollment in ≥2 subjects';
                                if (r === 'insufficient_data') return 'Needs more assessments this month';
                                if (r === 'archived') return 'Student is archived';
                                return r;
                            }).join(' · ')}
                        </p>
                    </div>
                )}

                {/* Stats Row */}
                <div className="px-8 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <div>
                        <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-1">Rank</div>
                        <div className="text-3xl font-black text-primary-800">{rank ? `#${rank}` : '—'}</div>
                    </div>
                    <div>
                        <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-1">Rating</div>
                        <div className="text-3xl font-black text-primary-800">{rating !== null ? rating.toFixed(2) : '—'}</div>
                        <div className="text-[10px] text-neutral-400 mt-0.5 italic">weighted toward recent lessons</div>
                    </div>
                    <div>
                        <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-1">Month Average</div>
                        <div className="text-3xl font-black text-neutral-600">{plainAvg !== null ? plainAvg.toFixed(2) : '—'}</div>
                        <div className="text-[10px] text-neutral-400 mt-0.5 italic">plain arithmetic mean</div>
                    </div>
                    <div>
                        <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-1">Assessments</div>
                        <div className="text-3xl font-black text-neutral-600">{boardEntry?.assessment_count ?? 0}</div>
                        <div className="text-[10px] text-neutral-400 mt-0.5 italic">this month</div>
                    </div>
                </div>
            </div>

            {/* Teachers per Subject */}
            <div className="bg-white rounded-2xl shadow-card border border-neutral-100 p-6 mb-8">
                <h2 className="text-lg font-bold text-neutral-800 mb-4">📚 Subjects & Teachers</h2>
                {subjectTeacherList.length === 0 ? (
                    <p className="text-neutral-400">No enrollments found.</p>
                ) : (
                    <div className="space-y-3">
                        {subjectTeacherList.map((st, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                                <span className="font-semibold text-primary-700">{st.subjectName}</span>
                                <span className="text-neutral-600 text-sm">{st.teacherName}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Assessment History — newest first, expandable sub-scores (§5.4) */}
            <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-100">
                    <h2 className="text-lg font-bold text-neutral-800">📋 Assessment History</h2>
                    <p className="text-neutral-400 text-sm">Permanent archive — all months, newest first</p>
                </div>
                {allStudentAssessments.length === 0 ? (
                    <div className="p-8 text-center text-neutral-400">No assessments recorded yet.</div>
                ) : (
                    <div className="divide-y divide-neutral-100">
                        {allStudentAssessments.map((assessment) => (
                            <ExpandableAssessmentRow key={assessment.id} assessment={assessment} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function ExpandableAssessmentRow({ assessment }: { assessment: Assessment }) {
    const [expanded, setExpanded] = useState(false);
    const data = useData();
    const subject = data.getSubject(assessment.subject_id);
    const teacher = data.getTeacher(assessment.teacher_id);
    const mean = computeAssessmentMean(assessment.scores);
    const dateStr = assessment.created_at.slice(0, 10);

    return (
        <div>
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-neutral-50 transition-colors text-left"
            >
                <div className="flex items-center gap-4">
                    <div className="text-sm text-neutral-400 min-w-[80px] font-mono">{dateStr}</div>
                    <div>
                        <span className="font-semibold text-neutral-700">{subject?.name ?? assessment.subject_id}</span>
                        <span className="text-neutral-400 text-sm ml-2">by {teacher?.full_name ?? assessment.teacher_id}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="bg-primary-50 text-primary-800 font-bold px-3 py-1 rounded-lg text-sm border border-primary-100">
                        {mean.toFixed(2)}
                    </span>
                    <svg className={`w-4 h-4 text-neutral-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>
            {expanded && (
                <div className="px-6 pb-4 grid grid-cols-2 sm:grid-cols-5 gap-3 animate-fade-in">
                    {(Object.keys(CRITERION_LABELS) as (keyof typeof CRITERION_LABELS)[]).map((key) => (
                        <div key={key} className="bg-neutral-50 rounded-lg p-3 text-center border border-neutral-100">
                            <div className="text-xs text-neutral-500 mb-1 truncate">{CRITERION_LABELS[key]}</div>
                            <div className="text-lg font-bold text-primary-700">
                                {assessment.scores[key].toFixed(1)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
