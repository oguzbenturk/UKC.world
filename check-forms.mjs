import { pool } from './backend/db.js';

// Update the theme_config to restore the missing image_url
const updateResult = await pool.query(`
  UPDATE form_templates 
  SET theme_config = jsonb_set(
    theme_config, 
    '{background,image_url}', 
    '"/uploads/form-backgrounds/bg-9f64cebb-8dd0-4ff3-be66-77beb73b0750-1769353687859.png"'
  )
  WHERE id = 3
  RETURNING theme_config
`);
console.log('Updated theme_config:', JSON.stringify(updateResult.rows[0]?.theme_config, null, 2));

await pool.end();
