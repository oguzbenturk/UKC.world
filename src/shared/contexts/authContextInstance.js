// Isolated module so Vite HMR never re-creates the context object.
// AuthContext.jsx and useAuth.js both import from here.
import { createContext } from 'react';

export const AuthContext = createContext(null);
