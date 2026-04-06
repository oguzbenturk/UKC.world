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
    profile, loading, error,
    updateProfile, addProgress, removeProgress, saving, progressSaving,
    addGoal, editGoal, removeGoal, goalSaving
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

  const [goalFeedback, setGoalFeedback] = useState(null);
  const [goalError, setGoalError] = useState(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState('');
  const [goalNotes, setGoalNotes] = useState('');

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

  const handleGoalAdd = async (event) => {
    event.preventDefault();
    if (!goalTitle.trim()) { setGoalError('Goal title is required'); return; }
    setGoalFeedback(null); setGoalError(null);
    try {
      await addGoal({
        title: goalTitle.trim(),
        description: goalDescription || null,
        targetDate: goalTargetDate || null,
        notes: goalNotes || null
      });
      setGoalFeedback('Goal added');
      setGoalTitle(''); setGoalDescription(''); setGoalTargetDate(''); setGoalNotes('');
      setShowGoalForm(false);
    } catch (err) {
      setGoalError(err.response?.data?.error || err.message || 'Failed to add goal');
    }
  };

  const handleGoalAchieve = async (goalId) => {
    setGoalError(null); setGoalFeedback(null);
    try {
      await editGoal(goalId, { status: 'achieved' });
      setGoalFeedback('Goal marked as achieved');
    } catch (err) {
      setGoalError(err.response?.data?.error || err.message || 'Failed to update goal');
    }
  };

  const handleGoalDelete = async (goalId) => {
    if (!window.confirm('Delete this goal?')) return;
    setGoalError(null); setGoalFeedback(null);
    try {
      await removeGoal(goalId);
      setGoalFeedback('Goal deleted');
    } catch (err) {
      setGoalError(err.response?.data?.error || err.message || 'Failed to delete goal');
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
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back
        </button>
        <div className="text-xs text-slate-500 italic">Student management</div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
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

          <GoalsSection
            goals={profile.goals || []}
            showForm={showGoalForm}
            onToggleForm={() => { setShowGoalForm(v => !v); setGoalError(null); }}
            goalTitle={goalTitle} setGoalTitle={setGoalTitle}
            goalDescription={goalDescription} setGoalDescription={setGoalDescription}
            goalTargetDate={goalTargetDate} setGoalTargetDate={setGoalTargetDate}
            goalNotes={goalNotes} setGoalNotes={setGoalNotes}
            onSubmit={handleGoalAdd}
            saving={goalSaving}
            feedback={goalFeedback}
            error={goalError}
            onAchieve={handleGoalAchieve}
            onDelete={handleGoalDelete}
          />
        </div>
      )}
    </div>
  );
};

