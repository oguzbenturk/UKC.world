import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import {
  buildSkillPath,
  countByFilter,
  formatLessonWhen,
  groupStudents,
  lessonKind,
  nextBucket,
  phoneDigits,
  selectStudents,
  studentFlags,
  whatsappHref,
} from '@/features/instructor/students/studentsFormat';

const NOW = dayjs('2026-10-08T09:00:00');

const make = (overrides = {}) => ({
  studentId: overrides.studentId || 's',
  name: 'Student',
  skillLevel: 'beginner',
  totalLessonCount: 1,
  totalHours: 2,
  lastLessonDate: null,
  nextLesson: null,
  packageHours: { totalHours: 0, usedHours: 0, remainingHours: 0 },
  ...overrides,
});

const STUDENTS = [
  make({ studentId: 'a', name: 'Zeynep Kaya', nextLesson: { date: '2026-10-08', startHour: '15.50' }, totalHours: 4 }),
  make({ studentId: 'b', name: 'Ali Demir', nextLesson: { date: '2026-10-09', startHour: 9 }, packageHours: { totalHours: 10, usedHours: 8.5, remainingHours: 1.5 }, totalHours: 12 }),
  make({ studentId: 'c', name: 'Mira Jans', lastLessonDate: '2026-10-01', totalHours: 6, phone: '+90 544 324 99 45' }),
  make({ studentId: 'd', name: 'Old Timer', lastLessonDate: '2026-07-01', totalHours: 1 }),
];

describe('studentFlags / countByFilter', () => {
  it('flags upcoming, low hours and inactive students', () => {
    expect(studentFlags(STUDENTS[0], NOW)).toEqual({ upcoming: true, lowHours: false, inactive: false });
    expect(studentFlags(STUDENTS[1], NOW)).toEqual({ upcoming: true, lowHours: true, inactive: false });
    expect(studentFlags(STUDENTS[2], NOW)).toEqual({ upcoming: false, lowHours: false, inactive: false });
    expect(studentFlags(STUDENTS[3], NOW)).toEqual({ upcoming: false, lowHours: false, inactive: true });
  });

  it('counts each filter', () => {
    expect(countByFilter(STUDENTS, NOW)).toEqual({ all: 4, upcoming: 2, lowHours: 1, inactive: 1 });
  });
});

describe('selectStudents', () => {
  it('sorts by next lesson, then most recent', () => {
    expect(selectStudents(STUDENTS, { sort: 'next' }, NOW).map((s) => s.studentId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts by hours and name', () => {
    expect(selectStudents(STUDENTS, { sort: 'hours' }, NOW).map((s) => s.studentId)).toEqual(['b', 'c', 'a', 'd']);
    expect(selectStudents(STUDENTS, { sort: 'name' }, NOW).map((s) => s.name)[0]).toBe('Ali Demir');
  });

  it('searches name, level and phone; every word must match', () => {
    expect(selectStudents(STUDENTS, { query: 'mira' }, NOW).map((s) => s.studentId)).toEqual(['c']);
    expect(selectStudents(STUDENTS, { query: '324 99' }, NOW).map((s) => s.studentId)).toEqual(['c']);
    expect(selectStudents(STUDENTS, { query: 'ali kaya' }, NOW)).toHaveLength(0);
  });

  it('applies the filter', () => {
    expect(selectStudents(STUDENTS, { filter: 'lowHours' }, NOW).map((s) => s.studentId)).toEqual(['b']);
  });
});

describe('grouping and dates', () => {
  it('buckets the next lesson by day', () => {
    expect(nextBucket(STUDENTS[0], NOW)).toBe('today');
    expect(nextBucket(STUDENTS[1], NOW)).toBe('tomorrow');
    expect(nextBucket(make({ nextLesson: { date: '2026-10-12' } }), NOW)).toBe('week');
    expect(nextBucket(make({ nextLesson: { date: '2026-11-12' } }), NOW)).toBe('later');
    expect(nextBucket(STUDENTS[2], NOW)).toBe('none');
  });

  it('groups only for the next-lesson sort', () => {
    const groups = groupStudents(selectStudents(STUDENTS, { sort: 'next' }, NOW), 'next', NOW);
    expect(groups.map((g) => g.key)).toEqual(['today', 'tomorrow', 'none']);
    expect(groupStudents(STUDENTS, 'name', NOW)).toEqual([{ key: 'all', items: STUDENTS }]);
  });

  it('formats the lesson day with a decimal start hour', () => {
    const t = (key) => ({ 'instructor:students.when.today': 'Today', 'instructor:students.when.tomorrow': 'Tomorrow' }[key] || key);
    expect(formatLessonWhen('2026-10-08', '15.50', { locale: 'en', t, now: NOW })).toBe('Today · 15:30');
    expect(formatLessonWhen('2026-10-09', 9, { locale: 'en', t, now: NOW })).toBe('Tomorrow · 09:00');
  });
});

describe('contact links', () => {
  it('normalises phone numbers', () => {
    expect(phoneDigits('+90 544 324 99 45')).toBe('905443249945');
    expect(whatsappHref('+90 (544) 324-99-45')).toBe('https://wa.me/905443249945');
    expect(whatsappHref('')).toBeNull();
  });
});

describe('lessonKind', () => {
  it('maps booking statuses', () => {
    expect(lessonKind('completed')).toBe('completed');
    expect(lessonKind('checked-out')).toBe('completed');
    expect(lessonKind('cancelled')).toBe('cancelled');
    expect(lessonKind('no_show')).toBe('noShow');
    expect(lessonKind('confirmed')).toBe('booked');
  });
});

describe('buildSkillPath', () => {
  it('groups skills by level order and marks achieved ones', () => {
    const levels = [{ id: 'l2', name: 'Intermediate', orderIndex: 2 }, { id: 'l1', name: 'Beginner', orderIndex: 1 }];
    const skills = [
      { id: 'k1', name: 'Body drag', skillLevelId: 'l1' },
      { id: 'k2', name: 'Water start', skillLevelId: 'l1' },
      { id: 'k3', name: 'Upwind', skillLevelId: 'l2' },
      { id: 'k4', name: 'Loose', skillLevelId: null },
    ];
    const progress = [{ id: 'p1', skillId: 'k2', dateAchieved: '2026-10-01' }];
    const path = buildSkillPath(levels, skills, progress);
    expect(path.groups.map((g) => g.level?.name ?? null)).toEqual(['Beginner', 'Intermediate', null]);
    expect(path.groups[0].skills.map((s) => Boolean(s.progress))).toEqual([false, true]);
    expect(path).toMatchObject({ total: 4, done: 1 });
  });
});
