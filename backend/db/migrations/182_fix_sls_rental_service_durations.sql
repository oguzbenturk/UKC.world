-- Fix incorrect SLS rental service durations and names
-- Services '15089143' and '2cdd4b03' had duration=4 and name prefix "4H" but should be 1H and 8H respectively.
-- Also trim leading space from service '6034d692'.

-- Fix SLS kite 1H service (was incorrectly stored as 4H @ €40)
UPDATE services
SET name = '1H - SLS - Full Equipment Rental Service',
    duration = 1.00
WHERE id = '15089143-07df-43a3-8f5a-afc200af4cb8'
  AND duration = 4.00
  AND price = 40.00;

-- Fix SLS kite 8H service (was incorrectly stored as 4H @ €85)
UPDATE services
SET name = '8H - SLS - Full Equipment Rental Service',
    duration = 8.00
WHERE id = '2cdd4b03-ba04-4edb-815d-ae2ef759d36d'
  AND duration = 4.00
  AND price = 85.00;

-- Trim leading space from SLS wing 1H service name
UPDATE services
SET name = TRIM(name)
WHERE id = '6034d692-7f59-427f-a4d0-0719866fdb67';
