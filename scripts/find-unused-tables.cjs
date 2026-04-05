const fs = require('fs');
const path = require('path');

// --- Configuration ---
const ROOT_DIR = path.resolve(__dirname, '..');

const TABLE_LIST_CSV = `accommodation_bookings,accommodation_units,api_keys,archive_legacy_transactions,archive_student_accounts,audit_logs,bank_transfer_receipts,booking_custom_commissions,booking_equipment,booking_participants,booking_reschedule_notifications,booking_series,booking_series_customers,bookings,business_expenses,conversation_participants,conversations,currency_settings,currency_update_logs,customer_packages,deleted_booking_relations_backup,deleted_bookings_backup,deleted_entities_backup,earnings_audit_log,equipment,event_registrations,events,family_members,feedback,financial_events,financial_settings,financial_settings_overrides,form_analytics_events,form_email_logs,form_email_notifications,form_fields,form_quick_action_tokens,form_steps,form_submissions,form_template_versions,form_templates,group_booking_participants,group_bookings,group_lesson_requests,instructor_category_rates,instructor_commission_history,instructor_default_commissions,instructor_earnings,instructor_payroll,instructor_rate_history,instructor_ratings,instructor_service_commissions,instructor_services,instructor_skills,instructor_student_notes,legal_documents,liability_waivers,manager_commission_settings,manager_commissions,manager_payout_items,manager_payouts,manager_salary_records,marketing_campaigns,member_offerings,member_purchases,message_reactions,messages,notification_settings,notifications,package_hour_fixes,package_prices,password_reset_tokens,payment_gateway_webhook_events,payment_intents,performance_overview,popup_analytics,popup_configurations,popup_content_blocks,popup_media_assets,popup_targeting_rules,popup_templates,popup_user_interactions,product_subcategories,products,push_subscriptions,quick_link_registrations,quick_links,recommended_products,refunds,rental_details,rental_equipment,rentals,repair_request_comments,repair_requests,revenue_items,roles,schema_migrations,security_audit,service_categories,service_packages,service_prices,service_revenue_ledger,services,settings,shop_order_items,shop_order_messages,shop_order_status_history,shop_orders,skill_levels,skills,spare_parts_orders,student_accounts,student_achievements,student_progress,student_support_requests,transactions,user_consents,user_popup_preferences,user_preferences,user_relationships,user_sessions,user_tags,user_vouchers,users,v_booking_details,voucher_campaigns,voucher_codes,voucher_redemptions,waiver_versions,wallet_audit_logs,wallet_balances,wallet_bank_accounts,wallet_deposit_requests,wallet_export_jobs,wallet_kyc_documents,wallet_notification_delivery_logs,wallet_notification_preferences,wallet_payment_methods,wallet_promotions,wallet_settings,wallet_transactions,wallet_withdrawal_requests`;

const ALLOWED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.java', '.xml', '.sql']);

const IGNORED_DIRS = new Set(['node_modules', 'target', 'build', 'dist', '.git', '.idea', 'coverage']);

// --- Parse table list ---
const tables = TABLE_LIST_CSV.split(',').map(t => t.trim()).filter(Boolean);
console.log(`Toplam tablo sayisi: ${tables.length}`);

// --- Collect all files recursively ---
function collectFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log('Dosyalar taranıyor...');
const files = collectFiles(ROOT_DIR);
console.log(`Taranan dosya sayisi: ${files.length}`);

// --- Read all file contents once ---
const fileContents = [];
for (const filePath of files) {
  try {
    fileContents.push(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    // skip unreadable files
  }
}

// --- Check each table ---
const usedTables = [];
const unusedTables = [];

for (const table of tables) {
  const regex = new RegExp(`\\b${table}\\b`);
  let found = false;
  for (const content of fileContents) {
    if (regex.test(content)) {
      found = true;
      break;
    }
  }
  if (found) {
    usedTables.push(table);
  } else {
    unusedTables.push(table);
  }
}

// --- Report ---
console.log('\n========== SONUC ==========');
console.log(`Toplam tablo:       ${tables.length}`);
console.log(`Kullanilan:         ${usedTables.length}`);
console.log(`Kullanilmayan:      ${unusedTables.length}`);

if (unusedTables.length > 0) {
  console.log('\nKullanilmayan tablolar:');
  unusedTables.forEach(t => console.log(`  - ${t}`));
}

// --- Write to file ---
const outputPath = path.join(ROOT_DIR, 'kullanilmayan_tablolar.txt');
fs.writeFileSync(outputPath, unusedTables.join('\n') + '\n', 'utf-8');
console.log(`\nSonuclar "${outputPath}" dosyasina kaydedildi.`);
