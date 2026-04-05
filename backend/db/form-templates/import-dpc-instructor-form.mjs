/**
 * Import DPC Instructor Registration Form Template
 * 
 * This script imports the DPC Instructor Registration form template
 * into the database using the formTemplateService.
 * 
 * Usage: node backend/db/form-templates/import-dpc-instructor-form.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../db.js';
import * as formTemplateService from '../../services/formTemplateService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function importTemplate() {
  const forceUpdate = process.argv.includes('--force') || process.argv.includes('-f');
  
  console.log('🚀 Starting DPC Instructor Registration form import...\n');
  if (forceUpdate) {
    console.log('⚡ Force mode enabled - will replace existing template\n');
  }

  try {
    // Read the template JSON
    const templatePath = join(__dirname, 'dpc-instructor-registration.json');
    const templateData = JSON.parse(readFileSync(templatePath, 'utf8'));

    console.log(`📄 Template: ${templateData.name}`);
    console.log(`📝 Description: ${templateData.description}`);
    console.log(`📂 Category: ${templateData.category}`);
    console.log(`📊 Steps: ${templateData.steps.length}\n`);

    // Check if template already exists
    const existingCheck = await pool.query(
      `SELECT id FROM form_templates WHERE name = $1 AND deleted_at IS NULL`,
      [templateData.name]
    );

    if (existingCheck.rows.length > 0) {
      if (forceUpdate) {
        const existingId = existingCheck.rows[0].id;
        console.log(`🗑️  Deleting existing template (ID: ${existingId})...`);
        
        // Soft delete the existing template
        await pool.query(
          `UPDATE form_templates SET deleted_at = NOW() WHERE id = $1`,
          [existingId]
        );
        console.log('   ✓ Existing template removed\n');
      } else {
        console.log('⚠️  Template already exists. Skipping import.');
        console.log(`   Existing template ID: ${existingCheck.rows[0].id}`);
        console.log('\n   To re-import, use --force flag or first delete the existing template.');
        return;
      }
    }

    // Create the template (using null for created_by since this is a system import)
    const newTemplate = await formTemplateService.createFormTemplate({
      name: templateData.name,
      description: templateData.description,
      category: templateData.category,
      is_active: false, // Import as inactive, activate manually after review
      theme_config: templateData.theme_config,
      settings: templateData.settings
    }, null); // null for created_by (system import)

    console.log(`✅ Created template with ID: ${newTemplate.id}`);

    // Create steps and fields
    for (const stepData of templateData.steps) {
      console.log(`   📌 Creating step: ${stepData.title}`);
      
      const step = await formTemplateService.createFormStep(newTemplate.id, {
        title: stepData.title,
        description: stepData.description,
        order_index: stepData.order_index,
        show_progress: stepData.show_progress !== false,
        completion_message: stepData.completion_message,
        skip_logic: stepData.skip_logic
      });

      // Create fields for this step
      if (stepData.fields && Array.isArray(stepData.fields)) {
        for (const fieldData of stepData.fields) {
          await formTemplateService.createFormField(step.id, {
            field_type: fieldData.field_type,
            field_name: fieldData.field_name,
            field_label: fieldData.field_label,
            placeholder_text: fieldData.placeholder_text,
            help_text: fieldData.help_text,
            default_value: fieldData.default_value,
            is_required: fieldData.is_required || false,
            is_readonly: fieldData.is_readonly || false,
            order_index: fieldData.order_index,
            width: fieldData.width || 'full',
            validation_rules: fieldData.validation_rules,
            options: fieldData.options,
            conditional_logic: fieldData.conditional_logic,
            integration_mapping: fieldData.integration_mapping
          });
        }
        console.log(`      ✓ Created ${stepData.fields.length} field(s)`);
      }
    }

    console.log('\n🎉 Import completed successfully!');
    console.log(`\n📋 Template Summary:`);
    console.log(`   ID: ${newTemplate.id}`);
    console.log(`   Name: ${templateData.name}`);
    console.log(`   Status: Inactive (activate after review)`);
    console.log(`   Steps: ${templateData.steps.length}`);
    console.log(`   Total Fields: ${templateData.steps.reduce((acc, s) => acc + (s.fields?.length || 0), 0)}`);
    console.log('\n💡 Next steps:');
    console.log('   1. Go to Forms in the admin panel');
    console.log('   2. Find the "DPC Instructor Registration" form');
    console.log('   3. Review and customize the form if needed');
    console.log('   4. Upload DPC logo and background images');
    console.log('   5. Activate the form when ready');
    console.log('   6. Create a Quick Link to share the form');

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the import
importTemplate();
