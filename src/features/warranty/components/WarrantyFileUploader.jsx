import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Progress, Tag } from 'antd';
import { CloudUploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  ACCEPT_ATTRIBUTE,
  ACCEPT_ATTRIBUTE_WITH_DOCS,
  MAX_DOCUMENT_SIZE,
  MAX_DOCUMENTS,
  MAX_FILES_PER_REQUEST,
  MAX_PHOTO_SIZE,
  MAX_PHOTOS,
  MAX_TOTAL_PER_CLAIM,
  MAX_VIDEO_SIZE,
  MAX_VIDEOS,
  formatBytes,
  kindForMime
} from '../constants';

function validateLocal(file, accum, existing, allowDocuments) {
  const kind = kindForMime(file.type);
  if (!kind) return { ok: false, reason: 'mime' };
  // PDF documents are only accepted in staff/admin contexts.
  if (kind === 'document' && !allowDocuments) return { ok: false, reason: 'mime' };
  if (kind === 'photo' && file.size > MAX_PHOTO_SIZE) return { ok: false, reason: 'photoTooLarge' };
  if (kind === 'video' && file.size > MAX_VIDEO_SIZE) return { ok: false, reason: 'videoTooLarge' };
  if (kind === 'document' && file.size > MAX_DOCUMENT_SIZE) return { ok: false, reason: 'documentTooLarge' };
  const totalAfter =
    accum.totalBytes + file.size + (existing.totalBytes || 0);
  if (totalAfter > MAX_TOTAL_PER_CLAIM) return { ok: false, reason: 'quota' };
  if (kind === 'photo'
      && (accum.photoCount + 1 + (existing.photoCount || 0)) > MAX_PHOTOS) {
    return { ok: false, reason: 'tooManyPhotos' };
  }
  if (kind === 'video'
      && (accum.videoCount + 1 + (existing.videoCount || 0)) > MAX_VIDEOS) {
    return { ok: false, reason: 'tooManyVideos' };
  }
  if (kind === 'document'
      && (accum.documentCount + 1 + (existing.documentCount || 0)) > MAX_DOCUMENTS) {
    return { ok: false, reason: 'tooManyDocuments' };
  }
  return { ok: true, kind };
}

const VARIANTS = {
  light: {
    dropZone: 'border-sky-300 bg-sky-50/60 hover:border-sky-400 hover:bg-sky-50',
    icon: '#0284c7',
    title: 'text-slate-800',
    hint: 'text-slate-500',
    cap: 'text-slate-400',
    error: 'bg-rose-50 border-rose-200 text-rose-700',
    list: 'divide-slate-200 border-slate-200 bg-white',
    fileName: 'text-slate-700',
    fileSize: 'text-slate-500',
    removeBtn: 'text-rose-500 hover:text-rose-700',
    progress: { from: '#38bdf8', to: '#0ea5e9' }
  },
  dark: {
    dropZone: 'border-[#00a8c4]/30 bg-white/[0.03] hover:border-[#00a8c4]/60 hover:bg-white/[0.05]',
    icon: '#00a8c4',
    title: 'text-white',
    hint: 'text-white/50',
    cap: 'text-white/30',
    error: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    list: 'divide-white/10 border-white/10 bg-white/[0.03]',
    fileName: 'text-white/80',
    fileSize: 'text-white/40',
    removeBtn: 'text-rose-400 hover:text-rose-300',
    progress: { from: '#22d3ee', to: '#00a8c4' }
  }
};

