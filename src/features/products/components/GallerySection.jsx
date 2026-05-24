import React, { useCallback, useRef } from 'react';
import { Upload, Image } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useTranslation } from 'react-i18next';
import {
  PlusOutlined,
  LoadingOutlined,
  PictureOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { describeUploadError } from '../utils/productImagePayload';

const MAX_GALLERY_IMAGES = 10;

const SectionLabel = ({ icon, children, extra }) => (
  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
    {icon} {children}
    {extra}
  </p>
);

// Pin Content-Type so axios's transformRequest doesn't see the instance
// default `application/json` and JSON-stringify the FormData.
const uploadImages = async (files) => {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));
  const response = await apiClient.post('/upload/images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return { urls: response.data.images.map((img) => img.url), count: response.data.count };
};

const logUploadFailure = (label, error) => {
  console.error(
    `${label} —`,
    error?.response?.status,
    error?.response?.data ?? error?.message ?? error,
  );
};

const GallerySection = ({
  imageUrl,
  setImageUrl,
  imageLoading,
  setImageLoading,
  images,
  setImages,
  colorNames,
  colorImagesMap,
  setColorImagesMap,
}) => {
  const { t } = useTranslation(['manager']);
  const [colorUploading, setColorUploading] = React.useState(null);
  const uploadInProgressRef = useRef(false);

  const handleMainImageChange = (info) => {
    if (info.file.status === 'uploading') {
      setImageLoading(true);
      return;
    }
    if (info.file.status === 'done') {
      setImageLoading(false);
      setImageUrl(info.file.response.url);
      message.success(t('manager:products.form.imageUploaded'));
    } else if (info.file.status === 'error') {
      setImageLoading(false);
      logUploadFailure('Main image upload failed', info.file.error);
      message.error(describeUploadError(info.file.error, t('manager:products.form.imageUploadError')));
    }
  };

  const handleGalleryUpload = useCallback(async (fileList) => {
    // `beforeUpload` fires once per file with the full list — guard against
    // duplicate submits without dropping any files from the batch.
    if (uploadInProgressRef.current || fileList.length === 0) return;
    uploadInProgressRef.current = true;
    setImageLoading(true);
    try {
      const { urls, count } = await uploadImages(fileList);
      setImages((prev) => [...prev, ...urls]);
      message.success(t('manager:products.form.imagesUploaded', { count }));
    } catch (error) {
      logUploadFailure('Gallery upload failed', error);
      message.error(describeUploadError(error, t('manager:products.form.imagesUploadError')));
    } finally {
      setImageLoading(false);
      uploadInProgressRef.current = false;
    }
  }, [setImages, setImageLoading, t]);

  const handleColorImageUpload = useCallback(async (colorName, fileList) => {
    if (!fileList.length) return;
    setColorUploading(colorName);
    try {
      const { urls } = await uploadImages(fileList);
      setColorImagesMap((prev) => ({
        ...prev,
        [colorName]: [...(prev[colorName] || []), ...urls],
      }));
      message.success(t('manager:products.form.colorPhotosAdded', { count: urls.length, color: colorName }));
    } catch (error) {
      logUploadFailure('Color image upload failed', error);
      message.error(describeUploadError(error, t('manager:products.form.colorPhotoUploadError')));
    } finally {
      setColorUploading(null);
    }
  }, [setColorImagesMap, t]);

  const removeColorImage = useCallback((colorName, index) => {
    setColorImagesMap((prev) => ({
      ...prev,
      [colorName]: (prev[colorName] || []).filter((_, i) => i !== index),
    }));
  }, [setColorImagesMap]);

  const removeGalleryImage = (indexToRemove) => {
    setImages((prev) => prev.filter((_, i) => i !== indexToRemove));
    message.success(t('manager:products.form.imageRemoved'));
  };

  return (
    <>
      {/* ── Main Image ── */}
      <SectionLabel icon={<PictureOutlined />}>
        {t('manager:products.form.mainImage')}
        <span className="normal-case tracking-normal font-normal text-slate-300">
          {' '}— {t('manager:products.form.mainImageHint')}
        </span>
      </SectionLabel>
      <div className="flex items-center gap-3">
        <Upload
          name="image"
          listType="picture-card"
          showUploadList={false}
          onChange={handleMainImageChange}
          customRequest={async ({ file, onSuccess, onError, onProgress }) => {
            try {
              const formData = new FormData();
              formData.append('image', file);
              const response = await apiClient.post('/upload/image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: ({ total, loaded }) => {
                  if (total) onProgress?.({ percent: Math.round((loaded / total) * 100) });
                },
              });
              onSuccess?.(response.data);
            } catch (err) { onError?.(err); }
          }}
        >
          {imageUrl ? (
            <div className="w-20 h-20 overflow-hidden rounded-lg">
              <img src={imageUrl} alt="main" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg">
              {imageLoading ? <LoadingOutlined className="text-slate-400" /> : <PlusOutlined className="text-slate-400" />}
              <span className="text-xs text-slate-400 mt-1">{t('manager:products.form.uploadButton')}</span>
            </div>
          )}
        </Upload>
        <p className="text-xs text-slate-400">800×800px · max 15 MB · JPEG / PNG / WebP / HEIC</p>
      </div>

      {/* ── Per-colour buckets OR fallback gallery ── */}
      {colorNames.length > 0 ? (
        <>
          <SectionLabel icon={<BgColorsOutlined />}>
            {t('manager:products.form.photosPerColor')}
          </SectionLabel>
          <div className="space-y-3">
            {colorNames.map((colorName) => {
              const colorImgs = colorImagesMap[colorName] || [];
              const isUploading = colorUploading === colorName;
              return (
                <div key={colorName} className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-700">{colorName}</span>
                    <span className="text-xs text-slate-400">
                      ({colorImgs.length} photo{colorImgs.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Upload
                      multiple
                      listType="picture-card"
                      showUploadList={false}
                      beforeUpload={(file, fileList) => {
                        if (file === fileList[fileList.length - 1]) {
                          handleColorImageUpload(colorName, fileList);
                        }
                        return false;
                      }}
                      disabled={isUploading}
                    >
                      <div className="flex flex-col items-center justify-center w-14 h-14">
                        {isUploading ? <LoadingOutlined /> : <PlusOutlined />}
                        <span className="text-[10px] mt-1">Add</span>
                      </div>
                    </Upload>
                    {colorImgs.map((url, i) => (
                      <div key={url} className="relative w-14 h-14 flex-shrink-0">
                        <img
                          src={url}
                          alt={`${colorName}-${i + 1}`}
                          className="w-full h-full object-cover rounded-lg border border-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeColorImage(colorName, i)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                          style={{ fontSize: 9 }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <SectionLabel
            icon={<AppstoreOutlined />}
            extra={
              <span className="ml-1 font-normal normal-case text-slate-300">
                {images.length}/{MAX_GALLERY_IMAGES}
              </span>
            }
          >
            Gallery
          </SectionLabel>
          <div className="flex flex-wrap gap-2">
            <Upload
              multiple
              listType="picture-card"
              showUploadList={false}
              beforeUpload={(file, fileList) => {
                if (images.length + fileList.length > MAX_GALLERY_IMAGES) {
                  message.error(t('manager:products.form.maxImagesError'));
                  return false;
                }
                handleGalleryUpload(fileList);
                return false;
              }}
              disabled={imageLoading || images.length >= MAX_GALLERY_IMAGES}
            >
              {images.length < MAX_GALLERY_IMAGES && (
                <div className="flex flex-col items-center justify-center w-16 h-16">
                  {imageLoading ? <LoadingOutlined /> : <PlusOutlined />}
                  <span className="text-xs mt-1">Add</span>
                </div>
              )}
            </Upload>
            {images.map((imgUrl, index) => (
              <div key={imgUrl} className="relative w-16 h-16 flex-shrink-0">
                <div className="w-full h-full overflow-hidden rounded-lg border border-slate-100">
                  <Image
                    src={imgUrl}
                    alt={`${index + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    preview={{ mask: false }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeGalleryImage(index)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                  style={{ fontSize: 9 }}
                >✕</button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
};

export default GallerySection;
