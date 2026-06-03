import React from 'react';
import { Input } from 'antd';
import { mlText, setMlText } from '../utils/contentValue';

// A text field that edits one language of a multilang content field.
// `value` may be a string or { en, tr, … }; onChange returns the updated object.
export default function MultilangInput({
  value, lang, onChange, textarea = false, rows = 3, placeholder, size = 'middle',
}) {
  const text = mlText(value, lang);
  const handle = (e) => onChange(setMlText(value, lang, e.target.value, lang));
  if (textarea) {
    return <Input.TextArea value={text} onChange={handle} rows={rows} placeholder={placeholder} autoSize={{ minRows: rows, maxRows: 10 }} />;
  }
  return <Input value={text} onChange={handle} placeholder={placeholder} size={size} />;
}
