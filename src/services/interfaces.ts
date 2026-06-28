// ===== SAT-MAKON Data Repository Interface =====
// All data access goes through this typed interface.
// Components never touch mock data directly.
// A real backend replaces the mock later without touching UI.

import type {
    Student,
    Subject,
    Teacher,
    Enrollment,
    Assessment,
    Config,
    YearMonth,
    Scores,
} from '@/data/types';

export interface AssignResult {
    enrollment: Enrollment;
    wasReassigned: boolean;
    previousTeacherId: string | null;
}

/** Typed data repository interface — the single access point for all data */
export interface IDataRepository {
    // ----- Read: Entities -----
    getStudents(includeArchived?: boolean): Student[];
    getStudent(id: string): Student | undefined;

    getTeachers(includeArchived?: boolean): Teacher[];
    getTeacher(id: string): Teacher | undefined;

    getSubjects(includeArchived?: boolean): Subject[];
    getSubject(id: string): Subject | undefined;

    // ----- Read: Enrollments -----
    getEnrollments(): Enrollment[];
    getEnrollmentsForStudent(studentId: string): Enrollment[];
    getEnrollmentsForTeacher(teacherId: string): Enrollment[];
    getUnassignedEnrollments(): Enrollment[];

    // ----- Read: Assessments -----
    getAssessments(): Assessment[];
    getAssessmentsForStudent(studentId: string, month?: YearMonth): Assessment[];
    getAssessmentsForSubject(subjectId: string, month?: YearMonth): Assessment[];
    getAssessmentsForStudentSubject(studentId: string, subjectId: string, month?: YearMonth): Assessment[];
    getAssessmentsForTeacher(teacherId: string): Assessment[];

    // ----- Read: Config & Meta -----
    getConfig(): Config;
    getCurrentMonth(): YearMonth;
    getPreviousMonth(): YearMonth;

    // ----- Auth (MOCK — clearly fake, behind the interface) -----
    authenticateStaff(username: string, password: string): Teacher | null;

    // ----- Mutations (Phase 3–4) -----
    addAssessment(assessment: Omit<Assessment, 'id'>): Assessment;
    updateAssessment(id: string, scores: Scores): Assessment | null;
    deleteAssessment(id: string): boolean;

    addStudent(student: Omit<Student, 'id'>): Student;
    updateStudent(id: string, updates: Partial<Student>): Student | null;
    archiveStudent(id: string): boolean;

    addTeacher(teacher: Omit<Teacher, 'id'>, actor: Teacher): Teacher;
    updateTeacher(id: string, updates: Partial<Teacher>, actor: Teacher): Teacher | null;
    archiveTeacher(id: string, actor: Teacher): boolean;

    addSubject(subject: Omit<Subject, 'id'>): Subject;
    updateSubject(id: string, updates: Partial<Subject>): Subject | null;
    archiveSubject(id: string): boolean;

    setEnrollmentTeacher(studentId: string, subjectId: string, teacherId: string | null): Enrollment | null;
    addEnrollment(enrollment: Enrollment): Enrollment;
    assignStudentToTeacher(studentId: string, subjectId: string, teacherId: string): AssignResult;

    isUsernameAvailable(username: string, excludeId?: string): boolean;
}
