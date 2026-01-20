-- Delete products uploaded before the cache fix (they all have wrong Dice kite images)
-- These are products 1-53 from the first upload run

-- List of product IDs to delete (from upload log products 1-53):
DELETE FROM products WHERE id IN (
  -- Bars (1-10)
  '13eac7b9-93fd-42f6-945f-e93d558fc725', -- Quick Rel Combi Kit
  'a24a8de4-47cb-41ec-93d8-126508d45e45', -- Quick Rel Kit Freeride  
  '553a1f3f-19ac-404b-adc3-808fb047a2ce', -- Quick Rel Kit Freestyle
  'efb8c69f-653b-4e0c-9eb0-13075a0c06dd', -- Quick Rel Kit Rope Harness
  '10a5b46e-8529-47c8-adc0-84695d8b00d9', -- Quick Rel Kit Wakestyle
  'a99f9823-783b-4fdc-946c-c80ee0f1fc8c', -- Short Safety Leash
  '21375504-9aa4-4cd6-b0d7-9c914463f620', -- Stash
  '974c9982-8518-48ff-94f3-976e5c3cdcc9', -- Vegas 2024
  '2fd866a4-44af-44bf-af5e-18b707c67079', -- Click Bar Quad Control
  '3862dc50-4acd-4e9b-92e0-6c1e7fe64801', -- Trust Bar Quad Control
  
  -- Boards (11-38)
  'f9dcf6fd-7752-40f3-ae8e-3b270631c1f9', -- Gonzales
  '6f56a942-1146-4bd4-9efd-75277edff799', -- Jaime Concept Blue
  '95cd7f7c-d810-4b1e-b0af-c960228ffd8e', -- Jaime SLS
  'e0ec4687-32e9-4ad6-a1ec-6a0a38123aed', -- Blur D-LAB
  '2a15d296-29b2-414d-8346-1a1b34a120be', -- Blur SLS
  '5842e485-613a-4df5-b382-e48c8cf6aed1', -- Boardbag Single Compact
  '2693ea69-0dd7-4243-8d8d-543fe251f6f7', -- Boardbag Single Surf
  '1d507943-155c-4bba-82fd-a5e31d663ccc', -- Boardbag Single Twintip
  'd302b5d1-4c14-4550-8fd1-eb2d10ce194f', -- Combibag
  '65c9f1c6-2a21-4950-ab56-99419fb6ec54', -- Daypack
  'c35f10bb-bfc3-44b8-8ade-a746b3ddba70', -- Shred
  -- Stash skipped (duplicate SKU)
  'f88183a0-ff91-4b4e-a5a6-9f272e98d6cf', -- Team Bag
  '31b1efdf-2ada-465a-8820-a65aeef85d18', -- Travelbag
  'd426e48d-cd7c-45e5-932a-ba9da47a2939', -- Volt D-LAB
  '1f3fe7ef-7c75-4c97-b5fe-11923efe1a1b', -- Volt SLS
  '5eaf45d6-017f-4ecb-a228-90ef9dc1229e', -- Provoke
  '374f937d-a9f9-4d4f-98fe-d24f48feb679', -- Select Concept Blue
  '364c2e85-bae5-4df7-bbef-c25cde81cd74', -- Select SLS
  'edc729d4-df20-469d-bebe-96194615c800', -- Soleil Concept Blue
  '09c0e471-ce39-45d0-993c-7f9b7d1faae1', -- Soleil SLS
  '9191d2e1-0aad-4146-bc9c-c81f3e406bee', -- Spike CB
  '3d767e5e-de8d-422a-8545-fcc13d56833b', -- Spike SLS
  'c3b9ff8b-a543-4c4a-ae7f-e6a4521f42c7', -- TS Big Air SLS
  'ea2016d1-290c-467c-b1c5-f530c18362de', -- TS Freestyle SLS
  'b2cdbaa3-c30e-4fc3-8eb2-229e8a4c87e2', -- TS Park
  'e78fb8af-d5cd-4b4e-9a71-2ba99996a9c5', -- Whip D-LAB
  '8a946a59-2ecc-4b8f-ba57-146441e90f87', -- Whip SLS
  
  -- Kites (39-53)
  '307c510c-35ca-4233-bb1a-3f9cba17f349', -- Evo D-LAB
  '5acb251c-5d4b-4bc0-b93e-9b9459c288a5', -- Juice D-LAB
  -- Neo D-LAB skipped (failed upload)
  '3582ddac-a0ff-4ef8-8ca9-f964aa9ab6c4', -- Rebel D-LAB
  -- Evo skipped (failed upload)
  'c70dba04-26ac-4bc0-b49c-42d2c434f6a8', -- Evo Concept Blue
  'f76670fb-f9cf-4a07-9f3d-f1e14be296a8', -- Neo
  -- Juice skipped (failed upload)
  'debc4650-7bd8-4666-b1e1-faddb4e73973', -- Mono
  -- Stash skipped (duplicate SKU)
  -- Dice SLS skipped (failed upload)
  -- Evo SLS skipped (failed upload)
  -- Neo SLS skipped (failed upload)
  -- Rebel SLS skipped (failed upload)
  'f26a260b-aef5-4bc5-b214-4b82560d06d1'  -- Vegas Concept Blue
);

-- Verify deletion count (should be 45 products)
SELECT COUNT(*) as deleted_count FROM products WHERE name LIKE '%Vegas 2024%' OR name LIKE '%Quick Rel%' OR name LIKE '%Gonzales%';
