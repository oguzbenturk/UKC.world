import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInstructorStudentProfile } from '../hooks/useInstructorStudentProfile';

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const StudentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    profile,
    loading,
    error,
    updateProfile,
    addProgress,
    removeProgress,
    saving,
    progressSaving
  } = useInstructorStudentProfile(id);

  const student = profile?.student;

  const [levelValue, setLevelValue] = useState('');
  const [notesValue, setNotesValue] = useState('');
  const [profileFeedback, setProfileFeedback] = useState(null);
  const [profileError, setProfileError] = useState(null);

  const [progressSkillId, setProgressSkillId] = useState('');
  const [progressDate, setProgressDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [progressNotes, setProgressNotes] = useState('');
  const [progressError, setProgressError] = useState(null);
  const [progressFeedback, setProgressFeedback] = useState(null);

  useEffect(() => {
    if (!student) return;
    setLevelValue(student.level || '');
    setNotesValue(student.notes || '');
  }, [student]);

  useEffect(() => {
    if (!progressSkillId && profile?.skills?.length) {
      setProgressSkillId(profile.skills[0].id);
    }
  }, [profile?.skills, progressSkillId]);

  const levelOptions = useMemo(() => {
    if (!profile?.skillLevels?.length) return [];
    return profile.skillLevels.map((lvl) => ({ id: lvl.id, name: lvl.name }));
  }, [profile?.skillLevels]);

  const skillOptions = useMemo(() => {
    if (!profile?.skills?.length) return [];
    return profile.skills.map((skill) => ({ id: skill.id, name: skill.name, levelId: skill.skillLevelId }));
  }, [profile?.skills]);

  const selectedSkillLevelName = useMemo(() => {
    if (!progressSkillId) return null;
    const skill = skillOptions.find((s) => s.id === progressSkillId);
    if (!skill) return null;
    const level = profile?.skillLevels?.find((lvl) => lvl.id === skill.levelId);
    return level?.name || null;
  }, [progressSkillId, skillOptions, profile?.skillLevels]);

  const handleProfileSave = async (event) => {
    event.preventDefault();
    if (!id) return;
    setProfileFeedback(null);
    setProfileError(null);
    try {
      await updateProfile({
        level: levelValue || null,
        notes: notesValue || null
      });
      setProfileFeedback('Student details updated');
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Failed to update student';
      setProfileError(message);
    }
  };

  const handleProgressAdd = async (event) => {
    event.preventDefault();
    if (!progressSkillId) {
      setProgressError('Select a skill to record progress');
      return;
    }
    setProgressFeedback(null);
    setProgressError(null);
    try {
      await addProgress({
        skillId: progressSkillId,
        dateAchieved: progressDate,
        notes: progressNotes || null
      });
      setProgressFeedback('Progress recorded');
      setProgressNotes('');
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Failed to save progress';
      setProgressError(message);
    }
  };

  const handleProgressDelete = async (progressId) => {
    if (!progressId) return;
    if (!window.confirm('Remove this progress entry?')) return;
    setProgressError(null);
    setProgressFeedback(null);
    try {
      await removeProgress(progressId);
      setProgressFeedback('Progress entry removed');
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Failed to remove progress';
      setProgressError(message);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          ← Back
        </button>
        <div className="text-xs text-slate-500 italic">Student management</div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 p-10 text-center text-slate-500">
          Loading student profile...
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && profile && (
        <div className="space-y-8">
          <StudentHeader student={student} progressPercent={profile.progressPercent} />
          <StatsGrid stats={profile.stats} />

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProfileForm
              levelValue={levelValue}
              setLevelValue={setLevelValue}
              levelOptions={levelOptions}
              notesValue={notesValue}
              setNotesValue={setNotesValue}
              onSubmit={handleProfileSave}
              saving={saving}
              feedback={profileFeedback}
              error={profileError}
            />

            <ProgressForm
              skillOptions={skillOptions}
              selectedLevel={selectedSkillLevelName}
              progressSkillId={progressSkillId}
              setProgressSkillId={setProgressSkillId}
              progressDate={progressDate}
              setProgressDate={setProgressDate}
              progressNotes={progressNotes}
              setProgressNotes={setProgressNotes}
              onSubmit={handleProgressAdd}
              saving={progressSaving}
              feedback={progressFeedback}
              error={progressError}
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProgressHistory progress={profile.progress} onDelete={handleProgressDelete} />
            <RecentLessons lessons={profile.recentLessons} />
          </section>
        </div>
      )}
    </div>
  );
};

const StudentHeader = ({ student, progressPercent }) => (
  <header className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 p-6 shadow-md">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">{student.name}</h1>
        <p className="text-sm text-slate-500">{student.email}</p>
        <p className="text-sm text-slate-500">{student.phone || 'Phone not specified'}</p>
      </div>
      <div className="w-full md:w-64">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Progress towards 20h goal</div>
        <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-teal-500 to-sky-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-wide text-slate-500 mt-1">
          <span>{progressPercent}%</span>
          <span>20h Goal</span>
        </div>
      </div>
    </div>
  </header>
);

