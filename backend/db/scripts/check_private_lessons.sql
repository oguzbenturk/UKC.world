-- Check private lesson services after our update
SELECT id, name, max_participants, category 
FROM services 
WHERE name ILIKE '%private%' 
ORDER BY name;
