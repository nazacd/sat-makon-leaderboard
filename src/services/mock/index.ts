// ===== SAT-MAKON In-Memory Mock Data Repository =====
// Loads from satmakon-mock-data.json at init.
// Components consume via IDataRepository — never import JSON directly.
// MOCK ONLY — replace with real backend before launch.

import type { IDataRepository, AssignResult } from '@/services/interfaces';
import { canManageStaff, canArchiveStaff } from '@/services/permissions';
import type {
    Student,
    Subject,
    Teacher,
    Enrollment,
    Assessment,
    Config,
    YearMonth,
    Scores,
    MockDataFile,
} from '@shared/types';
import mockDataJson from '@/data/satmakon-mock-data.json';

const mockData = mockDataJson as unknown as MockDataFile;

// ===== In-memory stores (mutable copies of the seed) =====
let students: Student[] = [...mockData.students];
let teachers: Teacher[] = [...mockData.teachers];
let subjects: Subject[] = [...mockData.subjects];
let enrollments: Enrollment[] = [...mockData.enrollments];
let assessments: Assessment[] = [...mockData.assessments];
const config: Config = { ...mockData.config };
const currentMonth: YearMonth = mockData._meta.current_month;
const previousMonth: YearMonth = mockData._meta.previous_month;

let nextId = 1000; // For generating new IDs

function isUsernameTaken(username: string, excludeId?: string): boolean {
    return teachers.some((t) => t.username === username && t.id !== excludeId);
}
function generateId(prefix: string): string {
    return `${prefix}_${++nextId}`;
}

/** Extract month (YYYY-MM) from an ISO datetime string */
function extractMonth(dateStr: string): YearMonth {
    return dateStr.slice(0, 7);
}

// ===== Implementation =====

