import { useState } from 'react';
import dayjs from 'dayjs';
import EasyDatePicker from '@/shared/components/ui/EasyDatePicker';
import FlexibleDatePicker from '@/shared/components/ui/FlexibleDatePicker';

// Throwaway comparison page for the guided date picker proposal — /dev/date-picker-test.
// Not linked from any menu; delete once a picker is chosen and rolled out.
const DatePickerTestPage = () => {
  const [newDob, setNewDob] = useState(null);
  const [oldDob, setOldDob] = useState(null);

  const noFuture = (d) => d && d > dayjs().endOf('day');

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Date Picker Test</h1>
        <p className="text-slate-500 mb-8">
          Proposal for the registration forms: tap the field, pick the <b>year</b>, then the{' '}
          <b>month</b>, then the <b>day</b>. No scrolling through decades.
        </p>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* ── New picker ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-sky-200 p-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold text-slate-800">New — guided picker</h2>
              <span className="text-[11px] font-semibold uppercase tracking-wide bg-sky-100 text-sky-700 rounded-full px-2 py-0.5">
                Proposal
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Year → Month → Day, big touch targets, no keyboard needed.
            </p>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Date of birth
            </label>
            <EasyDatePicker
              value={newDob}
              onChange={setNewDob}
              placeholder="Select date of birth"
              disabledDate={noFuture}
              defaultPickerYear={1995}
              className="w-full"
            />
            <p className="text-sm text-slate-500 mt-4">
              Selected:{' '}
              <span className="font-medium text-slate-800">
                {newDob ? newDob.format('DD/MM/YYYY') : '—'}
              </span>
            </p>
          </div>

          {/* ── Current picker ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-1">Current — calendar popup</h2>
            <p className="text-sm text-slate-500 mb-4">
              What registration uses today (opens on the current month).
            </p>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Date of birth
            </label>
            <FlexibleDatePicker
              style={{ width: '100%' }}
              placeholder="Select date of birth"
              value={oldDob}
              onChange={setOldDob}
              disabledDate={noFuture}
            />
            <p className="text-sm text-slate-500 mt-4">
              Selected:{' '}
              <span className="font-medium text-slate-800">
                {oldDob ? oldDob.format('DD/MM/YYYY') : '—'}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-2">How the new one works</h2>
          <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
            <li>Tap the field — a year list opens, centered near a typical birth year.</li>
            <li>Tap the year → the 12 months appear. Tap the month → the days appear.</li>
            <li>Tap the day — done. The chips on top let you jump back and change any part.</li>
            <li>Future dates are greyed out, and the ✕ clears the field.</li>
          </ol>
          <p className="text-sm text-slate-500 mt-3">
            If approved, this replaces the picker in: customer self-register (/join), public
            register wizard, staff user form, instructor form and family-member form.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DatePickerTestPage;
