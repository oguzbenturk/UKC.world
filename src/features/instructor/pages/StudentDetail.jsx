import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstructorStudentProfile } from '../hooks/useInstructorStudentProfile';
import apiClient from '@/shared/services/apiClient';

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

const getInitials = (name) => {
  if (!name) return '??';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

const StudentDetail = () => {
  const { t } = useTranslation(['instructor']);
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    profile, loading, error,
    updateProfile, addProgress, removeProgress, saving, progressSaving,
    addRecommendation, removeRecommendation, recSaving
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
      await updateProfile({ level: levelValue || null, notes: notesValue || null });
      setProfileFeedback(t('instructor:studentDetail.studentUpdated'));
    } catch (err) {
      const message = (typeof err.response?.data?.error === 'string' ? err.response.data.error : err.response?.data?.message) || err.message || t('instructor:studentDetail.failedToUpdate');
      setProfileError(message);
    }
  };

  const handleProgressAdd = async (event) => {
    event.preventDefault();
    if (!progressSkillId) { setProgressError(t('instructor:studentDetail.selectSkill')); return; }
    setProgressFeedback(null);
    setProgressError(null);
    try {
      await addProgress({ skillId: progressSkillId, dateAchieved: progressDate, notes: progressNotes || null });
      setProgressFeedback(t('instructor:studentDetail.progressRecorded'));
      setProgressNotes('');
    } catch (err) {
      const message = (typeof err.response?.data?.error === 'string' ? err.response.data.error : err.response?.data?.message) || err.message || t('instructor:studentDetail.failedToSaveProgress');
      setProgressError(message);
    }
  };

  const handleProgressDelete = async (progressId) => {
    if (!progressId) return;
    if (!window.confirm(t('instructor:studentDetail.removeProgressConfirm'))) return;
    setProgressError(null); setProgressFeedback(null);
    try {
      await removeProgress(progressId);
      setProgressFeedback(t('instructor:studentDetail.progressRemoved'));
    } catch (err) {
      const message = (typeof err.response?.data?.error === 'string' ? err.response.data.error : err.response?.data?.message) || err.message || t('instructor:studentDetail.failedToRemoveProgress');
      setProgressError(message);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          {t('instructor:studentDetail.back')}
        </button>
        <span className="text-slate-300 text-sm">/</span>
        <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600 border border-sky-100">
          {t('instructor:studentDetail.studentProfile')}
        </span>
      </div>

      {loading && <LoadingSkeleton />}

      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && profile && (
        <div className="space-y-6">
          <StudentHeader
            student={student}
            progressPercent={profile.progressPercent}
            goalHours={profile.goalHours}
            remainingHours={profile.remainingHours}
          />
          <StatsGrid stats={profile.stats} />

          <RecommendationsSection
            recommendations={profile.recommendations || []}
            onAdd={addRecommendation}
            onRemove={removeRecommendation}
            saving={recSaving}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProgressHistory progress={profile.progress} onDelete={handleProgressDelete} />
            <RecentLessons lessons={profile.recentLessons} />
          </div>
        </div>
      )}
    </div>
  );
};

const LoadingSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="rounded-2xl bg-slate-100 h-28" />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="rounded-xl bg-slate-100 h-20" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl bg-slate-100 h-56" />
      <div className="rounded-2xl bg-slate-100 h-56" />
    </div>
  </div>
);

const StudentHeader = ({ student, progressPercent, goalHours, remainingHours }) => {
  const { t } = useTranslation(['instructor']);
  const initials = getInitials(student.name);
  const hasPackage = goalHours > 0;
  return (
    <header className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-lg font-bold text-white tracking-wide">{initials}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{student.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{student.email}</p>
            {student.phone && <p className="text-sm text-slate-500">{student.phone}</p>}
          </div>
        </div>

        <div className="md:ml-auto flex flex-col items-start md:items-end gap-2.5 w-full md:w-64">
          {student.level && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100">
              {student.level}
            </span>
          )}
          {hasPackage ? (
            <div className="w-full">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>{t('instructor:studentDetail.packageHours')}</span>
                <span className="font-semibold text-slate-700">
                  {t('instructor:studentDetail.hoursLeft', { remaining: remainingHours, total: goalHours })}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-500 transition-all duration-700"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-right text-xs text-slate-400 mt-1">{t('instructor:studentDetail.percentUsed', { percent: progressPercent })}</p>
            </div>
          ) : (
            <span className="text-xs text-slate-400">{t('instructor:studentDetail.noActivePackage')}</span>
          )}
        </div>
      </div>
    </header>
  );
};

