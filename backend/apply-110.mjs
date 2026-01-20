import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL
});

async function apply() {
  const client = await pool.connect();
  try {
    await client.query("ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS question_icon_type VARCHAR(50) DEFAULT 'question'");
    console.log('✅ Column added successfully');
    
    await client.query("CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_question_icon_type ON marketing_campaigns(question_icon_type) WHERE type = 'question'");
    console.log('✅ Index created successfully');
    
    await client.query("COMMENT ON COLUMN marketing_campaigns.question_icon_type IS 'Icon type for question campaigns (question, info, bulb, heart, star, trophy, gift, rocket, fire, bell)'");
    console.log('✅ Comment added successfully');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

apply();
