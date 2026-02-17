-- Migration: Fix existing packages with incorrect lesson_service_name values
-- Created: 2026-01-08
-- Description: Update the 4 existing packages to have correct lesson_service_name values
--              based on their package names and intended usage

-- Update packages one by one with correct service names
-- 1. BEGINNER -> "Private Lessons" (already correct, but ensure no trailing spaces)
UPDATE service_packages 
SET lesson_service_name = 'Private Lessons'
WHERE name = 'BEGINNER' AND (lesson_service_name = 'Private Lesson' OR lesson_service_name != 'Private Lessons');

-- 2. 4H Premium Lesson -> "Private Lessons" (premium is quality, not lesson type)
UPDATE service_packages 
SET lesson_service_name = 'Private Lessons'
WHERE name = '4H Premium Lesson';

-- 3. 6H Beginner Course -> "Private Lessons" (already correct)
-- This one already has the correct value, no update needed

-- 4. 6H Group Lesson -> "Group Lessons" (already correct)
-- This one already has the correct value, no update needed

-- Verify the updates
SELECT id, name, lesson_service_name, total_hours, sessions_count 
FROM service_packages 
ORDER BY name;
