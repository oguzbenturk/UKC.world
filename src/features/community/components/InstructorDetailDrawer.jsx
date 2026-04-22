import { Drawer, Tag } from 'antd';
import {
  GlobalOutlined,
  StarFilled,
  CalendarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/hooks/useAuth';

const LANGUAGE_FLAGS = {
  en: '🇬🇧', english: '🇬🇧',
  tr: '🇹🇷', turkish: '🇹🇷', türkçe: '🇹🇷',
  de: '🇩🇪', german: '🇩🇪', deutsch: '🇩🇪',
  fr: '🇫🇷', french: '🇫🇷', français: '🇫🇷',
  es: '🇪🇸', spanish: '🇪🇸', español: '🇪🇸',
  it: '🇮🇹', italian: '🇮🇹', italiano: '🇮🇹',
  ru: '🇷🇺', russian: '🇷🇺', русский: '🇷🇺',
  pt: '🇵🇹', portuguese: '🇵🇹',
  nl: '🇳🇱', dutch: '🇳🇱',
  ar: '🇸🇦', arabic: '🇸🇦',
};

const parseLanguages = (langStr) => {
  if (!langStr) return [];
  return langStr.split(/[,;/|]+/).map((l) => l.trim().toLowerCase()).filter(Boolean);
};

const getDisplayName = (member) => {
  if (member.first_name || member.last_name) {
    return `${member.first_name || ''} ${member.last_name || ''}`.trim();
  }
  return member.name || 'Team Member';
};

const getInitials = (member) => {
  const name = getDisplayName(member);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || 'T')[0].toUpperCase();
};

const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return url;
};

const getExperienceYear = (createdAt) => {
  if (!createdAt) return null;
  return new Date(createdAt).getFullYear();
};

const InstructorDetailDrawer = ({ instructor, open, onClose }) => {
  const { t } = useTranslation(['admin']);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  if (!instructor) return null;

  const avatarUrl = getImageUrl(instructor.profile_image_url) || getImageUrl(instructor.avatar_url);
  const name = getDisplayName(instructor);
  const languages = parseLanguages(instructor.language);
  const visibleFields = instructor.visible_fields || ['bio', 'specializations', 'languages', 'experience'];
  const skills = instructor.skills || [];
  const experienceYear = getExperienceYear(instructor.created_at);
  const experienceText = experienceYear ? t('admin:community.team.withUsSince', { year: experienceYear }) : null;

  const handleBookLesson = () => {
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      navigate('/experience');
    }
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={480}
      closable
      styles={{
        wrapper: { maxWidth: '100vw' },
        header: { background: '#1a1d26', borderBottom: '1px solid rgba(255,255,255,0.1)' },
        body: { background: '#1a1d26', padding: 0 },
      }}
      closeIcon={<span className="text-white text-lg">&times;</span>}
      title={null}
    >
      <div className="text-white min-h-full">
        {/* Hero Photo */}
        <div className="relative h-72 overflow-hidden bg-gradient-to-br from-sky-900/30 to-cyan-900/15">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = 'none';
                e.target.nextElementSibling.style.display = 'flex';
              }}
            />
          ) : null}
          <div
            className={`absolute inset-0 items-center justify-center bg-gradient-to-br from-sky-600/30 to-cyan-600/20 ${avatarUrl ? 'hidden' : 'flex'}`}
          >
            <span className="text-7xl font-bold text-sky-300/60">{getInitials(instructor)}</span>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1d26] via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="px-6 pb-6 -mt-8 relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-2xl font-bold text-white">{name}</h2>
            {instructor.featured && (
              <Tag className="!bg-amber-500/20 !border-amber-500/40 !text-amber-300 !rounded-full !text-xs !font-semibold">
                <StarFilled className="mr-1" />{t('admin:community.team.featured')}
              </Tag>
            )}
          </div>

          {visibleFields.includes('bio') && instructor.bio && (
            <div className="mb-5">
              <p className="text-gray-300 text-sm leading-relaxed">{instructor.bio}</p>
            </div>
          )}

          {visibleFields.includes('specializations') && skills.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('admin:community.team.specializations')}</h4>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill, idx) => (
                  skill.discipline_tag && (
                    <Tag key={idx} className="!bg-sky-500/15 !border-sky-500/30 !text-sky-300 !rounded-full !text-xs">
                      {skill.discipline_tag}
                      {skill.max_level ? ` (L${skill.max_level})` : ''}
                    </Tag>
                  )
                ))}
              </div>
            </div>
          )}

          {visibleFields.includes('languages') && languages.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('admin:community.team.languages')}</h4>
              <div className="flex flex-wrap gap-1.5">
                {languages.map((lang) => {
                  const flag = LANGUAGE_FLAGS[lang];
                  return (
                    <span key={lang} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-300 capitalize">
                      {flag && <span>{flag}</span>}
                      {!flag && <GlobalOutlined className="text-[10px] text-gray-500" />}
                      {lang}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {visibleFields.includes('experience') && experienceText && (
            <div className="mb-6">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <CalendarOutlined className="text-sky-400" />
                <span>{experienceText}</span>
              </div>
            </div>
          )}

          {instructor.booking_link_enabled && (
            <button
              onClick={handleBookLesson}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00a8c4] to-cyan-500 text-white font-semibold text-sm hover:from-[#0095ad] hover:to-cyan-600 transition-all duration-200 shadow-lg shadow-cyan-500/20"
            >
              {t('admin:community.team.bookALesson')}
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default InstructorDetailDrawer;
