import { StarIcon } from '@heroicons/react/24/solid';

const RatingPrompt = ({ reminders = [], onRate }) => {
  if (!reminders.length) return null;

  const first = reminders[0];
  const instructorName = first.instructor?.name ?? 'your instructor';
  const hasMultiple = reminders.length > 1;

  return (
    <section className="rounded-2xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        {first.instructor?.avatar ? (
          <img src={first.instructor.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-amber-200" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 font-gotham-bold text-sm text-amber-800">
            {(first.instructor?.name || 'I')[0].toUpperCase()}
          </span>
        )}
        <p className="flex-1 font-duotone-regular text-sm text-slate-700">
          Rate your lesson with <span className="font-duotone-bold">{instructorName}</span>
          {hasMultiple && <span className="ml-1 text-slate-500">+{reminders.length - 1} more</span>}
        </p>
        <button
          type="button"
          onClick={() => onRate(first)}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 font-gotham-medium text-xs text-white shadow-sm transition hover:bg-amber-600"
        >
          <StarIcon className="h-3.5 w-3.5" />
          Rate
        </button>
      </div>
    </section>
  );
};

export default RatingPrompt;
