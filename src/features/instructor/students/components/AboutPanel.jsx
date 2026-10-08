// Skill level + the staff note on the student's profile, edited in a sheet.
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../../earnings/components/earningsStyles';
import { NoteIcon } from '../../dashboard/components/DashboardIcons';
import { capitalize } from '../studentsFormat';
import { LevelBadge, Sheet, fieldClass, labelClass } from './parts';

const NOTE_MAX = 2000;

function LevelPicker({ levels, value, onChange, labelId }) {
  const { t } = useTranslation(['instructor']);
  const options = [{ key: '', label: t('instructor:students.levelUnset') }, ...levels.map((l) => ({ key: l.name, label: capitalize(l.name) }))];
  const current = String(value || '').toLowerCase();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = current === o.key.toLowerCase();
        return (
          <button
            key={o.key || 'none'}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.key)}
            className={`h-10 rounded-xl border px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] ${active ? 'border-[#00798c] bg-cyan-50 font-semibold text-[#00687a]' : 'border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AboutForm({ student, levels, onSubmit, saving, onClose }) {
  const { t } = useTranslation(['instructor']);
  const ids = useId();
  const [level, setLevel] = useState(student.level || '');
  const [notes, setNotes] = useState(student.notes || '');

  const submit = async (event) => {
    event.preventDefault();
    try {
      await onSubmit({ level: level || null, notes: notes.trim() || null });
      onClose();
    } catch {
      // toast shown by the mutation
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-5 pb-5 pt-1 lg:px-0 lg:pb-0">
      <div className="flex flex-col gap-1.5">
        <span id={`${ids}-level`} className={labelClass}>{t('instructor:students.about.level')}</span>
        <LevelPicker levels={levels} value={level} onChange={setLevel} labelId={`${ids}-level`} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-notes`} className={labelClass}>{t('instructor:students.about.note')}</label>
        <textarea id={`${ids}-notes`} rows={4} maxLength={NOTE_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('instructor:students.about.notePlaceholder')} className={fieldClass} />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className={`${secondaryButtonClass} h-12 sm:h-11`}>{t('instructor:students.cancel')}</button>
        <button type="submit" disabled={saving} className={`${primaryButtonClass} h-12 text-base sm:h-11 sm:text-sm`}>
          {saving ? t('instructor:students.saving') : t('instructor:students.save')}
        </button>
      </div>
    </form>
  );
}

export default function AboutPanel({ profile, actions, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const [open, setOpen] = useState(false);
  const { student } = profile;
  return (
    <section className={`${cardClass} flex flex-col gap-3 p-4 lg:p-5`} aria-labelledby="about-title" data-testid="about-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 id="about-title" className="text-base font-semibold text-slate-900">{t('instructor:students.about.title')}</h2>
        <button type="button" onClick={() => setOpen(true)} className={`${secondaryButtonClass} h-9 text-sm`}>
          <NoteIcon size={15} />
          {t('instructor:students.about.edit')}
        </button>
      </div>
      <dl className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-slate-600">{t('instructor:students.about.level')}</dt>
          <dd><LevelBadge level={student.level} /></dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-slate-600">{t('instructor:students.about.note')}</dt>
          <dd className={`whitespace-pre-line rounded-xl px-3 py-2.5 text-sm ${student.notes ? 'bg-slate-50 text-slate-800' : 'bg-slate-50 text-slate-500'}`}>
            {student.notes || t('instructor:students.about.noNote')}
          </dd>
        </div>
      </dl>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('instructor:students.about.sheetTitle')} isDesktop={isDesktop}>
        <AboutForm
          student={student}
          levels={profile.skillLevels || []}
          onSubmit={actions.updateProfile.mutateAsync}
          saving={actions.updateProfile.isPending}
          onClose={() => setOpen(false)}
        />
      </Sheet>
    </section>
  );
}
