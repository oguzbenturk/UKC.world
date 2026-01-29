# Form Builder State Synchronization Fix

## Issue Description

Users were experiencing problems when editing forms at https://plannivo.com/forms/builder/:
1. **Fields added to wrong step** - When trying to add a field to a specific step, it would appear in a different step
2. **Changes not persisting** - After removing/moving fields and refreshing, old fields would reappear
3. **State inconsistency** - The UI would show one state, but after refresh, the backend data would be different

## Root Cause

The issue was caused by **stale closure state** in the `useFormBuilder` hook. Here's what was happening:

1. React's `useCallback` captures dependencies at creation time
2. When rapid operations occurred (add field → move field → delete field), each callback was using the `steps` state from when it was created
3. Multiple operations could all be working with the same stale state
4. The API calls succeeded (backend was correct), but local state updates used old data
5. After refresh, fresh data was loaded from backend, revealing the inconsistency

### Example of the Problem:

```javascript
// Old code - captures 'steps' in closure
const addField = useCallback(async (stepId, fieldType) => {
  const step = steps.find(s => s.id === stepId); // ❌ Uses stale 'steps'
  // ...
  const updatedSteps = steps.map(s => { // ❌ Uses stale 'steps'
    // update logic
  });
  setSteps(updatedSteps);
}, [steps]); // Changes whenever steps changes, but closure is stale during rapid operations
```

## Solution

Implemented **ref-based state management** to always access the most current state:

```javascript
// Keep a ref to the latest steps state to avoid stale closures
const stepsRef = useRef(steps);
stepsRef.current = steps; // Updated on every render

const addField = useCallback(async (stepId, fieldType) => {
  const currentSteps = stepsRef.current; // ✅ Always gets latest state
  const step = currentSteps.find(s => s.id === stepId);
  // ...
  const updatedSteps = stepsRef.current.map(s => { // ✅ Always uses latest state
    // update logic
  });
  setSteps(updatedSteps);
}, [saveToHistory, showMessage]); // Removed 'steps' from dependencies
```

## Changes Made

Updated all field and step operations in `src/features/forms/hooks/useFormBuilder.js`:

### State Management
- Added `stepsRef` that always points to current steps state
- Removed `steps` from dependency arrays to prevent stale closures

### Updated Operations
1. **Field Operations:**
   - `addField` - Uses `stepsRef.current` instead of captured `steps`
   - `updateField` - Uses `stepsRef.current` for state updates
   - `deleteField` - Uses `stepsRef.current` for filtering
   - `duplicateField` - Uses `stepsRef.current` for finding and updating
   - `reorderFields` - Uses `stepsRef.current` for reordering
   - `moveFieldToStep` - Uses `stepsRef.current` for cross-step operations

2. **Step Operations:**
   - `addStep` - Uses `stepsRef.current` for step count and updates
   - `updateStep` - Uses `stepsRef.current` for mapping updates
   - `deleteStep` - Uses `stepsRef.current` for filtering
   - `reorderSteps` - Uses `stepsRef.current` for reordering

## Benefits

1. **Consistency** - Local UI state always matches backend state
2. **Reliability** - Operations work correctly even when performed rapidly
3. **No refresh needed** - Changes persist immediately without page reload
4. **Better UX** - Fields appear in the correct steps as expected

## Testing Recommendations

1. **Rapid Operations Test:**
   - Add multiple fields quickly to different steps
   - Move fields between steps
   - Delete and re-add fields
   - Verify all appear in correct locations

2. **Persistence Test:**
   - Make several changes
   - Refresh the page
   - Verify all changes persisted correctly

3. **Complex Workflow Test:**
   - Add a step
   - Add fields to that step
   - Duplicate some fields
   - Move fields to another step
   - Delete some fields
   - Verify final state matches expectations

## Technical Details

**File Modified:** `src/features/forms/hooks/useFormBuilder.js`

**Pattern Used:** Ref-based state synchronization
- React's `useRef` provides a mutable container that persists across renders
- The ref is updated on every render but doesn't trigger re-renders
- Callbacks always access the latest state through the ref
- This prevents the stale closure problem while maintaining React's performance optimizations

## Migration Notes

This is a **non-breaking change** - the API and component interfaces remain identical. No changes needed in components that use the `useFormBuilder` hook.
