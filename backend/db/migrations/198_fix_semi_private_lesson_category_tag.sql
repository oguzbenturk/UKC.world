-- Fix lesson_category_tag for semi-private services
-- Services with max_participants 2-3 should have 'semi-private' tag, not 'group'

UPDATE services
SET lesson_category_tag = 'semi-private',
    service_type = 'semi-private'
WHERE category = 'lesson'
  AND lesson_category_tag = 'group'
  AND COALESCE(max_participants, 1) BETWEEN 2 AND 3;

-- Also fix Group Kitesurfing Lesson that has lesson_category_tag = 'private' but max_participants > 3
UPDATE services
SET lesson_category_tag = 'group',
    service_type = 'group'
WHERE category = 'lesson'
  AND lesson_category_tag = 'private'
  AND COALESCE(max_participants, 1) > 3;
