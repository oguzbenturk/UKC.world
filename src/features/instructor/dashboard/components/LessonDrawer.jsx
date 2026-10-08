import { useEffect, useId, useState } from 'react';
import { Drawer } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckIcon, ClockIcon } from '../../earnings/components/EarningsIcons';
import { primaryButtonClass, secondaryButtonClass } from '../../earnings/components/earningsStyles';
import { isCheckedIn, isLessonDone, lessonEnd } from '../dashboardFormat';
import { useAddNote } from '../useDashboard';
import { Avatar, LastNote, LevelChip, WaiverChip } from './lessonParts';
import { useLessonSubtitle, useLessonTitle } from './lessonText';
import { BoxIcon, MessageIcon, NoteIcon, PinIcon } from './DashboardIcons';

const NOTE_MAX = 2000;

function CheckStatus({ lesson }) {
  const { t } = useTranslation(['instructor']);
  if (isLessonDone(lesson)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <CheckIcon size={16} />
        {t('instructor:myDay.drawer.checkedOut')}
      </span>
    );
  }
  if (isCheckedIn(lesson)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#00687a]">
        <ClockIcon size={16} />
        {t('instructor:myDay.drawer.checkedIn')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600">
      <ClockIcon size={16} />
      {t('instructor:myDay.drawer.notCheckedIn')}
    </span>
  );
}