const STAT_TONES = {
  sky: { border: 'border-l-sky-500', text: 'text-sky-700' },
  emerald: { border: 'border-l-emerald-500', text: 'text-emerald-700' },
  slate: { border: 'border-l-slate-400', text: 'text-slate-700' },
  amber: { border: 'border-l-amber-500', text: 'text-amber-700' },
};

const StatCard = ({ title, value, tone = 'sky' }) => {
  const t = STAT_TONES[tone] || STAT_TONES.sky;
  return (
    <div className={`rounded-xl bg-white border border-slate-200 border-l-4 ${t.border} p-4 shadow-sm`}>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
      <p className={`mt-2 text-xl font-bold ${t.text} leading-tight`}>{value}</p>
    </div>
  );
};

const StatsGrid = ({ stats }) => {
  const { t } = useTranslation(['instructor']);
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard title={t('instructor:studentDetail.totalLessons')} value={stats.totalLessons} tone="sky" />
      <StatCard title={t('instructor:studentDetail.totalHours')} value={stats.totalHours} tone="emerald" />
      <StatCard title={t('instructor:studentDetail.lastLesson')} value={formatDateTime(stats.lastLessonAt)} tone="slate" />
      <StatCard title={t('instructor:studentDetail.nextLesson')} value={formatDateTime(stats.nextLessonAt)} tone="amber" />
    </section>
  );
};