export default function WarrantyFileUploader({
  value = [],
  onChange,
  existing = { photoCount: 0, videoCount: 0, documentCount: 0, totalBytes: 0 },
  progress = 0,
  isUploading = false,
  disabled = false,
  variant = 'light',
  allowDocuments = false
}) {
  const tokens = VARIANTS[variant] || VARIANTS.light;
  const { t } = useTranslation(['public']);
  const inputRef = useRef(null);
  const [error, setError] = useState(null);

  const totals = useMemo(() => {
    const totalBytes = value.reduce((s, f) => s + f.size, 0);
    const photoCount = value.filter((f) => kindForMime(f.type) === 'photo').length;
    const videoCount = value.filter((f) => kindForMime(f.type) === 'video').length;
    const documentCount = value.filter((f) => kindForMime(f.type) === 'document').length;
    return { totalBytes, photoCount, videoCount, documentCount };
  }, [value]);

  const handleFiles = useCallback((files) => {
    setError(null);
    const next = [...value];
    const accum = { ...totals };
    const existingFileCount = (existing.photoCount || 0) + (existing.videoCount || 0) + (existing.documentCount || 0);
    for (const file of files) {
      if (next.length + 1 + existingFileCount > MAX_FILES_PER_REQUEST) {
        setError(t('public:warranty.uploader.errorFileCount', 'Too many files (max {{n}}).', { n: MAX_FILES_PER_REQUEST }));
        break;
      }
      const check = validateLocal(file, accum, existing, allowDocuments);
      if (!check.ok) {
        const messages = {
          mime: t('public:warranty.uploader.errorMime', 'Unsupported file type: {{name}}', { name: file.name }),
          photoTooLarge: t('public:warranty.uploader.errorPhoto', 'Photo "{{name}}" is larger than {{max}} MB.', {
            name: file.name, max: Math.round(MAX_PHOTO_SIZE / 1024 / 1024)
          }),
          videoTooLarge: t('public:warranty.uploader.errorVideo', 'Video "{{name}}" is larger than {{max}} MB.', {
            name: file.name, max: Math.round(MAX_VIDEO_SIZE / 1024 / 1024)
          }),
          documentTooLarge: t('public:warranty.uploader.errorDocument', 'Document "{{name}}" is larger than {{max}} MB.', {
            name: file.name, max: Math.round(MAX_DOCUMENT_SIZE / 1024 / 1024)
          }),
          quota: t('public:warranty.uploader.errorQuota', 'Total upload size would exceed {{cap}} GB.', {
            cap: Math.round(MAX_TOTAL_PER_CLAIM / 1024 / 1024 / 1024 * 10) / 10
          }),
          tooManyPhotos: t('public:warranty.uploader.errorPhotos', 'Maximum {{n}} photos per claim.', { n: MAX_PHOTOS }),
          tooManyVideos: t('public:warranty.uploader.errorVideos', 'Maximum {{n}} videos per claim.', { n: MAX_VIDEOS }),
          tooManyDocuments: t('public:warranty.uploader.errorDocuments', 'Maximum {{n}} documents per claim.', { n: MAX_DOCUMENTS })
        };
        setError(messages[check.reason] || 'File rejected.');
        continue;
      }
      next.push(file);
      accum.totalBytes += file.size;
      if (check.kind === 'photo') accum.photoCount += 1;
      if (check.kind === 'video') accum.videoCount += 1;
      if (check.kind === 'document') accum.documentCount += 1;
    }
    onChange?.(next);
  }, [value, totals, existing, onChange, t, allowDocuments]);

  const removeAt = (idx) => {
    const next = value.slice();
    next.splice(idx, 1);
    onChange?.(next);
  };

  return (
    <div className="space-y-3">
      <label
        className={`block cursor-pointer rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${tokens.dropZone} ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={allowDocuments ? ACCEPT_ATTRIBUTE_WITH_DOCS : ACCEPT_ATTRIBUTE}
          multiple
          disabled={disabled}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files.length) handleFiles(files);
          }}
        />
        <CloudUploadOutlined style={{ fontSize: 36, color: tokens.icon }} />
        <p className={`mt-2 font-semibold ${tokens.title}`}>
          {allowDocuments
            ? t('public:warranty.uploader.ctaDocs', 'Click to add photos, videos or a PDF bill')
            : t('public:warranty.uploader.cta', 'Click to add photos or videos')}
        </p>
        <p className={`mt-1 text-xs ${tokens.hint}`}>
          {t('public:warranty.uploader.hint', 'JPG, PNG, WEBP, HEIC up to {{photo}} MB each · MP4, MOV, WEBM up to {{video}} MB each', {
            photo: Math.round(MAX_PHOTO_SIZE / 1024 / 1024),
            video: Math.round(MAX_VIDEO_SIZE / 1024 / 1024)
          })}
        </p>
        {allowDocuments && (
          <p className={`mt-1 text-xs ${tokens.hint}`}>
            {t('public:warranty.uploader.hintDocs', 'PDF (e.g. the manufacturer Product Bill) up to {{doc}} MB each', {
              doc: Math.round(MAX_DOCUMENT_SIZE / 1024 / 1024)
            })}
          </p>
        )}
        <p className={`mt-1 text-xs ${tokens.cap}`}>
          {allowDocuments
            ? t('public:warranty.uploader.capDocs', 'Max {{photos}} photos, {{videos}} videos and {{docs}} PDFs · {{cap}} GB combined', {
                photos: MAX_PHOTOS, videos: MAX_VIDEOS, docs: MAX_DOCUMENTS,
                cap: Math.round(MAX_TOTAL_PER_CLAIM / 1024 / 1024 / 1024 * 10) / 10
              })
            : t('public:warranty.uploader.cap', 'Max {{photos}} photos and {{videos}} videos · {{cap}} GB combined', {
                photos: MAX_PHOTOS, videos: MAX_VIDEOS,
                cap: Math.round(MAX_TOTAL_PER_CLAIM / 1024 / 1024 / 1024 * 10) / 10
              })}
        </p>
      </label>

      {error && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${tokens.error}`}>
          {error}
        </div>
      )}

      {value.length > 0 && (
        <ul className={`divide-y rounded-xl border text-sm ${tokens.list}`}>
          {value.map((file, idx) => {
            const kind = kindForMime(file.type);
            return (
              <li key={`${file.name}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Tag color={kind === 'photo' ? 'blue' : kind === 'document' ? 'orange' : 'purple'}>{kind || 'file'}</Tag>
                  <span className={`truncate ${tokens.fileName}`} title={file.name}>{file.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs ${tokens.fileSize}`}>{formatBytes(file.size)}</span>
                  {!isUploading && (
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      className={tokens.removeBtn}
                      aria-label="Remove"
                    >
                      <DeleteOutlined />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(isUploading || progress > 0) && (
        <Progress
          percent={Math.round(progress)}
          status={progress >= 100 ? 'success' : 'active'}
          strokeColor={tokens.progress}
        />
      )}
    </div>
  );
}
