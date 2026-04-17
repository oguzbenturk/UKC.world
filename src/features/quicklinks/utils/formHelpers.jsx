import {
  FileImageOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileOutlined,
  HomeOutlined,
  BookOutlined,
  ShoppingCartOutlined,
  CarOutlined,
  EyeOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { Button, Space } from 'antd';
import dayjs from 'dayjs';

export const SERVICE_TYPES = [
  { value: 'accommodation', label: 'Accommodation', icon: <HomeOutlined />, color: 'blue' },
  { value: 'lesson', label: 'Lessons', icon: <BookOutlined />, color: 'green' },
  { value: 'rental', label: 'Rentals', icon: <CarOutlined />, color: 'orange' },
  { value: 'shop', label: 'Shop', icon: <ShoppingCartOutlined />, color: 'purple' }
];

export const FORM_CATEGORIES = [
  { value: 'registration', label: 'Registration', color: 'blue' },
  { value: 'feedback', label: 'Feedback', color: 'green' },
  { value: 'waiver', label: 'Waiver/Consent', color: 'orange' },
  { value: 'booking', label: 'Booking', color: 'purple' },
  { value: 'survey', label: 'Survey', color: 'cyan' },
  { value: 'application', label: 'Application', color: 'magenta' },
  { value: 'other', label: 'Other', color: 'default' }
];

export const findProfilePicture = (data) => {
  const profileFields = ['profile_picture', 'profile_pic', 'photo', 'picture', 'avatar'];
  for (const field of profileFields) {
    const value = data[field];
    if (value) {
      if (Array.isArray(value) && value[0]?.url) return value[0].url;
      if (value.url) return value.url;
      if (typeof value === 'string' && value.startsWith('http')) return value;
    }
  }
  return null;
};

export const findCVFile = (data) => {
  const cvFields = ['cv', 'resume', 'curriculum_vitae', 'cv_file', 'resume_file'];
  for (const field of cvFields) {
    const value = data[field];
    if (value) {
      if (Array.isArray(value) && value[0]?.url) return value[0];
      if (value.url) return value;
    }
  }
  return null;
};

export const getFileIcon = (file) => {
  const type = file?.type || '';
  const name = file?.name || '';
  if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) {
    return <FileImageOutlined style={{ color: '#52c41a', fontSize: 20 }} />;
  }
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />;
  }
  if (type.includes('word') || /\.(doc|docx)$/i.test(name)) {
    return <FileWordOutlined style={{ color: '#1890ff', fontSize: 20 }} />;
  }
  return <FileOutlined style={{ fontSize: 20 }} />;
};

export const getAbsoluteFileUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const baseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  return url.startsWith('/') ? `${baseUrl}${url}` : `${baseUrl}/${url}`;
};

export const humanizeValue = (value) => {
  if (!value) return '';
  
  const str = String(value);
  
  const enumMappings = {
    'under_500': 'Under 500 hours',
    '500_1000': '500-1000 hours',
    '1000_2000': '1000-2000 hours',
    '2000_3000': '2000-3000 hours',
    'over_3000': 'Over 3000 hours',
    'absolute_beginners': 'Absolute Beginners',
    'independent_advance': 'Independent/Advanced',
    'advanced_safety': 'Advanced Safety',
    'strong_wind': 'Strong Wind',
    'light_wind': 'Light Wind',
    'flat_water': 'Flat Water',
    'choppy_waves': 'Choppy/Waves',
    'gusty_thermal': 'Gusty/Thermal Winds',
    'full_season': 'Full Season',
    'high_volume': 'High Volume',
    'occasional': 'Occasional',
    'premium_clientele': 'Premium Clientele',
    'duotone_pro_center': 'Plannivo',
    'radio_helmets': 'Radio Helmets',
    'progression_plans': 'Progression Plans',
    'video_analysis': 'Video Analysis',
    'lesson_debriefing': 'Lesson Debriefing',
    'iko': 'IKO',
    'vdws': 'VDWS',
    'bksa': 'BKSA',
    'us1': 'US Level 1',
    'us2': 'US Level 2',
    'us3': 'US Level 3',
    'us4': 'US Level 4',
    'english': 'English',
    'turkish': 'Turkish',
    'german': 'German',
    'french': 'French',
    'spanish': 'Spanish',
    'italian': 'Italian',
    'portuguese': 'Portuguese',
    'dutch': 'Dutch',
    'russian': 'Russian'
  };
  
  if (enumMappings[str.toLowerCase()]) {
    return enumMappings[str.toLowerCase()];
  }
  
  return str
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
};

export const formatSubmissionValue = (value) => {
  if (value === null || value === undefined || value === '') return <span className="text-gray-400 italic">Not provided</span>;
  
  if (Array.isArray(value) && value[0]?.url) {
    return value.map((file, idx) => {
      const fileUrl = getAbsoluteFileUrl(file.url);
      return (
        <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded border mt-1">
          {getFileIcon(file)}
          <div className="flex-1 min-w-0">
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block truncate">
              {file.name || 'View file'}
            </a>
            {file.size && <span className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</span>}
          </div>
          <Space size="small">
            <Button type="link" size="small" icon={<EyeOutlined />} href={fileUrl} target="_blank" />
            <Button type="link" size="small" icon={<DownloadOutlined />} href={fileUrl} download={file.name} />
          </Space>
        </div>
      );
    });
  }
  
  if (value?.url) {
    const fileUrl = getAbsoluteFileUrl(value.url);
    return (
      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
        {getFileIcon(value)}
        <div className="flex-1 min-w-0">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block truncate">
            {value.name || 'View file'}
          </a>
          {value.size && <span className="text-xs text-gray-500">{(value.size / 1024).toFixed(1)} KB</span>}
        </div>
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} href={fileUrl} target="_blank" />
          <Button type="link" size="small" icon={<DownloadOutlined />} href={fileUrl} download={value.name} />
        </Space>
      </div>
    );
  }
  
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return dayjs(value).format('MMMM D, YYYY');
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400 italic">Not provided</span>;
    return value.map(v => humanizeValue(v)).join(', ');
  }
  
  if (typeof value === 'boolean') return value ? '✓ Yes' : '✗ No';
  
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  
  return humanizeValue(value);
};

export const findFieldValue = (data, possibleKeys) => {
  const dataKeys = Object.keys(data);
  for (const key of possibleKeys) {
    if (data[key]) return data[key];
    const foundKey = dataKeys.find(k => k.toLowerCase() === key.toLowerCase());
    if (foundKey && data[foundKey]) return data[foundKey];
  }
  return '';
};

export const getSubmitterName = (record) => {
  const data = record.submission_data || {};
  const firstName = findFieldValue(data, ['first_name', 'firstName', 'firstname', 'fname', 'given_name']);
  const lastName = findFieldValue(data, ['last_name', 'lastName', 'lastname', 'lname', 'surname', 'family_name']);
  
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }
  
  const fullName = findFieldValue(data, ['name', 'full_name', 'fullName', 'fullname', 'your_name', 'yourname', 'complete_name']);
  if (fullName) return fullName;

  const email = findFieldValue(data, ['email', 'email_address', 'e-mail', 'mail']);
  if (email) return email;

  return record.submitted_by_name || record.user_name || 'Anonymous';
};

export const getSubmitterEmail = (record) => {
  const data = record.submission_data || {};
  return findFieldValue(data, ['email', 'email_address', 'e-mail', 'mail']) || record.submitted_by_email || '';
};

export const getPublicUrl = (linkCode) => {
  const baseUrl = window.location.origin;
  return `${baseUrl}/f/${linkCode}`;
};
