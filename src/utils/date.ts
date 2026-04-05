import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';
import { tr, enUS } from 'date-fns/locale';

function getLocale(lang = 'tr') {
  return lang === 'tr' ? tr : enUS;
}

export function formatDate(date: string | Date, lang = 'tr'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd MMM yyyy', { locale: getLocale(lang) });
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'HH:mm');
}

export function formatDateTime(date: string | Date, lang = 'tr'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd MMM yyyy, HH:mm', { locale: getLocale(lang) });
}

export function formatRelative(date: string | Date, lang = 'tr'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (isToday(d)) return formatTime(d);
  if (isYesterday(d)) return lang === 'tr' ? 'Dün' : 'Yesterday';
  if (isTomorrow(d)) return lang === 'tr' ? 'Yarın' : 'Tomorrow';
  return formatDate(d, lang);
}

export function timeAgo(date: string | Date, lang = 'tr'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: getLocale(lang) });
}
