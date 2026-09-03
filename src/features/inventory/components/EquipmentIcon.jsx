import { GiKite, GiSurfBoard, GiBelt, GiLifeJacket, GiKevlarVest, GiSail, GiRopeCoil, GiGasPump, GiToolbox } from 'react-icons/gi';
import { TbHelmet, TbShirtSport, TbShoe, TbSailboat } from 'react-icons/tb';
import { MdKitesurfing } from 'react-icons/md';

// Subject icons for units without a photo. Tailwind classes are written out in
// full so the JIT compiler picks them up.
const TYPE_STYLE = {
  kite: { Icon: GiKite, cls: 'bg-sky-50 text-sky-600 border-sky-100' },
  board: { Icon: GiSurfBoard, cls: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  harness: { Icon: GiBelt, cls: 'bg-amber-50 text-amber-600 border-amber-100' },
  'control bar': { Icon: MdKitesurfing, cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  wetsuit: { Icon: TbShirtSport, cls: 'bg-teal-50 text-teal-600 border-teal-100' },
  'safety gear': { Icon: GiLifeJacket, cls: 'bg-rose-50 text-rose-600 border-rose-100' },
  'wing/foil': { Icon: GiSail, cls: 'bg-violet-50 text-violet-600 border-violet-100' },
  footwear: { Icon: TbShoe, cls: 'bg-stone-100 text-stone-600 border-stone-200' },
  accessory: { Icon: GiToolbox, cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  other: { Icon: GiToolbox, cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

// A more specific icon when the sub-type is known.
const SUBTYPE_ICON = {
  helmet: TbHelmet,
  impact: GiKevlarVest,
  lifevest: GiLifeJacket,
  leash: GiRopeCoil,
  pump: GiGasPump,
  mast: TbSailboat,
  foil: TbSailboat,
};

const equipmentIcon = (typeKey, subtypes = []) => {
  const base = TYPE_STYLE[typeKey] || TYPE_STYLE.other;
  const sub = (subtypes || []).find((s) => SUBTYPE_ICON[s]);
  return { Icon: sub ? SUBTYPE_ICON[sub] : base.Icon, cls: base.cls };
};

const SIZES = {
  sm: 'h-10 w-10 rounded-lg text-xl',
  card: 'h-16 w-16 rounded-2xl text-3xl',
  lg: 'h-20 w-20 rounded-2xl text-4xl',
};

export default function EquipmentIcon({ typeKey, subtypes, size = 'sm', className = '' }) {
  const { Icon, cls } = equipmentIcon(typeKey, subtypes);
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center border ${SIZES[size] || SIZES.sm} ${cls} ${className}`}
    >
      <Icon />
    </div>
  );
}