const StatsGrid = ({ stats }) => (
  <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
    <StatCard title="Total Lessons" value={stats.totalLessons} tone="blue" />
    <StatCard title="Total Hours" value={stats.totalHours} tone="emerald" />
    <StatCard title="Last Lesson" value={formatDateTime(stats.lastLessonAt)} tone="violet" />
    <StatCard title="Next Lesson" value={formatDateTime(stats.nextLessonAt)} tone="amber" />
  </section>
);

const ProfileForm = ({
  levelValue,
  setLevelValue,
  levelOptions,
  notesValue,
  setNotesValue,
  onSubmit,
  saving,
  feedback,
  error
}) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 p-6 shadow">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Skill & Notes</h2>
      {feedback && <span className="text-xs text-emerald-600">{feedback}</span>}
    </div>
    {error && (
      <div className="mb-3 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>
    )}
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Skill Level</label>
        <select
          value={levelValue || ''}
          onChange={(e) => setLevelValue(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        >
          <option value="">Not specified</option>
          {levelOptions.map((lvl) => (
            <option key={lvl.id} value={lvl.name}>
              {lvl.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
        <textarea
          value={notesValue || ''}
          onChange={(e) => setNotesValue(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-slate-900 text-white text-sm rounded-md shadow hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </form>
  </div>
);

const ProgressForm = ({
  skillOptions,
  selectedLevel,
  progressSkillId,
  setProgressSkillId,
  progressDate,
  setProgressDate,
  progressNotes,
  setProgressNotes,
  onSubmit,
  saving,
  feedback,
  error
}) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 p-6 shadow">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Record Progress</h2>
      {feedback && <span className="text-xs text-emerald-600">{feedback}</span>}
    </div>
    {error && (
      <div className="mb-3 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>
    )}
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Skill</label>
        <select
          value={progressSkillId}
          onChange={(e) => setProgressSkillId(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        >
          {skillOptions.map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.name}
            </option>
          ))}
        </select>
        {selectedLevel && <p className="text-xs text-slate-500 mt-1">Level: {selectedLevel}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
          <input
            type="date"
            value={progressDate}
            onChange={(e) => setProgressDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes (optional)</label>
        <textarea
          value={progressNotes}
          onChange={(e) => setProgressNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-md shadow hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Add progress'}
        </button>
      </div>
    </form>
  </div>
);

const ProgressHistory = ({ progress, onDelete }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 p-6 shadow space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Progress History</h2>
      <span className="text-xs text-slate-500">{progress.length} entries</span>
    </div>
    {progress.length === 0 && <p className="text-sm text-slate-500">No progress entries recorded yet.</p>}
    <ul className="space-y-3">
      {progress.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{entry.skillName}</p>
              <p className="text-xs text-slate-500">{entry.skillLevelName || 'General skill'}</p>
              <p className="text-xs text-slate-500 mt-1">{formatDate(entry.dateAchieved)}</p>
              {entry.notes && (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 whitespace-pre-line">{entry.notes}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDelete(entry.id)}
              className="text-xs text-rose-600 hover:text-rose-500"
            >
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  </div>
);

const RecentLessons = ({ lessons }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 p-6 shadow space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Recent Lessons</h2>
      <span className="text-xs text-slate-500">Last {lessons.length}</span>
    </div>
    {lessons.length === 0 && <p className="text-sm text-slate-500">No lessons yet for this student.</p>}
    <ul className="space-y-3">
      {lessons.map((lesson) => (
        <li
          key={lesson.id}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4 flex justify-between items-center"
        >
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{formatDateTime(lesson.startTime)}</p>
            <p className="text-xs text-slate-500">Status: {lesson.status}</p>
          </div>
          <span className="text-sm text-slate-600 dark:text-slate-300">{lesson.durationHours}h</span>
        </li>
      ))}
    </ul>
  </div>
);

const toneStyles = {
  blue: 'from-sky-400 to-indigo-500 text-sky-900 dark:text-white',
  emerald: 'from-emerald-400 to-teal-500 text-emerald-900 dark:text-white',
  violet: 'from-violet-400 to-fuchsia-500 text-violet-900 dark:text-white',
  amber: 'from-amber-400 to-orange-500 text-amber-900 dark:text-white'
};

const StatCard = ({ title, value, tone = 'blue' }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm overflow-hidden">
    <div className={`p-4 bg-gradient-to-r ${toneStyles[tone] || toneStyles.blue} bg-opacity-10`}> 
      <div className="text-xs uppercase tracking-wide text-slate-600/80 dark:text-white/70">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  </div>
);

export default StudentDetail;
