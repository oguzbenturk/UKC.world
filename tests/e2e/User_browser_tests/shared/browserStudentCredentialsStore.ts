import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

/** Written by registration spec; read by wallet and other User_browser_tests. Gitignored. */
export const BROWSER_STUDENT_CREDENTIALS_PATH = path.join(thisDir, '..', '.browser-student-credentials.json');

export type BrowserStudentCredentials = { email: string; password: string };

export function readBrowserStudentCredentials(): BrowserStudentCredentials | null {
  try {
    const raw = fs.readFileSync(BROWSER_STUDENT_CREDENTIALS_PATH, 'utf8');
    const data = JSON.parse(raw) as Partial<BrowserStudentCredentials>;
    if (typeof data.email === 'string' && typeof data.password === 'string' && data.email && data.password) {
      return { email: data.email.trim(), password: data.password };
    }
  } catch {
    /* missing or invalid */
  }
  return null;
}

export function writeBrowserStudentCredentials(creds: BrowserStudentCredentials): void {
  fs.writeFileSync(
    BROWSER_STUDENT_CREDENTIALS_PATH,
    JSON.stringify({ email: creds.email.trim(), password: creds.password }, null, 2) + '\n',
    'utf8',
  );
}
