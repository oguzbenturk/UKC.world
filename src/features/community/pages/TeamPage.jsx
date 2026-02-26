/**
 * TeamPage
 *
 * Public page under /community/team showing the center's staff (instructors).
 * Fetches from the public GET /instructors endpoint.
 * Dark-themed to match the outsider/experience pages.
 */

import { useState, useEffect, useMemo } from 'react';
import { Tag, Spin } from 'antd';
import {
  TeamOutlined,
  GlobalOutlined,
  MailOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { usePageSEO } from '@/shared/utils/seo';

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
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState(null);

  usePageSEO({
    title: 'Our Team | Community | UKC',
    description: 'Meet the team behind UKC — our passionate instructors and staff who make your experience unforgettable.',
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

  // Sort: members with photos first, then by name
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const aHasImg = a.profile_image_url || a.avatar_url ? 0 : 1;
      const bHasImg = b.profile_image_url || b.avatar_url ? 0 : 1;
      if (aHasImg !== bHasImg) return aHasImg - bHasImg;
      return getDisplayName(a).localeCompare(getDisplayName(b));
    });
  }, [members]);

  return (
    <div className="min-h-screen text-white font-sans relative overflow-x-hidden bg-[#17140b] selection:bg-sky-400/30">
      {/* Background orbs */}
      <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-12%] right-[-8%] w-[920px] h-[920px] bg-sky-300/10 rounded-full blur-[155px]" />
        <div className="absolute top-[30%] left-[-10%] w-[760px] h-[760px] bg-sky-400/8 rounded-full blur-[135px]" />
        <div className="absolute bottom-[-10%] right-[20%] w-[700px] h-[700px] bg-sky-500/6 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 py-12 pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Tag className="mb-3 !px-4 !py-1 !rounded-full !font-bold uppercase tracking-wider !bg-sky-500/10 !border-sky-500/30 !text-sky-400">
            UKC.Community
          </Tag>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight">
            Meet Our{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-cyan-400">
              Team
            </span>
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Our passionate instructors and staff are here to make your water sports experience unforgettable.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Spin size="large" />
            <p className="text-gray-400 text-sm">Loading team...</p>
          </div>
        ) : sortedMembers.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#1a1d26] p-10 text-center">
            <TeamOutlined className="text-4xl text-gray-500 mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">Team info coming soon</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              Our team information is being updated. Check back soon!
            </p>
          </div>
        ) : (
          <>
            {/* Team count */}
            <div className="mb-6 flex items-center justify-center">
              <Tag className="!bg-white/10 !border-white/20 !text-white !px-4 !py-1 !rounded-full !text-sm">
                <TeamOutlined className="mr-1.5" />
                {sortedMembers.length} Team Member{sortedMembers.length !== 1 ? 's' : ''}
              </Tag>
            </div>

            {/* Team Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {sortedMembers.map((member) => {
                const avatarUrl = getImageUrl(member.profile_image_url) || getImageUrl(member.avatar_url);
                const name = getDisplayName(member);
                const languages = parseLanguages(member.language);
                const isHovered = hoveredId === member.id;

                return (
                  <div
                    key={member.id}
                    className="group relative bg-gradient-to-b from-[#1f2230] to-[#171925] rounded-2xl border border-white/10 hover:border-sky-400/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-sky-500/5 overflow-hidden"
                    onMouseEnter={() => setHoveredId(member.id)}
                    onMouseLeave={() => setHoveredId(null)}
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
                        Instructor
                      </Tag>
                    </div>

                    {/* Info */}
                    <div className="p-4 -mt-4 relative z-10">
                      <h3 className="text-lg font-bold text-white mb-1 group-hover:text-sky-300 transition-colors truncate">
                        {name}
                      </h3>

                      {/* Bio */}
                      {member.bio && (
                        <p className="text-gray-400 text-xs leading-relaxed line-clamp-3 mb-3">
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

                      {/* Contact hint on hover (email) */}
                      {member.email && isHovered && (
                        <div className="flex items-center gap-1.5 text-[10px] text-sky-400/70 transition-opacity duration-200">
                          <MailOutlined className="text-[9px]" />
                          <span className="truncate">{member.email}</span>
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
    </div>
  );
};

export default TeamPage;
