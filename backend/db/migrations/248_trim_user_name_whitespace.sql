-- Trim leading/trailing whitespace and collapse internal runs of whitespace
-- in user name fields. Stray spaces (e.g. first_name = "Sego ") were breaking
-- the booking customer search because the concatenated haystack ended up with
-- double spaces that no realistic search query would ever contain.

UPDATE users
SET
  first_name = regexp_replace(btrim(first_name), '\s+', ' ', 'g'),
  last_name  = regexp_replace(btrim(last_name),  '\s+', ' ', 'g'),
  name       = regexp_replace(btrim(name),       '\s+', ' ', 'g')
WHERE
  first_name IS DISTINCT FROM regexp_replace(btrim(first_name), '\s+', ' ', 'g')
  OR last_name IS DISTINCT FROM regexp_replace(btrim(last_name), '\s+', ' ', 'g')
  OR name IS DISTINCT FROM regexp_replace(btrim(name), '\s+', ' ', 'g');