function NoteForm({ lesson, participant, onDone }) {
  const { t } = useTranslation(['instructor']);
  const fieldId = useId();
  const [text, setText] = useState('');
  const [shared, setShared] = useState(true);
  const mutation = useAddNote();
  const trimmed = text.trim();

  const submit = async (event) => {
    event.preventDefault();
    if (!trimmed || mutation.isPending) return;
    try {
      await mutation.mutateAsync({
        studentId: participant.userId,
        bookingId: lesson.id,
        note: trimmed,
        visibility: shared ? 'student_visible' : 'instructor_only',
      });
      onDone();
    } catch {
      // toast shown by the mutation
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3" data-testid="note-form">
      <label htmlFor={fieldId} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {t('instructor:myDay.drawer.noteFor', { name: participant.name || t('instructor:myDay.unknownStudent') })}
      </label>
      <textarea
        id={fieldId}
        rows={3}
        maxLength={NOTE_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('instructor:myDay.drawer.notePlaceholder')}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#00798c] focus:outline-none focus:ring-2 focus:ring-[#00798c]/40"
        autoFocus
      />
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-5 w-5 rounded border-slate-300 accent-[#00798c]" />
        {t('instructor:myDay.drawer.shareWithStudent')}
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={`${secondaryButtonClass} h-11 text-sm`}>{t('instructor:myDay.drawer.cancel')}</button>
        <button type="submit" disabled={!trimmed || mutation.isPending} className={`${primaryButtonClass} h-11 text-sm`}>
          {mutation.isPending ? t('instructor:myDay.actions.saving') : t('instructor:myDay.drawer.saveNote')}
        </button>
      </div>
    </form>
  );
}

function ParticipantRow({ lesson, participant, noteOpen, onToggleNote, onMessage, opening }) {
  const { t } = useTranslation(['instructor']);
  return (
    <li className="flex flex-col gap-2.5 py-3" data-testid="drawer-participant">
      <div className="flex items-center gap-3">
        <Avatar initials={participant.initials} size="sm" />
        <span className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">{participant.name || t('instructor:myDay.unknownStudent')}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <LevelChip level={participant.skillLevel} />
        <WaiverChip signed={participant.waiverSigned} />
      </div>
      {participant.lastNote
        ? <LastNote note={participant.lastNote} />
        : <p className="text-sm text-slate-500">{t('instructor:myDay.drawer.noNotes')}</p>}
      {noteOpen ? (
        <NoteForm lesson={lesson} participant={participant} onDone={onToggleNote} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onToggleNote} className={`${secondaryButtonClass} h-11 text-sm`}>
            <NoteIcon size={16} />
            {t('instructor:myDay.actions.addNote')}
          </button>
          <button type="button" onClick={() => onMessage(participant.userId)} disabled={opening === participant.userId} className={`${secondaryButtonClass} h-11 text-sm`}>
            <MessageIcon size={16} />
            {opening === participant.userId ? t('instructor:myDay.actions.openingChat') : t('instructor:myDay.actions.message')}
          </button>
        </div>
      )}
    </li>
  );
}

function DrawerBody({ lesson, initialNote, busy, canClose, onCheckIn, onCheckOut, onMessage, openingFor }) {
  const { t } = useTranslation(['instructor']);
  const subtitle = useLessonSubtitle(lesson, { withPackage: true });
  const [noteFor, setNoteFor] = useState(() => (initialNote && lesson.participants.length === 1 ? lesson.participants[0].userId : null));
  const done = isLessonDone(lesson);
  const checkedIn = isCheckedIn(lesson);

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 pt-1">
      <p className="text-sm text-slate-700">{subtitle}</p>
      {(lesson.location || lesson.equipment.length > 0) && (
        <ul className="flex flex-col gap-1.5 text-sm text-slate-700">
          {lesson.location && (
            <li className="flex items-center gap-2">
              <PinIcon size={16} className="text-slate-500" />
              <span className="sr-only">{t('instructor:myDay.drawer.location')}: </span>
              {lesson.location}
            </li>
          )}
          {lesson.equipment.length > 0 && (
            <li className="flex items-center gap-2">
              <BoxIcon size={16} className="text-slate-500" />
              <span className="sr-only">{t('instructor:myDay.drawer.equipment')}: </span>
              {lesson.equipment.join(' · ')}
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <CheckStatus lesson={lesson} />
        {/* Check in and check out are staff-only; instructors get a hint instead. */}
        {!done && !canClose && (
          <p data-testid={checkedIn ? 'close-hint' : 'checkin-hint'} className="text-sm text-slate-600">
            {checkedIn ? t('instructor:myDay.closeHint') : t('instructor:myDay.checkInHint')}
          </p>
        )}
        {!done && canClose && (
          <button
            type="button"
            onClick={() => (checkedIn ? onCheckOut(lesson) : onCheckIn(lesson))}
            disabled={busy}
            className={`${primaryButtonClass} h-11 text-sm`}
          >
            {busy && t('instructor:myDay.actions.saving')}
            {!busy && (checkedIn ? t('instructor:myDay.actions.checkOut') : t('instructor:myDay.actions.checkIn'))}
          </button>
        )}
      </div>

      <section aria-labelledby="drawer-participants">
        <h3 id="drawer-participants" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t('instructor:myDay.drawer.participants', { total: lesson.participants.length })}
        </h3>
        {lesson.participants.length ? (
          <ul className="divide-y divide-slate-100">
            {lesson.participants.map((p) => (
              <ParticipantRow
                key={`${p.userId}-${p.familyMemberId || ''}`}
                lesson={lesson}
                participant={p}
                noteOpen={noteFor === p.userId}
                onToggleNote={() => setNoteFor((cur) => (cur === p.userId ? null : p.userId))}
                onMessage={onMessage}
                opening={openingFor}
              />
            ))}
          </ul>
        ) : (
          <p className="py-3 text-sm text-slate-600">{t('instructor:myDay.drawer.noParticipants')}</p>
        )}
      </section>
    </div>
  );
}

/** Lesson detail: bottom sheet on mobile, right-hand drawer on desktop. */
export default function LessonDrawer({ lesson, open, onClose, isDesktop, initialNote, ...actions }) {
  const { t } = useTranslation(['instructor']);
  const title = useLessonTitle(lesson);
  const [bodyKey, setBodyKey] = useState(0);
  useEffect(() => {
    if (open) setBodyKey((k) => k + 1);
  }, [open, lesson?.id]);

  const header = lesson ? (
    <div className="flex flex-col">
      <span className="text-xs font-bold tabular-nums text-[#00687a]">{lesson.startHour}–{lessonEnd(lesson)}</span>
      <span className="text-lg font-extrabold text-slate-900">{title}</span>
    </div>
  ) : null;

  const shared = {
    open: open && Boolean(lesson),
    onClose,
    title: header,
    destroyOnHidden: true,
    closable: { 'aria-label': t('instructor:myDay.drawer.close') },
  };
  const body = lesson
    ? <DrawerBody key={bodyKey} lesson={lesson} initialNote={initialNote} {...actions} />
    : null;

  if (isDesktop) {
    return (
      <Drawer {...shared} placement="right" width={460} styles={{ body: { padding: 0 } }}>
        {body}
      </Drawer>
    );
  }
  return (
    <Drawer
      {...shared}
      placement="bottom"
      height="auto"
      styles={{
        content: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92vh' },
        body: { padding: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
      }}
    >
      {body}
    </Drawer>
  );
}
