import PropTypes from 'prop-types';
import { Avatar, Button, Carousel, Tag } from 'antd';
import { StarIcon as StarOutline } from '@heroicons/react/24/outline';
import { formatDistanceToNow, parseISO } from 'date-fns';

const ReminderSlide = ({ booking, onRate }) => {
  const completedText = booking.completedAt
    ? formatDistanceToNow(parseISO(booking.completedAt), { addSuffix: true })
    : booking.date ?? 'recently';

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-400 to-indigo-500" aria-hidden />
      <div className="flex items-center gap-3 pl-2">
        <Avatar size={48} src={booking.instructor?.avatar} className="shrink-0 ring-2 ring-sky-100">
          {(booking.instructor?.name || 'I').slice(0, 1).toUpperCase()}
        </Avatar>
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">{booking.instructor?.name ?? 'Your instructor'}</p>
            <p className="text-xs text-slate-500">{booking.service?.name ?? 'Private Lesson'} • {completedText}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tag color="gold" className="rounded-full border-0 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
              Needs rating
            </Tag>
            <Button
              type="primary"
              size="small"
              className="rounded-full"
              onClick={() => onRate(booking)}
            >
              Rate now
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
};

ReminderSlide.propTypes = {
  booking: PropTypes.shape({
    bookingId: PropTypes.string.isRequired,
    completedAt: PropTypes.string,
    date: PropTypes.string,
    instructor: PropTypes.shape({
      name: PropTypes.string,
      avatar: PropTypes.string
    }),
    service: PropTypes.shape({
      name: PropTypes.string
    })
  }).isRequired,
  onRate: PropTypes.func.isRequired
};

export const RatingReminderBanner = ({ reminders = [], onRate }) => {
  if (!reminders.length) {
    return null;
  }

  return (
    <section className="mb-5 overflow-hidden rounded-[22px] border border-slate-200/70 bg-gradient-to-br from-sky-50 via-white to-indigo-50/40 p-5 shadow-sm backdrop-blur">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow">
            <StarOutline className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              You have {reminders.length} lesson{reminders.length > 1 ? 's' : ''} to rate
            </p>
            <p className="text-[11px] text-slate-500">Share your experience to help others</p>
          </div>
        </div>
        <Button type="link" size="small" className="text-sky-600" onClick={() => onRate(reminders[0])}>
          Rate first lesson
        </Button>
      </header>
      <Carousel dots={reminders.length > 1} autoplay autoplaySpeed={5000} className="w-full">
        {reminders.map((booking) => (
          <ReminderSlide key={booking.bookingId} booking={booking} onRate={onRate} />
        ))}
      </Carousel>
    </section>
  );
};

RatingReminderBanner.propTypes = {
  reminders: PropTypes.arrayOf(ReminderSlide.propTypes.booking),
  onRate: PropTypes.func.isRequired
};

export default RatingReminderBanner;
