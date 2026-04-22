import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon, BookmarkIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/24/solid';
import { useAuth } from '@/shared/hooks/useAuth';

// ── Role-specific default quick-action buttons ──────────────────────────────
const ROLE_BUTTONS = {
  outsider: [
    { label: 'Lessons?', message: 'What lessons do you offer?' },
    { label: 'Prices', message: 'What are your lesson prices?' },
    { label: 'How to book?', message: 'How do I book a lesson?' },
    { label: 'Location', message: 'Where are you located?' },
  ],
  student: [
    { label: 'Next lesson', message: 'Show my next lesson' },
    { label: 'My packages', message: 'Check my package balance' },
    { label: 'Wallet', message: 'Check my wallet balance' },
    { label: 'Book lesson', message: 'I want to book a lesson' },
    { label: 'Reschedule', message: 'I want to reschedule a lesson' },
  ],
  trusted_customer: [
    { label: 'Next lesson', message: 'Show my next lesson' },
    { label: 'My packages', message: 'Check my package balance' },
    { label: 'Wallet', message: 'Check my wallet balance' },
    { label: 'Book lesson', message: 'I want to book a lesson' },
    { label: 'Reschedule', message: 'I want to reschedule a lesson' },
  ],
  instructor: [
    { label: "Today's schedule", message: "Show today's schedule" },
    { label: 'My students', message: 'Show my students' },
    { label: 'Wind today', message: "What's the wind forecast today?" },
    { label: 'Add note', message: 'I want to add a note for a student' },
  ],
  manager: [
    { label: "Today's bookings", message: "Show today's bookings" },
    { label: 'Search customer', message: 'I want to search for a customer' },
    { label: "Revenue today", message: "What's today's revenue?" },
    { label: 'Send notification', message: 'I want to send a notification' },
  ],
  admin: [
    { label: "Today's bookings", message: "Show today's bookings" },
    { label: 'Search customer', message: 'I want to search for a customer' },
    { label: "Revenue today", message: "What's today's revenue?" },
    { label: 'Create booking', message: 'I want to create a booking' },
    { label: 'Send notification', message: 'I want to send a notification' },
  ],
};

const MAX_CUSTOM = 5;
const MAX_SAVED = 20;

function storageKey(prefix, userId) {
  return `${prefix}_${userId || 'guest'}`;
}

