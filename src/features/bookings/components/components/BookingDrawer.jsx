import { useState, useEffect, useCallback, useMemo, Component } from 'react';
import { Drawer, Select, Spin, Alert, Checkbox, Modal, AutoComplete, App } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  CheckCircleFilled,
  SearchOutlined,
  UserOutlined,
  TagOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCalendar } from '../contexts/CalendarContext';
import { getAvailableSlots } from '../api/calendarApi';
import { useToast } from '@/shared/contexts/ToastContext';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useBookingForm } from '../../hooks/useBookingForm';
import { computeBookingPrice } from '@/shared/utils/pricing';
import { filterServicesByCapacity, isGroupService } from '@/shared/utils/serviceCapacityFilter';
import apiClient from '@/shared/services/apiClient';
import UserForm from '@/shared/components/ui/UserForm';
import CustomerPackageManager from '@/features/customers/components/CustomerPackageManager';

// ── Error Boundary for sections ──────────────────────────────────
class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error(`BookingDrawer [${this.props.section}] crashed:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="px-5 py-4 text-center">
          <WarningOutlined className="text-amber-500 text-lg" />
          <p className="text-sm text-slate-500 mt-1">Something went wrong in <strong>{this.props.section}</strong>.</p>
          <button type="button" onClick={() => this.setState({ hasError: false })} className="mt-2 px-3 py-1 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const HALF_HOUR_MINUTES = 30;

// ── Time helpers (ported from StepBookingModal) ──────────────────────
const timeStringToMinutes = (time) => {
  if (!time || typeof time !== 'string') return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const minutesToTimeString = (mins) => {
  const n = Math.max(0, Math.round(Number(mins) || 0));
  return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
};

const normalizeDurationMinutes = (hours) => {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return HALF_HOUR_MINUTES;
  return Math.max(1, Math.round((h * 60) / HALF_HOUR_MINUTES)) * HALF_HOUR_MINUTES;
};

const buildRequiredSlotTimes = (startTime, durationMinutes) => {
  const startMin = timeStringToMinutes(startTime);
  if (startMin === null) return [];
  const steps = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  return Array.from({ length: steps }, (_, i) => minutesToTimeString(startMin + i * HALF_HOUR_MINUTES));
};

const extractInstructorSlots = (availability, date, instructorId) => {
  if (!Array.isArray(availability)) return [];
  const dayData = availability.find(d => d.date === date);
  if (!dayData?.slots) return [];
  return dayData.slots.filter(s => String(s.instructorId) === String(instructorId));
};

const findAlternativeSlots = (slots, durationMinutes, requestedMinutes) => {
  if (!slots?.length) return [];
  const stepsNeeded = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  const sorted = [...slots].sort((a, b) => (timeStringToMinutes(a.time) ?? 0) - (timeStringToMinutes(b.time) ?? 0));
  const suggestions = [];
  for (let i = 0; i <= sorted.length - stepsNeeded; i++) {
    const window = sorted.slice(i, i + stepsNeeded);
    if (!window.every(s => s.status === 'available')) continue;
    const wStart = timeStringToMinutes(window[0].time);
    if (wStart === null || wStart === requestedMinutes) continue;
    suggestions.push({
      startTime: window[0].time,
      endTime: minutesToTimeString(wStart + durationMinutes),
      startHour: wStart / 60,
      duration: durationMinutes / 60
    });
    if (suggestions.length >= 3) break;
  }
  return suggestions;
};

const generateTimeSlots = () => {
  const slots = [];
  for (let h = 8; h <= 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  return slots;
};
const ALL_TIME_SLOTS = generateTimeSlots();

// ── Service matching helpers ──────────────────────────────────────────
const RENTAL_CATEGORIES = ['rental', 'shop', 'repair', 'storage'];

const isLessonService = (service) => {
  const cat = (service?.category || '').toLowerCase();
  const type = (service?.service_type || service?.serviceType || '').toLowerCase();
  // Exclude rental/shop by category
  if (RENTAL_CATEGORIES.some(k => cat.includes(k))) return false;
  // Include if it has a lesson-oriented service_type
  if (['private', 'semi-private', 'group', 'supervision', 'semi-private-supervision', 'lesson'].includes(type)) return true;
  // Include if it has a lessonCategoryTag set
  if (service?.lesson_category_tag || service?.lessonCategoryTag) return true;
  // Fallback: include if category is lesson-oriented
  return ['lesson', 'kitesurfing', 'kite', 'wing', 'foil', 'efoil', 'surf'].some(k => cat.includes(k));
};

const getServiceCategory = (service) => {
  const name = (service?.name || '').toLowerCase();
  const src = (service?.lesson_category_tag || service?.lessonCategoryTag || service?.service_type || service?.serviceType || '').toLowerCase();
  // Name-level override: if name clearly says group/semi, trust that over a mismatched tag
  if (name.includes('semi')) return 'semi-private';
  if (name.includes('group') && src !== 'private') return 'group';
  if (src.includes('semi')) return 'semi-private';
  const known = ['private', 'supervision', 'group'];
  const tagMatch = known.find(k => src === k);
  if (tagMatch) return tagMatch;
  // Fallback to name if no tag/type
  if (!src) {
    const nameMatch = known.find(k => name.includes(k));
    if (nameMatch) return nameMatch;
  }
  return 'lesson';
};

// ── Preflight check ──────────────────────────────────────────────────
const preflightCheckGroupSlot = async ({ date, instructorId, startTime, durationHours }) => {
  if (!date || !instructorId || !startTime) return { ok: true };
  try {
    const availability = await getAvailableSlots(date, date, { instructorIds: [instructorId] });
    const relevantSlots = extractInstructorSlots(availability, date, instructorId);
    if (!relevantSlots?.length) return { ok: true };
    const durationMinutes = normalizeDurationMinutes(durationHours);
    const required = buildRequiredSlotTimes(startTime, durationMinutes);
    const allAvailable = required.every(t => {
      const match = relevantSlots.find(s => s.time === t);
      return match && match.status === 'available';
    });
    if (allAvailable) return { ok: true };
    return { ok: false, suggestions: findAlternativeSlots(relevantSlots, durationMinutes, timeStringToMinutes(startTime) ?? undefined) };
  } catch {
    return { ok: true };
  }
};

// ── Assign-Package dropdown button ────────────────────────────────
const AssignPackageDropdown = ({ participants, onSelect, allPkgs }) => {
  const [open, setOpen] = useState(false);
  const [previewUser, setPreviewUser] = useState(null);
  const valid = (participants || []).filter(p => p?.userId);
  if (!valid.length) return null;

  const handleToggle = () => {
    setOpen(o => !o);
    setPreviewUser(null);
  };

  const handleClickCustomer = (p) => {
    if (valid.length === 1) {
      // Single participant: toggle preview directly
      setPreviewUser(prev => prev?.userId === p.userId ? null : p);
      setOpen(true);
      return;
    }
    setPreviewUser(p);
  };

  const pkgs = previewUser ? (allPkgs[previewUser.userId] || []) : [];

  // Single participant: button opens preview panel
  const triggerBtn = valid.length === 1 ? (
    <button type="button" onClick={() => handleClickCustomer(valid[0])} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors shrink-0">
      <TagOutlined className="text-xs" /> Packages
    </button>
  ) : (
    <button type="button" onClick={handleToggle} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
      <TagOutlined className="text-xs" /> Packages <span className="text-[10px]">▾</span>
    </button>
  );

  return (
    <div className="relative shrink-0">
      {triggerBtn}
      {open && (
        <div className="absolute right-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Customer list (multi) or direct preview (single) */}
          {!previewUser && valid.length > 1 && (
            <>
              <div className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Select customer</div>
              {valid.map(p => {
                const pPkgs = allPkgs[p.userId] || [];
                return (
                  <button key={p.userId} type="button" onClick={() => handleClickCustomer(p)} className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-green-50 transition-colors flex items-center gap-2.5 border-b border-gray-50 last:border-0">
                    <UserOutlined className="text-xs text-gray-400" />
                    <span className="font-medium truncate flex-1">{p.userName}</span>
                    {pPkgs.length > 0 ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-50 text-green-600 border border-green-200">{pPkgs.length} pkg</span>
                    ) : (
                      <span className="text-[10px] text-gray-400">No pkg</span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* Package preview panel */}
          {previewUser && (
            <>
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                {valid.length > 1 && (
                  <button type="button" onClick={() => setPreviewUser(null)} className="text-gray-400 hover:text-gray-600 text-xs">←</button>
                )}
                <UserOutlined className="text-xs text-gray-500" />
                <span className="text-xs font-semibold text-gray-700 truncate flex-1">{previewUser.userName}</span>
                <button type="button" onClick={() => { setOpen(false); setPreviewUser(null); }} className="text-gray-400 hover:text-gray-600 text-sm leading-none">✕</button>
              </div>

              {pkgs.length > 0 ? (
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                  {pkgs.map(pkg => {
                    const remaining = Number(pkg.remaining_hours || pkg.remainingHours || 0);
                    const total = Number(pkg.total_hours || pkg.totalHours || 0);
                    const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
                    const tag = pkg.lesson_category_tag || pkg.lessonCategoryTag || '';
                    return (
                      <div key={pkg.id} className="px-3 py-2.5 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm font-medium text-gray-800 truncate">{pkg.package_name || pkg.packageName}</span>
                          {tag && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 capitalize shrink-0">{tag}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct > 50 ? 'bg-green-400' : pct > 20 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-gray-500 font-medium shrink-0">{remaining.toFixed(1)}/{total.toFixed(1)}h</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-4 text-center text-sm text-gray-400">No active packages</div>
              )}

              <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setPreviewUser(null); onSelect(previewUser); }}
                  className="w-full px-3 py-2 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-center"
                >+ Assign New Package</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};


// ═════════════════════════════════════════════════════════════════════
// BookingDrawer Component
// ═════════════════════════════════════════════════════════════════════

// eslint-disable-next-line complexity
const BookingDrawer = ({ isOpen, onClose, onBookingCreated, prefilledCustomer, prefilledParticipants, prefilledServiceId, prefilledInstructor, prefilledDate }) => {
  const { selectedSlot, services, users, instructors, refreshData, createBooking } = useCalendar();
  const { showSuccess, showError, showInfo } = useToast();
  const { formatCurrency, businessCurrency } = useCurrency();
  const { user: authUser } = useAuth();
  const isInstructorBooker = authUser?.role?.toLowerCase?.() === 'instructor';
  const { modal } = App.useApp();

  // ── Form state ──────────────────────────────────────────────────
  // eslint-disable-next-line complexity
  const initialFormData = useMemo(() => {
    // Build participants list — prefer prefilledParticipants (array) over prefilledCustomer (single)
    let participants = [];
    let primaryUser = { userId: '', userName: '', userEmail: '', userPhone: '' };

    if (prefilledParticipants?.length > 0) {
      participants = prefilledParticipants.map((p, idx) => ({
        userId: p.user_id || p.id || p.userId || '',
        userName: p.user_name || p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        userEmail: p.user_email || p.email || '',
        userPhone: p.phone || p.userPhone || '',
        isPrimary: idx === 0,
        paymentStatus: 'paid',
        notes: '',
      }));
      primaryUser = {
        userId: participants[0].userId,
        userName: participants[0].userName,
        userEmail: participants[0].userEmail,
        userPhone: participants[0].userPhone,
      };
    } else if (prefilledCustomer) {
      participants = [{
        userId: prefilledCustomer.id,
        userName: prefilledCustomer.name || `${prefilledCustomer.first_name || ''} ${prefilledCustomer.last_name || ''}`.trim(),
        userEmail: prefilledCustomer.email || '',
        userPhone: prefilledCustomer.phone || '',
        isPrimary: true,
        paymentStatus: 'paid',
        notes: '',
      }];
      primaryUser = {
        userId: prefilledCustomer.id || '',
        userName: prefilledCustomer.name || (prefilledCustomer.first_name ? `${prefilledCustomer.first_name} ${prefilledCustomer.last_name || ''}`.trim() : ''),
        userEmail: prefilledCustomer.email || '',
        userPhone: prefilledCustomer.phone || '',
      };
    }

    const base = {
      ...primaryUser,
      instructorId: prefilledInstructor?.id || '',
      instructorName: prefilledInstructor?.name || '',
      serviceId: prefilledServiceId || '',
      participants,
    };
    if (selectedSlot) {
      return { ...base, date: selectedSlot.date || '', startTime: selectedSlot.startTime || '', endTime: selectedSlot.endTime || '', instructorId: selectedSlot.instructorId || base.instructorId, instructorName: selectedSlot.instructorName || base.instructorName };
    }
    if (prefilledDate) return { ...base, date: prefilledDate };
    // Default to today's date
    return { ...base, date: dayjs().format('YYYY-MM-DD') };
  }, [prefilledCustomer, prefilledParticipants, prefilledServiceId, prefilledInstructor, prefilledDate, selectedSlot]);

  const { formData, updateFormData, resetFormData, validateStep, hasUnsavedChanges } = useBookingForm(initialFormData);

  // ── Local state ─────────────────────────────────────────────────
  const [showReview, setShowReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Schedule
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(120);
  const [bookingDefaults, setBookingDefaults] = useState(null);
  const [instructorSearch, setInstructorSearch] = useState('');
  const [conflictWarning, setConflictWarning] = useState(null);
  const [slotPreFilled, setSlotPreFilled] = useState(false);

  // Customer
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  // Keep Customer section expanded until user moves on (so group/semi-private bookings can add multiple students)
  const [customerSectionExpanded, setCustomerSectionExpanded] = useState(true);
  // Keep Schedule section expanded until user explicitly continues (so they can add multiple lessons)
  const [scheduleSectionExpanded, setScheduleSectionExpanded] = useState(true);

  // Server-side customer search — the context preloads only ~200 customers
  // alphabetically; querying the API on-type finds names past that window.
  useEffect(() => {
    const q = customerSearchQuery.trim();
    if (!q) {
      setCustomerSearchResults([]);
      return;
    }
    setCustomerSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get('/users/students', { params: { q, limit: 50 } });
        setCustomerSearchResults(Array.isArray(res.data) ? res.data : []);
      } catch {
        setCustomerSearchResults([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearchQuery]);

  // Full lookup pool for resolving selected ids back to user records.
  // Includes every source we might have seen a user from.
  const customerPool = useMemo(() => {
    const map = new Map();
    (formData.participants || []).forEach((p) => {
      if (p.userId && !map.has(p.userId)) {
        map.set(p.userId, { id: p.userId, name: p.userName, email: p.userEmail, phone: p.userPhone });
      }
    });
    (users || []).forEach((u) => { if (u?.id && !map.has(u.id)) map.set(u.id, u); });
    customerSearchResults.forEach((u) => { if (u?.id && !map.has(u.id)) map.set(u.id, u); });
    return Array.from(map.values());
  }, [formData.participants, users, customerSearchResults]);

  // Options shown in the dropdown. With `filterOption={false}` AntD renders
  // whatever we pass, so we must narrow explicitly when a search is active:
  // show server hits (+ already-selected) instead of the full preloaded slice.
  const customerOptions = useMemo(() => {
    const q = customerSearchQuery.trim();
    const selected = new Map();
    (formData.participants || []).forEach((p) => {
      if (p.userId) selected.set(p.userId, { id: p.userId, name: p.userName });
    });

    const source = q
      ? customerSearchResults
      : (users || []);

    const map = new Map(selected);
    source.forEach((u) => {
      if (u?.id && !map.has(u.id)) {
        const label = u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
        map.set(u.id, { id: u.id, name: label });
      }
    });
    return Array.from(map.values()).map((u) => ({ value: u.id, label: u.name }));
  }, [customerSearchQuery, customerSearchResults, users, formData.participants]);

  // Assign package
  const [assignPkgUser, setAssignPkgUser] = useState(null);

  // Service
  const [serviceSearch, setServiceSearch] = useState('');

  // Recently-booked customers (localStorage)
  const [recentCustomers, setRecentCustomers] = useState([]);

  // Packages & Wallet
  // loadingPackages removed — packages now use allUserPackages inline
  const [userPackages, setUserPackages] = useState({});
  const [userBalances, setUserBalances] = useState({});
  const [allUserPackages, setAllUserPackages] = useState({});

  // ── Reset on open / close ───────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      resetFormData();
      const hasSlot = !!(initialFormData.instructorId && initialFormData.startTime);
      setSlotPreFilled(hasSlot);
      setInstructorSearch(initialFormData.instructorName || '');
      if (hasSlot && initialFormData.startTime && initialFormData.endTime) {
        const [sh, sm] = initialFormData.startTime.split(':').map(Number);
        const [eh, em] = initialFormData.endTime.split(':').map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        if (mins > 0) setSelectedDuration(mins);
      }
      setShowReview(false);
      setConflictWarning(null);
      setUserPackages({});
      setUserBalances({});
      setAllUserPackages({});
      setIsSubmitting(false);
      setServiceSearch('');
      setAvailableSlots([]);
      setScheduleSectionExpanded(true);
      // Load recent customers from localStorage
      try {
        const stored = JSON.parse(localStorage.getItem('plannivo_recent_customers') || '[]');
        setRecentCustomers(Array.isArray(stored) ? stored.slice(0, 5) : []);
      } catch { setRecentCustomers([]); }
    } else {
      resetFormData();
      setSlotPreFilled(false);
      setIsSubmitting(false);
      setServiceSearch('');
      setInstructorSearch('');
      setConflictWarning(null);
      setAvailableSlots([]);
      setUserPackages({});
      setUserBalances({});
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load booking defaults
  useEffect(() => {
    apiClient.get('/settings').then(r => {
      if (r.data?.booking_defaults) {
        setBookingDefaults(r.data.booking_defaults);
        setSelectedDuration(r.data.booking_defaults.defaultDuration || 120);
      }
    }).catch(() => {
      setBookingDefaults({ defaultDuration: 120, allowedDurations: [60, 90, 120, 150, 180, 240] });
    });
  }, []);

  // ── Load available slots when date/instructor changes ───────────
  useEffect(() => {
    const loadSlots = async () => {
      if (!formData.date || !formData.instructorId) { setAvailableSlots([]); return; }
      setLoadingSlots(true);
      try {
        const slots = await getAvailableSlots(formData.date, formData.date, { instructorIds: [formData.instructorId] });
        if (slots?.length > 0) {
          const dayData = slots.find(d => d.date === formData.date);
          if (dayData?.slots) {
            setAvailableSlots(dayData.slots.filter(s => String(s.instructorId) === String(formData.instructorId)));
          } else {
            setAvailableSlots([]);
          }
        } else {
          setAvailableSlots([]);
        }
      } catch {
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };
    loadSlots();
  }, [formData.date, formData.instructorId, formData.slotRefreshKey]);

  // ── Fetch ALL packages per participant (for package indicators) ──
  useEffect(() => {
    if (!formData.participants?.length) return;
    const fetchAllPkgs = async () => {
      for (const p of formData.participants) {
        if (!p.userId || allUserPackages[p.userId]) continue;
        try {
          const response = await apiClient.get(`/users/${p.userId}/packages`);
          let active = (response.data || []).filter(pkg => pkg.status === 'active' && (pkg.remaining_hours > 0 || pkg.remainingHours > 0));
          // Filter packages by participant count — exclude group/semi-private for single participant
          if (participantCount === 1) {
            active = active.filter(pkg => {
              const tag = (pkg.lesson_category_tag || '').toLowerCase();
              if (tag === 'group' || tag === 'semi-private' || tag.includes('semi')) return false;
              if (tag === 'private' || tag === 'supervision') return true;
              // No tag — check name fields for group/semi keywords
              const name = `${pkg.lesson_service_name || ''} ${pkg.package_name || ''}`.toLowerCase();
              if (name.includes('group') || name.includes('semi')) return false;
              return true;
            });
          }
          setAllUserPackages(prev => ({ ...prev, [p.userId]: active }));
        } catch {
          setAllUserPackages(prev => ({ ...prev, [p.userId]: [] }));
        }
      }
    };
    fetchAllPkgs();
  }, [formData.participants]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch participant packages when service is selected ─────────
  useEffect(() => {
    if (!formData.serviceId || !formData.participants?.length) return;
    const fetchPkgs = async () => {
      for (const p of formData.participants) {
        if (!p.userId || userPackages[p.userId]) continue;
        try {
          const params = new URLSearchParams();
          if (formData.serviceName) params.append('serviceName', formData.serviceName);
          if (formData.serviceType) params.append('serviceType', formData.serviceType);
          if (formData.serviceCategory) params.append('serviceCategory', formData.serviceCategory);
          const url = `/users/${p.userId}/packages${params.toString() ? `?${params}` : ''}`;
          const response = await apiClient.get(url);
          let active = (response.data || []).filter(pkg => pkg.status === 'active' && (pkg.remaining_hours > 0 || pkg.remainingHours > 0));
          // Client-side filter: exclude packages whose lesson_category_tag doesn't match the selected service type
          const selectedType = (formData.serviceType || '').toLowerCase();
          if (selectedType && ['private', 'group', 'semi-private'].includes(selectedType)) {
            active = active.filter(pkg => {
              const pkgTag = (pkg.lesson_category_tag || '').toLowerCase();
              if (!pkgTag) return true; // no tag → show (could match anything)
              if (selectedType === 'private') return pkgTag === 'private';
              if (selectedType === 'group') return pkgTag === 'group';
              if (selectedType === 'semi-private') return pkgTag === 'semi-private' || pkgTag.includes('semi');
              return true;
            });
          }
          setUserPackages(prev => ({ ...prev, [p.userId]: active }));
        } catch {
          // Don't cache on error — leave undefined so it retries on next dependency change
          continue;
        }
      }
    };
    fetchPkgs();
  }, [formData.serviceId, formData.participants, formData.serviceName, formData.serviceType, formData.serviceCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch wallet balances for participants ──────────────────────
  useEffect(() => {
    if (!formData.participants?.length) return;
    const fetchBalances = async () => {
      for (const p of formData.participants) {
        if (!p.userId || userBalances[p.userId] !== undefined) continue;
        try {
          const res = await apiClient.get(`/finances/accounts/${p.userId}`);
          const avail = Number(res.data?.wallet?.available ?? res.data?.balance ?? 0);
          setUserBalances(prev => ({ ...prev, [p.userId]: avail }));
        } catch {
          setUserBalances(prev => ({ ...prev, [p.userId]: 0 }));
        }
      }
    };
    fetchBalances();
  }, [formData.participants]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed values ─────────────────────────────────────────────
  const participantCount = Math.max(formData.participants?.length || 0, 1);
  const isGroupBooking = formData.participants?.length > 1;

  const getBookingDuration = useCallback(() => {
    const st = formData.startTime, et = formData.endTime;
    if (st && et) {
      const [sh, sm] = st.split(':').map(Number);
      const [eh, em] = et.split(':').map(Number);
      if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
        return Math.max(0.5, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
      }
    }
    return selectedDuration / 60;
  }, [formData.startTime, formData.endTime, selectedDuration]);

  const handleUserCreated = useCallback(async () => {
    setShowNewUserModal(false);
    message.success('Customer created! Select them from the list.');
    if (refreshData) await refreshData();
  }, [refreshData]);

  // ── Customer selection (Select dropdown) ─────────────────────
  const handleCustomerChange = useCallback((selectedIds) => {
    const current = formData.participants || [];
    const kept = current.filter(p => selectedIds.includes(p.userId));
    const existingIds = new Set(kept.map(p => p.userId));
    const added = selectedIds.filter(id => !existingIds.has(id)).map(id => {
      const user = customerPool.find(u => u.id === id);
      return {
        userId: id,
        userName: user?.name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || '',
        userEmail: user?.email || '',
        userPhone: user?.phone || '',
        isPrimary: false,
        paymentStatus: 'paid',
        notes: ''
      };
    });
    const all = [...kept, ...added];
    if (all.length > 0 && !all.some(p => p.isPrimary)) all[0].isPrimary = true;
    const primary = all.find(p => p.isPrimary);
    updateFormData({
      participants: all,
      userId: primary?.userId || '',
      userName: primary?.userName || '',
      userEmail: primary?.userEmail || '',
      userPhone: primary?.userPhone || '',
      isGroupBooking: all.length > 1
    });
    const removedIds = current.filter(p => !selectedIds.includes(p.userId)).map(p => p.userId);
    if (removedIds.length > 0) {
      setUserPackages(prev => { const copy = { ...prev }; removedIds.forEach(id => delete copy[id]); return copy; });
      setUserBalances(prev => { const copy = { ...prev }; removedIds.forEach(id => delete copy[id]); return copy; });
    }
  }, [formData.participants, customerPool, updateFormData]);

  // ── Instructor selection ────────────────────────────────────────
  const handleInstructorSelect = useCallback((instr) => {
    updateFormData({ instructorId: instr.id, instructorName: instr.name });
    setInstructorSearch(instr.name);
    setConflictWarning(null);
    setCustomerSectionExpanded(false);
  }, [updateFormData]);

  // ── Duration / Time ─────────────────────────────────────────────
  const handleDurationChange = useCallback((mins) => {
    setSelectedDuration(mins);
    if (formData.startTime) {
      const startMins = timeStringToMinutes(formData.startTime);
      if (startMins !== null) {
        updateFormData({ endTime: minutesToTimeString(startMins + mins), duration: mins / 60 });
      }
    }
  }, [formData.startTime, updateFormData]);
  const handleStartTimeSelect = useCallback((time) => {
    const startMins = timeStringToMinutes(time);
    if (startMins === null) return;
    const endTime = minutesToTimeString(startMins + selectedDuration);
    updateFormData({ startTime: time, endTime, duration: selectedDuration / 60 });
    setConflictWarning(null);

    // Validate selected range
    const required = buildRequiredSlotTimes(time, selectedDuration);
    const allOk = required.every(t => {
      const match = availableSlots.find(s => s.time === t);
      return match && match.status === 'available';
    });
    if (!allOk && availableSlots.length > 0) {
      const suggestions = findAlternativeSlots(availableSlots, selectedDuration, startMins);
      setConflictWarning({ message: `Time ${time} conflicts with an existing booking`, suggestions });
    }
  }, [selectedDuration, availableSlots, updateFormData]);

  // ── Multi-lesson helpers ────────────────────────────────────────
  const addExtraLesson = useCallback(() => {
    const extras = formData.extraLessons || [];
    const lastDate = extras.length > 0 ? extras[extras.length - 1].date : formData.date;
    const baseDate = lastDate || dayjs().format('YYYY-MM-DD');
    const nextDate = dayjs(baseDate).add(1, 'day').format('YYYY-MM-DD');
    const dur = selectedDuration || 120;
    updateFormData({
      extraLessons: [...extras, {
        date: nextDate,
        startTime: '',
        endTime: '',
        duration: dur
      }]
    });
  }, [formData.date, formData.extraLessons, selectedDuration, updateFormData]);

  const removeExtraLesson = useCallback((idx) => {
    const next = [...(formData.extraLessons || [])];
    next.splice(idx, 1);
    // Reindex per-lesson package overrides (lessonIdx 0 = primary, 1+ = extras)
    const removedLessonIdx = idx + 1;
    const oldOverrides = formData.lessonPackageOverrides || {};
    const newOverrides = {};
    for (const [k, v] of Object.entries(oldOverrides)) {
      const ki = Number(k);
      if (ki < removedLessonIdx) newOverrides[ki] = v;
      else if (ki > removedLessonIdx) newOverrides[ki - 1] = v;
    }
    updateFormData({ extraLessons: next, lessonPackageOverrides: newOverrides });
  }, [formData.extraLessons, formData.lessonPackageOverrides, updateFormData]);

  const updateExtraLesson = useCallback((idx, patch) => {
    const next = [...(formData.extraLessons || [])];
    if (!next[idx]) return;
    next[idx] = { ...next[idx], ...patch };
    // If duration or startTime changed, recompute endTime
    if (patch.duration != null || patch.startTime != null) {
      const lesson = next[idx];
      const startMins = timeStringToMinutes(lesson.startTime);
      if (startMins !== null) {
        lesson.endTime = minutesToTimeString(startMins + lesson.duration);
      } else {
        lesson.endTime = '';
      }
    }
    updateFormData({ extraLessons: next });
  }, [formData.extraLessons, updateFormData]);

  const totalLessonHours = useMemo(() => {
    let total = 0;
    if (formData.startTime && formData.endTime) {
      const s = timeStringToMinutes(formData.startTime);
      const e = timeStringToMinutes(formData.endTime);
      if (s !== null && e !== null && e > s) total += (e - s) / 60;
    }
    for (const l of (formData.extraLessons || [])) {
      const s = timeStringToMinutes(l.startTime);
      const e = timeStringToMinutes(l.endTime);
      if (s !== null && e !== null && e > s) total += (e - s) / 60;
    }
    return total;
  }, [formData.startTime, formData.endTime, formData.extraLessons]);

  const allLessons = useMemo(() => {
    const list = [];
    if (formData.date && formData.startTime && formData.endTime) {
      const s = timeStringToMinutes(formData.startTime);
      const e = timeStringToMinutes(formData.endTime);
      const dur = (s !== null && e !== null && e > s) ? (e - s) : selectedDuration;
      list.push({ date: formData.date, startTime: formData.startTime, endTime: formData.endTime, duration: dur });
    }
    for (const l of (formData.extraLessons || [])) {
      if (l.date && l.startTime && l.endTime) list.push(l);
    }
    return list;
  }, [formData.date, formData.startTime, formData.endTime, formData.extraLessons, selectedDuration]);

  // ── Per-lesson package overrides ────────────────────────────────
  // Resolves the effective package for (lessonIdx, participantId).
  // Override semantics: undefined → use participant default; null → wallet; <pkgId> → that package.
  const getLessonParticipantPackage = useCallback((lessonIdx, participantId) => {
    const overrides = formData.lessonPackageOverrides || {};
    const lessonOverride = overrides[lessonIdx];
    if (lessonOverride && Object.prototype.hasOwnProperty.call(lessonOverride, participantId)) {
      return lessonOverride[participantId]; // null = wallet
    }
    const p = (formData.participants || []).find(x => x.userId === participantId);
    return (p?.usePackage && p?.selectedPackageId) ? p.selectedPackageId : null;
  }, [formData.lessonPackageOverrides, formData.participants]);

  const setLessonParticipantPackage = useCallback((lessonIdx, participantId, packageId) => {
    const next = { ...(formData.lessonPackageOverrides || {}) };
    next[lessonIdx] = { ...(next[lessonIdx] || {}), [participantId]: packageId };
    updateFormData({ lessonPackageOverrides: next });
  }, [formData.lessonPackageOverrides, updateFormData]);

  // ── Service selection ───────────────────────────────────────────
  const availableServices = useMemo(() => filterServicesByCapacity(services || [], participantCount).filter(isLessonService), [services, participantCount]);

  const filteredServicesList = useMemo(() => {
    const q = (serviceSearch || '').trim().toLowerCase();
    if (!q) return availableServices;
    return availableServices.filter(s => {
      const name = (s?.name || '').toLowerCase();
      const cat = (s?.category || '').toLowerCase();
      const disc = (s?.disciplineTag || '').toLowerCase();
      const lcat = (s?.lessonCategoryTag || '').toLowerCase();
      return name.includes(q) || cat.includes(q) || disc.includes(q) || lcat.includes(q);
    });
  }, [availableServices, serviceSearch]);

  const groupedServices = useMemo(() => {
    const groups = {};
    for (const svc of filteredServicesList) {
      const cat = getServiceCategory(svc);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(svc);
    }
    const order = ['private', 'semi-private', 'group', 'supervision', 'lesson'];
    return order.filter(k => groups[k]?.length).map(k => ({ category: k, services: groups[k] }));
  }, [filteredServicesList]);

  // Set of service IDs where at least one participant has a matching package
  const pkgMatchSet = useMemo(() => {
    const set = new Set();
    const participants = formData.participants || [];
    for (const svc of filteredServicesList) {
      const cat = getServiceCategory(svc);
      for (const p of participants) {
        const pkgs = allUserPackages[p.userId] || [];
        if (pkgs.some(pkg => {
          const pkgTag = (pkg.lesson_category_tag || '').toLowerCase();
          const pkgSvcId = pkg.lesson_service_id;
          // Exact service ID match
          if (pkgSvcId && pkgSvcId === svc.id) return true;
          // Category tag match (only if tag exists)
          if (!pkgTag) return false;
          return pkgTag === cat || (cat === 'semi-private' && pkgTag.includes('semi'));
        })) { set.add(svc.id); break; }
      }
    }
    return set;
  }, [filteredServicesList, formData.participants, allUserPackages]);

  const handleServiceSelect = useCallback((service) => {
    if (formData.serviceId === service.id) {
      updateFormData({ serviceId: null, serviceName: '', servicePrice: 0, serviceDuration: 0, serviceCategory: '', usePackageHours: false, paymentMethod: null, selectedPackage: null, customerPackageId: null });
      return;
    }
    const cat = getServiceCategory(service);
    const dur = getBookingDuration();
    const price = service.price * dur * (isGroupBooking ? formData.participants.length : 1);
    // Clear participant-level package state to prevent stale package hours
    // from affecting price calculation for the new service
    const clearedParticipants = (formData.participants || []).map(p => ({
      ...p,
      usePackage: false,
      selectedPackageId: null,
      selectedPackageName: null,
      customerPackageId: null,
      paymentStatus: 'paid'
    }));
    updateFormData({
      serviceId: service.id,
      serviceName: service.name,
      serviceType: cat,
      servicePrice: price,
      serviceDuration: dur,
      serviceCategory: service.discipline_tag || service.disciplineTag || cat,
      usePackageHours: false,
      paymentMethod: 'cash',
      selectedPackage: null,
      customerPackageId: null,
      participants: clearedParticipants
    });
    // Clear cached packages so they reload for new service
    setUserPackages({});
  }, [formData.serviceId, formData.participants, getBookingDuration, isGroupBooking, updateFormData]);


  // ── Package selection (form-level, uses allUserPackages) ────────
  const handleFormPackageSelect = useCallback((participantIndex, packageId) => {
    const updated = [...(formData.participants || [])];
    const p = updated[participantIndex];
    const updatePayload = { participants: updated };

    if (packageId) {
      const pkg = (allUserPackages[p.userId] || []).find(pk => pk.id === packageId);
      p.usePackage = true;
      p.selectedPackageId = packageId;
      p.selectedPackageName = pkg?.package_name || pkg?.packageName;
      p.customerPackageId = packageId;
      p.paymentStatus = 'package';
      // Auto-select matching service based on package's linked service or category
      const pkgServiceId = pkg?.lesson_service_id;
      const pkgServiceName = (pkg?.lesson_service_name || pkg?.lessonServiceName || '').toLowerCase();
      const pkgTag = (pkg?.lesson_category_tag || '').toLowerCase();

      // 1. Exact match by lesson_service_id
      let matchSvc = pkgServiceId ? availableServices.find(svc => svc.id === pkgServiceId) : null;
      // 2. Match by lesson_service_name
      if (!matchSvc && pkgServiceName) {
        matchSvc = availableServices.find(svc => (svc.name || '').toLowerCase() === pkgServiceName);
      }
      // 3. Fallback to category tag match
      if (!matchSvc && pkgTag) {
        matchSvc = availableServices.find(svc => {
          const cat = getServiceCategory(svc);
          return cat === pkgTag || (pkgTag.includes('semi') && cat === 'semi-private');
        });
      }
      if (matchSvc) {
        const cat = getServiceCategory(matchSvc);
        const dur = getBookingDuration();
        const price = matchSvc.price * dur * (isGroupBooking ? updated.length : 1);
        Object.assign(updatePayload, {
          serviceId: matchSvc.id,
          serviceName: matchSvc.name,
          serviceType: cat,
          servicePrice: price,
          serviceDuration: dur,
          serviceCategory: matchSvc.discipline_tag || matchSvc.disciplineTag || cat,
          paymentMethod: 'package',
          selectedPackage: null,
          customerPackageId: packageId
        });
        setUserPackages({});
      }
    } else {
      p.usePackage = false;
      p.selectedPackageId = null;
      p.selectedPackageName = null;
      p.customerPackageId = null;
      p.paymentStatus = 'paid';
      // If no other participant still has a package, clear the auto-set service
      const anyOtherHasPackage = updated.some((part, i) => i !== participantIndex && part.usePackage && part.selectedPackageId);
      if (!anyOtherHasPackage) {
        Object.assign(updatePayload, {
          serviceId: null, serviceName: '', servicePrice: 0, serviceDuration: 0,
          serviceCategory: '', serviceType: '', usePackageHours: false,
          paymentMethod: null, selectedPackage: null, customerPackageId: null
        });
        setUserPackages({});
      }
    }

    updateFormData(updatePayload);
  }, [formData.participants, allUserPackages, availableServices, getBookingDuration, isGroupBooking, updateFormData]);

  // ── Package display helpers ─────────────────────────────────────
  const formatPackageDetails = (pkg) => {
    const remainingHours = Number(pkg.remaining_hours || pkg.remainingHours || 0);
    const totalHours = Number(pkg.total_hours || pkg.totalHours || remainingHours);
    const lessonType = pkg.lesson_service_name || pkg.lessonServiceName || '';
    const expiryDate = pkg.expiry_date || pkg.expiryDate;
    const usagePercent = totalHours > 0 ? Math.round((remainingHours / totalHours) * 100) : 100;
    return { remainingHours, totalHours, lessonType, expiryDate, usagePercent };
  };

  const isExpiringSoon = (expiryDate) => {
    if (!expiryDate) return false;
    const exp = dayjs(expiryDate);
    return exp.diff(dayjs(), 'day') <= 7 && exp.isAfter(dayjs());
  };

  // ── Submit ──────────────────────────────────────────────────────
  // eslint-disable-next-line complexity
  const handleSubmit = useCallback(async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      message.error('Please complete all required sections before booking');
      return;
    }
    setIsSubmitting(true);
    try {
      const selectedService = (services || []).find(s => s.id === formData.serviceId);
      if (!selectedService) throw new Error('Selected service not found.');

      const hourlyRate = Number(selectedService.price || 0);
      const pCount = Math.max(formData.participants?.length || 1, 1);

      // Build the lesson list (primary + extras)
      const lessons = [
        { date: formData.date, startTime: formData.startTime, endTime: formData.endTime },
        ...(formData.extraLessons || [])
      ].filter(l => l.date && l.startTime && l.endTime);

      if (lessons.length === 0) throw new Error('At least one lesson is required.');

      // Track package remaining hours per (participantId, packageId) so each lesson sees fresh availability
      const pkgRemaining = {};
      for (const p of formData.participants || []) {
        pkgRemaining[p.userId] = {};
        for (const pkg of (allUserPackages[p.userId] || [])) {
          pkgRemaining[p.userId][pkg.id] = Number(pkg.remaining_hours || pkg.remainingHours || 0);
        }
      }

      const responses = [];
      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i];
        const lessonStart = lesson.startTime;
        const lessonEnd = lesson.endTime;
        const sMin = timeStringToMinutes(lessonStart);
        const eMin = timeStringToMinutes(lessonEnd);
        const lessonDuration = (sMin !== null && eMin !== null && eMin > sMin) ? (eMin - sMin) / 60 : selectedDuration / 60;

        let resp;
        if (formData.participants?.length > 1) {
          // ── Group booking (one per lesson) ──
          const processedParticipants = formData.participants.map(p => {
            const pkgId = getLessonParticipantPackage(i, p.userId);
            const pkgs = allUserPackages[p.userId] || [];
            const pkg = pkgId ? pkgs.find(x => x.id === pkgId) : null;
            const usePackage = !!pkg;
            // Deduct (so subsequent lessons see updated remaining)
            if (usePackage) {
              const avail = pkgRemaining[p.userId]?.[pkgId] ?? 0;
              pkgRemaining[p.userId][pkgId] = Math.max(0, avail - lessonDuration);
            }
            return {
              userId: p.userId,
              userName: p.userName,
              userEmail: p.userEmail,
              userPhone: p.userPhone,
              isPrimary: p.isPrimary === true,
              usePackage,
              customerPackageId: usePackage ? pkgId : null,
              paymentStatus: usePackage ? 'package' : (p.paymentStatus || 'paid'),
              manualCashPreference: p.manualCashPreference === true,
              notes: p.notes || ''
            };
          });

          const groupData = {
            date: lesson.date,
            start_hour: parseFloat(lessonStart.split(':')[0]) + parseFloat(lessonStart.split(':')[1]) / 60,
            duration: lessonDuration,
            instructor_user_id: formData.instructorId,
            service_id: formData.serviceId,
            status: 'pending',
            notes: formData.notes || '',
            location: 'TBD',
            participants: processedParticipants,
            allowNegativeBalance: formData.allowNegativeBalance === true
          };

          // Preflight on first lesson only (others rely on backend conflict detection)
          if (i === 0) {
            const pf = await preflightCheckGroupSlot({ date: groupData.date, instructorId: groupData.instructor_user_id, startTime: lessonStart, durationHours: lessonDuration });
            if (!pf.ok) {
              setConflictWarning({ message: 'The selected time is no longer available.', suggestions: pf.suggestions || [] });
              setShowReview(false);
              updateFormData({ startTime: '', endTime: '', slotRefreshKey: Date.now() });
              return;
            }
          }

          const token = localStorage.getItem('token');
          const apiResp = await fetch('/api/bookings/group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(groupData)
          });
          if (!apiResp.ok) {
            let errData = {};
            try { errData = await apiResp.json(); } catch { /* empty */ }
            const err = new Error(`Lesson ${i + 1} (${lesson.date} ${lessonStart}): ${errData.error || 'Failed to create group booking'}`);
            err.status = apiResp.status;
            if (errData.details) err.details = errData.details;
            throw err;
          }
          resp = await apiResp.json();
        } else {
          // ── Single booking (one per lesson) ──
          const participant = formData.participants?.[0];
          const pkgId = participant ? getLessonParticipantPackage(i, participant.userId) : null;
          const pkgs = participant ? (allUserPackages[participant.userId] || []) : [];
          const pkg = pkgId ? pkgs.find(x => x.id === pkgId) : null;
          const usePackage = !!pkg;
          const pkgAvailNow = (usePackage && pkgRemaining[participant.userId]?.[pkgId] != null) ? pkgRemaining[participant.userId][pkgId] : 0;
          const finalPrice = computeBookingPrice({ plannedHours: lessonDuration, hourlyRate, packageHoursAvailable: pkgAvailNow, step: 0.25, participants: pCount });
          if (usePackage) pkgRemaining[participant.userId][pkgId] = Math.max(0, pkgAvailNow - lessonDuration);

          const singleData = {
            date: lesson.date,
            startTime: lessonStart,
            endTime: lessonEnd,
            duration: lessonDuration,
            instructorId: formData.instructorId,
            instructorName: formData.instructorName,
            serviceId: formData.serviceId,
            serviceName: selectedService.name,
            userId: participant?.userId || formData.userId,
            user: { name: participant?.userName || formData.userName, email: participant?.userEmail || formData.userEmail || '', phone: participant?.userPhone || formData.userPhone || '', notes: formData.notes || '' },
            price: hourlyRate,
            totalCost: finalPrice,
            usePackageHours: usePackage,
            paymentMethod: usePackage ? 'package' : 'cash',
            customerPackageId: usePackage ? pkgId : null,
            isGroupBooking: false,
            participants: formData.participants || []
          };
          resp = await createBooking(singleData);
        }
        responses.push(resp);
      }

      const response = responses[0];
      if (!response?.id && !response?.bookingId) throw new Error('Booking created but no ID returned.');

      // Contextual success message based on service type and role
      const lessonCount = lessons.length;
      const lessonSuffix = lessonCount > 1 ? ` (${lessonCount} lessons)` : '';
      if (isInstructorBooker) {
        showInfo(`Booking submitted${lessonSuffix} — pending approval from a manager or admin.`);
      } else {
        const selectedSvc = (services || []).find(s => s.id === formData.serviceId);
        const isGroupLessonSvc = selectedSvc ? isGroupService(selectedSvc) : false;
        const pLen = formData.participants?.length || 1;
        if (pLen > 1) {
          showSuccess(`Group lesson booked with ${pLen} participants${lessonSuffix}!`);
        } else {
          const participant = formData.participants?.[0];
          const pName = participant?.userName || formData.userName;
          if (participant?.usePackage && participant?.selectedPackageId) {
            showSuccess(`Lesson booked for ${pName} using package hours${lessonSuffix}!`);
          } else {
            const lessonType = isGroupLessonSvc ? 'Group lesson' : 'Private lesson';
            showSuccess(`${lessonType} booked for ${pName}${lessonSuffix}!`);
          }
        }
      }

      // Save participants to recent customers in localStorage
      try {
        const prev = JSON.parse(localStorage.getItem('plannivo_recent_customers') || '[]');
        const currentIds = (formData.participants || []).map(p => ({ id: p.userId, name: p.userName }));
        const merged = [...currentIds, ...prev.filter(r => !currentIds.some(c => c.id === r.id))].slice(0, 5);
        localStorage.setItem('plannivo_recent_customers', JSON.stringify(merged));
      } catch { /* ignore */ }

      onBookingCreated?.(response);
      handleClose(true);
    } catch (error) {
      if (error.status === 400 || error.message?.includes('conflict')) {
        setConflictWarning({ message: error.details?.message || error.message || 'Time slot conflict detected', suggestions: error.details?.suggestedSlots || [] });
        setShowReview(false);
        return;
      }
      if (error.message?.includes('wallet')) {
        showError(`Payment failed: ${error.message}`);
        return;
      }
      showError(error.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, services, allUserPackages, selectedDuration, validateStep, createBooking, updateFormData, showSuccess, showError, showInfo, isInstructorBooker, onBookingCreated, getLessonParticipantPackage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close handler ───────────────────────────────────────────────
  const handleClose = useCallback((force = false) => {
    if (hasUnsavedChanges && !force) {
      modal.confirm({
        title: 'Unsaved changes',
        content: 'You have unsaved changes. Close anyway?',
        okText: 'Close',
        cancelText: 'Keep editing',
        onOk: () => { resetFormData(); onClose(); }
      });
      return;
    }
    resetFormData();
    onClose();
  }, [hasUnsavedChanges, resetFormData, onClose]);

  // ── Effective total (accounts for package usage, summed across all lessons) ─
  const totalBookingHours = useMemo(() => {
    return totalLessonHours > 0 ? totalLessonHours : getBookingDuration();
  }, [totalLessonHours, getBookingDuration]);

  // Per-lesson, per-participant breakdown. Simulates package depletion lesson-by-lesson
  // so a 4h package + 3 × 2h lessons correctly shows 4h covered + 2h on the wallet.
  const lessonBreakdown = useMemo(() => {
    const svc = (services || []).find(s => s.id === formData.serviceId);
    const hourlyRate = svc?.price || 0;
    const participants = formData.participants || [];

    // Snapshot remaining hours per participant per package
    const remaining = {};
    for (const p of participants) {
      remaining[p.userId] = {};
      for (const pkg of (allUserPackages[p.userId] || [])) {
        remaining[p.userId][pkg.id] = Number(pkg.remaining_hours || pkg.remainingHours || 0);
      }
    }

    const lessonsBreakdown = [];
    let grandTotal = 0;
    const perParticipantWalletCost = {};

    for (let lIdx = 0; lIdx < allLessons.length; lIdx++) {
      const l = allLessons[lIdx];
      const sM = timeStringToMinutes(l.startTime);
      const eM = timeStringToMinutes(l.endTime);
      const hrs = (sM !== null && eM !== null && eM > sM) ? (eM - sM) / 60 : 0;

      const pBreakdown = [];
      let lessonWalletCost = 0;
      let lessonPkgHours = 0;

      for (const p of participants) {
        const pkgId = getLessonParticipantPackage(lIdx, p.userId);
        const pkgs = allUserPackages[p.userId] || [];
        const pkg = pkgId ? pkgs.find(x => x.id === pkgId) : null;
        let fromPkg = 0;
        let fromWallet = hrs;
        if (pkg && remaining[p.userId]) {
          const avail = remaining[p.userId][pkgId] || 0;
          fromPkg = Math.min(hrs, avail);
          fromWallet = hrs - fromPkg;
          remaining[p.userId][pkgId] = Math.max(0, avail - fromPkg);
        }
        const walletCost = fromWallet * hourlyRate;
        lessonWalletCost += walletCost;
        lessonPkgHours += fromPkg;
        grandTotal += walletCost;
        perParticipantWalletCost[p.userId] = (perParticipantWalletCost[p.userId] || 0) + walletCost;
        pBreakdown.push({
          userId: p.userId,
          userName: p.userName,
          pkgId,
          pkgName: pkg?.package_name || pkg?.packageName || null,
          fromPkg,
          fromWallet,
          walletCost,
        });
      }

      lessonsBreakdown.push({ lesson: l, lessonHrs: hrs, participants: pBreakdown, lessonWalletCost, lessonPkgHours });
    }

    return {
      lessons: lessonsBreakdown,
      grandTotal: Number(grandTotal.toFixed(2)),
      perParticipantWalletCost,
      packageRemainingAfter: remaining, // package hours after all lessons
    };
  }, [allLessons, formData.participants, formData.serviceId, services, allUserPackages, getLessonParticipantPackage]);

  // Wallet-side total cost for the whole booking series
  const effectiveTotal = lessonBreakdown.grandTotal;

  // Per-participant single-lesson cost (used by the "wallet payer" badge in review)
  const perPersonCost = useMemo(() => {
    if (!formData.serviceId || !formData.participants?.length) return 0;
    const svc = (services || []).find(s => s.id === formData.serviceId);
    if (!svc) return 0;
    return svc.price * totalBookingHours;
  }, [formData.serviceId, formData.participants, services, totalBookingHours]);

  // ── Filtered instructors ────────────────────────────────────────
  const filteredInstructors = useMemo(() => {
    const q = instructorSearch.toLowerCase();
    if (!q) return instructors || [];
    return (instructors || []).filter(i => (i.name || '').toLowerCase().includes(q));
  }, [instructors, instructorSearch]);

  // ── Slot availability helpers ───────────────────────────────────
  const isSlotAvailable = useCallback((time) => {
    if (!availableSlots.length) return true;
    // Check that the full duration fits from this start time
    const required = buildRequiredSlotTimes(time, selectedDuration);
    return required.every(t => {
      const match = availableSlots.find(s => s.time === t);
      return match ? match.status === 'available' : true;
    });
  }, [availableSlots, selectedDuration]);

  // ── Allowed durations ───────────────────────────────────────────
  const allowedDurations = bookingDefaults?.allowedDurations || [60, 90, 120, 150, 180, 240];

  // ── Formatting ──────────────────────────────────────────────────
  const formatPrice = useCallback((price) => formatCurrency(price || 0, businessCurrency), [formatCurrency, businessCurrency]);


  const instructorOptions = useMemo(() =>
    filteredInstructors.map(i => ({ value: i.name, label: i.name, key: i.id, instructor: i })),
    [filteredInstructors]
  );
  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  const hasCustomer = formData.participants?.length > 0;
  const hasInstructor = !!formData.instructorId;
  const hasSchedule = !!(formData.date && formData.startTime && formData.endTime && formData.instructorId);
  const hasService = !!formData.serviceId;
  const anyPackageSelected = (formData.participants || []).some(p => p.usePackage && p.selectedPackageId);
  const canReview = hasCustomer && hasSchedule && hasService;

  // Step-gate validation message
  const validationMessage = useMemo(() => {
    if (!hasCustomer) return 'Select at least one customer';
    if (!hasInstructor) return 'Select an instructor';
    if (!formData.date) return 'Pick a date';
    if (!formData.startTime) return 'Pick a time slot';
    const incompleteExtra = (formData.extraLessons || []).findIndex(l => !l.date || !l.startTime || !l.endTime);
    if (incompleteExtra !== -1) return `Complete lesson ${incompleteExtra + 2} (date & time)`;
    if (!hasService) return 'Select a service or package';
    return null;
  }, [hasCustomer, hasInstructor, hasService, formData.date, formData.startTime, formData.extraLessons]);

  // beforeunload guard
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isOpen, hasUnsavedChanges]);

  // Progressive disclosure: determine which section is currently active
  const activeSection = (() => {
    if (!hasCustomer) return 'customer';
    if (!hasInstructor) return 'instructor';
    if (!hasSchedule) return 'schedule';
    return 'package'; // package or service
  })();

  return (
    <Drawer
      open={isOpen}
      onClose={() => handleClose(false)}
      placement="right"
      width={typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : 520}
      closable={false}
      destroyOnHidden
      styles={{ body: { padding: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }, header: { display: 'none' } }}
    >
      {/* ── Title Bar ── */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-base font-semibold text-slate-800 m-0">New Booking</h2>
        <button type="button" onClick={() => handleClose(false)} className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 border-0 cursor-pointer transition-colors text-sm bg-transparent">✕</button>
      </div>

      {/* ── Body ── */}
      <div>
        <div className="divide-y divide-slate-100">

          {/* ═══ 1. CUSTOMER ═══ */}
          <SectionErrorBoundary section="Customer">
          <div className="px-5 py-3">
            {/* Collapsed summary */}
            {hasCustomer && !customerSectionExpanded ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircleFilled className="text-green-500 text-sm shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{(formData.participants || []).map(p => p.userName).join(', ')}</span>
                </div>
                <button type="button" onClick={() => setCustomerSectionExpanded(true)} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium bg-transparent border-0 cursor-pointer">Edit</button>
              </div>
            ) : (
              /* Expanded */
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5">Customer</div>
                <div className="flex gap-2">
                  <Select
                    mode="multiple"
                    showSearch
                    placeholder="Search or select customers…"
                    value={(formData.participants || []).map(p => p.userId)}
                    onChange={handleCustomerChange}
                    onSearch={setCustomerSearchQuery}
                    filterOption={false}
                    loading={customerSearching}
                    notFoundContent={customerSearching ? <Spin size="small" /> : 'No customers found'}
                    options={customerOptions}
                    className="flex-1 [&_.ant-select-selector]:!min-h-[38px] [&_.ant-select-selection-item]:!text-sm [&_.ant-select-selection-placeholder]:!text-sm"
                    maxTagCount="responsive"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUserModal(true)}
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors shrink-0"
                  >+ New</button>
                </div>

                {formData.participants?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {formData.participants.map(p => (
                      <div key={p.userId} className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                        <UserOutlined className="text-[10px]" />
                        <span className="font-medium">{p.userName}</span>
                        {p.isPrimary && <span className="text-[9px] text-blue-500">★</span>}
                      </div>
                    ))}
                  </div>
                )}

                {recentCustomers.length > 0 && formData.participants?.length === 0 && (
                  <div className="mt-3">
                    <span className="text-[10px] text-slate-400 font-medium">Recent</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {recentCustomers.map(rc => (
                        <button
                          key={rc.id}
                          type="button"
                          onClick={() => {
                            const currentIds = (formData.participants || []).map(p => p.userId);
                            if (!currentIds.includes(rc.id)) handleCustomerChange([...currentIds, rc.id]);
                          }}
                          className="px-2 py-0.5 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                        >{rc.name}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          </SectionErrorBoundary>

          {/* ═══ 2. INSTRUCTOR ═══ */}
          {hasCustomer && (
            <SectionErrorBoundary section="Instructor">
            <div className="px-5 py-3">
              {/* Collapsed summary */}
              {hasInstructor && activeSection !== 'instructor' && !slotPreFilled ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircleFilled className="text-green-500 text-sm shrink-0" />
                    <span className="text-sm text-slate-700">{formData.instructorName}</span>
                  </div>
                  <button type="button" onClick={() => { updateFormData({ instructorId: '', instructorName: '', date: '', startTime: '', endTime: '' }); setInstructorSearch(''); }} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium bg-transparent border-0 cursor-pointer">Edit</button>
                </div>
              ) : (
                /* Expanded */
                <>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5">Instructor</div>
                  <AutoComplete
                    value={instructorSearch}
                    options={instructorOptions}
                    onSearch={setInstructorSearch}
                    onSelect={(_, option) => handleInstructorSelect(option.instructor)}
                    placeholder="Search instructor…"
                    className="w-full [&_input]:!text-sm [&_input]:!py-1.5 [&_input]:!px-3"
                    popupMatchSelectWidth
                    allowClear
                    onClear={() => { setInstructorSearch(''); updateFormData({ instructorId: '', instructorName: '' }); }}
                  />
                </>
              )}
            </div>
            </SectionErrorBoundary>
          )}

          {/* ═══ 3. DATE / TIME / DURATION ═══ */}
          {hasInstructor && (
            <SectionErrorBoundary section="Schedule">
            <div className="px-5 py-3">
              {/* Collapsed summary */}
              {hasSchedule && !scheduleSectionExpanded && !slotPreFilled ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircleFilled className="text-green-500 text-sm shrink-0" />
                    {(formData.extraLessons?.length || 0) === 0 ? (
                      <span className="text-sm text-slate-700">{dayjs(formData.date).format('ddd, MMM D')} · {formData.startTime}–{formData.endTime} ({getBookingDuration()}h)</span>
                    ) : (
                      <span className="text-sm text-slate-700 truncate">{1 + formData.extraLessons.length} lessons · {totalLessonHours}h total</span>
                    )}
                  </div>
                  <button type="button" onClick={() => setScheduleSectionExpanded(true)} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium bg-transparent border-0 cursor-pointer">Edit</button>
                </div>
              ) : (
                /* Expanded */
                <>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Duration, Date & Time</div>
                    {(formData.extraLessons?.length || 0) > 0 && (
                      <span className="text-[10px] text-slate-400">Lesson 1 of {1 + formData.extraLessons.length}</span>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Duration</label>
                      <div className="flex flex-wrap gap-1.5">
                        {allowedDurations.map(d => (
                          <button key={d} type="button" onClick={() => handleDurationChange(d)} className={`px-3.5 py-1 text-sm rounded-lg border font-medium transition-all ${selectedDuration === d ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>{d / 60}h</button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <label className="text-xs font-medium text-slate-500">Date</label>
                          <button type="button" onClick={() => { updateFormData({ date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'), startTime: '', endTime: '' }); setConflictWarning(null); }} className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${formData.date === dayjs().subtract(1, 'day').format('YYYY-MM-DD') ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>Yest</button>
                          <button type="button" onClick={() => { updateFormData({ date: dayjs().format('YYYY-MM-DD'), startTime: '', endTime: '' }); setConflictWarning(null); }} className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${formData.date === dayjs().format('YYYY-MM-DD') ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>Today</button>
                          <button type="button" onClick={() => { updateFormData({ date: dayjs().add(1, 'day').format('YYYY-MM-DD'), startTime: '', endTime: '' }); setConflictWarning(null); }} className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${formData.date === dayjs().add(1, 'day').format('YYYY-MM-DD') ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>Tmrw</button>
                        </div>
                        <input type="date" value={formData.date || ''} onChange={e => { updateFormData({ date: e.target.value, startTime: '', endTime: '' }); setConflictWarning(null); }} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Time</label>
                        {formData.date && formData.instructorId ? (
                          loadingSlots ? (
                            <div className="flex items-center gap-2 text-sm text-slate-400 py-1.5"><Spin size="small" /> Loading…</div>
                          ) : (
                            <select value={formData.startTime || ''} onChange={e => handleStartTimeSelect(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400">
                              <option value="">Select time…</option>
                              {ALL_TIME_SLOTS.map(t => { const avail = isSlotAvailable(t); return <option key={t} value={t} disabled={!avail}>{t}{!avail ? ' ✗' : ''}</option>; })}
                            </select>
                          )
                        ) : (
                          <select disabled className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-400">
                            <option>Pick date first</option>
                          </select>
                        )}
                      </div>
                    </div>

                    {conflictWarning && (
                      <Alert
                        type="warning"
                        showIcon
                        message={<span className="text-sm">{conflictWarning.message}</span>}
                        description={conflictWarning.suggestions?.length > 0 ? (
                          <div className="mt-1.5 space-y-1">
                            {conflictWarning.suggestions.map(s => (
                              <button key={s.startTime} onClick={() => { handleStartTimeSelect(s.startTime); setConflictWarning(null); }} className="block w-full text-left px-3 py-1.5 text-sm bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors">
                                {s.startTime}–{s.endTime} ({s.duration}h)
                              </button>
                            ))}
                          </div>
                        ) : null}
                        className="text-sm [&_.ant-alert-message]:!mb-0 !rounded-lg"
                      />
                    )}

                    {/* Extra lessons */}
                    {(formData.extraLessons || []).map((lesson, idx) => (
                      <div key={idx} className="pt-3 border-t border-dashed border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lesson {idx + 2}</span>
                          <button type="button" onClick={() => removeExtraLesson(idx)} className="text-[11px] text-rose-500 hover:text-rose-700 font-medium bg-transparent border-0 cursor-pointer">Remove</button>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Duration</label>
                          <div className="flex flex-wrap gap-1.5">
                            {allowedDurations.map(d => (
                              <button key={d} type="button" onClick={() => updateExtraLesson(idx, { duration: d })} className={`px-3.5 py-1 text-sm rounded-lg border font-medium transition-all ${lesson.duration === d ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>{d / 60}h</button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                            <input type="date" value={lesson.date || ''} onChange={e => updateExtraLesson(idx, { date: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Time</label>
                            <select value={lesson.startTime || ''} onChange={e => updateExtraLesson(idx, { startTime: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400">
                              <option value="">Select time…</option>
                              {ALL_TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Add another lesson */}
                    <button
                      type="button"
                      onClick={addExtraLesson}
                      className="w-full mt-1 px-3 py-2 text-sm font-medium text-blue-600 border border-dashed border-blue-300 bg-blue-50/50 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-colors"
                    >+ Add another lesson</button>

                    {totalLessonHours > 0 && (formData.extraLessons?.length || 0) > 0 && (
                      <div className="text-[11px] text-slate-500 text-right">Total: {totalLessonHours}h across {1 + formData.extraLessons.length} lessons</div>
                    )}

                    {hasSchedule && !slotPreFilled && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setScheduleSectionExpanded(false)}
                          className="px-3 py-1 text-[11px] font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                        >Done — continue ↓</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            </SectionErrorBoundary>
          )}

          {/* ═══ 4. PACKAGE / SERVICE ═══ */}
          {hasSchedule && (
            <SectionErrorBoundary section="Package & Service">
            <div className="px-5 py-3">
              {/* Package section */}
              {formData.participants?.length > 0 && (() => {
                const anyPkgs = formData.participants.some(p => (allUserPackages[p.userId] || []).length > 0);
                if (!anyPkgs) return null;
                return (
                  <>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Package</div>
                      <AssignPackageDropdown
                        participants={formData.participants}
                        allPkgs={allUserPackages}
                        onSelect={(p) => setAssignPkgUser({ id: p.userId, name: p.userName, email: p.userEmail })}
                      />
                    </div>

                    <div className="space-y-2.5">
                      {formData.participants.map((participant, idx) => {
                        const pkgs = allUserPackages[participant.userId] || [];
                        if (pkgs.length === 0) return null;
                        return (
                          <div key={participant.userId}>
                            {formData.participants.length > 1 && (
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <UserOutlined className="text-slate-400 text-[10px]" />
                                <span className="font-medium text-xs text-slate-600">{participant.userName}</span>
                                {participant.isPrimary && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Primary</span>}
                              </div>
                            )}

                            <div className="space-y-1">
                              {/* Wallet option */}
                              <div
                                onClick={() => handleFormPackageSelect(idx, null)}
                                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-all text-sm ${!participant.selectedPackageId ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                              >
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${!participant.selectedPackageId ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>€</span>
                                <span className="flex-1 text-sm text-slate-700">
                                  Wallet
                                  {userBalances[participant.userId] !== undefined && (
                                    <span className="ml-1 text-xs text-slate-400">{formatPrice(userBalances[participant.userId])}</span>
                                  )}
                                </span>
                                {!participant.selectedPackageId && <CheckCircleFilled className="text-blue-500 text-sm" />}
                              </div>

                              {/* Package options */}
                              {pkgs.map(pkg => {
                                const { remainingHours, totalHours, lessonType, expiryDate, usagePercent } = formatPackageDetails(pkg);
                                const isSelected = participant.selectedPackageId === pkg.id;
                                const expiring = isExpiringSoon(expiryDate);
                                return (
                                  <div
                                    key={pkg.id}
                                    onClick={() => handleFormPackageSelect(idx, pkg.id)}
                                    className={`rounded-lg border px-2.5 py-2 cursor-pointer transition-all ${isSelected ? 'border-green-400 bg-green-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-green-500 text-white' : 'bg-purple-100 text-purple-600'}`}>
                                        <TagOutlined className="text-[10px]" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <span className="text-sm font-medium text-slate-700 truncate">{pkg.package_name || pkg.packageName}</span>
                                          {lessonType && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600">{lessonType}</span>}
                                          {expiring && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-50 text-orange-600">Exp.</span>}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span className="text-[11px] text-slate-400">{remainingHours.toFixed(1)}/{totalHours.toFixed(1)}h</span>
                                          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${usagePercent > 50 ? 'bg-green-400' : usagePercent > 20 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${usagePercent}%` }} />
                                          </div>
                                          {expiryDate && <span className="text-[10px] text-slate-400">{dayjs(expiryDate).format('MM/DD')}</span>}
                                        </div>
                                      </div>
                                      {isSelected && <CheckCircleFilled className="text-green-500 shrink-0 text-sm" />}
                                    </div>
                                  </div>
                                );
                              })}

                              {participant.selectedPackageId && (() => {
                                const selPkg = pkgs.find(pk => pk.id === participant.selectedPackageId);
                                const remaining = Number(selPkg?.remaining_hours || selPkg?.remainingHours || 0);
                                const dur = totalBookingHours;
                                const after = Math.max(0, remaining - dur);
                                return (
                                  <>
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50/60 rounded text-[11px] text-green-700">
                                      <CheckCircleFilled className="text-[10px]" /> {Math.min(remaining, dur)}h deducted → {after.toFixed(1)}h left
                                    </div>
                                    {remaining < dur && (() => {
                                      const svc = (services || []).find(s => s.id === formData.serviceId);
                                      const spillover = dur - remaining;
                                      const spillCost = spillover * (svc?.price || 0);
                                      return (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50/60 rounded text-[11px] text-amber-700">
                                          <ExclamationCircleOutlined className="text-[10px]" /> {spillover}h ({formatPrice(spillCost)}) from wallet
                                        </div>
                                      );
                                    })()}
                                    {formData.serviceName && (
                                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/60 rounded text-[11px] text-blue-600">
                                        <CheckCircleOutlined className="text-[10px]" /> Service: {formData.serviceName}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              {/* Per-lesson package overrides (only when there's more than 1 lesson and someone has packages) */}
              {allLessons.length > 1 && formData.participants?.some(p => (allUserPackages[p.userId] || []).length > 0) && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Per-lesson packages</div>
                    <span className="text-[10px] text-slate-400">override defaults</span>
                  </div>
                  <div className="space-y-2.5">
                    {lessonBreakdown.lessons.map(({ lesson, lessonHrs, participants: pList }, lIdx) => (
                      <div key={lIdx} className="rounded-lg border border-slate-200 p-2.5 bg-slate-50/40">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-slate-600">Lesson {lIdx + 1}</span>
                          <span className="text-[11px] text-slate-500">{dayjs(lesson.date).format('MMM D')} · {lesson.startTime}–{lesson.endTime} ({lessonHrs}h)</span>
                        </div>
                        <div className="space-y-1.5">
                          {(formData.participants || []).map((p) => {
                            const pkgs = allUserPackages[p.userId] || [];
                            if (pkgs.length === 0) return null;
                            const effectivePkgId = getLessonParticipantPackage(lIdx, p.userId);
                            const breakdown = pList.find(x => x.userId === p.userId);
                            return (
                              <div key={p.userId}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] text-slate-500 w-20 truncate">{p.userName}</span>
                                  <button
                                    type="button"
                                    onClick={() => setLessonParticipantPackage(lIdx, p.userId, null)}
                                    className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${effectivePkgId === null ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
                                  >Wallet</button>
                                  {pkgs.map(pkg => {
                                    // Compute remaining at this lesson's point
                                    let rem = Number(pkg.remaining_hours || pkg.remainingHours || 0);
                                    for (let i = 0; i < lIdx; i++) {
                                      const otherPkgId = getLessonParticipantPackage(i, p.userId);
                                      if (otherPkgId === pkg.id) {
                                        const ol = allLessons[i];
                                        const sM = timeStringToMinutes(ol.startTime);
                                        const eM = timeStringToMinutes(ol.endTime);
                                        if (sM !== null && eM !== null && eM > sM) rem -= (eM - sM) / 60;
                                      }
                                    }
                                    rem = Math.max(0, rem);
                                    const isSel = effectivePkgId === pkg.id;
                                    return (
                                      <button
                                        key={pkg.id}
                                        type="button"
                                        onClick={() => setLessonParticipantPackage(lIdx, p.userId, pkg.id)}
                                        className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${isSel ? 'bg-green-500 text-white border-green-500' : rem === 0 ? 'bg-rose-50 text-rose-500 border-rose-200' : 'bg-white text-slate-600 border-slate-200 hover:border-green-300'}`}
                                        title={`${pkg.package_name || pkg.packageName} · ${rem.toFixed(1)}h available`}
                                      >📦 {pkg.package_name || pkg.packageName} ({rem.toFixed(1)}h)</button>
                                    );
                                  })}
                                </div>
                                {breakdown && breakdown.fromWallet > 0 && breakdown.fromPkg > 0 && (
                                  <div className="text-[10px] text-amber-600 ml-[5.25rem] mt-0.5">⚠ Spillover: {breakdown.fromWallet}h from wallet</div>
                                )}
                                {breakdown && breakdown.fromWallet > 0 && breakdown.fromPkg === 0 && effectivePkgId !== null && (
                                  <div className="text-[10px] text-rose-600 ml-[5.25rem] mt-0.5">⚠ Package empty — falls back to wallet</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Service section (only when no package selected) */}
              {!anyPackageSelected && (
                <>
                  <div className={`flex items-center justify-between mb-2.5 ${formData.participants?.some(p => (allUserPackages[p.userId] || []).length > 0) ? 'mt-4 pt-3 border-t border-slate-100' : ''}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Service</div>
                    {isGroupBooking && (
                      <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">👥 {formData.participants.length} participants</span>
                    )}
                  </div>

                  <div className="relative mb-2.5">
                    <SearchOutlined className="absolute left-3 top-2 text-slate-400 text-xs" />
                    <input type="text" placeholder="Search services…" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400" />
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {groupedServices.length > 0 ? groupedServices.map(({ category: grpCat, services: svcs }) => (
                      <div key={grpCat}>
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-300 mb-1 capitalize">{grpCat}</div>
                        <div className="space-y-1">
                          {svcs.map(svc => {
                            const isSelected = formData.serviceId === svc.id;
                            const dur = totalBookingHours;
                            const price = computeBookingPrice({ plannedHours: dur, hourlyRate: svc.price, packageHoursAvailable: 0, step: 0.25, participants: isGroupBooking ? formData.participants.length : 1 });
                            const hasMatchingPkg = pkgMatchSet.has(svc.id);
                            return (
                              <div key={svc.id} onClick={() => handleServiceSelect(svc)} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all text-sm ${isSelected ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span className={`font-medium truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{svc.name}</span>
                                  {hasMatchingPkg && <span className="shrink-0 px-1 py-0.5 text-[10px] font-semibold bg-green-50 text-green-600 border border-green-200 rounded">📦</span>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-sm font-semibold ${isSelected ? 'text-blue-600' : 'text-slate-600'}`}>{formatPrice(price)}</span>
                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                                    {isSelected && <CheckCircleOutlined className="text-white text-[8px]" />}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-6 text-slate-400 text-sm">
                        {serviceSearch ? `No services matching "${serviceSearch}".` : isGroupBooking ? `No group services for ${participantCount}.` : 'No services available.'}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            </SectionErrorBoundary>
          )}

        </div>
      </div>

      {/* ── Footer ── */}
      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-5 py-3">
        {validationMessage && (
          <p className="text-xs text-amber-600 mb-2 flex items-center gap-1"><ExclamationCircleOutlined className="text-[11px]" /> {validationMessage}</p>
        )}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => handleClose(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">Cancel</button>
          <button
            type="button"
            onClick={() => setShowReview(true)}
            disabled={!canReview}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >Review →</button>
        </div>
      </div>

      {/* ═══ REVIEW OVERLAY DRAWER ═══ */}
      <Drawer
        open={showReview}
        onClose={() => setShowReview(false)}
        placement="right"
        width={typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : 520}
        closable={false}
        styles={{ body: { padding: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }, header: { display: 'none' } }}
      >
        {/* Review Header */}
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800 m-0">Confirm Booking</h2>
            <button type="button" onClick={() => setShowReview(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 border-0 cursor-pointer transition-colors text-base">✕</button>
          </div>
        </div>

        {/* Review Body */}
        <div>
          <div className="px-5 py-4 space-y-4">
            {/* Review table */}
            <div className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">Customer</span>
                <span className="font-medium text-slate-700 text-right max-w-[60%] truncate">{(formData.participants || []).map(p => p.userName).join(', ')}</span>
              </div>
              {allLessons.length > 1 && (
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Schedule</span>
                  <span className="font-medium text-slate-700">{allLessons.length} lessons · {totalLessonHours}h total</span>
                </div>
              )}
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">Instructor</span>
                <span className="font-medium text-slate-700">{formData.instructorName || '—'}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">Service</span>
                <span className="font-medium text-slate-700">{formData.serviceName || '—'}</span>
              </div>
              {/* Per-lesson breakdown */}
              {lessonBreakdown.lessons.map(({ lesson, lessonHrs, participants: pList, lessonWalletCost }, lIdx) => (
                <div key={lIdx} className="py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-500 font-medium">{allLessons.length > 1 ? `Lesson ${lIdx + 1}: ` : ''}{dayjs(lesson.date).format('MMM D')} · {lesson.startTime}–{lesson.endTime}</span>
                    <span className="text-xs text-slate-400">{lessonHrs}h</span>
                  </div>
                  <div className="pl-3 space-y-0.5">
                    {pList.map(b => (
                      <div key={b.userId} className="flex items-center justify-between text-[12px]">
                        <span className="text-slate-500 truncate flex-1 pr-2">{b.userName}</span>
                        <span className="text-right">
                          {b.fromPkg > 0 && (
                            <span className="text-green-700">📦 {b.fromPkg}h{b.pkgName ? ` · ${b.pkgName}` : ''}</span>
                          )}
                          {b.fromPkg > 0 && b.fromWallet > 0 && <span className="text-slate-400 mx-1">+</span>}
                          {b.fromWallet > 0 && (
                            <span className={b.fromPkg > 0 ? 'text-amber-600' : 'text-blue-700'}>💰 {b.fromWallet}h ({formatPrice(b.walletCost)})</span>
                          )}
                          {b.fromPkg === 0 && b.fromWallet === 0 && <span className="text-slate-400">—</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  {pList.length > 1 && lessonWalletCost > 0 && (
                    <div className="flex justify-end text-[11px] text-slate-500 mt-0.5">Lesson subtotal: {formatPrice(lessonWalletCost)}</div>
                  )}
                </div>
              ))}
              <div className="py-3 flex justify-between items-center bg-slate-50 -mx-5 px-5 rounded-lg mt-2">
                <span className="text-slate-600 font-semibold">Total (wallet)</span>
                <span className="text-lg font-bold text-slate-900">{formatPrice(effectiveTotal)}</span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label>
              <textarea
                rows={2}
                value={formData.notes || ''}
                onChange={e => updateFormData({ notes: e.target.value })}
                placeholder="Add any notes for this booking…"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              />
            </div>

            {/* Negative balance */}
            {(() => {
              const walletPayers = (formData.participants || []).filter(p => !p.usePackage || !p.selectedPackageId);
              const anyInsufficient = walletPayers.some(p => (userBalances[p.userId] ?? Infinity) < perPersonCost);
              if (!anyInsufficient && !formData.allowNegativeBalance) return null;
              return (
                <div className="border border-amber-200 rounded-lg p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={formData.allowNegativeBalance === true}
                      onChange={e => updateFormData({ allowNegativeBalance: e.target.checked })}
                    />
                    <span className="text-slate-700">Allow negative wallet balance</span>
                  </label>
                  {formData.allowNegativeBalance && (
                    <Alert type="warning" showIcon message="Participants may accumulate debt." className="text-sm [&_.ant-alert-message]:!mb-0 !rounded-lg" />
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Review Footer */}
        <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setShowReview(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">← Back</button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >{isSubmitting ? 'Booking…' : '✓ Confirm Booking'}</button>
          </div>
        </div>
      </Drawer>

      {/* ═══ MODALS ═══ */}
      <Modal title="Add New Customer" open={showNewUserModal} onCancel={() => setShowNewUserModal(false)} footer={null} width={480} destroyOnHidden>
        <UserForm onSuccess={handleUserCreated} onCancel={() => setShowNewUserModal(false)} />
      </Modal>

      {assignPkgUser && (
        <CustomerPackageManager
          visible={!!assignPkgUser}
          onClose={() => setAssignPkgUser(null)}
          customer={assignPkgUser}
          startAssignFlow
          onPackageAssigned={() => {
            const userId = assignPkgUser.id;
            setAssignPkgUser(null);
            setUserPackages(prev => { const copy = { ...prev }; delete copy[userId]; return copy; });
            setAllUserPackages(prev => { const copy = { ...prev }; delete copy[userId]; return copy; });
          }}
        />
      )}
    </Drawer>
  );
};

export default BookingDrawer;
