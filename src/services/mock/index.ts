// ===== SAT-MAKON In-Memory Mock Data Repository =====
// Loads from satmakon-mock-data.json at init.
// Components consume via IDataRepository — never import JSON directly.
// MOCK ONLY — replace with real backend before launch.

import type { IDataRepository } from '@/services/interfaces';
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
} from '@/data/types';
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

    addTeacher(data) {
        const teacher: Teacher = { ...data, id: generateId('tch') };
        teachers = [...teachers, teacher];
        return teacher;
    },
    updateTeacher(id, updates) {
        const idx = teachers.findIndex((t) => t.id === id);
        if (idx === -1) return null;
        teachers = teachers.map((t) => (t.id === id ? { ...t, ...updates } : t));
        return teachers.find((t) => t.id === id)!;
    },
    archiveTeacher(id) {
        const t = teachers.find((t) => t.id === id);
        if (!t) return false;
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
};

// Log to confirm data loaded
console.log(
    `[SAT-MAKON Mock] Loaded: ${students.length} students, ${assessments.length} assessments, ` +
    `${teachers.length} teachers, ${subjects.length} subjects. Current month: ${currentMonth}`
);
