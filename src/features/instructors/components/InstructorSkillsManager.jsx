// src/features/instructors/components/InstructorSkillsManager.jsx
import { useState, useEffect, forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Select, Tag, Spin, Button, Typography, Tooltip, Empty } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { CheckOutlined } from '@ant-design/icons';
import { useData } from '@/shared/hooks/useData';

const { Text } = Typography;

const DISCIPLINES = [
  { key: 'kite', label: 'Kitesurfing', color: '#3B82F6', description: 'Kite lessons & coaching' },
  { key: 'wing', label: 'Wing Foil', color: '#8B5CF6', description: 'Wing foil & wing surf' },
  { key: 'kite_foil', label: 'Kite Foil', color: '#06B6D4', description: 'Kite foil racing & training' },
  { key: 'efoil', label: 'E-Foil', color: '#F59E0B', description: 'Electric foil board' },
  { key: 'premium', label: 'Premium', color: '#EF4444', description: 'Premium / VIP sessions' },
];

const LESSON_CATEGORIES = [
  { key: 'private', label: 'Private', color: 'blue' },
  { key: 'semi-private', label: 'Semi-Private', color: 'purple' },
  { key: 'group', label: 'Group', color: 'green' },
  { key: 'supervision', label: 'Supervision', color: 'orange' },
];

const LEVELS = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
];

const InstructorSkillsManager = forwardRef(({ instructorId, onSave = () => {} }, ref) => {
  const { t } = useTranslation(['instructor']);
  const { apiClient } = useData();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const hasFetchedRef = useRef(false);

  const fetchSkills = useCallback(async () => {
    if (!instructorId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/instructors/${instructorId}/skills`);
      setSkills(res.data || []);
      setDirty(false);
    } catch (err) {
      console.error('Error fetching instructor skills:', err);
      message.error(t('instructor:skills.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [apiClient, instructorId]);

  useEffect(() => {
    if (instructorId && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchSkills();
    }
  }, [instructorId, fetchSkills]);

  useImperativeHandle(ref, () => ({
    refresh: () => {
      hasFetchedRef.current = false;
      fetchSkills();
    },
  }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = skills.map(s => ({
        discipline_tag: s.discipline_tag,
        lesson_categories: s.lesson_categories,
        max_level: s.max_level,
      }));
      const res = await apiClient.put(`/instructors/${instructorId}/skills`, { skills: payload });
      setSkills(res.data || []);
      setDirty(false);
      message.success(t('instructor:skills.saved'));
      onSave();
    } catch (err) {
      console.error('Error saving instructor skills:', err);
      message.error(err?.response?.data?.error || t('instructor:skills.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const isDisciplineEnabled = (disciplineKey) => {
    return skills.some(s => s.discipline_tag === disciplineKey);
  };

  const getSkill = (disciplineKey) => {
    return skills.find(s => s.discipline_tag === disciplineKey);
  };

  const toggleDiscipline = (disciplineKey) => {
    setDirty(true);
    if (isDisciplineEnabled(disciplineKey)) {
      setSkills(prev => prev.filter(s => s.discipline_tag !== disciplineKey));
    } else {
      setSkills(prev => [
        ...prev,
        {
          discipline_tag: disciplineKey,
          lesson_categories: ['private', 'semi-private', 'group', 'supervision'],
          max_level: 'advanced',
        },
      ]);
    }
  };

  const updateCategories = (disciplineKey, categories) => {
    setDirty(true);
    setSkills(prev =>
      prev.map(s =>
        s.discipline_tag === disciplineKey ? { ...s, lesson_categories: categories } : s
      )
    );
  };

  const updateMaxLevel = (disciplineKey, level) => {
    setDirty(true);
    setSkills(prev =>
      prev.map(s =>
        s.discipline_tag === disciplineKey ? { ...s, max_level: level } : s
      )
    );
  };

  return (
    <Spin spinning={loading}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">{t('instructor:skills.teachingSkills')}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {t('instructor:skills.configureHint')}
            </p>
          </div>
          {dirty && (
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              {t('instructor:skills.saveChanges')}
            </Button>
          )}
        </div>

        {/* Discipline Cards */}
        <div className="space-y-3">
          {DISCIPLINES.map((disc) => {
            const enabled = isDisciplineEnabled(disc.key);
            const skill = getSkill(disc.key);

            return (
              <div
                key={disc.key}
                className={`rounded-xl border-2 transition-all duration-200 overflow-hidden ${
                  enabled
                    ? 'border-blue-200 bg-white shadow-sm'
                    : 'border-gray-100 bg-gray-50/50'
                }`}
              >
                {/* Discipline header row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{disc.label}</div>
                      <div className="text-[11px] text-gray-400">{disc.description}</div>
                    </div>
                  </div>
                  <Switch
                    checked={enabled}
                    onChange={() => toggleDiscipline(disc.key)}
                    style={{ backgroundColor: enabled ? disc.color : undefined }}
                  />
                </div>

                {/* Expanded settings */}
                {enabled && skill && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
                    {/* Lesson categories */}
                    <div>
                      <Text className="text-xs text-gray-500 font-medium block mb-1.5">
                        {t('instructor:skills.lessonTypes')}
                      </Text>
                      <div className="flex flex-wrap gap-1.5">
                        {LESSON_CATEGORIES.map((cat) => {
                          const active = skill.lesson_categories.includes(cat.key);
                          return (
                            <Tag
                              key={cat.key}
                              color={active ? cat.color : undefined}
                              className={`cursor-pointer select-none rounded-full px-3 py-0.5 text-xs transition-all ${
                                active
                                  ? 'opacity-100'
                                  : 'opacity-40 bg-gray-100 text-gray-400 border-gray-200 hover:opacity-70'
                              }`}
                              onClick={() => {
                                const next = active
                                  ? skill.lesson_categories.filter(c => c !== cat.key)
                                  : [...skill.lesson_categories, cat.key];
                                if (next.length === 0) {
                                  message.warning(t('instructor:skills.atLeastOneLessonType'));
                                  return;
                                }
                                updateCategories(disc.key, next);
                              }}
                            >
                              {active && <CheckOutlined className="mr-1 text-[10px]" />}
                              {cat.label}
                            </Tag>
                          );
                        })}
                      </div>
                    </div>

                    {/* Max level */}
                    <div>
                      <Text className="text-xs text-gray-500 font-medium block mb-1.5">
                        {t('instructor:skills.maximumTeachingLevel')}
                      </Text>
                      <div className="flex flex-wrap gap-2">
                        {LEVELS.map((lvl) => {
                          const active = skill.max_level === lvl.key;
                          return (
                            <button
                              key={lvl.key}
                              type="button"
                              onClick={() => updateMaxLevel(disc.key, lvl.key)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                                active
                                  ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              {lvl.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Info footer */}
        <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-4 py-2.5">
          <Text className="text-[11px] text-blue-600/80">
            {t('instructor:skills.skillsInfo')}
          </Text>
        </div>
      </div>
    </Spin>
  );
});

InstructorSkillsManager.displayName = 'InstructorSkillsManager';

export default InstructorSkillsManager;
