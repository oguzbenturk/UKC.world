// Lesson notes for this student (the same notes the "My day" lesson drawer writes):
// quick composer with shared / private toggle, then the note feed.
import { useId, useState } from 'react';
import { Popconfirm } from 'antd';
import { useTranslation } from 'react-i18next';
import { message } from '@/shared/utils/antdStatic';
import { cardClass, primaryButtonClass } from '../../earnings/components/earningsStyles';
import { formatRelativeTime } from '../../earnings/earningsFormat';
import { SkeletonBlock } from '../../earnings/components/ui';
import { NoteIcon } from '../../dashboard/components/DashboardIcons';
import { useLocale } from '../../dashboard/components/lessonText';
import { useInstructorStudentNotes } from '../../hooks/useInstructorStudentNotes';
import { apiErrorText } from '../useStudents';
import { EyeIcon, LockIcon, TrashIcon } from './StudentsIcons';
import { fieldClass } from './parts';

const NOTE_MAX = 2000;

function VisibilityToggle({ shared, onChange, labelId }) {
  const { t } = useTranslation(['instructor']);
  const options = [
    { key: true, label: t('instructor:students.notes.shared'), icon: <EyeIcon size={14} /> },
    { key: false, label: t('instructor:students.notes.private'), icon: <LockIcon size={14} /> },
  ];
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
      {options.map((o) => {
        const active = shared === o.key;
        return (
          <button
            key={String(o.key)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.key)}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] ${active ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'font-medium text-slate-600 hover:text-slate-900'}`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Composer({ onCreate, creating }) {
  const { t } = useTranslation(['instructor']);
  const ids = useId();
  const [text, setText] = useState('');
  const [shared, setShared] = useState(true);
  const trimmed = text.trim();

  const submit = async (event) => {
    event.preventDefault();
    if (!trimmed || creating) return;
    try {
      await onCreate({ note: trimmed, visibility: shared ? 'student_visible' : 'instructor_only' });
      setText('');
    } catch {
      // toast shown by the caller
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
      <label htmlFor={`${ids}-text`} className="sr-only">{t('instructor:students.notes.label')}</label>
      <textarea
        id={`${ids}-text`}
        rows={3}
        maxLength={NOTE_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }}
        placeholder={t('instructor:students.notes.placeholder')}
        className={`${fieldClass} resize-y`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={`${ids}-vis`} className="sr-only">{t('instructor:students.notes.visibility')}</span>
        <VisibilityToggle shared={shared} onChange={setShared} labelId={`${ids}-vis`} />
        <button type="submit" disabled={!trimmed || creating} className={`${primaryButtonClass} h-10 text-sm`}>
          {creating ? t('instructor:students.saving') : t('instructor:students.notes.add')}
        </button>
      </div>
    </form>
  );
}

function NoteItem({ note, onDelete, deleting }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const shared = note.visibility !== 'instructor_only';
  return (
    <li className="flex gap-3 py-3">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${shared ? 'bg-cyan-50 text-[#00687a]' : 'bg-slate-100 text-slate-600'}`}>
        {shared ? <EyeIcon size={15} /> : <LockIcon size={15} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="whitespace-pre-line break-words text-sm text-slate-800">{note.note}</p>
        <span className="text-xs text-slate-500">
          {[formatRelativeTime(note.createdAt, locale), shared ? t('instructor:students.notes.sharedTag') : t('instructor:students.notes.privateTag')].join(' · ')}
        </span>
      </div>
      <Popconfirm
        title={t('instructor:students.notes.removeConfirm')}
        okText={t('instructor:students.remove')}
        cancelText={t('instructor:students.cancel')}
        okButtonProps={{ danger: true, loading: deleting }}
        onConfirm={() => onDelete(note.id)}
      >
        <button
          type="button"
          aria-label={t('instructor:students.notes.removeLabel')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
        >
          <TrashIcon size={16} />
        </button>
      </Popconfirm>
    </li>
  );
}

export default function NotesPanel({ studentId }) {
  const { t } = useTranslation(['instructor']);
  const { notes, isLoading, error, createNote, deleteNote, isCreating, isDeleting } = useInstructorStudentNotes(studentId);

  const onCreate = async (payload) => {
    try {
      await createNote(payload);
      message.success(t('instructor:students.toast.noteSaved'));
    } catch (err) {
      message.error(apiErrorText(err, t('instructor:students.toast.noteError')));
      throw err;
    }
  };
  const onDelete = async (id) => {
    try {
      await deleteNote(id);
      message.success(t('instructor:students.toast.noteRemoved'));
    } catch (err) {
      message.error(apiErrorText(err, t('instructor:students.toast.genericError')));
    }
  };

  // 403: notes need a booking with this student (progress-only access).
  const noAccess = error?.response?.status === 403;

  return (
    <section className={`${cardClass} flex flex-col gap-3 p-4 lg:p-5`} aria-labelledby="notes-title" data-testid="notes-panel">
      <div className="flex flex-col gap-0.5">
        <h2 id="notes-title" className="text-base font-semibold text-slate-900">{t('instructor:students.notes.title')}</h2>
        <span className="text-sm text-slate-600">{t('instructor:students.notes.subtitle')}</span>
      </div>
      {!noAccess && <Composer onCreate={onCreate} creating={isCreating} />}
      {isLoading && (
        <div className="flex flex-col gap-3 py-2">
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-3/4" />
        </div>
      )}
      {!isLoading && notes.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"><NoteIcon size={18} /></span>
          <p className="text-sm text-slate-600">{noAccess ? t('instructor:students.notes.noAccess') : t('instructor:students.notes.empty')}</p>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {notes.map((n) => <NoteItem key={n.id} note={n} onDelete={onDelete} deleting={isDeleting} />)}
        </ul>
      )}
    </section>
  );
}