const StudentHeader = ({ student, progressPercent }) => (
  <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">{student.name}</h1>
        <p className="text-sm text-slate-500">{student.email}</p>
        <p className="text-sm text-slate-500">{student.phone || 'Phone not specified'}</p>
      </div>
      <div className="w-full md:w-64">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Progress towards 20h goal</div>
        <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
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
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold text-slate-900">Skill & Notes</h2>
      {feedback && <span className="text-xs text-emerald-600">{feedback}</span>}
    </div>
    {error && (
      <div className="mb-3 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>
    )}
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Skill Level</label>
        <select
          value={levelValue || ''}
          onChange={(e) => setLevelValue(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
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
        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
        <textarea
          value={notesValue || ''}
          onChange={(e) => setNotesValue(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-sky-600 text-white text-sm rounded-md shadow hover:bg-sky-500 disabled:opacity-50"
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
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold text-slate-900">Record Progress</h2>
      {feedback && <span className="text-xs text-emerald-600">{feedback}</span>}
    </div>
    {error && (
      <div className="mb-3 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>
    )}
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Skill</label>
        <select
          value={progressSkillId}
          onChange={(e) => setProgressSkillId(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
          <input
            type="date"
            value={progressDate}
            onChange={(e) => setProgressDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
        <textarea
          value={progressNotes}
          onChange={(e) => setProgressNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
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
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold text-slate-900">Progress History</h2>
      <span className="text-xs text-slate-500">{progress.length} entries</span>
    </div>
    {progress.length === 0 && <p className="text-sm text-slate-500">No progress entries recorded yet.</p>}
    <ul className="space-y-3">
      {progress.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{entry.skillName}</p>
              <p className="text-xs text-slate-500">{entry.skillLevelName || 'General skill'}</p>
              <p className="text-xs text-slate-500 mt-1">{formatDate(entry.dateAchieved)}</p>
              {entry.notes && (
                <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">{entry.notes}</p>
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
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold text-slate-900">Recent Lessons</h2>
      <span className="text-xs text-slate-500">Last {lessons.length}</span>
    </div>
    {lessons.length === 0 && <p className="text-sm text-slate-500">No lessons yet for this student.</p>}
    <ul className="space-y-3">
      {lessons.map((lesson) => (
        <li
          key={lesson.id}
          className="rounded-lg border border-slate-200 bg-white p-4 flex justify-between items-center"
        >
          <div>
            <p className="text-sm font-medium text-slate-900">{formatDateTime(lesson.startTime)}</p>
            <p className="text-xs text-slate-500">Status: {lesson.status}</p>
          </div>
          <span className="text-sm text-slate-600">{lesson.durationHours}h</span>
        </li>
      ))}
    </ul>
  </div>
);

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  achieved: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const GoalsSection = ({
  goals, showForm, onToggleForm,
  goalTitle, setGoalTitle, goalDescription, setGoalDescription,
  goalTargetDate, setGoalTargetDate, goalNotes, setGoalNotes,
  onSubmit, saving, feedback, error, onAchieve, onDelete
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold text-slate-900">Goals</h2>
      <div className="flex items-center gap-3">
        {feedback && <span className="text-xs text-emerald-600">{feedback}</span>}
        <button
          type="button"
          onClick={onToggleForm}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-sky-600 text-white hover:bg-sky-500 transition"
        >
          {showForm ? 'Cancel' : '+ Add Goal'}
        </button>
      </div>
    </div>

    {error && (
      <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>
    )}

    {showForm && (
      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Goal Title <span className="text-rose-500">*</span></label>
          <input
            value={goalTitle}
            onChange={e => setGoalTitle(e.target.value)}
            placeholder="e.g. Achieve Water Start"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            value={goalDescription}
            onChange={e => setGoalDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Target Date</label>
            <input
              type="date"
              value={goalTargetDate}
              onChange={e => setGoalTargetDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <input
              value={goalNotes}
              onChange={e => setGoalNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-sky-600 text-white text-sm rounded-md shadow hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Add Goal'}
          </button>
        </div>
      </form>
    )}

    {goals.length === 0 && !showForm && (
      <p className="text-sm text-slate-500">No goals set yet. Add a goal to track progress with this student.</p>
    )}

    <ul className="space-y-3">
      {goals.map(goal => (
        <li key={goal.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-900">{goal.title}</p>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[goal.status] || STATUS_STYLES.pending}`}>
                  {goal.status}
                </span>
              </div>
              {goal.description && <p className="text-xs text-slate-600 mt-1">{goal.description}</p>}
              {goal.targetDate && (
                <p className="text-xs text-slate-500 mt-1">Target: {formatDate(goal.targetDate)}</p>
              )}
              {goal.notes && <p className="text-xs text-slate-500 mt-1 italic">{goal.notes}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {goal.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => onAchieve(goal.id)}
                  className="text-xs text-emerald-600 hover:text-emerald-500 font-medium"
                >
                  ✓ Achieved
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(goal.id)}
                className="text-xs text-rose-600 hover:text-rose-500"
              >
                Delete
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  </div>
);

const toneStyles = {
  blue: 'from-sky-400 to-indigo-500 text-sky-900',
  emerald: 'from-emerald-400 to-teal-500 text-emerald-900',
  violet: 'from-violet-400 to-fuchsia-500 text-violet-900',
  amber: 'from-amber-400 to-orange-500 text-amber-900'
};

const StatCard = ({ title, value, tone = 'blue' }) => (
  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
    <div className={`p-4 bg-gradient-to-r ${toneStyles[tone] || toneStyles.blue} bg-opacity-10`}> 
      <div className="text-xs uppercase tracking-wide text-slate-600/80">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  </div>
);

export default StudentDetail;