export const mockRepository: IDataRepository = {
    // ----- Students -----
    getStudents(includeArchived = false) {
        return includeArchived ? [...students] : students.filter((s) => !s.archived);
    },
    getStudent(id) {
        return students.find((s) => s.id === id);
    },

    // ----- Teachers -----
    getTeachers(includeArchived = false) {
        return includeArchived ? [...teachers] : teachers.filter((t) => !t.archived);
    },
    getTeacher(id) {
        return teachers.find((t) => t.id === id);
    },

    // ----- Subjects -----
    getSubjects(includeArchived = false) {
        return includeArchived ? [...subjects] : subjects.filter((s) => !s.archived);
    },
    getSubject(id) {
        return subjects.find((s) => s.id === id);
    },

    // ----- Enrollments -----
    getEnrollments() {
        return [...enrollments];
    },
    getEnrollmentsForStudent(studentId) {
        return enrollments.filter((e) => e.student_id === studentId);
    },
    getEnrollmentsForTeacher(teacherId) {
        return enrollments.filter((e) => e.teacher_id === teacherId);
    },
    getUnassignedEnrollments() {
        return enrollments.filter((e) => e.teacher_id === null);
    },

    // ----- Assessments -----
    getAssessments() {
        return [...assessments];
    },
    getAssessmentsForStudent(studentId, month?) {
        return assessments.filter(
            (a) => a.student_id === studentId && (!month || extractMonth(a.created_at) === month)
        );
    },
    getAssessmentsForSubject(subjectId, month?) {
        return assessments.filter(
            (a) => a.subject_id === subjectId && (!month || extractMonth(a.created_at) === month)
        );
    },
    getAssessmentsForStudentSubject(studentId, subjectId, month?) {
        return assessments.filter(
            (a) =>
                a.student_id === studentId &&
                a.subject_id === subjectId &&
                (!month || extractMonth(a.created_at) === month)
        );
    },
    getAssessmentsForTeacher(teacherId) {
        return assessments.filter((a) => a.teacher_id === teacherId);
    },

    // ----- Config & Meta -----
    getConfig() {
        return { ...config };
    },
    getCurrentMonth() {
        return currentMonth;
    },
    getPreviousMonth() {
        return previousMonth;
    },

    // ----- Auth (MOCK — clearly fake) -----
    authenticateStaff(username, password) {
        const staff = teachers.find(
            (t) => t.username === username && t.password === password && !t.archived
        );
        return staff ?? null;
    },

    // ----- Mutations -----
    addAssessment(data) {
        const assessment: Assessment = { ...data, id: generateId('ass') };
        assessments = [...assessments, assessment];
        return assessment;
    },
    updateAssessment(id, scores: Scores) {
        const idx = assessments.findIndex((a) => a.id === id);
        if (idx === -1) return null;
        assessments = assessments.map((a) => (a.id === id ? { ...a, scores } : a));
        return assessments.find((a) => a.id === id)!;
    },
    deleteAssessment(id: string) {
        const initialLength = assessments.length;
        assessments = assessments.filter((a) => a.id !== id);
        return assessments.length < initialLength;
    },

    addStudent(data) {
        const student: Student = { ...data, id: generateId('stu') };
        students = [...students, student];
        return student;
    },
    updateStudent(id, updates) {
        const idx = students.findIndex((s) => s.id === id);
        if (idx === -1) return null;
        students = students.map((s) => (s.id === id ? { ...s, ...updates } : s));
        return students.find((s) => s.id === id)!;
    },
    archiveStudent(id) {
        const s = students.find((s) => s.id === id);
        if (!s) return false;
        students = students.map((s) => (s.id === id ? { ...s, archived: true } : s));
        return true;
    },

    addTeacher(data, actor) {
        if (isUsernameTaken(data.username)) {
            throw new Error(`Username "${data.username}" is already taken.`);
        }
        if (!canManageStaff(actor.role, data.role)) {
            throw new Error(`Permission denied: cannot create a ${data.role} account.`);
        }
        const teacher: Teacher = { ...data, id: generateId('tch') };
        teachers = [...teachers, teacher];
        return teacher;
    },
    updateTeacher(id, updates, actor) {
        const existing = teachers.find((t) => t.id === id);
        if (!existing) return null;
        const isSelf = actor.id === id;
        if (!isSelf && !canManageStaff(actor.role, existing.role)) {
            throw new Error(`Permission denied: cannot edit a ${existing.role} account.`);
        }
        // Self-updates may only change username and password, not role or archived status
        const safeUpdates: Partial<Teacher> = isSelf
            ? Object.fromEntries(
                Object.entries({ username: updates.username, password: updates.password }).filter(([, v]) => v !== undefined)
              ) as Partial<Teacher>
            : updates;
        if (safeUpdates.username !== undefined && isUsernameTaken(safeUpdates.username, id)) {
            throw new Error(`Username "${safeUpdates.username}" is already taken.`);
        }
        teachers = teachers.map((t) => (t.id === id ? { ...t, ...safeUpdates } : t));
        return teachers.find((t) => t.id === id)!;
    },
    archiveTeacher(id, actor) {
        const target = teachers.find((t) => t.id === id);
        if (!target) return false;
        const check = canArchiveStaff(actor, target, teachers);
        if (!check.allowed) throw new Error(check.reason);
        teachers = teachers.map((t) => (t.id === id ? { ...t, archived: true } : t));
        return true;
    },

    addSubject(data) {
        const subject: Subject = { ...data, id: generateId('sub') };
        subjects = [...subjects, subject];
        return subject;
    },
    updateSubject(id, updates) {
        const idx = subjects.findIndex((s) => s.id === id);
        if (idx === -1) return null;
        subjects = subjects.map((s) => (s.id === id ? { ...s, ...updates } : s));
        return subjects.find((s) => s.id === id)!;
    },
    archiveSubject(id) {
        const s = subjects.find((s) => s.id === id);
        if (!s) return false;
        subjects = subjects.map((s) => (s.id === id ? { ...s, archived: true } : s));
        return true;
    },

    isUsernameAvailable(username, excludeId?) {
        return !isUsernameTaken(username, excludeId);
    },

    setEnrollmentTeacher(studentId, subjectId, teacherId) {
        const idx = enrollments.findIndex(
            (e) => e.student_id === studentId && e.subject_id === subjectId
        );
        if (idx === -1) return null;
        enrollments = enrollments.map((e) =>
            e.student_id === studentId && e.subject_id === subjectId
                ? { ...e, teacher_id: teacherId }
                : e
        );
        return enrollments.find(
            (e) => e.student_id === studentId && e.subject_id === subjectId
        )!;
    },
    addEnrollment(enrollment) {
        enrollments = [...enrollments, enrollment];
        return enrollment;
    },
    assignStudentToTeacher(studentId, subjectId, teacherId): AssignResult {
        const existing = enrollments.find(
            (e) => e.student_id === studentId && e.subject_id === subjectId
        );
        if (existing) {
            const wasReassigned = existing.teacher_id !== null && existing.teacher_id !== teacherId;
            const previousTeacherId = existing.teacher_id;
            enrollments = enrollments.map((e) =>
                e.student_id === studentId && e.subject_id === subjectId
                    ? { ...e, teacher_id: teacherId }
                    : e
            );
            const updated = enrollments.find(
                (e) => e.student_id === studentId && e.subject_id === subjectId
            )!;
            return { enrollment: updated, wasReassigned, previousTeacherId };
        }
        const newEnrollment: Enrollment = { student_id: studentId, subject_id: subjectId, teacher_id: teacherId };
        enrollments = [...enrollments, newEnrollment];
        return { enrollment: newEnrollment, wasReassigned: false, previousTeacherId: null };
    },
};

// Log to confirm data loaded
console.log(
    `[SAT-MAKON Mock] Loaded: ${students.length} students, ${assessments.length} assessments, ` +
    `${teachers.length} teachers, ${subjects.length} subjects. Current month: ${currentMonth}`
);
