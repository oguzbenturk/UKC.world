const ProgressBar = ({ used, total, color }) => {
  const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
};

const ProgressRow = ({ label, used, total, remaining, color, colorText }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="font-gotham-medium text-slate-500">{label}</span>
      <span className={`font-gotham-bold ${colorText}`}>{remaining} left</span>
    </div>
    <ProgressBar used={used} total={total} color={color} />
    <p className="text-[10px] text-slate-400">{used} / {total} used</p>
  </div>
);

const statusColors = {
  active:  'bg-emerald-50 text-emerald-700',
  used_up: 'bg-amber-50 text-amber-700',
  expired: 'bg-slate-100 text-slate-500',
};

const PackageCard = ({ pkg }) => {
  const includesLessons       = pkg.includesLessons !== false && (pkg.totalHours || 0) > 0;
  const includesRental        = pkg.includesRental && (pkg.rentalDaysTotal || 0) > 0;
  const includesAccommodation = pkg.includesAccommodation && (pkg.accommodationNightsTotal || 0) > 0;

  return (
    <div className="min-w-[260px] shrink-0 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm lg:min-w-0">
      <div className="mb-4 flex items-start justify-between gap-2">
        <h4 className="font-duotone-bold text-sm text-slate-900">{pkg.name}</h4>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-gotham-medium uppercase tracking-wider ${statusColors[pkg.status] || statusColors.expired}`}>
          {pkg.status}
        </span>
      </div>
      <div className="space-y-4">
        {includesLessons && (
          <ProgressRow label="Lesson hours" used={pkg.usedHours} total={pkg.totalHours} remaining={pkg.remainingHours} color="bg-emerald-400" colorText="text-emerald-600" />
        )}
        {includesRental && (
          <ProgressRow label="Rental days" used={pkg.rentalDaysUsed || 0} total={pkg.rentalDaysTotal} remaining={pkg.rentalDaysRemaining || pkg.rentalDaysTotal} color="bg-orange-400" colorText="text-orange-600" />
        )}
        {includesAccommodation && (
          <ProgressRow label="Accommodation nights" used={pkg.accommodationNightsUsed || 0} total={pkg.accommodationNightsTotal} remaining={pkg.accommodationNightsRemaining || pkg.accommodationNightsTotal} color="bg-blue-400" colorText="text-blue-600" />
        )}
      </div>
      {pkg.expiresAt && (
        <div className="mt-4 flex items-center gap-2">
          {pkg.expiryWarning && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-gotham-medium uppercase tracking-wider text-amber-700">Expires soon</span>
          )}
          <span className="text-[11px] text-slate-400">Exp. {pkg.expiresAt.split('T')[0]}</span>
        </div>
      )}
    </div>
  );
};

const PackageCards = ({ packages = [] }) => {
  const activePackages = packages.filter((pkg) => pkg.status === 'active');
  if (!activePackages.length) return null;

  return (
    <section>
      <h3 className="mb-3 font-duotone-bold text-sm uppercase tracking-[0.12em] text-antrasit">Active packages</h3>
      <div className="flex gap-4 overflow-x-auto scrollbar-none lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:overflow-visible">
        {activePackages.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
      </div>
    </section>
  );
};

export default PackageCards;
