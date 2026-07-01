import { useState, useMemo } from 'react';
import { useData } from '@/services/DataProvider';
import { useAuth } from '@/services/AuthProvider';
import { buildMainBoard, formatFailureReason, computeEligibilityStart } from '@shared/engine';
import { canManageStaff, canArchiveStaff } from '@/services/permissions';
import Modal from '@/components/Modal';
import ChangeCredentialsModal from '@/components/ChangeCredentialsModal';
import { logAction, getAuditLog } from '@/services/auditLog';
import type { Teacher, Student, Subject } from '@shared/types';
import RosterModal from '@/pages/admin/RosterModal';

// ===== Shared button style helpers =====
const btnEdit = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-200 bg-white hover:border-primary-400 hover:text-primary-600 text-neutral-600 transition-colors';
const btnDanger = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-200 bg-white hover:border-error-400 hover:text-error-600 text-neutral-600 transition-colors';
const btnRoster = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-50 border border-primary-200 text-primary-700 hover:bg-primary-100 transition-colors';

// ===== Admin Views =====
type AdminView = 'overview' | 'students' | 'teachers' | 'subjects' | 'assessments' | 'audit';

export default function AdminShell() {
    const { session, logout } = useAuth();
    const [view, setView] = useState<AdminView>('overview');
    const [showCredentials, setShowCredentials] = useState(false);

    const tabs: { key: AdminView; label: string; icon: string }[] = [
        { key: 'overview', label: 'Overview', icon: '📊' },
        { key: 'students', label: 'Students', icon: '👥' },
        { key: 'teachers', label: 'Teachers', icon: '🎓' },
        { key: 'subjects', label: 'Subjects', icon: '📚' },
        { key: 'assessments', label: 'Assessments', icon: '📝' },
        { key: 'audit', label: 'Audit Log', icon: '📋' },
    ];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 text-primary-700 text-sm font-medium mb-4">
                        <span className="w-2 h-2 rounded-full bg-error-500" />
                        {session?.role === 'super_admin' ? 'Super Admin' : 'Admin'} · {session?.full_name}
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-neutral-900 tracking-tight">
                        Admin <span className="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">Dashboard</span>
                    </h1>
                </div>
                <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => setShowCredentials(true)}
                        className="px-4 py-2 text-sm font-semibold border border-neutral-200 bg-white text-neutral-600 rounded-xl hover:border-primary-400 hover:text-primary-600 transition-colors">
                        Change Credentials
                    </button>
                    <button onClick={logout} className={btnDanger}>Sign Out</button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex flex-wrap justify-center gap-2 mb-8">
                {tabs.map(tab => (
                    <button key={tab.key} onClick={() => setView(tab.key)}
                        className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2
                            ${view === tab.key ? 'bg-primary-600 text-white shadow-card' : 'bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-200'}`}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {view === 'overview' && <OverviewView />}
            {view === 'students' && <StudentsView />}
            {view === 'teachers' && <TeachersView />}
            {view === 'subjects' && <SubjectsView />}
            {view === 'assessments' && <AssessmentsView />}
            {view === 'audit' && <AuditView />}

            {showCredentials && session && (
                <ChangeCredentialsModal teacher={session} onClose={() => setShowCredentials(false)} />
            )}
        </div>
    );
}

// ===== Overview =====
function OverviewView() {
    const data = useData();
    const students = data.getStudents(true);
    const teachers = data.getTeachers().filter(t => t.role === 'teacher');
    const subjects = data.getSubjects();
    const unassigned = data.getUnassignedEnrollments();
    const config = data.getConfig();

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard icon="👥" value={students.filter(s => !s.archived).length} label="Active Students" />
                <StatCard icon="🎓" value={teachers.length} label="Teachers" />
                <StatCard icon="📚" value={subjects.length} label="Subjects" />
                <StatCard icon="⚠️" value={unassigned.length} label="Unassigned Pairs" accent />
            </div>
            <UnassignedQueue />
            <div className="bg-neutral-900 rounded-3xl p-8 border border-neutral-800 text-neutral-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-600 rounded-full blur-3xl opacity-20 pointer-events-none translate-x-10 -translate-y-10" />
                <h2 className="text-xl font-bold text-white mb-6">⚙️ Engine Configuration</h2>
                <div className="space-y-4">
                    <CfgRow label="EWMA Alpha" value={config.alpha} />
                    <CfgRow label="Min Assessments per Stream" value={config.stream_min_assessments} />
                    <CfgRow label="Min Qualifying Streams" value={config.main_board_min_streams} />
                    <CfgRow label="Self-Edit Window" value={`${config.teacher_self_edit_window_days} days`} />
                    <CfgRow label="Top-N Main Page" value={config.top_n_main_page} />
                    <CfgRow label="Mid-Month Cutoff Day" value={config.mid_month_cutoff_day} />
                    <CfgRow label="Timezone" value={config.timezone} />
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, value, label, accent }: { icon: string; value: number; label: string; accent?: boolean }) {
    return (
        <div className={`bg-white rounded-xl shadow-card border p-6 text-center hover:border-primary-300 transition-colors
            ${accent ? 'border-l-4 border-l-error-500 border-t border-r border-b border-neutral-100' : 'border-neutral-100'}`}>
            <div className="text-3xl mb-2">{icon}</div>
            <div className={`text-3xl font-bold ${accent ? 'text-error-600' : 'text-primary-800'}`}>{value}</div>
            <div className="text-sm font-semibold text-neutral-500 mt-1 uppercase tracking-wider">{label}</div>
        </div>
    );
}

function CfgRow({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-400">{label}</span>
            <span className="text-sm font-bold text-white bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded">{value}</span>
        </div>
    );
}

// ===== Unassigned Queue =====
function UnassignedQueue() {
    const data = useData();
    const unassigned = data.getUnassignedEnrollments();
    const teachers = data.getTeachers().filter(t => t.role === 'teacher');
    const [assignments, setAssignments] = useState<Record<string, string>>({});

    const handleAssign = (studentId: string, subjectId: string) => {
        const key = `${studentId}::${subjectId}`;
        const teacherId = assignments[key];
        if (!teacherId) return;
        data.setEnrollmentTeacher(studentId, subjectId, teacherId);
        logAction('admin', 'assign_teacher', `${studentId}/${subjectId}`, 'null', teacherId);
        setAssignments({ ...assignments, [key]: '' });
    };

    if (unassigned.length === 0) {
        return (
            <div className="bg-success-50 border border-success-200 rounded-2xl p-8 text-center">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="text-lg font-bold text-success-800">All students assigned!</h3>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
            <div className="bg-warning-50 px-6 py-4 border-b border-warning-200">
                <h2 className="font-bold text-warning-800">⚠️ Unassigned Pairs ({unassigned.length})</h2>
            </div>
            <div className="p-6 space-y-3">
                {unassigned.map(e => {
                    const student = data.getStudent(e.student_id);
                    const subject = data.getSubject(e.subject_id);
                    const key = `${e.student_id}::${e.subject_id}`;
                    return (
                        <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                            <div>
                                <div className="font-bold text-neutral-800">{student?.full_name ?? e.student_id}</div>
                                <div className="text-sm text-primary-600 font-medium">{subject?.name ?? e.subject_id}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <select title="Select teacher" value={assignments[key] || ''}
                                    onChange={ev => setAssignments({ ...assignments, [key]: ev.target.value })}
                                    className="bg-white border border-neutral-300 text-neutral-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                                    <option value="" disabled>Select Teacher...</option>
                                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                </select>
                                <button onClick={() => handleAssign(e.student_id, e.subject_id)} disabled={!assignments[key]}
                                    className="px-4 py-2 bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg hover:bg-primary-700 transition-colors">
                                    Assign
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ===== Students CRUD =====
function StudentsView() {
    const data = useData();
    const { session } = useAuth();
    const students = data.getStudents(true);
    const enrollments = data.getEnrollments();
    const assessments = data.getAssessments();
    const config = data.getConfig();
    const currentMonth = data.getCurrentMonth();
    const subjects = data.getSubjects();
    const teachers = data.getTeachers().filter(t => t.role === 'teacher');

    const { board, ineligible } = useMemo(() => {
        return buildMainBoard(data.getStudents(), enrollments, assessments, currentMonth, config);
    }, [students, enrollments, assessments, currentMonth, config]);
    const allEntries = [...board, ...ineligible];

    // Add modal state
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newStatus, setNewStatus] = useState<'new' | 'established'>('new');
    const [subjectTeachers, setSubjectTeachers] = useState<Record<string, string>>({});

    // Edit modal state
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [editName, setEditName] = useState('');
    const [editTeacherMap, setEditTeacherMap] = useState<Record<string, string | null>>({});
    const [enrolledSubjectIds, setEnrolledSubjectIds] = useState<Set<string>>(new Set());

    const [filter, setFilter] = useState('');
    const filteredStudents = students.filter(s => s.full_name.toLowerCase().includes(filter.toLowerCase()));

    const handleAddStudent = () => {
        if (!newName.trim()) return;
        const now = new Date().toISOString().slice(0, 10);
        const eligStart = computeEligibilityStart(now, newStatus, currentMonth, config.mid_month_cutoff_day);
        const student = data.addStudent({
            full_name: newName.trim(),
            enrollment_date: now,
            enrollment_status: newStatus,
            eligibility_start: eligStart,
            archived: false,
        });
        logAction(session?.full_name ?? 'admin', 'add_student', student.id, undefined, `${newName} (${newStatus})`);
        for (const [subjectId, teacherId] of Object.entries(subjectTeachers)) {
            if (teacherId) {
                data.assignStudentToTeacher(student.id, subjectId, teacherId);
                logAction(session?.full_name ?? 'admin', 'assign_teacher_on_create', `${student.id}/${subjectId}`, undefined, teacherId);
            }
        }
        setNewName(''); setNewStatus('new'); setSubjectTeachers({}); setShowAdd(false);
    };

    const handleArchive = (s: Student) => {
        if (!confirm(`Archive ${s.full_name}? They will be removed from the live board.`)) return;
        data.archiveStudent(s.id);
        logAction(session?.full_name ?? 'admin', 'archive_student', s.id, 'active', 'archived');
    };

    const openEditModal = (s: Student) => {
        const enrs = data.getEnrollmentsForStudent(s.id);
        const enrolledIds = new Set(enrs.map(e => e.subject_id));
        const map: Record<string, string | null> = {};
        for (const sub of subjects) map[sub.id] = null;
        for (const e of enrs) map[e.subject_id] = e.teacher_id;
        setEditingStudent(s);
        setEditName(s.full_name);
        setEditTeacherMap(map);
        setEnrolledSubjectIds(enrolledIds);
    };

    const handleMakeEligibleNow = () => {
        if (!editingStudent) return;
        const updated = data.updateStudent(editingStudent.id, { eligibility_start: currentMonth });
        if (updated) {
            logAction(session?.full_name ?? 'admin', 'instant_eligibility', editingStudent.id, editingStudent.eligibility_start, currentMonth);
            setEditingStudent(updated);
        }
    };

    const handleSaveEdit = () => {
        if (!editingStudent || !editName.trim()) return;

        if (editName.trim() !== editingStudent.full_name) {
            data.updateStudent(editingStudent.id, { full_name: editName.trim() });
            logAction(session?.full_name ?? 'admin', 'edit_student_name', editingStudent.id, editingStudent.full_name, editName.trim());
        }

        // Persist teacher assignment changes
        const original = data.getEnrollmentsForStudent(editingStudent.id);
        for (const [subjectId, newTid] of Object.entries(editTeacherMap)) {
            const wasEnrolled = enrolledSubjectIds.has(subjectId);
            const subName = subjects.find(s => s.id === subjectId)?.name ?? subjectId;
            if (!wasEnrolled && newTid !== null) {
                // New enrollment — student was not in this subject before
                data.assignStudentToTeacher(editingStudent.id, subjectId, newTid);
                const newTname = data.getTeacher(newTid)?.full_name ?? newTid;
                logAction(session?.full_name ?? 'admin', 'add_enrollment',
                    `${editingStudent.full_name}/${subName}`, undefined, newTname);
            } else if (wasEnrolled) {
                const origTid = original.find(e => e.subject_id === subjectId)?.teacher_id ?? null;
                if (newTid !== origTid) {
                    data.setEnrollmentTeacher(editingStudent.id, subjectId, newTid);
                    const prevTname = origTid ? (data.getTeacher(origTid)?.full_name ?? origTid) : 'Unassigned';
                    const newTname = newTid ? (data.getTeacher(newTid)?.full_name ?? newTid) : 'Unassigned';
                    logAction(session?.full_name ?? 'admin', 'reassign_teacher',
                        `${editingStudent.full_name}/${subName}`, prevTname, newTname);
                }
            }
        }

        setEditingStudent(null);
    };

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <input type="text" placeholder="Filter students..." value={filter} onChange={e => setFilter(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-neutral-200 bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                <button onClick={() => setShowAdd(true)}
                    className="px-5 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors">
                    + Add Student
                </button>
            </div>

            {/* Add Student Modal */}
            {showAdd && (
                <Modal
                    title="Add New Student"
                    onClose={() => { setShowAdd(false); setNewName(''); setSubjectTeachers({}); }}
                    maxWidth="max-w-lg"
                    footer={
                        <>
                            <button onClick={() => { setShowAdd(false); setNewName(''); setSubjectTeachers({}); }}
                                className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl hover:bg-neutral-50">
                                Cancel
                            </button>
                            <button onClick={handleAddStudent} disabled={!newName.trim()}
                                className="px-5 py-2 bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white font-bold rounded-xl hover:bg-primary-700">
                                Save Student
                            </button>
                        </>
                    }
                >
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Full Name</label>
                            <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)}
                                className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-neutral-700 mb-2">Enrollment Type</label>
                            <div className="flex gap-3">
                                {(['new', 'established'] as const).map(s => (
                                    <label key={s} className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer flex-1 ${newStatus === s ? 'border-primary-500 bg-primary-50 text-primary-800 font-bold' : 'border-neutral-200 text-neutral-600'}`}>
                                        <input type="radio" name="status" value={s} checked={newStatus === s} onChange={() => setNewStatus(s)} className="accent-primary-600" />
                                        {s === 'new' ? 'New' : 'Established'}
                                    </label>
                                ))}
                            </div>
                            <p className="text-xs text-neutral-400 mt-1.5">
                                {newStatus === 'new' ? 'Settles from join date (mid-month cutoff applies).' : 'Eligible immediately.'}
                            </p>
                        </div>
                        {subjects.length > 0 && (
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-2">Assign to Subjects (optional)</label>
                                <div className="space-y-2">
                                    {subjects.map(sub => (
                                        <div key={sub.id} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 bg-neutral-50">
                                            <span className="text-sm font-medium text-neutral-700 w-28 shrink-0">{sub.name}</span>
                                            <select
                                                value={subjectTeachers[sub.id] ?? ''}
                                                onChange={e => setSubjectTeachers(prev => ({ ...prev, [sub.id]: e.target.value }))}
                                                className="flex-1 bg-white border border-neutral-200 text-neutral-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                            >
                                                <option value="">— Unassigned —</option>
                                                {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            {/* Edit Student Modal */}
            {editingStudent && (
                <Modal
                    title="Edit Student"
                    onClose={() => setEditingStudent(null)}
                    maxWidth="max-w-lg"
                    footer={
                        <>
                            <button onClick={() => setEditingStudent(null)}
                                className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl hover:bg-neutral-50">
                                Cancel
                            </button>
                            <button onClick={handleSaveEdit} disabled={!editName.trim()}
                                className="px-5 py-2 bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white font-bold rounded-xl hover:bg-primary-700">
                                Save
                            </button>
                        </>
                    }
                >
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Full Name</label>
                            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                                className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>

                        {subjects.length > 0 && (
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-2">Teacher Assignments</label>
                                <div className="space-y-2">
                                    {subjects.map(sub => {
                                        const isEnrolled = enrolledSubjectIds.has(sub.id);
                                        return (
                                            <div key={sub.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isEnrolled ? 'border-neutral-100 bg-neutral-50' : 'border-dashed border-neutral-200 bg-white'}`}>
                                                <span className="text-sm font-medium text-neutral-700 w-28 shrink-0">{sub.name}</span>
                                                {!isEnrolled && <span className="text-xs text-neutral-400 italic shrink-0">not enrolled</span>}
                                                <select
                                                    value={editTeacherMap[sub.id] ?? ''}
                                                    onChange={e => setEditTeacherMap(prev => ({
                                                        ...prev,
                                                        [sub.id]: e.target.value || null,
                                                    }))}
                                                    className="flex-1 bg-white border border-neutral-200 text-neutral-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                                >
                                                    <option value="">— {isEnrolled ? 'Unassigned' : 'Skip'} —</option>
                                                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>
                                {subjects.some(s => !enrolledSubjectIds.has(s.id)) && (
                                    <p className="text-xs text-neutral-400 mt-2">Selecting a teacher for a non-enrolled subject will enroll the student in it.</p>
                                )}
                            </div>
                        )}

                        {editingStudent.eligibility_start > currentMonth && (
                            <div className="p-4 rounded-xl border border-warning-200 bg-warning-50">
                                <p className="text-sm font-semibold text-warning-800 mb-1">Student is settling</p>
                                <p className="text-xs text-warning-700 mb-3">
                                    Eligible from <span className="font-mono font-bold">{editingStudent.eligibility_start}</span>.
                                    Overriding sets eligibility to <span className="font-mono font-bold">{currentMonth}</span> immediately — cannot be undone.
                                </p>
                                <button onClick={handleMakeEligibleNow}
                                    className="px-4 py-2 text-sm font-bold rounded-lg bg-warning-600 hover:text-white hover:bg-warning-700 text-gray transition-colors">
                                    Make Eligible Now
                                </button>
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            {/* Student Table */}
            <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-100">
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Name</th>
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Status</th>
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Subjects & Teachers</th>
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Rank</th>
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Eligibility</th>
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {filteredStudents.map(s => {
                                const entry = allEntries.find(e => e.student_id === s.id);
                                const studentEnrollments = enrollments.filter(e => e.student_id === s.id);
                                return (
                                    <tr key={s.id} className={`hover:bg-neutral-50 ${s.archived ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-3">
                                            <span className="font-semibold text-neutral-800">{s.full_name}</span>
                                            {s.archived && <span className="ml-2 text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">Archived</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-bold px-2 py-1 rounded ${s.enrollment_status === 'new' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                                                {s.enrollment_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                {studentEnrollments.map(e => {
                                                    const sub = subjects.find(x => x.id === e.subject_id);
                                                    const tch = e.teacher_id ? data.getTeacher(e.teacher_id) : null;
                                                    return (
                                                        <div key={`${e.student_id}-${e.subject_id}`} className="text-xs">
                                                            <span className="font-semibold text-primary-700">{sub?.name ?? e.subject_id}</span>
                                                            <span className="text-neutral-400 ml-1">
                                                                → {tch?.full_name ?? (e.teacher_id ? 'Unknown' : <span className="text-warning-600 font-bold">Unassigned</span>)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {entry?.eligibility.eligible
                                                ? <span className="font-bold text-primary-700">#{entry.rank}</span>
                                                : <span className="text-neutral-400">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            {entry?.eligibility.eligible ? (
                                                <span className="text-xs bg-success-50 text-success-700 px-2 py-1 rounded font-semibold">Eligible</span>
                                            ) : entry ? (
                                                <div className="space-y-1">
                                                    {entry.eligibility.failure_reasons.map(r => (
                                                        <span key={r} className="block text-xs bg-warning-50 text-warning-700 px-2 py-1 rounded font-medium">
                                                            {formatFailureReason(r, entry.eligibility.eligibility_start)}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-neutral-400">No data</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {!s.archived && (
                                                <div className="flex gap-2">
                                                    <button onClick={() => openEditModal(s)} className={btnEdit}>Edit</button>
                                                    <button onClick={() => handleArchive(s)} className={btnDanger}>Archive</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ===== Teachers CRUD — RBAC-aware =====
function TeachersView() {
    const { session } = useAuth();
    const data = useData();
    const allTeachers = data.getTeachers(true);
    const enrollments = data.getEnrollments();
    const subjects = data.getSubjects();

    const actor = session!;
    const isSuperAdmin = actor.role === 'super_admin';

    const teacherAccounts = allTeachers.filter(t => t.role === 'teacher');
    const adminAccounts = allTeachers.filter(t => t.role === 'admin' || t.role === 'super_admin');

    // Add Teacher modal state
    const [showAddTeacher, setShowAddTeacher] = useState(false);
    const [newTeacherName, setNewTeacherName] = useState('');
    const [newTeacherUsername, setNewTeacherUsername] = useState('');
    const [newTeacherPassword, setNewTeacherPassword] = useState('');
    const [newTeacherConfirmPw, setNewTeacherConfirmPw] = useState('');
    const [teacherUsernameEdited, setTeacherUsernameEdited] = useState(false);
    const [addTeacherError, setAddTeacherError] = useState<string | null>(null);

    // Add Admin modal state
    const [showAddAdmin, setShowAddAdmin] = useState(false);
    const [newAdminName, setNewAdminName] = useState('');
    const [newAdminRole, setNewAdminRole] = useState<'admin' | 'super_admin'>('admin');
    const [newAdminUsername, setNewAdminUsername] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');
    const [newAdminConfirmPw, setNewAdminConfirmPw] = useState('');
    const [adminUsernameEdited, setAdminUsernameEdited] = useState(false);
    const [addAdminError, setAddAdminError] = useState<string | null>(null);

    const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
    const [editTeacherName, setEditTeacherName] = useState('');

    const [rosterTeacher, setRosterTeacher] = useState<Teacher | null>(null);
    const [error, setError] = useState<string | null>(null);

    const resetAddTeacher = () => {
        setNewTeacherName(''); setNewTeacherUsername(''); setNewTeacherPassword('');
        setNewTeacherConfirmPw(''); setTeacherUsernameEdited(false); setAddTeacherError(null);
    };

    const resetAddAdmin = () => {
        setNewAdminName(''); setNewAdminUsername(''); setNewAdminPassword('');
        setNewAdminConfirmPw(''); setAdminUsernameEdited(false); setAddAdminError(null);
    };

    const handleAddTeacher = () => {
        if (!newTeacherName.trim()) return;
        const trimmedUsername = newTeacherUsername.trim();
        if (!trimmedUsername) { setAddTeacherError('Username is required.'); return; }
        if (/\s/.test(trimmedUsername)) { setAddTeacherError('Username must not contain spaces.'); return; }
        if (newTeacherPassword.length < 6) { setAddTeacherError('Password must be at least 6 characters.'); return; }
        if (newTeacherPassword !== newTeacherConfirmPw) { setAddTeacherError('Passwords do not match.'); return; }
        if (!data.isUsernameAvailable(trimmedUsername)) { setAddTeacherError(`Username "${trimmedUsername}" is already taken.`); return; }
        try {
            const teacher = data.addTeacher(
                { full_name: newTeacherName.trim(), username: trimmedUsername, password: newTeacherPassword, role: 'teacher', archived: false },
                actor,
            );
            logAction(actor.full_name, 'add_teacher', teacher.id, undefined, `${newTeacherName.trim()} (@${trimmedUsername})`);
            resetAddTeacher(); setShowAddTeacher(false); setError(null);
        } catch (e: any) { setAddTeacherError(e.message); }
    };

    const handleAddAdmin = () => {
        if (!newAdminName.trim()) return;
        const trimmedUsername = newAdminUsername.trim();
        if (!trimmedUsername) { setAddAdminError('Username is required.'); return; }
        if (/\s/.test(trimmedUsername)) { setAddAdminError('Username must not contain spaces.'); return; }
        if (newAdminPassword.length < 6) { setAddAdminError('Password must be at least 6 characters.'); return; }
        if (newAdminPassword !== newAdminConfirmPw) { setAddAdminError('Passwords do not match.'); return; }
        if (!data.isUsernameAvailable(trimmedUsername)) { setAddAdminError(`Username "${trimmedUsername}" is already taken.`); return; }
        try {
            const teacher = data.addTeacher(
                { full_name: newAdminName.trim(), username: trimmedUsername, password: newAdminPassword, role: newAdminRole, archived: false },
                actor,
            );
            logAction(actor.full_name, 'add_admin', teacher.id, undefined, `${newAdminName.trim()} (@${trimmedUsername}, ${newAdminRole})`);
            resetAddAdmin(); setShowAddAdmin(false); setError(null);
        } catch (e: any) { setAddAdminError(e.message); }
    };

    const handleSaveEdit = () => {
        if (!editingTeacher || !editTeacherName.trim()) return;
        try {
            data.updateTeacher(editingTeacher.id, { full_name: editTeacherName.trim() }, actor);
            logAction(actor.full_name, 'edit_teacher', editingTeacher.id, editingTeacher.full_name, editTeacherName.trim());
            setEditingTeacher(null); setError(null);
        } catch (e: any) { setError(e.message); }
    };

    const handleArchive = (t: Teacher) => {
        const check = canArchiveStaff(actor, t, allTeachers);
        if (!check.allowed) { setError(check.reason ?? 'Cannot archive.'); return; }
        if (!confirm(`Archive ${t.full_name}? They won't be able to log in.`)) return;
        try {
            data.archiveTeacher(t.id, actor);
            logAction(actor.full_name, 'archive_teacher', t.id, 'active', 'archived');
            setError(null);
        } catch (e: any) { setError(e.message); }
    };

    return (
        <div className="space-y-8">
            {error && (
                <div className="bg-error-50 border border-error-200 text-error-700 font-medium px-4 py-3 rounded-xl text-sm flex justify-between">
                    {error}
                    <button onClick={() => setError(null)} className="ml-4 text-error-400 hover:text-error-600">✕</button>
                </div>
            )}

            {/* Edit Teacher Modal */}
            {editingTeacher && (
                <Modal
                    title={`Edit: ${editingTeacher.full_name}`}
                    onClose={() => setEditingTeacher(null)}
                    footer={
                        <>
                            <button onClick={() => setEditingTeacher(null)}
                                className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl hover:bg-neutral-50">
                                Cancel
                            </button>
                            <button onClick={handleSaveEdit} disabled={!editTeacherName.trim()}
                                className="px-5 py-2 bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white font-bold rounded-xl hover:bg-primary-700">
                                Save
                            </button>
                        </>
                    }
                >
                    <div>
                        <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Full Name</label>
                        <input type="text" value={editTeacherName} onChange={e => setEditTeacherName(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                </Modal>
            )}

            {/* ===== Teachers Section ===== */}
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-neutral-900">Teachers</h2>
                    <button onClick={() => setShowAddTeacher(true)}
                        className="px-5 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors">
                        + Add Teacher
                    </button>
                </div>

                {showAddTeacher && (
                    <Modal title="Add Teacher" onClose={() => { setShowAddTeacher(false); resetAddTeacher(); }}
                        maxWidth="max-w-lg"
                        footer={
                            <>
                                <button onClick={() => { setShowAddTeacher(false); resetAddTeacher(); }}
                                    className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl hover:bg-neutral-50">Cancel</button>
                                <button onClick={handleAddTeacher}
                                    disabled={!newTeacherName.trim() || !newTeacherUsername.trim() || !newTeacherPassword}
                                    className="px-5 py-2 bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white font-bold rounded-xl hover:bg-primary-700">Save</button>
                            </>
                        }>
                        <div className="space-y-4">
                            {addTeacherError && (
                                <div className="bg-error-50 border border-error-200 text-error-700 font-medium px-4 py-3 rounded-xl text-sm">
                                    {addTeacherError}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Full Name</label>
                                <input type="text" placeholder="Full name" value={newTeacherName}
                                    onChange={e => {
                                        setNewTeacherName(e.target.value);
                                        if (!teacherUsernameEdited)
                                            setNewTeacherUsername(e.target.value.trim().toLowerCase().replace(/\s+/g, '.'));
                                    }}
                                    className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Username</label>
                                <input type="text" placeholder="e.g. john.doe" value={newTeacherUsername}
                                    onChange={e => { setNewTeacherUsername(e.target.value); setTeacherUsernameEdited(true); }}
                                    className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono" />
                                <p className="text-xs text-neutral-400 mt-1">Auto-generated from name. You may customize it.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Password</label>
                                <input type="password" placeholder="Min 6 characters" value={newTeacherPassword}
                                    onChange={e => setNewTeacherPassword(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Confirm Password</label>
                                <input type="password" placeholder="Repeat password" value={newTeacherConfirmPw}
                                    onChange={e => setNewTeacherConfirmPw(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                            </div>
                        </div>
                    </Modal>
                )}

                <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-100">
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Name</th>
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Username</th>
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Roster</th>
                                <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {teacherAccounts.length === 0 && (
                                <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-400">No teachers yet.</td></tr>
                            )}
                            {teacherAccounts.map(t => {
                                const teacherEnrollments = enrollments.filter(e => e.teacher_id === t.id);
                                const bySubject = subjects.map(sub => ({
                                    subject: sub,
                                    count: teacherEnrollments.filter(e => e.subject_id === sub.id).length,
                                })).filter(x => x.count > 0);
                                const canManage = canManageStaff(actor.role, t.role);
                                return (
                                    <tr key={t.id} className={`hover:bg-neutral-50 ${t.archived ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-3">
                                            <span className="font-semibold text-neutral-800">{t.full_name}</span>
                                            {t.archived && <span className="ml-2 text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">Archived</span>}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-500 font-mono">{t.username}</td>
                                        <td className="px-4 py-3">
                                            {bySubject.length === 0 ? (
                                                <span className="text-xs text-neutral-400">No assignments</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {bySubject.map(({ subject, count }) => (
                                                        <span key={subject.id} className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded font-medium">
                                                            {subject.name}: {count}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2 flex-wrap">
                                                {!t.archived && (
                                                    <button onClick={() => setRosterTeacher(t)} className={btnRoster}>Manage Roster</button>
                                                )}
                                                {!t.archived && canManage && (
                                                    <button onClick={() => { setEditingTeacher(t); setEditTeacherName(t.full_name); }} className={btnEdit}>Edit</button>
                                                )}
                                                {!t.archived && canManage && (
                                                    <button onClick={() => handleArchive(t)} className={btnDanger}>Archive</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ===== Administrators Section (super_admin only) ===== */}
            {isSuperAdmin && (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-neutral-900">Administrators</h2>
                        <button onClick={() => setShowAddAdmin(true)}
                            className="px-5 py-2 bg-neutral-800 text-white font-bold rounded-xl hover:bg-neutral-900 transition-colors">
                            + Add Administrator
                        </button>
                    </div>

                    {showAddAdmin && (
                        <Modal title="Add Administrator" onClose={() => { setShowAddAdmin(false); resetAddAdmin(); }}
                            maxWidth="max-w-lg"
                            footer={
                                <>
                                    <button onClick={() => { setShowAddAdmin(false); resetAddAdmin(); }}
                                        className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl hover:bg-neutral-50">Cancel</button>
                                    <button onClick={handleAddAdmin}
                                        disabled={!newAdminName.trim() || !newAdminUsername.trim() || !newAdminPassword}
                                        className="px-5 py-2 bg-neutral-800 disabled:bg-neutral-300 text-white font-bold rounded-xl hover:bg-neutral-900">Save</button>
                                </>
                            }>
                            <div className="space-y-4">
                                {addAdminError && (
                                    <div className="bg-error-50 border border-error-200 text-error-700 font-medium px-4 py-3 rounded-xl text-sm">
                                        {addAdminError}
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Full Name</label>
                                    <input type="text" placeholder="Full name" value={newAdminName}
                                        onChange={e => {
                                            setNewAdminName(e.target.value);
                                            if (!adminUsernameEdited)
                                                setNewAdminUsername(e.target.value.trim().toLowerCase().replace(/\s+/g, '.'));
                                        }}
                                        className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Role</label>
                                    <div className="flex gap-3">
                                        {(['admin', 'super_admin'] as const).map(r => (
                                            <label key={r} className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer flex-1 ${newAdminRole === r ? 'border-primary-500 bg-primary-50 font-bold text-primary-800' : 'border-neutral-200 text-neutral-600'}`}>
                                                <input type="radio" name="adminRole" value={r} checked={newAdminRole === r} onChange={() => setNewAdminRole(r)} /> {r === 'admin' ? 'Admin' : 'Super Admin'}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Username</label>
                                    <input type="text" placeholder="e.g. admin.doe" value={newAdminUsername}
                                        onChange={e => { setNewAdminUsername(e.target.value); setAdminUsernameEdited(true); }}
                                        className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono" />
                                    <p className="text-xs text-neutral-400 mt-1">Auto-generated from name. You may customize it.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Password</label>
                                    <input type="password" placeholder="Min 6 characters" value={newAdminPassword}
                                        onChange={e => setNewAdminPassword(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Confirm Password</label>
                                    <input type="password" placeholder="Repeat password" value={newAdminConfirmPw}
                                        onChange={e => setNewAdminConfirmPw(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                                </div>
                            </div>
                        </Modal>
                    )}

                    <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-neutral-50 border-b border-neutral-100">
                                    <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Name</th>
                                    <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Role</th>
                                    <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Username</th>
                                    <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {adminAccounts.length === 0 && (
                                    <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-400">No administrators.</td></tr>
                                )}
                                {adminAccounts.map(t => {
                                    const check = canArchiveStaff(actor, t, allTeachers);
                                    return (
                                        <tr key={t.id} className={`hover:bg-neutral-50 ${t.archived ? 'opacity-50' : ''}`}>
                                            <td className="px-4 py-3">
                                                <span className="font-semibold text-neutral-800">{t.full_name}</span>
                                                {t.id === actor.id && <span className="ml-2 text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded">You</span>}
                                                {t.archived && <span className="ml-2 text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">Archived</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-bold px-2 py-1 rounded ${t.role === 'super_admin' ? 'bg-error-50 text-error-700' : 'bg-warning-50 text-warning-700'}`}>
                                                    {t.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-500 font-mono">{t.username}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2">
                                                    {!t.archived && canManageStaff(actor.role, t.role) && (
                                                        <button onClick={() => { setEditingTeacher(t); setEditTeacherName(t.full_name); }} className={btnEdit}>Edit</button>
                                                    )}
                                                    {!t.archived && check.allowed && (
                                                        <button onClick={() => handleArchive(t)} className={btnDanger}>Archive</button>
                                                    )}
                                                    {!t.archived && !check.allowed && t.id !== actor.id && (
                                                        <span className="text-xs text-neutral-300" title={check.reason}>—</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {rosterTeacher && (
                <RosterModal teacher={rosterTeacher} actor={actor} onClose={() => setRosterTeacher(null)} />
            )}
        </div>
    );
}

// ===== Subjects CRUD =====
function SubjectsView() {
    const data = useData();
    const { session } = useAuth();
    const subjects = data.getSubjects(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
    const [editName, setEditName] = useState('');

    const handleAdd = () => {
        if (!newName.trim()) return;
        const subject = data.addSubject({ name: newName.trim(), archived: false });
        logAction(session?.full_name ?? 'admin', 'add_subject', subject.id, undefined, newName.trim());
        setNewName(''); setShowAdd(false);
    };

    const handleArchive = (s: Subject) => {
        if (!confirm(`Archive "${s.name}"? ⚠️ This removes a whole stream from everyone and reshuffles the board mid-month!`)) return;
        data.archiveSubject(s.id);
        logAction(session?.full_name ?? 'admin', 'archive_subject', s.id, 'active', 'archived');
    };

    const handleRename = () => {
        if (!editingSubject || !editName.trim()) return;
        data.updateSubject(editingSubject.id, { name: editName.trim() });
        logAction(session?.full_name ?? 'admin', 'rename_subject', editingSubject.id, editingSubject.name, editName.trim());
        setEditingSubject(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button onClick={() => setShowAdd(true)}
                    className="px-5 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors">
                    + Add Subject
                </button>
            </div>

            {showAdd && (
                <Modal title="Add Subject" onClose={() => { setShowAdd(false); setNewName(''); }}
                    footer={
                        <>
                            <button onClick={() => { setShowAdd(false); setNewName(''); }}
                                className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl hover:bg-neutral-50">Cancel</button>
                            <button onClick={handleAdd} disabled={!newName.trim()}
                                className="px-5 py-2 bg-primary-600 disabled:bg-neutral-300 text-white font-bold rounded-xl hover:bg-primary-700">Save</button>
                        </>
                    }>
                    <div>
                        <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Subject Name</label>
                        <input type="text" placeholder="e.g. Mathematics" value={newName} onChange={e => setNewName(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                </Modal>
            )}

            {editingSubject && (
                <Modal title="Rename Subject" onClose={() => setEditingSubject(null)}
                    footer={
                        <>
                            <button onClick={() => setEditingSubject(null)}
                                className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl hover:bg-neutral-50">Cancel</button>
                            <button onClick={handleRename} disabled={!editName.trim()}
                                className="px-5 py-2 bg-primary-600 disabled:bg-neutral-300 text-white font-bold rounded-xl hover:bg-primary-700">Save</button>
                        </>
                    }>
                    <div>
                        <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Subject Name</label>
                        <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                </Modal>
            )}

            <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-100">
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Name</th>
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Status</th>
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {subjects.map(s => (
                            <tr key={s.id} className={`hover:bg-neutral-50 ${s.archived ? 'opacity-50' : ''}`}>
                                <td className="px-4 py-3 font-semibold text-neutral-800">{s.name}</td>
                                <td className="px-4 py-3">
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${s.archived ? 'bg-neutral-100 text-neutral-500' : 'bg-success-50 text-success-700'}`}>
                                        {s.archived ? 'Archived' : 'Active'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    {!s.archived && (
                                        <div className="flex gap-2">
                                            <button onClick={() => { setEditingSubject(s); setEditName(s.name); }} className={btnEdit}>Rename</button>
                                            <button onClick={() => handleArchive(s)} className={btnDanger}>Archive ⚠️</button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ===== Assessments CRUD =====
function AssessmentsView() {
    const data = useData();
    const { session } = useAuth();
    const assessments = data.getAssessments().sort((a, b) => b.created_at.localeCompare(a.created_at));
    const students = data.getStudents(true);
    const teachers = data.getTeachers(true);
    const subjects = data.getSubjects(true);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editScores, setEditScores] = useState<Record<string, number> | null>(null);

    const handleEdit = (assessment: any) => {
        setEditingId(assessment.id);
        setEditScores({ ...assessment.scores });
    };

    const handleSave = () => {
        if (!editingId || !editScores) return;
        data.updateAssessment(editingId, editScores as any);
        logAction(session?.full_name ?? 'admin', 'edit_assessment', editingId, 'old_scores', JSON.stringify(editScores));
        setEditingId(null); setEditScores(null);
    };

    const scoreKeys = ['homework', 'progress', 'activity', 'attendance', 'behavior'];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-neutral-100">
                <p className="text-neutral-500 text-sm">Admins can edit any assessment at any time. Changes trigger stream replay.</p>
            </div>

            {editingId && editScores && (
                <Modal title="Edit Assessment Scores" onClose={() => { setEditingId(null); setEditScores(null); }} maxWidth="max-w-lg"
                    footer={
                        <>
                            <button onClick={() => { setEditingId(null); setEditScores(null); }}
                                className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl hover:bg-neutral-50">Cancel</button>
                            <button onClick={handleSave}
                                className="px-5 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700">Save</button>
                        </>
                    }>
                    <div className="space-y-4">
                        {scoreKeys.map(k => (
                            <div key={k} className="flex items-center gap-4">
                                <label className="w-32 text-sm font-semibold text-neutral-700 capitalize">{k}</label>
                                <input type="range" min="0" max="10" step="0.5"
                                    value={editScores[k] ?? 0}
                                    onChange={e => setEditScores({ ...editScores, [k]: Number(e.target.value) })}
                                    className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-primary-600 bg-primary-100" />
                                <span className="w-10 text-center font-bold text-sm bg-primary-50 text-primary-800 px-2 py-1 rounded">
                                    {(editScores[k] ?? 0).toFixed(1)}
                                </span>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}

            <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-100">
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Date</th>
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Student / Subject</th>
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Teacher</th>
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Scores</th>
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {assessments.slice(0, 100).map(a => {
                            const student = students.find(s => s.id === a.student_id);
                            const subject = subjects.find(s => s.id === a.subject_id);
                            const teacher = teachers.find(t => t.id === a.teacher_id);
                            return (
                                <tr key={a.id} className="hover:bg-neutral-50">
                                    <td className="px-4 py-3 text-sm font-mono text-neutral-500">
                                        {new Date(a.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-neutral-800">{student?.full_name ?? a.student_id}</div>
                                        <div className="text-xs text-primary-600 font-medium">{subject?.name ?? a.subject_id}</div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-neutral-600">{teacher?.full_name ?? a.teacher_id}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1.5 text-xs flex-wrap">
                                            {scoreKeys.map(k => (
                                                <span key={k} className="bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded font-mono">
                                                    {k.slice(0, 1).toUpperCase()}: {(a.scores as any)[k].toFixed(1)}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => handleEdit(a)} className={btnEdit}>Edit</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {assessments.length > 100 && (
                <div className="text-center text-sm text-neutral-400">Showing 100 most recent assessments.</div>
            )}
        </div>
    );
}

// ===== Audit Log =====
function AuditView() {
    const log = getAuditLog();
    return (
        <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center">
                <h2 className="font-bold text-neutral-800 text-lg">📋 Audit Log</h2>
                <span className="text-xs text-neutral-400">{log.length} entries</span>
            </div>
            {log.length === 0 ? (
                <div className="p-8 text-center text-neutral-400">
                    <div className="text-4xl mb-3">🕵️</div>
                    <p>No admin actions recorded yet this session.</p>
                </div>
            ) : (
                <div className="divide-y divide-neutral-100 max-h-[500px] overflow-y-auto">
                    {log.map((entry, i) => (
                        <div key={i} className="px-6 py-3 hover:bg-neutral-50">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-neutral-800 text-sm">{entry.action}</span>
                                <span className="text-xs text-neutral-400 font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="text-xs text-neutral-500 mt-1">
                                Actor: <span className="font-medium">{entry.actor}</span> · Target: <span className="font-mono">{entry.target}</span>
                                {entry.before && <> · Before: <span className="text-error-600">{entry.before}</span></>}
                                {entry.after && <> · After: <span className="text-success-600">{entry.after}</span></>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