const SectionCard = ({ title, feedback, headerRight, children }) => (
  <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">{title}</h2>
      <div className="flex items-center gap-3">
        {feedback && (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
            {feedback}
          </span>
        )}
        {headerRight}
      </div>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const fieldClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:bg-white focus:outline-none transition-colors';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5';

const ProfileForm = ({ levelValue, setLevelValue, levelOptions, notesValue, setNotesValue, onSubmit, saving, feedback, error }) => {
  const { t } = useTranslation(['instructor']);
  return (
    <SectionCard title={t('instructor:studentDetail.skillAndNotes')} feedback={feedback}>
      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className={labelClass}>{t('instructor:studentDetail.skillLevel')}</label>
          <select
            value={levelValue || ''}
            onChange={(e) => setLevelValue(e.target.value)}
            className={fieldClass}
          >
            <option value="">{t('instructor:studentDetail.notSpecified')}</option>
            {levelOptions.map((lvl) => (
              <option key={lvl.id} value={lvl.name}>{lvl.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t('instructor:studentDetail.notes')}</label>
          <textarea
            value={notesValue || ''}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={4}
            className={fieldClass}
          />
        </div>
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-slate-700 to-slate-800 text-white text-sm font-medium shadow-sm hover:from-slate-600 hover:to-slate-700 disabled:opacity-50 transition-all"
          >
            {saving ? t('instructor:studentDetail.saving') : t('instructor:studentDetail.saveChanges')}
          </button>
        </div>
      </form>
    </SectionCard>
  );
};

const ProgressForm = ({ skillOptions, selectedLevel, progressSkillId, setProgressSkillId, progressDate, setProgressDate, progressNotes, setProgressNotes, onSubmit, saving, feedback, error }) => {
  const { t } = useTranslation(['instructor']);
  return (
    <SectionCard title={t('instructor:studentDetail.recordProgress')} feedback={feedback}>
      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className={labelClass}>{t('instructor:studentDetail.skill')}</label>
          <select
            value={progressSkillId}
            onChange={(e) => setProgressSkillId(e.target.value)}
            className={fieldClass}
          >
            {skillOptions.map((skill) => (
              <option key={skill.id} value={skill.id}>{skill.name}</option>
            ))}
          </select>
          {selectedLevel && (
            <p className="text-xs text-slate-500 mt-1.5">
              {t('instructor:studentDetail.level', { name: selectedLevel })}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass}>{t('instructor:studentDetail.dateAchieved')}</label>
          <input
            type="date"
            value={progressDate}
            onChange={(e) => setProgressDate(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>{t('instructor:studentDetail.notesOptional')}</label>
          <textarea
            value={progressNotes}
            onChange={(e) => setProgressNotes(e.target.value)}
            rows={3}
            className={fieldClass}
          />
        </div>
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-sm font-medium shadow-sm hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50 transition-all"
          >
            {saving ? t('instructor:studentDetail.saving') : t('instructor:studentDetail.addProgress')}
          </button>
        </div>
      </form>
    </SectionCard>
  );
};

const ProgressHistory = ({ progress, onDelete }) => {
  const { t } = useTranslation(['instructor']);
  return (
  <SectionCard
    title={t('instructor:studentDetail.progressHistory')}
    headerRight={<span className="text-xs text-slate-400 font-normal">{progress.length} {t('instructor:studentDetail.entries')}</span>}
  >
    {progress.length === 0 && (
      <p className="text-sm text-slate-400 text-center py-6">{t('instructor:studentDetail.noProgressYet')}</p>
    )}
    <ul className="space-y-0">
      {progress.map((entry, idx) => (
        <li key={entry.id} className={`flex items-start gap-4 py-3.5 ${idx < progress.length - 1 ? 'border-b border-slate-100' : ''}`}>
          <div className="mt-1 w-2 h-2 rounded-full bg-sky-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{entry.skillName}</p>
              <button
                type="button"
                onClick={() => onDelete(entry.id)}
                className="text-xs text-rose-500 hover:text-rose-700 transition-colors shrink-0"
              >
                {t('instructor:studentDetail.remove')}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {entry.skillLevelName && (
                <span className="text-xs text-slate-500">{entry.skillLevelName}</span>
              )}
              <span className="text-xs text-slate-400">{formatDate(entry.dateAchieved)}</span>
            </div>
            {entry.notes && <p className="text-xs text-slate-600 mt-1.5 whitespace-pre-line">{entry.notes}</p>}
          </div>
        </li>
      ))}
    </ul>
  </SectionCard>
  );
};

const LESSON_STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  scheduled: 'bg-sky-50 text-sky-700 border-sky-100',
  cancelled: 'bg-rose-50 text-rose-600 border-rose-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
};

const RecentLessons = ({ lessons }) => {
  const { t } = useTranslation(['instructor']);
  return (
  <SectionCard
    title={t('instructor:studentDetail.recentLessons')}
    headerRight={<span className="text-xs text-slate-400 font-normal">{t('instructor:studentDetail.last', { count: lessons.length })}</span>}
  >
    {lessons.length === 0 && (
      <p className="text-sm text-slate-400 text-center py-6">{t('instructor:studentDetail.noLessons')}</p>
    )}
    <ul className="space-y-0">
      {lessons.map((lesson, idx) => (
        <li key={lesson.id} className={`flex items-center justify-between py-3.5 ${idx < lessons.length - 1 ? 'border-b border-slate-100' : ''}`}>
          <div>
            <p className="text-sm font-medium text-slate-900">{formatDateTime(lesson.startTime)}</p>
            <span className={`inline-flex items-center mt-1 rounded-full border px-2 py-0.5 text-xs font-medium ${LESSON_STATUS_STYLES[lesson.status] || LESSON_STATUS_STYLES.pending}`}>
              {lesson.status}
            </span>
          </div>
          <span className="text-sm font-semibold text-slate-600">{lesson.durationHours}h</span>
        </li>
      ))}
    </ul>
  </SectionCard>
  );
};

const REC_TYPE_CONFIG = {
  product:       { label: 'Product',       badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  service:       { label: 'Lesson',        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rental:        { label: 'Rental',        badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  accommodation: { label: 'Room',          badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  custom:        { label: 'Custom',        badge: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const REC_ENDPOINTS = {
  product:       '/products/?limit=200',
  service:       '/services/?limit=200',
  rental:        '/services/?serviceType=rental&limit=200',
  accommodation: '/accommodation/units?limit=200',
};

const RecommendationsSection = ({ recommendations, onAdd, onRemove, saving }) => {
  const { t } = useTranslation(['instructor']);
  const [showForm, setShowForm] = useState(false);
  const [recType, setRecType] = useState('product');
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!showForm || recType === 'custom') { setItems([]); setSelectedItemId(''); return; }
    setItemsLoading(true);
    setSelectedItemId('');
    apiClient.get(REC_ENDPOINTS[recType])
      .then(r => {
        const d = r.data;
        const arr = Array.isArray(d) ? d : (d.items || d.services || d.units || d.data || []);
        setItems(Array.isArray(arr) ? arr : []);
      })
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }, [recType, showForm]);

  const selectedItem = items.find(i => String(i.id) === selectedItemId);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null); setFeedback(null);
    const itemName = recType === 'custom' ? customName.trim() : (selectedItem?.name || '');
    if (!itemName) { setError(recType === 'custom' ? 'Enter an item name' : 'Select an item'); return; }
    const itemPrice = recType === 'custom'
      ? (customPrice ? Number(customPrice) : null)
      : (recType === 'accommodation'
          ? (selectedItem?.nightly_price || selectedItem?.base_price || null)
          : (selectedItem?.price || null));
    const itemImage = selectedItem
      ? (selectedItem.image_url || selectedItem.imageUrl || selectedItem.thumbnail || null)
      : null;
    try {
      await onAdd({
        itemType: recType,
        itemId: recType !== 'custom' ? (selectedItemId || null) : null,
        itemName,
        itemPrice: itemPrice || null,
        itemImage: itemImage || null,
        notes: notes.trim() || null,
      });
      setFeedback(t('instructor:studentDetail.recommendationAdded'));
      setSelectedItemId(''); setCustomName(''); setCustomPrice(''); setNotes('');
      setShowForm(false);
    } catch (err) {
      setError((typeof err.response?.data?.error === 'string' ? err.response.data.error : err.response?.data?.message) || err.message || t('instructor:studentDetail.failedToAddRec'));
    }
  };

  const handleDelete = async (recId) => {
    if (!window.confirm(t('instructor:studentDetail.removeRecommendationConfirm'))) return;
    setError(null); setFeedback(null);
    try {
      await onRemove(recId);
      setFeedback(t('instructor:studentDetail.recommendationRemoved'));
    } catch (err) {
      setError(err.message || t('instructor:studentDetail.failedToRemoveRec'));
    }
  };

  return (
    <SectionCard
      title={t('instructor:studentDetail.recommendations')}
      feedback={feedback}
      headerRight={
        <button
          type="button"
          onClick={() => { setShowForm(v => !v); setError(null); }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${showForm ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
        >
          {showForm ? t('instructor:studentDetail.cancel') : t('instructor:studentDetail.add')}
        </button>
      }
    >
      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {showForm && (
        <form onSubmit={handleAdd} className="mb-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('instructor:studentDetail.category')}</label>
              <select
                value={recType}
                onChange={e => { setRecType(e.target.value); setSelectedItemId(''); setCustomName(''); }}
                className={fieldClass}
              >
                <option value="product">{t('instructor:studentDetail.recTypes.product')}</option>
                <option value="service">{t('instructor:studentDetail.recTypes.service')}</option>
                <option value="rental">{t('instructor:studentDetail.recTypes.rental')}</option>
                <option value="accommodation">{t('instructor:studentDetail.recTypes.accommodation')}</option>
                <option value="custom">{t('instructor:studentDetail.recTypes.custom')}</option>
              </select>
            </div>
            <div>
              {recType === 'custom' ? (
                <>
                  <label className={labelClass}>{t('instructor:studentDetail.itemName')} <span className="text-rose-500 normal-case tracking-normal font-normal">*</span></label>
                  <input
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="e.g. Kite Board Pro"
                    className={fieldClass}
                  />
                </>
              ) : (
                <>
                  <label className={labelClass}>
                    {t('instructor:studentDetail.item')} {itemsLoading && <span className="text-slate-400 font-normal normal-case">{t('instructor:studentDetail.itemLoading')}</span>}
                  </label>
                  <select
                    value={selectedItemId}
                    onChange={e => setSelectedItemId(e.target.value)}
                    className={fieldClass}
                    disabled={itemsLoading}
                  >
                    <option value="">{t('instructor:studentDetail.selectItem')}</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.price ? ` — €${item.price}` : item.nightly_price ? ` — €${item.nightly_price}/night` : ''}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
          {recType === 'custom' && (
            <div>
              <label className={labelClass}>{t('instructor:studentDetail.priceOptional')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={customPrice}
                onChange={e => setCustomPrice(e.target.value)}
                placeholder="0.00"
                className={fieldClass}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>{t('instructor:studentDetail.noteToStudent')}</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Perfect for your current level"
              className={fieldClass}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-sky-700 text-white text-sm font-medium shadow-sm hover:from-sky-500 hover:to-sky-600 disabled:opacity-50 transition-all"
            >
              {saving ? t('instructor:studentDetail.saving') : t('instructor:studentDetail.addRecommendation')}
            </button>
          </div>
        </form>
      )}

      {recommendations.length === 0 && !showForm && (
        <p className="text-sm text-slate-400 text-center py-6">{t('instructor:studentDetail.noRecommendations')}</p>
      )}

      <ul className="space-y-3">
        {recommendations.map((rec) => {
          const typeConf = REC_TYPE_CONFIG[rec.itemType] || REC_TYPE_CONFIG.custom;
          return (
            <li key={rec.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${typeConf.badge}`}>
                      {typeConf.label}
                    </span>
                    <p className="text-sm font-semibold text-slate-900">{rec.itemName}</p>
                    {rec.itemPrice != null && (
                      <span className="text-xs font-semibold text-slate-500">€{rec.itemPrice}</span>
                    )}
                  </div>
                  {rec.notes && <p className="text-xs text-slate-500 mt-1.5 italic">{rec.notes}</p>}
                  <p className="text-xs text-slate-400 mt-1">{formatDate(rec.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(rec.id)}
                  className="text-xs text-rose-500 hover:text-rose-700 transition-colors shrink-0"
                >
                  {t('instructor:studentDetail.remove')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
};

export default StudentDetail;