function loadFromStorage(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function saveToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── KaiQuickActions ──────────────────────────────────────────────────────────
export default function KaiQuickActions({ onSend, disabled }) {
  const { t } = useTranslation(['common']);
  const { user } = useAuth();
  const userId = user?.id || 'guest';
  const role = user?.role?.toLowerCase() || 'outsider';

  const customKey = storageKey('kai_custom_buttons', userId);
  const savedKey  = storageKey('kai_saved_messages', userId);

  const [customButtons, setCustomButtons] = useState(() => loadFromStorage(customKey));
  const [savedMessages, setSavedMessages] = useState(() => loadFromStorage(savedKey));

  // Add-custom-button panel state
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newLabel, setNewLabel]   = useState('');
  const [newMessage, setNewMessage] = useState('');

  // Saved-messages dropdown state
  const [showSaved, setShowSaved] = useState(false);
  const savedRef   = useRef(null);
  const addPanelRef = useRef(null);

  // Persist whenever state changes
  useEffect(() => { saveToStorage(customKey, customButtons); }, [customButtons, customKey]);
  useEffect(() => { saveToStorage(savedKey, savedMessages); }, [savedMessages, savedKey]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (savedRef.current && !savedRef.current.contains(e.target)) setShowSaved(false);
      if (addPanelRef.current && !addPanelRef.current.contains(e.target)) setShowAddPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const send = useCallback((msg) => {
    if (!msg?.trim() || disabled) return;
    onSend(msg);
    setShowSaved(false);
  }, [onSend, disabled]);

  const addCustomButton = useCallback(() => {
    if (!newLabel.trim() || !newMessage.trim()) return;
    if (customButtons.length >= MAX_CUSTOM) return;
    setCustomButtons((prev) => [...prev, { label: newLabel.trim(), message: newMessage.trim() }]);
    setNewLabel('');
    setNewMessage('');
    setShowAddPanel(false);
  }, [newLabel, newMessage, customButtons]);

  const removeCustomButton = useCallback((idx) => {
    setCustomButtons((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const removeSavedMessage = useCallback((idx) => {
    setSavedMessages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const defaults = ROLE_BUTTONS[role] || ROLE_BUTTONS.outsider;
  const hasSaved = savedMessages.length > 0;

  return (
    <div className="relative flex-shrink-0 bg-slate-50 border-t border-gray-100">

      {/* ── Add custom button panel ─────────────────────────────────────────── */}
      {showAddPanel && (
        <div ref={addPanelRef}
          className="absolute bottom-full left-0 right-0 z-10 bg-white border border-gray-200 shadow-lg rounded-t-xl p-3 mx-2 mb-0.5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('common:chat.addQuickButton')}</p>
          <input
            type="text"
            placeholder={t('common:chat.buttonLabel')}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            maxLength={24}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg mb-1.5 outline-none focus:border-duotone-blue/40 focus:ring-1 focus:ring-duotone-blue/20"
          />
          <input
            type="text"
            placeholder={t('common:chat.buttonMessage')}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            maxLength={200}
            onKeyDown={(e) => { if (e.key === 'Enter') addCustomButton(); }}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg mb-2 outline-none focus:border-duotone-blue/40 focus:ring-1 focus:ring-duotone-blue/20"
          />
          <div className="flex gap-2">
            <button onClick={addCustomButton} disabled={!newLabel.trim() || !newMessage.trim() || customButtons.length >= MAX_CUSTOM}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-duotone-blue text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-[#008da6] transition-colors">
              <CheckIcon className="w-3.5 h-3.5" /> {t('common:buttons.save')}
            </button>
            <button onClick={() => setShowAddPanel(false)}
              className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              {t('common:buttons.cancel')}
            </button>
          </div>
          {customButtons.length >= MAX_CUSTOM && (
            <p className="text-[10px] text-gray-400 mt-1 text-center">{t('common:chat.maxButtons', { count: MAX_CUSTOM })}</p>
          )}
        </div>
      )}

      {/* ── Saved messages dropdown ─────────────────────────────────────────── */}
      {showSaved && hasSaved && (
        <div ref={savedRef}
          className="absolute bottom-full left-0 z-10 w-72 bg-white border border-gray-200 shadow-lg rounded-xl mb-0.5 ml-2 overflow-hidden max-h-52 overflow-y-auto">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2.5 pb-1">{t('common:chat.savedMessagesTitle')}</p>
          {savedMessages.map((msg, i) => (
            <div key={i} className="flex items-center group hover:bg-slate-50 border-t border-gray-100 first:border-t-0">
              <button onClick={() => send(msg)}
                className="flex-1 text-left px-3 py-2 text-sm text-gray-700 leading-snug truncate">
                {msg.length > 60 ? msg.slice(0, 60) + '…' : msg}
              </button>
              <button onClick={() => removeSavedMessage(i)}
                className="px-2 py-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Button strip ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-2 py-2 overflow-x-auto scrollbar-none">

        {/* Saved messages bookmark button */}
        <button onClick={() => { setShowSaved((v) => !v); setShowAddPanel(false); }}
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            hasSaved
              ? 'text-duotone-blue hover:bg-slate-100'
              : 'text-gray-300 cursor-default'
          }`}
          title={t('common:chat.savedMessages')}
          disabled={!hasSaved}>
          {hasSaved
            ? <BookmarkSolid className="w-4 h-4" />
            : <BookmarkIcon className="w-4 h-4" />}
        </button>

        {/* Thin separator */}
        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        {/* Default role buttons */}
        {defaults.map((btn) => (
          <button key={btn.label} onClick={() => send(btn.message)} disabled={disabled}
            className="flex-shrink-0 px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-full hover:border-duotone-blue/40 hover:text-duotone-blue hover:bg-sky-50 active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap shadow-sm">
            {btn.label}
          </button>
        ))}

        {/* Custom buttons */}
        {customButtons.map((btn, i) => (
          <div key={i} className="relative flex-shrink-0 group">
            <button onClick={() => send(btn.message)} disabled={disabled}
              className="px-3 py-1 text-xs font-medium text-duotone-blue bg-sky-50 border border-duotone-blue/25 rounded-full hover:bg-sky-100 active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap pr-5">
              {btn.label}
            </button>
            <button onClick={() => removeCustomButton(i)}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 items-center justify-center hidden group-hover:flex hover:bg-red-100 hover:text-red-500 transition-colors">
              <XMarkIcon className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}

        {/* Add custom button */}
        {customButtons.length < MAX_CUSTOM && (
          <button onClick={() => { setShowAddPanel((v) => !v); setShowSaved(false); }}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-duotone-blue hover:bg-slate-100 border border-dashed border-gray-300 hover:border-duotone-blue/40 transition-colors"
            title={t('common:chat.addCustomButton')}>
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Exported helper: save a user message to the bookmark list ────────────────
export function useSaveMessage(userId) {
  const savedKey = storageKey('kai_saved_messages', userId);
  return useCallback((msg) => {
    if (!msg?.trim()) return;
    const existing = loadFromStorage(savedKey);
    if (existing.includes(msg)) return; // deduplicate
    const updated = [msg, ...existing].slice(0, MAX_SAVED);
    saveToStorage(savedKey, updated);
  }, [savedKey]);
}
