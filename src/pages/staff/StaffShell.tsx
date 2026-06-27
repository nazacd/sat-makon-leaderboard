import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useData } from '@/services/DataProvider';
import type { Teacher, Subject, Student, Enrollment, Scores } from '@/data/types';
import { CRITERION_LABELS } from '@/data/types';
import { extractMonth, computeAssessmentMean } from '@/engine';

export default function StaffShell() {
    const data = useData();
    const teachers = data.getTeachers();
    const [loggedInTeacher, setLoggedInTeacher] = useState<Teacher | null>(null);
    const [deckOpen, setDeckOpen] = useState(false);

    if (!loggedInTeacher) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-12 animate-fade-in text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-warning-50 text-warning-700 text-sm font-medium mb-6">
                    <span className="w-2 h-2 rounded-full bg-warning-500 animate-pulse" />
                    Mock Auth Phase
                </div>
                <h1 className="text-4xl font-extrabold text-neutral-900 mb-2">Select a Teacher Profile</h1>
                <p className="text-neutral-500 mb-8">No self-signup — admin provisions all accounts.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {teachers.map((t) => (
                        <button key={t.id} onClick={() => setLoggedInTeacher(t)}
                            className="bg-white p-5 rounded-2xl shadow-card border border-neutral-100 hover:border-primary-300 hover:shadow-card-hover transition-all text-left flex flex-col items-center group">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                                <span className="text-primary-700 font-bold text-xl">{t.full_name.split(' ').map(n => n[0]).join('')}</span>
                            </div>
                            <span className="font-semibold text-neutral-800 text-lg group-hover:text-primary-700">{t.full_name}</span>
                            <span className="text-neutral-500 text-sm">{t.role}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (deckOpen) {
        return <MixedSubjectDeck teacher={loggedInTeacher} onBack={() => setDeckOpen(false)} />;
    }

    return (
        <TeacherDashboard
            teacher={loggedInTeacher}
            onLogout={() => { setLoggedInTeacher(null); setDeckOpen(false); }}
            onOpenDeck={() => setDeckOpen(true)}
        />
    );
}

// ===== Teacher Dashboard with per-subject roster lists (§6.3) =====

function TeacherDashboard({
    teacher, onLogout, onOpenDeck,
}: {
    teacher: Teacher; onLogout: () => void; onOpenDeck: () => void;
}) {
    const data = useData();
    const enrollments = data.getEnrollmentsForTeacher(teacher.id);
    const allSubjects = data.getSubjects();
    const allStudents = data.getStudents();

    // Group by subject
    const subjectGroups = useMemo(() => {
        const subjectIds = Array.from(new Set(enrollments.map(e => e.subject_id)));
        return subjectIds.map(sid => {
            const subject = allSubjects.find(s => s.id === sid)!;
            const studentIds = enrollments.filter(e => e.subject_id === sid).map(e => e.student_id);
            const students = allStudents.filter(s => studentIds.includes(s.id));
            return { subject, students };
        });
    }, [enrollments, allSubjects, allStudents]);

    // State for single-assess (§6.3)
    const [singleAssess, setSingleAssess] = useState<{ student: Student; subject: Subject } | null>(null);

    if (singleAssess) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
                <button onClick={() => setSingleAssess(null)} className="text-neutral-400 hover:text-neutral-600 text-sm font-medium mb-4">← Back to Dashboard</button>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-primary-700 to-primary-500 bg-clip-text text-transparent mb-6">
                    Assess: {singleAssess.student.full_name} — {singleAssess.subject.name}
                </h2>
                <AssessmentCardSingle
                    student={singleAssess.student}
                    subject={singleAssess.subject}
                    teacher={teacher}
                    onDone={() => setSingleAssess(null)}
                />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg">
                        {teacher.full_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-neutral-900">{teacher.full_name}</h2>
                        <p className="text-neutral-500 text-sm">Teacher Dashboard</p>
                    </div>
                </div>
                <button onClick={onLogout} className="text-neutral-500 hover:text-error-600 font-medium px-4 py-2">Sign Out</button>
            </div>

            {/* §6.2: "Assess all my students" button */}
            <button
                onClick={onOpenDeck}
                className="w-full mb-8 bg-gradient-to-r from-primary-600 to-primary-700 text-white font-bold py-4 px-6 rounded-2xl shadow-card hover:shadow-card-hover transition-all text-lg flex items-center justify-center gap-3"
            >
                🃏 Assess All My Students
                <span className="text-primary-200 text-sm font-normal">(Mixed subject deck)</span>
            </button>

            {/* §6.3: Per-subject student lists — tap → same single card */}
            <h3 className="text-2xl font-bold text-neutral-900 mb-6">Your Rosters</h3>
            {subjectGroups.length === 0 ? (
                <div className="text-center p-12 bg-white rounded-2xl border border-neutral-100 mb-8">
                    <p className="text-neutral-500">No assigned classes.</p>
                </div>
            ) : (
                <div className="space-y-6 mb-12">
                    {subjectGroups.map(({ subject, students }) => (
                        <div key={subject.id} className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                            <div className="bg-gradient-to-r from-primary-700 to-primary-500 px-6 py-3 flex justify-between items-center">
                                <h4 className="text-white font-bold">{subject.name}</h4>
                                <span className="text-primary-100 text-sm">{students.length} students</span>
                            </div>
                            <div className="divide-y divide-neutral-100">
                                {students.map(student => (
                                    <button
                                        key={student.id}
                                        onClick={() => setSingleAssess({ student, subject })}
                                        className="w-full px-6 py-3 flex items-center justify-between hover:bg-primary-50 transition-colors text-left"
                                    >
                                        <span className="font-medium text-neutral-700">{student.full_name}</span>
                                        <span className="text-primary-600 text-sm font-medium">Assess →</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* T7: Teacher self-edit window */}
            <TeacherRecentAssessments teacher={teacher} />
        </div>
    );
}

// ===== §6.4: Recent Assessments Edit List =====
function TeacherRecentAssessments({ teacher }: { teacher: Teacher }) {
    const data = useData();
    const config = data.getConfig();
    const [editingAss, setEditingAss] = useState<any>(null);
    const [editScores, setEditScores] = useState<Scores | null>(null);

    const assessments = data.getAssessmentsForTeacher(teacher.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

    if (assessments.length === 0) return null;

    const allStudents = data.getStudents(true);
    const allSubjects = data.getSubjects(true);

    const isEditable = (createdAt: string) => {
        const date = new Date(createdAt);
        const now = new Date();
        const diffDays = (now.getTime() - date.getTime()) / (1000 * 3600 * 24);
        return diffDays <= config.teacher_self_edit_window_days;
    };

    const handleEditSave = () => {
        if (!editingAss || !editScores) return;
        data.updateAssessment(editingAss.id, editScores);
        setEditingAss(null);
    };

    if (editingAss) {
        const student = allStudents.find(s => s.id === editingAss.student_id);
        const subject = allSubjects.find(s => s.id === editingAss.subject_id);
        const keys = ['homework', 'progress', 'activity', 'attendance', 'behavior'] as const;

        return (
            <div className="bg-white rounded-3xl shadow-elevated border border-primary-200 overflow-hidden mb-12">
                <div className="bg-neutral-50 px-8 py-6 border-b border-neutral-100">
                    <h2 className="text-xl font-bold">Edit Assessment</h2>
                    <p className="text-sm text-neutral-500">
                        {student?.full_name} — {subject?.name}
                    </p>
                </div>
                <div className="p-8 space-y-7">
                    {(Object.keys(CRITERION_LABELS) as (keyof typeof CRITERION_LABELS)[]).map((key) => {
                        const val = editScores![key];
                        return (
                            <div key={key} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                <label className="w-full sm:w-1/3 font-semibold text-sm text-neutral-700">{CRITERION_LABELS[key]}</label>
                                <div className="w-full sm:w-2/3 flex items-center gap-4">
                                    <input type="range" min="0" max="10" step="0.5" value={val}
                                        onChange={(e) => setEditScores({ ...editScores!, [key]: parseFloat(e.target.value) })}
                                        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary-600 bg-primary-100" />
                                    <div className="w-12 text-center font-bold px-2 py-1 rounded text-sm bg-primary-50 text-primary-800">
                                        {val.toFixed(1)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="bg-neutral-50 px-8 py-5 flex justify-between gap-4">
                    <button onClick={() => setEditingAss(null)} className="flex-1 py-3 bg-white border border-neutral-200 rounded-xl font-bold text-neutral-600">Cancel</button>
                    <button onClick={handleEditSave} className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-card">Update Scores</button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <h3 className="text-2xl font-bold text-neutral-900 mb-6">Recent Assessments</h3>
            <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                <div className="divide-y divide-neutral-100 max-h-96 overflow-y-auto">
                    {assessments.map(a => {
                        const student = allStudents.find(s => s.id === a.student_id);
                        const subject = allSubjects.find(s => s.id === a.subject_id);
                        const mean = computeAssessmentMean(a.scores);
                        const canEdit = isEditable(a.created_at);

                        return (
                            <div key={a.id} className="p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors">
                                <div>
                                    <div className="font-semibold text-neutral-800">{student?.full_name}</div>
                                    <div className="text-xs text-neutral-500">
                                        {subject?.name} · {a.created_at.slice(0, 10)}
                                    </div>
                                    <div className="mt-1 text-xs text-primary-700 font-bold bg-primary-50 inline-block px-2 py-0.5 rounded">
                                        Score: {mean.toFixed(2)}
                                    </div>
                                </div>
                                <div>
                                    {canEdit ? (
                                        <button onClick={() => { setEditingAss(a); setEditScores({ ...a.scores }); }}
                                            className="px-4 py-2 text-sm font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors">
                                            Edit
                                        </button>
                                    ) : (
                                        <span className="text-xs text-neutral-400 bg-neutral-50 border border-neutral-100 px-3 py-1.5 rounded-lg flex items-center gap-1">
                                            🔒 Locked
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// =====§6.2 Mixed-Subject Deck (T1) =====
// Both-subject student = two cards. Subject-tagged. Already-assessed marked (T4).

interface DeckCard {
    student: Student;
    subject: Subject;
    enrollment: Enrollment;
    alreadyAssessedThisWeek: boolean;
}

function MixedSubjectDeck({ teacher, onBack }: { teacher: Teacher; onBack: () => void }) {
    const data = useData();
    const currentMonth = data.getCurrentMonth();
    const enrollments = data.getEnrollmentsForTeacher(teacher.id);
    const allStudents = data.getStudents();
    const allSubjects = data.getSubjects();

    // Build all cards: one per (student, subject) enrollment
    const allCards: DeckCard[] = useMemo(() => {
        const studentMap = new Map(allStudents.map(s => [s.id, s]));
        const subjectMap = new Map(allSubjects.map(s => [s.id, s]));

        return enrollments.map(e => {
            const student = studentMap.get(e.student_id)!;
            const subject = subjectMap.get(e.subject_id)!;

            // T4: Check if already assessed this week
            const assessments = data.getAssessmentsForStudentSubject(e.student_id, e.subject_id, currentMonth);
            const teacherAssessments = assessments.filter(a => a.teacher_id === teacher.id);

            // "This week" = within last 7 days
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const alreadyAssessedThisWeek = teacherAssessments.some(a => new Date(a.created_at) >= weekAgo);

            return { student, subject, enrollment: e, alreadyAssessedThisWeek };
        }).filter(c => c.student && c.subject)
            // §6.2: Already-assessed included but sorted to end, defaulted to skip side
            .sort((a, b) => (a.alreadyAssessedThisWeek ? 1 : 0) - (b.alreadyAssessedThisWeek ? 1 : 0));
    }, [enrollments, allStudents, allSubjects, currentMonth, teacher.id]);

    // T5: Deck progress autosave (retains skipped cards or resumes queue if accidentally refreshed)
    const [queue, setQueue] = useState<DeckCard[]>(() => {
        const saved = localStorage.getItem(`sm_deck_queue_${teacher.id}_${currentMonth}`);
        if (saved) {
            try {
                const ids = JSON.parse(saved) as string[];
                const savedSet = new Set(ids);
                const restored = ids.map(id => allCards.find(c => `${c.student.id}_${c.subject.id}` === id)).filter(Boolean) as DeckCard[];
                const brandNew = allCards.filter(c => !savedSet.has(`${c.student.id}_${c.subject.id}`) && !c.alreadyAssessedThisWeek);
                return [...restored, ...brandNew];
            } catch (e) { }
        }
        return allCards;
    });

    useEffect(() => {
        localStorage.setItem(`sm_deck_queue_${teacher.id}_${currentMonth}`, JSON.stringify(queue.map(c => `${c.student.id}_${c.subject.id}`)));
    }, [queue, teacher.id, currentMonth]);
    const [history, setHistory] = useState<{ card: DeckCard; assessmentId?: string }[]>([]);

    const handleSubmit = (assessmentId: string) => {
        const current = queue[0];
        setHistory([...history, { card: current, assessmentId }]);
        setQueue(queue.slice(1));
    };

    const handleSkip = () => {
        const current = queue[0];
        setHistory([...history, { card: current }]);
        setQueue(queue.slice(1));
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const last = history[history.length - 1];
        if (last.assessmentId) data.deleteAssessment(last.assessmentId);
        setQueue([last.card, ...queue]);
        setHistory(history.slice(0, -1));
    };

    if (queue.length === 0) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center animate-fade-in">
                <div className="text-6xl mb-6">🎉</div>
                <h2 className="text-3xl font-extrabold text-neutral-900 mb-4">All Caught Up!</h2>
                <p className="text-neutral-500 text-lg mb-8">You've completed the entire deck.</p>
                <div className="flex justify-center gap-4">
                    <button onClick={onBack} className="px-6 py-3 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-semibold rounded-xl transition-colors">
                        Return to Dashboard
                    </button>
                    {history.length > 0 && (
                        <button onClick={handleUndo} className="px-6 py-3 bg-white hover:bg-neutral-50 text-primary-600 font-semibold rounded-xl border border-primary-200 transition-colors">
                            Undo Last
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const currentCard = queue[0];

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <button onClick={onBack} className="text-neutral-400 hover:text-neutral-600 flex items-center gap-1 text-sm font-medium mb-2">← Back to Dashboard</button>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-primary-700 to-primary-500 bg-clip-text text-transparent">
                        Assessment Deck
                    </h2>
                </div>
                <div className="flex items-center gap-4">
                    {history.length > 0 && (
                        <button onClick={handleUndo} className="text-primary-600 hover:text-primary-700 font-medium text-sm flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Undo
                        </button>
                    )}
                    <div className="bg-neutral-100 px-4 py-2 rounded-full font-semibold text-neutral-600 text-sm">
                        {allCards.length - queue.length + 1} / {allCards.length}
                    </div>
                </div>
            </div>

            <SwipeableCard
                key={`${currentCard.student.id}-${currentCard.subject.id}`}
                card={currentCard}
                teacher={teacher}
                currentMonth={currentMonth}
                onSubmit={handleSubmit}
                onSkip={handleSkip}
            />
        </div>
    );
}

// ===== Swipeable Assessment Card with gesture split (T2) =====

function SwipeableCard({
    card, teacher, currentMonth, onSubmit, onSkip,
}: {
    card: DeckCard; teacher: Teacher; currentMonth: string; onSubmit: (id: string) => void; onSkip: () => void;
}) {
    const data = useData();
    const { student, subject, alreadyAssessedThisWeek } = card;

    // Prefill from last assessment (§6.2)
    const prevAssessments = data.getAssessmentsForStudentSubject(student.id, subject.id);
    const lastAssessment = prevAssessments.length > 0
        ? [...prevAssessments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        : null;

    const defaultScores: Scores = lastAssessment
        ? { ...lastAssessment.scores }
        : { homework: 5, progress: 5, activity: 5, attendance: 5, behavior: 5 };

    const cacheKeyBase = `sm_deck_card_${teacher.id}_${student.id}_${subject.id}`;

    const [scores, setScores] = useState<Scores>(() => {
        const cached = localStorage.getItem(`${cacheKeyBase}_scores`);
        if (cached) { try { return JSON.parse(cached); } catch { } }
        return defaultScores;
    });

    // T3: Track which sliders have been explicitly touched
    const [touched, setTouched] = useState<Set<string>>(() => {
        const cached = localStorage.getItem(`${cacheKeyBase}_touched`);
        if (cached) { try { return new Set(JSON.parse(cached)); } catch { } }
        return lastAssessment ? new Set(Object.keys(defaultScores)) : new Set();
    });

    useEffect(() => {
        localStorage.setItem(`${cacheKeyBase}_scores`, JSON.stringify(scores));
    }, [scores, cacheKeyBase]);

    useEffect(() => {
        localStorage.setItem(`${cacheKeyBase}_touched`, JSON.stringify(Array.from(touched)));
    }, [touched, cacheKeyBase]);

    const allTouched = touched.size >= 5;

    // T2: Swipe gesture state
    const cardRef = useRef<HTMLDivElement>(null);
    const [swipeX, setSwipeX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    const isSliderDrag = useRef(false);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        // §6.2: Slider drag captured only on slider track
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' && target.getAttribute('type') === 'range') {
            isSliderDrag.current = true;
            return;
        }
        isSliderDrag.current = false;
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        setIsSwiping(true);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (isSliderDrag.current) return;
        const dx = e.touches[0].clientX - touchStartX.current;
        const dy = e.touches[0].clientY - touchStartY.current;
        // Only swipe if horizontal movement > vertical
        if (Math.abs(dx) > Math.abs(dy) + 10) {
            setSwipeX(dx);
        }
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (isSliderDrag.current) { isSliderDrag.current = false; return; }
        setIsSwiping(false);
        if (swipeX > 100 && allTouched) {
            // Right swipe = Submit
            doSubmit();
        } else if (swipeX < -100) {
            // Left swipe = Skip
            handleSkipClick();
        }
        setSwipeX(0);
    }, [swipeX, allTouched]);

    const doSubmit = () => {
        const dt = new Date();
        const created_at = `${currentMonth}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:00+05:00`;
        const result = data.addAssessment({
            student_id: student.id,
            subject_id: subject.id,
            teacher_id: teacher.id,
            scores: { ...scores },
            created_at,
        });
        localStorage.removeItem(`${cacheKeyBase}_scores`);
        localStorage.removeItem(`${cacheKeyBase}_touched`);
        onSubmit(result.id);
    };

    const handleSkipClick = () => {
        localStorage.removeItem(`${cacheKeyBase}_scores`);
        localStorage.removeItem(`${cacheKeyBase}_touched`);
        onSkip();
    };

    // Swipe visual indicator
    const swipeDirection = swipeX > 50 ? 'right' : swipeX < -50 ? 'left' : null;

    return (
        <div
            ref={cardRef}
            className="bg-white rounded-3xl shadow-elevated border border-neutral-100 overflow-hidden transform transition-transform duration-150 select-none relative"
            style={{ transform: isSwiping ? `translateX(${swipeX}px) rotate(${swipeX * 0.03}deg)` : undefined }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Swipe indicator overlays */}
            {swipeDirection === 'right' && (
                <div className="absolute inset-0 bg-success-500/10 border-4 border-success-500 rounded-3xl flex items-center justify-center z-10 pointer-events-none">
                    <span className="text-success-600 font-black text-3xl rotate-[-15deg]">SUBMIT ✓</span>
                </div>
            )}
            {swipeDirection === 'left' && (
                <div className="absolute inset-0 bg-error-500/10 border-4 border-error-500 rounded-3xl flex items-center justify-center z-10 pointer-events-none">
                    <span className="text-error-600 font-black text-3xl rotate-[15deg]">SKIP ✗</span>
                </div>
            )}

            {/* Card Header */}
            <div className="bg-neutral-50 px-8 py-6 border-b border-neutral-100 flex justify-between items-start">
                <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-black text-2xl shadow-sm">
                        {student.full_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-neutral-900">{student.full_name}</h2>
                        {/* §6.2: Subject tag */}
                        <span className="inline-block mt-1 bg-primary-50 text-primary-700 text-xs font-bold px-2 py-1 rounded border border-primary-100">
                            {subject.name}
                        </span>
                        <div className="flex gap-2 mt-2">
                            {lastAssessment && (
                                <span className="bg-success-50 text-success-700 text-xs font-semibold px-2 py-1 rounded">
                                    Prefilled from last week
                                </span>
                            )}
                            {alreadyAssessedThisWeek && (
                                <span className="bg-warning-50 text-warning-700 text-xs font-semibold px-2 py-1 rounded">
                                    Already assessed this week
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sliders */}
            <div className="p-8 space-y-7">
                {(Object.entries(CRITERION_LABELS) as [string, string][]).map(([key, label]) => {
                    const value = scores[key as keyof Scores];
                    const isTouched = touched.has(key);
                    return (
                        <div key={key} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <div className="w-full sm:w-1/3 flex items-center gap-2">
                                <label className={`font-semibold text-sm ${isTouched ? 'text-neutral-700' : 'text-neutral-400'}`}>
                                    {label}
                                </label>
                            </div>
                            <div className="w-full sm:w-2/3 flex items-center gap-4">
                                <input
                                    type="range" min="0" max="10" step="0.5"
                                    value={value}
                                    onChange={(e) => {
                                        setScores({ ...scores, [key]: parseFloat(e.target.value) });
                                        setTouched(new Set([...touched, key]));
                                    }}
                                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isTouched ? 'accent-primary-600 bg-primary-100' : 'accent-neutral-400 bg-neutral-200'}`}
                                />
                                <div className={`w-12 text-center font-bold px-2 py-1 rounded text-sm ${isTouched ? 'bg-primary-50 text-primary-800' : 'bg-neutral-100 text-neutral-400'}`}>
                                    {value.toFixed(1)}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {!allTouched && !lastAssessment && (
                    <p className="text-xs text-warning-600 text-center bg-warning-50 rounded-lg py-2">
                        ⚠️ Adjust all 5 criteria before submitting — prevents accidental default scores.
                    </p>
                )}
            </div>

            {/* Swipe hint (mobile) */}
            <div className="px-8 pb-2 text-center sm:hidden">
                <p className="text-[10px] text-neutral-400">← Swipe left to skip · Swipe right to submit →</p>
            </div>

            {/* Actions */}
            <div className="bg-neutral-50 px-8 py-5 border-t border-neutral-100 flex justify-between gap-4">
                <button onClick={handleSkipClick}
                    className="flex-1 py-3.5 bg-white border border-neutral-200 hover:bg-neutral-100 text-neutral-600 font-bold rounded-xl transition-colors">
                    Skip Student
                </button>
                <button onClick={doSubmit} disabled={!allTouched}
                    className="flex-1 py-3.5 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-card transition-colors flex justify-center items-center gap-2">
                    Submit Assessment
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </button>
            </div>
        </div>
    );
}

// ===== §6.3 — Single Card (reuses same assessment card UI) =====

function AssessmentCardSingle({
    student, subject, teacher, onDone,
}: {
    student: Student; subject: Subject; teacher: Teacher; onDone: () => void;
}) {
    const data = useData();
    const currentMonth = data.getCurrentMonth();

    const prevAssessments = data.getAssessmentsForStudentSubject(student.id, subject.id);
    const lastAssessment = prevAssessments.length > 0
        ? [...prevAssessments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        : null;

    const defaultScores: Scores = lastAssessment
        ? { ...lastAssessment.scores }
        : { homework: 5, progress: 5, activity: 5, attendance: 5, behavior: 5 };

    const [scores, setScores] = useState<Scores>(defaultScores);
    const [touched, setTouched] = useState<Set<string>>(lastAssessment ? new Set(Object.keys(defaultScores)) : new Set());
    const allTouched = touched.size >= 5;

    const handleSubmit = () => {
        const dt = new Date();
        const created_at = `${currentMonth}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:00+05:00`;
        data.addAssessment({
            student_id: student.id,
            subject_id: subject.id,
            teacher_id: teacher.id,
            scores: { ...scores },
            created_at,
        });
        onDone();
    };

    return (
        <div className="bg-white rounded-3xl shadow-elevated border border-neutral-100 overflow-hidden">
            <div className="bg-neutral-50 px-8 py-6 border-b border-neutral-100">
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-black text-xl">
                        {student.full_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-neutral-900">{student.full_name}</h2>
                        <span className="inline-block mt-1 bg-primary-50 text-primary-700 text-xs font-bold px-2 py-1 rounded border border-primary-100">{subject.name}</span>
                        {lastAssessment && (
                            <span className="ml-2 bg-success-50 text-success-700 text-xs font-semibold px-2 py-1 rounded">Prefilled from last week</span>
                        )}
                    </div>
                </div>
            </div>
            <div className="p-8 space-y-7">
                {(Object.entries(CRITERION_LABELS) as [string, string][]).map(([key, label]) => {
                    const value = scores[key as keyof Scores];
                    const isTouched = touched.has(key);
                    return (
                        <div key={key} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <label className={`w-full sm:w-1/3 font-semibold text-sm ${isTouched ? 'text-neutral-700' : 'text-neutral-400'}`}>{label}</label>
                            <div className="w-full sm:w-2/3 flex items-center gap-4">
                                <input type="range" min="0" max="10" step="0.5" value={value}
                                    onChange={(e) => {
                                        setScores({ ...scores, [key]: parseFloat(e.target.value) });
                                        setTouched(new Set([...touched, key]));
                                    }}
                                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isTouched ? 'accent-primary-600 bg-primary-100' : 'accent-neutral-400 bg-neutral-200'}`}
                                />
                                <div className={`w-12 text-center font-bold px-2 py-1 rounded text-sm ${isTouched ? 'bg-primary-50 text-primary-800' : 'bg-neutral-100 text-neutral-400'}`}>
                                    {value.toFixed(1)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="bg-neutral-50 px-8 py-5 border-t border-neutral-100 flex justify-between gap-4">
                <button onClick={onDone} className="flex-1 py-3.5 bg-white border border-neutral-200 hover:bg-neutral-100 text-neutral-600 font-bold rounded-xl">Cancel</button>
                <button onClick={handleSubmit} disabled={!allTouched}
                    className="flex-1 py-3.5 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-card flex justify-center items-center gap-2">
                    Submit
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </button>
            </div>
        </div>
    );
}
