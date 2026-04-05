import { useEffect } from 'react';

/**
 * Custom hook for handling keyboard shortcuts in the calendar
 * @param {Object} shortcuts - Object mapping key combinations to functions
 * @param {boolean} enabled - Whether shortcuts are enabled
 */
export const useKeyboardShortcuts = (shortcuts = {}, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event) => {
      // Don't trigger shortcuts if user is typing in an input field
      if (
        event.target.tagName === 'INPUT' ||
        event.target.tagName === 'TEXTAREA' ||
        event.target.contentEditable === 'true'
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const isCtrl = event.ctrlKey || event.metaKey; // Support both Ctrl and Cmd
      const isShift = event.shiftKey;
      const isAlt = event.altKey;

      // Build key combination string
      let combination = '';
      if (isCtrl) combination += 'ctrl+';
      if (isShift) combination += 'shift+';
      if (isAlt) combination += 'alt+';
      combination += key;

      // Also check for simple key presses
      const simpleKey = key;

      // Execute matching shortcut
      if (shortcuts[combination]) {
        event.preventDefault();
        shortcuts[combination]();
      } else if (shortcuts[simpleKey] && !isCtrl && !isShift && !isAlt) {
        event.preventDefault();
        shortcuts[simpleKey]();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled]);
};

/**
 * Default calendar keyboard shortcuts
 * @param {Object} actions - Object containing action functions
 * @returns {Object} Keyboard shortcuts mapping
 */
export const createCalendarShortcuts = (actions) => {
  return {
    // New booking
    'ctrl+n': actions.newBooking,
    
    // Navigation
    't': actions.goToToday,
    'arrowleft': actions.goToPrevious,
    'arrowright': actions.goToNext,
    
    // View switching
    '1': () => actions.setView('day'),
    '2': () => actions.setView('week'),
    '3': () => actions.setView('month'),
    
    // Data operations
    'f5': actions.refresh,
    'ctrl+r': actions.refresh,
    
    // Search and filters
    'ctrl+k': actions.quickSearch,
    'ctrl+f': actions.toggleFilters,
    
    // Selection
    'escape': actions.clearSelection,
    
    // Debugging (development only)
    'ctrl+shift+d': actions.debugLog
  };
};

export default useKeyboardShortcuts;
