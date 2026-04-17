-- Migration 240: Rebrand waiver content from Duotone Pro Center / UKC to Plannivo
-- Applies to the akyaka.plannivo.com deployment only.
-- Replaces customer-visible strings in waiver_versions rows.

UPDATE waiver_versions
SET
  content    = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                 content,
                 'Duotone Pro Center', '[Company Name]'),
                 'DUOTONE PRO CENTER', '[COMPANY NAME]'),
                 'Pro Center Urla',   '[Company Name]'),
                 'DPC Urla',          '[Company Name]'),
                 'UKC.world',         'Plannivo'),
                 'ukc.world',         'plannivo.com'),
                 'UKC World',         'Plannivo'),
                 'Urla, Turkey',      '[City], [Country]')
WHERE
  content ILIKE '%Duotone Pro Center%'
  OR content ILIKE '%UKC%';
