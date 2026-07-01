// ===== SAT-MAKON Seed Script =====
// Loads satmakon-mock-data.json into Postgres.
// Hashes mock passwords with bcrypt.
// Idempotent: clears all tables then reinserts.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import mockDataJson from '../../src/data/satmakon-mock-data.json' with { type: 'json' };
import type { MockDataFile } from '../../shared/types.js';

const prisma = new PrismaClient();
const mockData = mockDataJson as unknown as MockDataFile;

async function main() {
    console.log('Seeding database from satmakon-mock-data.json...\n');

    // Hash the single mock password once
    const passwordHash = await bcrypt.hash(mockData._meta.mock_auth_password, 10);

    // Clear in reverse dependency order (FK safety)
    await prisma.auditLog.deleteMany();
    await prisma.assessment.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.student.deleteMany();
    await prisma.subject.deleteMany();
    await prisma.teacher.deleteMany();

    // Subjects
    await prisma.subject.createMany({
        data: mockData.subjects.map((s) => ({
            id: s.id,
            name: s.name,
            archived: s.archived,
        })),
    });

    // Teachers (password_hash replaces the plaintext mock password)
    await prisma.teacher.createMany({
        data: mockData.teachers.map((t) => ({
            id: t.id,
            full_name: t.full_name,
            username: t.username,
            password_hash: passwordHash,
            role: t.role,
            archived: t.archived,
        })),
    });

    // Students
    await prisma.student.createMany({
        data: mockData.students.map((s) => ({
            id: s.id,
            full_name: s.full_name,
            enrollment_date: new Date(s.enrollment_date),
            enrollment_status: s.enrollment_status,
            eligibility_start: s.eligibility_start,
            archived: s.archived,
        })),
    });

    // Enrollments (teacher_id may be null — the Unassigned case)
    await prisma.enrollment.createMany({
        data: mockData.enrollments.map((e) => ({
            student_id: e.student_id,
            subject_id: e.subject_id,
            teacher_id: e.teacher_id,
        })),
    });

    // Assessments — preserve original IDs and timestamps from mock data
    // month is derived from created_at (Tashkent-offset ISO string → slice 0–7)
    await prisma.assessment.createMany({
        data: mockData.assessments.map((a) => ({
            id: a.id,
            student_id: a.student_id,
            subject_id: a.subject_id,
            teacher_id: a.teacher_id,
            created_at: new Date(a.created_at),
            month: a.created_at.slice(0, 7),
            homework: a.scores.homework,
            progress: a.scores.progress,
            activity: a.scores.activity,
            attendance: a.scores.attendance,
            behavior: a.scores.behavior,
        })),
    });

    // Verify edge-case rows required by Phase 1 acceptance criteria
    const edgeCases = ['stu_freshman', 'stu_thin', 'stu_unassigned', 'stu_archived'];
    for (const id of edgeCases) {
        const student = await prisma.student.findUnique({ where: { id } });
        if (!student) throw new Error(`Edge-case student missing: ${id}`);
    }
    const bothSubjectsTeacher = await prisma.enrollment.groupBy({
        by: ['teacher_id'],
        where: { teacher_id: { not: null } },
        _count: { subject_id: true },
        having: { subject_id: { _count: { gt: 1 } } },
    });
    if (bothSubjectsTeacher.length === 0) {
        console.warn('Warning: no teacher assigned to multiple subjects found');
    }

    console.log('Seed complete.\n');
    console.log(`  Subjects:    ${mockData.subjects.length}`);
    console.log(`  Teachers:    ${mockData.teachers.length}`);
    console.log(`  Students:    ${mockData.students.length}`);
    console.log(`  Enrollments: ${mockData.enrollments.length}`);
    console.log(`  Assessments: ${mockData.assessments.length}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
