/**
 * TeamPage
 *
 * Public page under /community/team showing the center's staff (instructors).
 * Fetches from the public GET /instructors endpoint.
 * Dark-themed to match the outsider/experience pages.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, Spin } from 'antd';
import dpsLogo from '../../../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg';
import {
  TeamOutlined,
  GlobalOutlined,
  StarFilled,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { usePageSEO } from '@/shared/utils/seo';
import InstructorDetailDrawer from '../components/InstructorDetailDrawer';

const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return url;
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
  return langStr
    .split(/[,;/|]+/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
};

const TeamPage = () => {
  const { t } = useTranslation(['admin']);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstructor, setSelectedInstructor] = useState(null);

  usePageSEO({
    title: t('admin:community.team.pageTitle'),
    description: t('admin:community.team.pageDescription'),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/instructors');
        const data = Array.isArray(res.data) ? res.data : [];
        if (!cancelled) setMembers(data);
      } catch {
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Server handles ordering (featured first, then display_order, then name)
  const sortedMembers = members;

  return (
    <div className="min-h-screen text-white font-sans relative overflow-x-hidden bg-[#0d1511] selection:bg-[#00a8c4]/30">
      
      {/* Duotone Pro Center Urla Logo */}
      <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-[95vw] sm:w-[65vw] md:w-[48rem] max-w-[850px] z-10">
        <img
          src={dpsLogo}
          alt="Duotone Pro Center Urla Logo"
          className="w-full"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }}
        />
      </div>

      {/* Background orbs */}
      <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-12%] right-[-8%] w-[920px] h-[920px] bg-sky-300/10 rounded-full blur-[155px]" />
        <div className="absolute top-[30%] left-[-10%] w-[760px] h-[760px] bg-sky-400/8 rounded-full blur-[135px]" />
        <div className="absolute bottom-[-10%] right-[20%] w-[700px] h-[700px] bg-sky-500/6 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 py-12 pb-6 pt-24 md:pt-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mt-20 md:mt-24">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-duotone-bold-extended text-white mb-3 tracking-tight uppercase">
            {t('admin:community.team.heading')}
          </h1>
          <p className="text-lg text-gray-300 font-duotone-regular max-w-2xl mx-auto leading-relaxed">
            {t('admin:community.team.subtitle')}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Spin size="large" />
            <p className="text-gray-400 text-sm">{t('admin:community.team.loading')}</p>
          </div>
        ) : sortedMembers.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#1a1d26] p-10 text-center">
            <TeamOutlined className="text-4xl text-gray-500 mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">{t('admin:community.team.teamInfoComingSoon')}</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              {t('admin:community.team.teamInfoComingSoonDescription')}
            </p>
          </div>
        ) : (
          <>
            {/* Team count */}
            <div className="mb-6 flex items-center justify-center">
              <Tag className="!bg-white/10 !border-white/20 !text-white !px-4 !py-1 !rounded-full !text-sm">
                <TeamOutlined className="mr-1.5" />
                {t('admin:community.team.teamMemberCount', { count: sortedMembers.length })}
              </Tag>
            </div>

            {/* Team Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {sortedMembers.map((member) => {
                const avatarUrl = getImageUrl(member.profile_image_url) || getImageUrl(member.avatar_url);
                const name = getDisplayName(member);
                const languages = parseLanguages(member.language);


                return (
                  <div
                    key={member.id}
                    className="group relative bg-gradient-to-b from-[#1f2230] to-[#171925] rounded-2xl border border-white/10 hover:border-sky-400/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-sky-500/5 overflow-hidden cursor-pointer"
                    onClick={() => setSelectedInstructor(member)}
                  >
                    {/* Avatar area */}
                    <div className="relative h-56 overflow-hidden bg-gradient-to-br from-sky-900/20 to-cyan-900/10">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.style.display = 'none';
                            e.target.nextElementSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      {/* Initials fallback (shown when no image or image fails) */}
                      <div
                        className={`absolute inset-0 items-center justify-center bg-gradient-to-br from-sky-600/30 to-cyan-600/20 ${avatarUrl ? 'hidden' : 'flex'}`}
                      >
                        <span className="text-5xl font-bold text-sky-300/60">{getInitials(member)}</span>
                      </div>

                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#171925] via-transparent to-transparent" />

                      {/* Role badge */}
                      <Tag className="absolute top-3 left-3 !bg-sky-500/15 !border-sky-500/30 !text-sky-300 !rounded-full !text-[10px] !font-bold backdrop-blur-sm uppercase tracking-wide">
                        {t('admin:community.team.instructor')}
                      </Tag>
                      {member.featured && (
                        <Tag className="absolute top-3 right-3 !bg-amber-500/20 !border-amber-500/40 !text-amber-300 !rounded-full !text-[10px] !font-bold backdrop-blur-sm uppercase tracking-wide">
                          <StarFilled className="mr-0.5" /> {t('admin:community.team.featured')}
                        </Tag>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4 -mt-4 relative z-10">
                      <h3 className="text-lg font-duotone-bold text-white mb-1 group-hover:text-[#00a8c4] transition-colors truncate">
                        {name}
                      </h3>

                      {/* Bio */}
                      {member.bio && (
                        <p className="text-gray-400 text-xs font-duotone-regular leading-relaxed line-clamp-3 mb-3">
                          {member.bio}
                        </p>
                      )}

                      {/* Languages */}
                      {languages.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {languages.map((lang) => {
                            const flag = LANGUAGE_FLAGS[lang];
                            return (
                              <span
                                key={lang}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-gray-300 capitalize"
                              >
                                {flag && <span>{flag}</span>}
                                {flag ? null : <GlobalOutlined className="text-[9px] text-gray-500" />}
                                {lang}
                              </span>
                            );
                          })}
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <InstructorDetailDrawer
        instructor={selectedInstructor}
        open={!!selectedInstructor}
        onClose={() => setSelectedInstructor(null)}
      />

      {/* Centered White Logo at Bottom */}
      <div className="w-full flex justify-center items-center py-12">
        <img
          src={dpsLogo}
          alt="Duotone Pro Center Urla White Logo"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '8px 0' }}
        />
      </div>
    </div>
  );
};

export default TeamPage;
