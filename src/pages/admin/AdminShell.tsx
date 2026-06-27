import { useState, useMemo } from 'react';
import { useData } from '@/services/DataProvider';
import { buildMainBoard, formatFailureReason, computeEligibilityStart } from '@/engine';
import type { Teacher, Student, Subject, Enrollment, Config } from '@/data/types';

// ===== Simple in-memory audit log =====
interface AuditEntry {
    timestamp: string;
    actor: string;
    action: string;
    target: string;
    before?: string;
    after?: string;
}

const auditLog: AuditEntry[] = [];

function logAction(actor: string, action: string, target: string, before?: string, after?: string) {
    auditLog.unshift({
        timestamp: new Date().toISOString(),
        actor, action, target, before, after,
    });
}

// ===== Admin Views =====
type AdminView = 'overview' | 'students' | 'teachers' | 'subjects' | 'assessments' | 'audit';

export default function AdminShell() {
    const [view, setView] = useState<AdminView>('overview');

    const tabs: { key: AdminView; label: string; icon: string }[] = [
        { key: 'overview', label: 'Overview', icon: '📊' },
        { key: 'students', label: 'Students', icon: '👥' },
        { key: 'teachers', label: 'Teachers', icon: '🎓' },
        { key: 'subjects', label: 'Subjects', icon: '📚' },
        { key: 'assessments', label: 'Assessments', icon: '📝' },
        { key: 'audit', label: 'Audit Log', icon: '📋' },
    ];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 text-primary-700 text-sm font-medium mb-4">
                    <span className="w-2 h-2 rounded-full bg-error-500" />
                    Role-Gated · Admin Only
                </div>
                <h1 className="text-4xl sm:text-5xl font-extrabold text-neutral-900 tracking-tight">
                    Admin <span className="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">Dashboard</span>
                </h1>
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
        </div>
    );
}

