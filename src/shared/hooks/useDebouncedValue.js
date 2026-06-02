// src/shared/hooks/useDebouncedValue.js
// Returns a debounced copy of a value that only updates after `delay` ms have
// passed without the source value changing. Used to drive search-as-you-type
// without firing a request on every keystroke ("type, then it searches").

import { useState, useEffect } from 'react';

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
