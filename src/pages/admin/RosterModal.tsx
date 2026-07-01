import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '@/services/DataProvider';
import { logAction } from '@/services/auditLog';
import type { Teacher } from '@shared/types';

interface Props {
    teacher: Teacher;
    actor: Teacher;
    onClose: () => void;
}

export default function RosterModal({ teacher, actor, onClose }: Props) {
    const data = useData();
    const subjects = data.getSubjects();
    const allStudents = data.getStudents();
    const enrollments = data.getEnrollments();
    const allTeachers = data.getTeachers(true);

    const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
    const [pendingAdd, setPendingAdd] = useState<Record<string, string>>({});
    const [warning, setWarning] = useState<{ subjectId: string; studentId: string; prevTeacherName: string } | null>(null);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    const teacherEnrollments = enrollments.filter(e => e.teacher_id === teacher.id);

    const assignedBySubject = useMemo(() => {
        const map: Record<string, string[]> = {};
        for (const e of teacherEnrollments) {
            if (!map[e.subject_id]) map[e.subject_id] = [];
            map[e.subject_id].push(e.student_id);
        }
        return map;
    }, [teacherEnrollments]);

    const handleRemove = (studentId: string, subjectId: string) => {
        const student = allStudents.find(s => s.id === studentId);
        const subject = subjects.find(s => s.id === subjectId);
        data.setEnrollmentTeacher(studentId, subjectId, null);
        logAction(actor.full_name, 'roster_remove', `${teacher.full_name}/${subject?.name}`, student?.full_name, 'unassigned');
    };

    const initiateAdd = (subjectId: string, studentId: string) => {
        const existing = enrollments.find(e => e.student_id === studentId && e.subject_id === subjectId);
        if (existing && existing.teacher_id && existing.teacher_id !== teacher.id) {
            const prevTeacher = allTeachers.find(t => t.id === existing.teacher_id);
            setWarning({ subjectId, studentId, prevTeacherName: prevTeacher?.full_name ?? 'another teacher' });
        } else {
            doAssign(subjectId, studentId);
        }
    };

    const doAssign = (subjectId: string, studentId: string) => {
        const result = data.assignStudentToTeacher(studentId, subjectId, teacher.id);
        const student = allStudents.find(s => s.id === studentId);
        const subject = subjects.find(s => s.id === subjectId);
        const action = result.wasReassigned ? 'roster_reassign' : 'roster_assign';
        logAction(actor.full_name, action, `${teacher.full_name}/${subject?.name}`, result.previousTeacherId ?? undefined, student?.full_name);
        setPendingAdd(prev => ({ ...prev, [subjectId]: '' }));
        setSearchTerms(prev => ({ ...prev, [subjectId]: '' }));
        setWarning(null);
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-gradient-to-r from-primary-700 to-primary-500 text-white rounded-t-2xl">
                    <div>
                        <h2 className="font-bold text-lg">Manage Roster</h2>
                        <p className="text-primary-100 text-sm">{teacher.full_name}</p>
                    </div>
                    <button onClick={onClose} className="text-primary-200 hover:text-white text-xl font-bold leading-none">✕</button>
                </div>

                {/* Warning confirmation */}
                {warning && (
                    <div className="mx-4 mt-4 bg-warning-50 border border-warning-300 rounded-xl p-4">
                        <p className="text-warning-800 font-semibold text-sm mb-3">
                            ⚠️ This student is currently with <strong>{warning.prevTeacherName}</strong> for this subject. Reassign to {teacher.full_name}?
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => doAssign(warning.subjectId, warning.studentId)}
                                className="px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white font-bold text-sm rounded-lg">
                                Yes, Reassign
                            </button>
                            <button onClick={() => setWarning(null)}
                                className="px-4 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold text-sm rounded-lg">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Subject sections */}
                <div className="overflow-y-auto flex-1 p-4 space-y-4">
                    {subjects.map(subject => {
                        const assignedIds = assignedBySubject[subject.id] ?? [];
                        const assignedStudents = assignedIds.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as typeof allStudents;

                        const search = searchTerms[subject.id] ?? '';
                        const available = allStudents.filter(s =>
                            !s.archived &&
                            !assignedIds.includes(s.id) &&
                            s.full_name.toLowerCase().includes(search.toLowerCase())
                        );

                        return (
                            <div key={subject.id} className="bg-neutral-50 rounded-xl border border-neutral-200 overflow-hidden">
                                <div className="bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2 flex justify-between items-center">
                                    <h3 className="text-white font-bold text-sm">{subject.name}</h3>
                                    <span className="text-primary-100 text-xs">{assignedStudents.length} students</span>
                                </div>

                                {/* Assigned students */}
                                <div className="p-3 space-y-1">
                                    {assignedStudents.length === 0 && (
                                        <p className="text-xs text-neutral-400 py-1">No students assigned.</p>
                                    )}
                                    {assignedStudents.map(s => (
                                        <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white transition-colors">
                                            <span className="text-sm font-medium text-neutral-700">{s.full_name}</span>
                                            <button
                                                onClick={() => handleRemove(s.id, subject.id)}
                                                className="text-xs text-neutral-400 hover:text-error-600 font-semibold transition-colors"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Add student */}
                                <div className="border-t border-neutral-200 p-3">
                                    <input
                                        type="text"
                                        placeholder="Search to add a student…"
                                        value={search}
                                        onChange={e => setSearchTerms(prev => ({ ...prev, [subject.id]: e.target.value }))}
                                        className="w-full px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                    />
                                    {search && available.length > 0 && (
                                        <ul className="mt-1 bg-white border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-36 overflow-y-auto shadow-sm">
                                            {available.slice(0, 10).map(s => (
                                                <li key={s.id}>
                                                    <button
                                                        onClick={() => initiateAdd(subject.id, s.id)}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 hover:text-primary-700 transition-colors"
                                                    >
                                                        {s.full_name}
                                                        {enrollments.find(e => e.student_id === s.id && e.subject_id === subject.id && e.teacher_id && e.teacher_id !== teacher.id) && (
                                                            <span className="ml-2 text-xs text-warning-600 font-medium">(has teacher)</span>
                                                        )}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {search && available.length === 0 && (
                                        <p className="mt-1 text-xs text-neutral-400 px-1">No matching students available.</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-neutral-100 flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl text-sm transition-colors">
                        Done
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