// ===== Overview =====
function OverviewView() {
    const data = useData();
    const students = data.getStudents(true);
    const teachers = data.getTeachers();
    const subjects = data.getSubjects();
    const unassigned = data.getUnassignedEnrollments();
    const config = data.getConfig();

    return (
        <div className="space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard icon="👥" value={students.filter(s => !s.archived).length} label="Active Students" />
                <StatCard icon="🎓" value={teachers.length} label="Teachers" />
                <StatCard icon="📚" value={subjects.length} label="Subjects" />
                <StatCard icon="⚠️" value={unassigned.length} label="Unassigned Pairs" accent />
            </div>

            {/* Unassigned Queue */}
            <UnassignedQueue />

            {/* Config */}
            <div className="bg-neutral-900 rounded-3xl p-8 border border-neutral-800 text-neutral-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-600 rounded-full blur-3xl opacity-20 pointer-events-none translate-x-10 -translate-y-10"></div>
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
    const teachers = data.getTeachers();
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
            <div className="bg-warning-50 px-6 py-4 border-b border-warning-200 flex justify-between items-center">
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

// ===== Students CRUD (§7.1) =====
function StudentsView() {
    const data = useData();
    const students = data.getStudents(true);
    const enrollments = data.getEnrollments();
    const assessments = data.getAssessments();
    const config = data.getConfig();
    const currentMonth = data.getCurrentMonth();
    const subjects = data.getSubjects();
    const teachers = data.getTeachers(true);

    // Compute live board for ranks and eligibility (§4.3)
    const { board, ineligible } = useMemo(() => {
        return buildMainBoard(data.getStudents(), enrollments, assessments, currentMonth, config);
    }, [students, enrollments, assessments, currentMonth, config]);

    const allEntries = [...board, ...ineligible];

    // Add student form
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newStatus, setNewStatus] = useState<'new' | 'established'>('new');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // Filter / search
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
        logAction('admin', 'add_student', student.id, undefined, `${newName} (${newStatus})`);
        setNewName(''); setShowAddForm(false);
    };

    const handleArchive = (s: Student) => {
        if (!confirm(`Archive ${s.full_name}? They will be removed from the live board.`)) return;
        data.archiveStudent(s.id);
        logAction('admin', 'archive_student', s.id, 'active', 'archived');
    };

    const handleSaveEdit = () => {
        if (!editingId || !editName.trim()) return;
        data.updateStudent(editingId, { full_name: editName.trim() });
        logAction('admin', 'edit_student', editingId, undefined, editName.trim());
        setEditingId(null);
    };

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <input type="text" placeholder="Filter students..." value={filter} onChange={e => setFilter(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-neutral-200 bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                <button onClick={() => setShowAddForm(!showAddForm)}
                    className="px-5 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors">
                    + Add Student
                </button>
            </div>

            {/* Add Form (§7.1: New/Established control) */}
            {showAddForm && (
                <div className="bg-primary-50 rounded-2xl border border-primary-200 p-6 space-y-4 animate-fade-in">
                    <h3 className="font-bold text-primary-800 text-lg">Add New Student</h3>
                    <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-primary-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    <div className="flex gap-4">
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer ${newStatus === 'new' ? 'border-primary-500 bg-primary-100 text-primary-800 font-bold' : 'border-neutral-200 text-neutral-600'}`}>
                            <input type="radio" name="status" value="new" checked={newStatus === 'new'} onChange={() => setNewStatus('new')} className="accent-primary-600" />
                            New Student <span className="text-xs font-normal">(settles from join date)</span>
                        </label>
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer ${newStatus === 'established' ? 'border-primary-500 bg-primary-100 text-primary-800 font-bold' : 'border-neutral-200 text-neutral-600'}`}>
                            <input type="radio" name="status" value="established" checked={newStatus === 'established'} onChange={() => setNewStatus('established')} className="accent-primary-600" />
                            Established <span className="text-xs font-normal">(eligible immediately)</span>
                        </label>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={handleAddStudent} disabled={!newName.trim()}
                            className="px-5 py-2 bg-primary-600 disabled:bg-neutral-300 text-white font-bold rounded-xl hover:bg-primary-700">Save</button>
                        <button onClick={() => setShowAddForm(false)} className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl">Cancel</button>
                    </div>
                </div>
            )}

            {/* Student List */}
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
                                            {editingId === s.id ? (
                                                <div className="flex gap-2">
                                                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                                                        className="px-2 py-1 rounded border border-neutral-300 text-sm w-40" />
                                                    <button onClick={handleSaveEdit} className="text-primary-600 text-sm font-bold">Save</button>
                                                    <button onClick={() => setEditingId(null)} className="text-neutral-400 text-sm">Cancel</button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <span className="font-semibold text-neutral-800">{s.full_name}</span>
                                                    {s.archived && <span className="ml-2 text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">Archived</span>}
                                                </div>
                                            )}
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
                                                    const tch = e.teacher_id ? teachers.find(x => x.id === e.teacher_id) : null;
                                                    return (
                                                        <div key={`${e.student_id}-${e.subject_id}`} className="text-xs">
                                                            <span className="font-semibold text-primary-700">{sub?.name ?? e.subject_id}</span>
                                                            <span className="text-neutral-400 ml-1">→ {tch?.full_name ?? (e.teacher_id ? 'Unknown' : <span className="text-warning-600 font-bold">Unassigned</span>)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {entry?.eligibility.eligible ? (
                                                <span className="font-bold text-primary-700">#{entry.rank}</span>
                                            ) : (
                                                <span className="text-neutral-400">—</span>
                                            )}
                                        </td>
                                        {/* §4.3 Failure reason surfacing */}
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
                                            <div className="flex gap-2">
                                                {!s.archived && (
                                                    <>
                                                        <button onClick={() => { setEditingId(s.id); setEditName(s.full_name); }}
                                                            className="text-neutral-500 hover:text-primary-600 text-xs font-semibold">Edit</button>
                                                        <button onClick={() => handleArchive(s)}
                                                            className="text-neutral-500 hover:text-error-600 text-xs font-semibold">Archive</button>
                                                    </>
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
        </div>
    );
}

// ===== Teachers CRUD (§7.2) =====
function TeachersView() {
    const data = useData();
    const teachers = data.getTeachers(true);
    const enrollments = data.getEnrollments();
    const subjects = data.getSubjects();
    const students = data.getStudents();

    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState<'teacher' | 'admin'>('teacher');

    const handleAdd = () => {
        if (!newName.trim()) return;
        const username = newName.trim().toLowerCase().replace(/\s+/g, '.');
        const teacher = data.addTeacher({
            full_name: newName.trim(), username, password: 'mock123',
            role: newRole, archived: false,
        });
        logAction('admin', 'add_teacher', teacher.id, undefined, newName.trim());
        setNewName(''); setShowAdd(false);
    };

    const handleArchive = (t: Teacher) => {
        if (!confirm(`Archive ${t.full_name}? They won't be able to log in.`)) return;
        data.archiveTeacher(t.id);
        logAction('admin', 'archive_teacher', t.id, 'active', 'archived');
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button onClick={() => setShowAdd(!showAdd)}
                    className="px-5 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors">
                    + Add Teacher
                </button>
            </div>
            {showAdd && (
                <div className="bg-primary-50 rounded-2xl border border-primary-200 p-6 space-y-4 animate-fade-in">
                    <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-primary-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    <div className="flex gap-4">
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer ${newRole === 'teacher' ? 'border-primary-500 bg-primary-100 font-bold text-primary-800' : 'border-neutral-200 text-neutral-600'}`}>
                            <input type="radio" name="role" value="teacher" checked={newRole === 'teacher'} onChange={() => setNewRole('teacher')} /> Teacher
                        </label>
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer ${newRole === 'admin' ? 'border-primary-500 bg-primary-100 font-bold text-primary-800' : 'border-neutral-200 text-neutral-600'}`}>
                            <input type="radio" name="role" value="admin" checked={newRole === 'admin'} onChange={() => setNewRole('admin')} /> Admin
                        </label>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={handleAdd} disabled={!newName.trim()} className="px-5 py-2 bg-primary-600 disabled:bg-neutral-300 text-white font-bold rounded-xl hover:bg-primary-700">Save</button>
                        <button onClick={() => setShowAdd(false)} className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl">Cancel</button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-100">
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Name</th>
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Role</th>
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Roster (per subject)</th>
                            <th className="px-4 py-3 text-xs text-neutral-500 uppercase font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {teachers.map(t => {
                            const teacherEnrollments = enrollments.filter(e => e.teacher_id === t.id);
                            const bySubject = subjects.map(sub => ({
                                subject: sub,
                                students: teacherEnrollments.filter(e => e.subject_id === sub.id).map(e => students.find(s => s.id === e.student_id)?.full_name ?? e.student_id),
                            })).filter(x => x.students.length > 0);
                            return (
                                <tr key={t.id} className={`hover:bg-neutral-50 ${t.archived ? 'opacity-50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <span className="font-semibold text-neutral-800">{t.full_name}</span>
                                        {t.archived && <span className="ml-2 text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">Archived</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs font-bold px-2 py-1 rounded ${t.role === 'admin' || t.role === 'super_admin' ? 'bg-error-50 text-error-700' : 'bg-primary-50 text-primary-700'}`}>{t.role}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {bySubject.length === 0 ? (
                                            <span className="text-xs text-neutral-400">No assignments</span>
                                        ) : (
                                            <div className="space-y-1">
                                                {bySubject.map(({ subject, students: studs }) => (
                                                    <div key={subject.id} className="text-xs">
                                                        <span className="font-semibold text-primary-700">{subject.name}:</span>
                                                        <span className="text-neutral-600 ml-1">{studs.join(', ')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {!t.archived && (
                                            <button onClick={() => handleArchive(t)} className="text-neutral-500 hover:text-error-600 text-xs font-semibold">Archive</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ===== Subjects CRUD (§7.3) =====
function SubjectsView() {
    const data = useData();
    const subjects = data.getSubjects(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const handleAdd = () => {
        if (!newName.trim()) return;
        const subject = data.addSubject({ name: newName.trim(), archived: false });
        logAction('admin', 'add_subject', subject.id, undefined, newName.trim());
        setNewName(''); setShowAdd(false);
    };

    const handleArchive = (s: Subject) => {
        if (!confirm(`Archive "${s.name}"? ⚠️ This removes a whole stream from everyone and reshuffles the board mid-month!`)) return;
        data.archiveSubject(s.id);
        logAction('admin', 'archive_subject', s.id, 'active', 'archived');
    };

    const handleRename = () => {
        if (!editingId || !editName.trim()) return;
        const before = subjects.find(s => s.id === editingId)?.name;
        data.updateSubject(editingId, { name: editName.trim() });
        logAction('admin', 'rename_subject', editingId, before, editName.trim());
        setEditingId(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button onClick={() => setShowAdd(!showAdd)}
                    className="px-5 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors">
                    + Add Subject
                </button>
            </div>
            {showAdd && (
                <div className="bg-primary-50 rounded-2xl border border-primary-200 p-6 space-y-4 animate-fade-in">
                    <input type="text" placeholder="Subject name" value={newName} onChange={e => setNewName(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-primary-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    <div className="flex gap-3">
                        <button onClick={handleAdd} disabled={!newName.trim()} className="px-5 py-2 bg-primary-600 disabled:bg-neutral-300 text-white font-bold rounded-xl hover:bg-primary-700">Save</button>
                        <button onClick={() => setShowAdd(false)} className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl">Cancel</button>
                    </div>
                </div>
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
                                <td className="px-4 py-3">
                                    {editingId === s.id ? (
                                        <div className="flex gap-2">
                                            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                                                className="px-2 py-1 rounded border border-neutral-300 text-sm w-40" />
                                            <button onClick={handleRename} className="text-primary-600 text-sm font-bold">Save</button>
                                            <button onClick={() => setEditingId(null)} className="text-neutral-400 text-sm">Cancel</button>
                                        </div>
                                    ) : (
                                        <span className="font-semibold text-neutral-800">{s.name}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${s.archived ? 'bg-neutral-100 text-neutral-500' : 'bg-success-50 text-success-700'}`}>
                                        {s.archived ? 'Archived' : 'Active'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    {!s.archived && (
                                        <div className="flex gap-2">
                                            <button onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                                                className="text-neutral-500 hover:text-primary-600 text-xs font-semibold">Rename</button>
                                            <button onClick={() => handleArchive(s)}
                                                className="text-neutral-500 hover:text-error-600 text-xs font-semibold">Archive ⚠️</button>
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

// ===== Assessments CRUD & Edit (§7.7) & Bulk Import (§7) =====
function AssessmentsView() {
    const data = useData();
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
        logAction('admin', 'edit_assessment', editingId, 'old_scores', JSON.stringify(editScores));
        setEditingId(null);
        setEditScores(null);
    };

    const handleBulkImport = () => {
        alert("Bulk import stub: This would open a file dialog to parse a CSV of assignments.");
        logAction('admin', 'bulk_import', 'system');
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-neutral-100">
                <p className="text-neutral-500 text-sm">Admins can edit any assessment at any time. Changes trigger stream replay.</p>
                <button onClick={handleBulkImport} className="px-5 py-2 bg-neutral-800 text-white font-bold rounded-xl hover:bg-neutral-900 transition-colors">
                    Bulk Import CSV
                </button>
            </div>

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
                            const isEditing = editingId === a.id;
                            const scoreKeys = ['homework', 'progress', 'activity', 'attendance', 'behavior'];

                            return (
                                <tr key={a.id} className="hover:bg-neutral-50">
                                    <td className="px-4 py-3 text-sm font-mono text-neutral-500">
                                        {new Date(a.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-neutral-800">{student?.full_name ?? a.student_id}</div>
                                        <div className="text-xs text-primary-600 font-medium">{subject?.name ?? a.subject_id}</div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-neutral-600">
                                        {teacher?.full_name ?? a.teacher_id}
                                    </td>
                                    <td className="px-4 py-3">
                                        {isEditing ? (
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                                {scoreKeys.map(k => (
                                                    <div key={k} className="flex flex-col">
                                                        <label className="text-[10px] text-neutral-400 uppercase">{k.slice(0, 3)}</label>
                                                        <input type="number" min="0" max="10" step="0.5"
                                                            value={editScores?.[k] ?? 0}
                                                            onChange={e => setEditScores({ ...editScores!, [k]: Number(e.target.value) })}
                                                            className="w-16 px-1 py-0.5 border rounded text-sm" />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 text-xs">
                                                {scoreKeys.map(k => (
                                                    <span key={k} className="bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded font-mono">
                                                        {k.slice(0, 1).toUpperCase()}: {(a.scores as any)[k].toFixed(1)}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {isEditing ? (
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => setEditingId(null)} className="text-neutral-500 hover:text-neutral-700 text-xs font-semibold">Cancel</button>
                                                <button onClick={handleSave} className="text-primary-600 hover:text-primary-800 text-xs font-bold">Save</button>
                                            </div>
                                        ) : (
                                            <button onClick={() => handleEdit(a)} className="text-primary-600 hover:text-primary-700 text-xs font-semibold">Edit</button>
                                        )}
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

// ===== Audit Log (§7.8) =====
function AuditView() {
    return (
        <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center">
                <h2 className="font-bold text-neutral-800 text-lg">📋 Audit Log</h2>
                <span className="text-xs text-neutral-400">{auditLog.length} entries</span>
            </div>
            {auditLog.length === 0 ? (
                <div className="p-8 text-center text-neutral-400">
                    <div className="text-4xl mb-3">🕵️</div>
                    <p>No admin actions recorded yet this session.</p>
                </div>
            ) : (
                <div className="divide-y divide-neutral-100 max-h-[500px] overflow-y-auto">
                    {auditLog.map((entry, i) => (
                        <div key={i} className="px-6 py-3 hover:bg-neutral-50">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-neutral-800 text-sm">{entry.action}</span>
                                <span className="text-xs text-neutral-400 font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="text-xs text-neutral-500 mt-1">
                                Target: <span className="font-mono">{entry.target}</span>
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
