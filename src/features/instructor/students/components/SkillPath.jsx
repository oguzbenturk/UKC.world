// Skill path: every skill grouped by level, achieved ones ticked with the date.
// Tap an open skill to log it; achieved skills can be removed.
import { useId, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Popconfirm } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '../../earnings/components/EarningsIcons';
import { ProgressBar } from '../../earnings/components/ui';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../../earnings/components/earningsStyles';
import { formatShortDate } from '../../earnings/earningsFormat';
import { PlusIcon } from '../../dashboard/components/DashboardIcons';
import { useLocale } from '../../dashboard/components/lessonText';
import { buildSkillPath, capitalize } from '../studentsFormat';
import { TrashIcon, TrophyIcon } from './StudentsIcons';
import { Sheet, fieldClass, labelClass } from './parts';

const NOTE_MAX = 1000;

function SkillRow({ entry, onLog, onRemove, removing }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const { skill, progress } = entry;
  if (!progress) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onLog(skill.id)}
          className="group flex min-h-[48px] w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
        >
          <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border-2 border-dashed border-slate-300 group-hover:border-[#00798c]" />
          <span className="flex-1 text-sm font-medium text-slate-700">{skill.name}</span>
          <span className="text-xs font-semibold text-[#00687a] opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100">
            {t('instructor:students.skills.markLearned')}
          </span>
        </button>
      </li>
    );
  }
  return (
    <li className="flex min-h-[48px] items-start gap-3 rounded-xl px-2 py-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <CheckIcon size={14} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold text-slate-900">
          {skill.name}
          <span className="sr-only"> — {t('instructor:students.skills.learned')}</span>
        </span>
        <span className="text-xs text-slate-500">
          {t('instructor:students.skills.learnedOn', { date: formatShortDate(progress.dateAchieved, locale) })}
        </span>
        {progress.notes && <span className="mt-1 whitespace-pre-line text-xs text-slate-600">{progress.notes}</span>}
      </div>
      <Popconfirm
        title={t('instructor:students.skills.removeConfirm')}
        okText={t('instructor:students.remove')}
        cancelText={t('instructor:students.cancel')}
        okButtonProps={{ danger: true, loading: removing }}
        onConfirm={() => onRemove(progress.id)}
      >
        <button
          type="button"
          aria-label={t('instructor:students.skills.removeLabel', { name: skill.name })}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
        >
          <TrashIcon size={16} />
        </button>
      </Popconfirm>
    </li>
  );
}

function LogSkillForm({ path, initialSkillId, onSubmit, saving, onClose }) {
  const { t } = useTranslation(['instructor']);
  const ids = useId();
  const firstOpen = path.groups.flatMap((g) => g.skills).find((s) => !s.progress)?.skill.id;
  const [skillId, setSkillId] = useState(initialSkillId || firstOpen || path.groups[0]?.skills[0]?.skill.id || '');
  const [date, setDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [notes, setNotes] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!skillId || saving) return;
    try {
      await onSubmit({ skillId, dateAchieved: date, notes: notes.trim() || null });
      onClose();
    } catch {
      // toast shown by the mutation
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-5 pb-5 pt-1 lg:px-0 lg:pb-0">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-skill`} className={labelClass}>{t('instructor:students.skills.skill')}</label>
        <select id={`${ids}-skill`} value={skillId} onChange={(e) => setSkillId(e.target.value)} className={fieldClass} required>
          {path.groups.map((g) => (
            <optgroup key={g.level?.id || 'other'} label={g.level ? capitalize(g.level.name) : t('instructor:students.skills.otherLevel')}>
              {g.skills.map(({ skill, progress }) => (
                <option key={skill.id} value={skill.id}>
                  {progress ? `✓ ${skill.name}` : skill.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-date`} className={labelClass}>{t('instructor:students.skills.date')}</label>
        <input id={`${ids}-date`} type="date" value={date} max={dayjs().format('YYYY-MM-DD')} onChange={(e) => setDate(e.target.value)} className={fieldClass} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-notes`} className={labelClass}>{t('instructor:students.skills.notes')}</label>
        <textarea
          id={`${ids}-notes`}
          rows={3}
          maxLength={NOTE_MAX}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('instructor:students.skills.notesPlaceholder')}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className={`${secondaryButtonClass} h-12 sm:h-11`}>{t('instructor:students.cancel')}</button>
        <button type="submit" disabled={saving || !skillId} className={`${primaryButtonClass} h-12 text-base sm:h-11 sm:text-sm`}>
          {saving ? t('instructor:students.saving') : t('instructor:students.skills.save')}
        </button>
      </div>
    </form>
  );
}

export default function SkillPath({ profile, actions, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const [sheet, setSheet] = useState({ open: false, skillId: null });
  const path = useMemo(
    () => buildSkillPath(profile.skillLevels, profile.skills, profile.progress),
    [profile.skillLevels, profile.skills, profile.progress],
  );
  const openSheet = (skillId = null) => setSheet({ open: true, skillId });
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));
  const percent = path.total ? (path.done / path.total) * 100 : 0;

  return (
    <section className={`${cardClass} flex flex-col gap-4 p-4 lg:p-5`} aria-labelledby="skills-title" data-testid="skill-path">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="skills-title" className="text-base font-semibold text-slate-900">{t('instructor:students.skills.title')}</h2>
          <span className="text-sm text-slate-600">{t('instructor:students.skills.summary', { done: path.done, total: path.total })}</span>
        </div>
        {path.total > 0 && (
          <button type="button" onClick={() => openSheet()} className={`${secondaryButtonClass} h-10 shrink-0 text-sm`}>
            <PlusIcon size={16} />
            {t('instructor:students.skills.log')}
          </button>
        )}
      </div>

      {path.total === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">{t('instructor:students.skills.noSkills')}</p>
      ) : (
        <>
          <ProgressBar value={percent} label={t('instructor:students.skills.summary', { done: path.done, total: path.total })} />
          <div className="flex flex-col gap-3">
            {path.groups.map((group) => {
              const done = group.skills.filter((s) => s.progress).length;
              const complete = done === group.skills.length;
              return (
                <div key={group.level?.id || 'other'} className="flex flex-col">
                  <div className="flex items-center gap-2 px-2 pb-1">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {group.level ? capitalize(group.level.name) : t('instructor:students.skills.otherLevel')}
                    </h3>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${complete ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {complete && <TrophyIcon size={12} />}
                      {done}/{group.skills.length}
                    </span>
                  </div>
                  <ul className="flex flex-col">
                    {group.skills.map((entry) => (
                      <SkillRow
                        key={entry.skill.id}
                        entry={entry}
                        onLog={openSheet}
                        onRemove={(id) => actions.removeProgress.mutate(id)}
                        removing={actions.removeProgress.isPending}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Sheet open={sheet.open} onClose={closeSheet} title={t('instructor:students.skills.sheetTitle')} isDesktop={isDesktop}>
        <LogSkillForm
          key={`${sheet.skillId}-${sheet.open}`}
          path={path}
          initialSkillId={sheet.skillId}
          onSubmit={actions.addProgress.mutateAsync}
          saving={actions.addProgress.isPending}
          onClose={closeSheet}
        />
      </Sheet>
    </section>
  );
}
