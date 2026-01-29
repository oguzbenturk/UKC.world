#!/usr/bin/env node
/**
 * Automated Package Cleanup
 * WARNING: This will modify package.json files
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');

console.log(DRY_RUN ? '🔍 DRY RUN MODE\n' : '⚠️  LIVE MODE - Making changes!\n');

// Packages to remove from root
const rootPackages = [
  'bcrypt',
  'express-validator',
  'node-ssh',
  'cheerio',
  'pg',
  'jsonwebtoken',
];

// Packages to remove from backend
const backendPackages = [
  'react-window',
  'react-window-infinite-loader',
];

try {
  // Clean root packages
  console.log('🧹 Cleaning root package.json...\n');
  const rootPkg = JSON.parse(readFileSync('./package.json', 'utf8'));
  let removedFromRoot = 0;
  
  rootPackages.forEach(pkg => {
    if (rootPkg.dependencies && rootPkg.dependencies[pkg]) {
      console.log(`  ❌ Removing ${pkg} from root`);
      if (!DRY_RUN) {
        delete rootPkg.dependencies[pkg];
      }
      removedFromRoot++;
    }
  });

  if (!DRY_RUN && removedFromRoot > 0) {
    writeFileSync('./package.json', JSON.stringify(rootPkg, null, 2) + '\n');
    console.log(`\n✅ Updated root package.json (removed ${removedFromRoot} packages)`);
  }

  // Clean backend packages
  console.log('\n🧹 Cleaning backend/package.json...\n');
  const backendPkg = JSON.parse(readFileSync('./backend/package.json', 'utf8'));
  let removedFromBackend = 0;
  
  backendPackages.forEach(pkg => {
    if (backendPkg.dependencies && backendPkg.dependencies[pkg]) {
      console.log(`  ❌ Removing ${pkg} from backend`);
      if (!DRY_RUN) {
        delete backendPkg.dependencies[pkg];
      }
      removedFromBackend++;
    }
  });

  if (!DRY_RUN && removedFromBackend > 0) {
    writeFileSync('./backend/package.json', JSON.stringify(backendPkg, null, 2) + '\n');
    console.log(`\n✅ Updated backend/package.json (removed ${removedFromBackend} packages)`);
  }

  if (DRY_RUN) {
    console.log('\n📋 Summary (DRY RUN):');
    console.log(`   Would remove ${removedFromRoot} packages from root`);
    console.log(`   Would remove ${removedFromBackend} packages from backend`);
    console.log('\n👉 Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ Package.json files updated!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run: npm install');
    console.log('   2. Run: cd backend && npm install');
    console.log('   3. Test your application');
    console.log('   4. Delete node_modules and reinstall if issues:');
    console.log('      rm -rf node_modules backend/node_modules');
    console.log('      npm install && cd backend && npm install');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
