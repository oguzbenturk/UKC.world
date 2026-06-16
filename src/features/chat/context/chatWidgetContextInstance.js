import { createContext } from 'react';

// Context for the app-wide floating chat widget. Kept in its own module so the
// provider component can live in a file that also exports React components
// without breaking Fast Refresh.
export const ChatWidgetContext = createContext(null);

export default ChatWidgetContext;
