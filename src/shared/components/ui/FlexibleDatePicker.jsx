import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

// antd's picker already loads customParseFormat internally, but extend here too so the
// app's shared dayjs instance can parse these formats anywhere this component is used.
dayjs.extend(customParseFormat);

// When `format` is an array, antd DISPLAYS the first entry and PARSES typed input against
// every entry (first valid match wins). This lets a user type a date with almost any common
// separator — "01.01.1994", "06/04/2002", "09,12,2001", "1-1-94" — and have it understood.
// 4-digit-year formats are listed before 2-digit ones so full years never get truncated.
export const FLEXIBLE_DATE_FORMATS = [
  'DD/MM/YYYY', 'D/M/YYYY',
  'DD.MM.YYYY', 'D.M.YYYY',
  'DD,MM,YYYY', 'D,M,YYYY',
  'DD-MM-YYYY', 'D-M-YYYY',
  'DD MM YYYY', 'D M YYYY',
  'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY.MM.DD',
  'DD/MM/YY', 'D/M/YY',
  'DD.MM.YY', 'D.M.YY',
  'DD,MM,YY', 'D,M,YY',
  'DD-MM-YY', 'D-M-YY',
];

/**
 * Drop-in replacement for antd <DatePicker> that accepts dates typed in many formats.
 * Pass an explicit `format` to override the flexible default.
 */
const FlexibleDatePicker = ({ format, ...props }) => (
  <DatePicker format={format || FLEXIBLE_DATE_FORMATS} {...props} />
);

export default FlexibleDatePicker;
