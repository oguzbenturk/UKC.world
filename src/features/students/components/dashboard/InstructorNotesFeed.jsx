import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline';

const formatTimestamp = (isoString) => {
  if (!isoString) return 'Recently';
  try { return formatDistanceToNow(parseISO(isoString), { addSuffix: true }); }
  catch { return 'Recently'; }
};

const NoteBubble = ({ note }) => {
  const isPinned = note.isPinned;
  const instructorInitial = (note.instructor?.name || 'I')[0].toUpperCase();

  return (
    <div className={`flex gap-3 rounded-2xl p-3 ${isPinned ? 'bg-amber-50/60 ring-1 ring-amber-200/40' : 'bg-slate-50/60'}`}>
      {note.instructor?.avatar ? (
        <img src={note.instructor.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 font-gotham-bold text-xs text-slate-600">
          {instructorInitial}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-gotham-bold text-xs text-slate-800">{note.instructor?.name ?? 'Instructor'}</span>
          {isPinned && <span className="text-[10px] text-amber-600">pinned</span>}
          <span className="ml-auto text-[10px] text-slate-400">{formatTimestamp(note.updatedAt || note.createdAt)}</span>
        </div>
        <p className="mt-1 font-duotone-regular text-sm leading-relaxed text-slate-600 line-clamp-2">{note.note}</p>
      </div>
    </div>
  );
};

const InstructorNotesFeed = ({ notes = [] }) => {
  const navigate = useNavigate();
  const visibleNotes = notes.filter((n) => (n.visibility || 'student_visible') !== 'instructor_only');
  const pinnedNotes  = visibleNotes.filter((n) => n.isPinned);
  const recentNotes  = visibleNotes.filter((n) => !n.isPinned);
  const displayNotes = [...pinnedNotes, ...recentNotes].slice(0, 2);

  if (!displayNotes.length) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChatBubbleLeftEllipsisIcon className="h-4 w-4 text-slate-400" />
          <h3 className="font-duotone-bold text-sm uppercase tracking-[0.12em] text-antrasit">Instructor notes</h3>
        </div>
        {visibleNotes.length > 2 && (
          <button type="button" onClick={() => navigate('/student/profile')} className="font-gotham-medium text-xs text-[#00a8c4] transition hover:underline">
            View all
          </button>
        )}
      </div>
      <div className="space-y-2">
        {displayNotes.map((note) => <NoteBubble key={note.id} note={note} />)}
      </div>
    </section>
  );
};

export default InstructorNotesFeed;
