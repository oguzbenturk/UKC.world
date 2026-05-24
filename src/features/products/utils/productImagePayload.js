import { getErrorMessage } from '@/shared/utils/apiError';

// Concatenates colour-bucket photos (in `colorNames` order) followed by the
// unbucketed gallery. The reload path slices the first N images per
// `colors[i].imageCount` and treats the suffix as gallery.
//
// Why: returning only the colour photos when `colorNames.length > 0` wiped
// the existing gallery the first time staff added a colour mid-edit.
export const buildImagePayload = ({ colorNames = [], colorImagesMap = {}, gallery = [] } = {}) => {
  const colors = colorNames.map((name) => ({
    name,
    imageCount: (colorImagesMap[name] || []).length,
  }));
  const colorPhotos = colorNames.flatMap((name) => colorImagesMap[name] || []);
  const images = [...colorPhotos, ...gallery];
  return { colors, images };
};

export const describeUploadError = (error, fallback) => {
  const status = error?.response?.status;
  if (status === 413) return 'File too large. Try a smaller photo (max 15 MB).';
  if (status === 401) return 'Session expired — please log in again.';
  if (status === 403) return 'You don\'t have permission to upload images.';
  return getErrorMessage(error, fallback);
};
