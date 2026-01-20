#!/usr/bin/env python3
"""
Plannivo Rollback Script
========================
Deletes all test users created by populate_2000_users.py

This script reads the population_manifest.json file and:
1. Deletes all bookings created during population
2. Deletes all rentals created during population
3. Deletes all customer packages created during population
4. Deletes all test users (soft delete via API or hard delete)

Usage:
  python rollback_population.py --base-url http://localhost:3001 --admin-token <JWT>
  python rollback_population.py --manifest-file path/to/manifest.json

Requirements:
  pip install requests

Safety Features:
  - Only deletes resources tracked in the manifest
  - Confirms before deletion (unless --force flag)
  - Creates backup of manifest before deletion
"""

import os
import sys
import json
import argparse
import shutil
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)

DEFAULT_BASE_URL = "http://localhost:3001"
TIMEOUT_SECONDS = 30

class PlannivioRollback:
    """Handles rollback of populated test data"""
    
    def __init__(self, base_url: str, admin_token: str, manifest_path: str, dry_run: bool = False):
        self.base_url = base_url.rstrip('/')
        self.admin_token = admin_token
        self.manifest_path = manifest_path
        self.dry_run = dry_run
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {admin_token}',
            'Content-Type': 'application/json'
        })
        
        self.stats = {
            'users_deleted': 0,
            'users_failed': 0,
            'bookings_deleted': 0,
            'rentals_deleted': 0,
            'packages_deleted': 0
        }
    
    def _api_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Tuple[bool, Any]:
        """Make API request with error handling"""
        url = f"{self.base_url}/api{endpoint}"
        
        if self.dry_run:
            print(f"  [DRY RUN] {method} {url}")
            return True, {}
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                timeout=TIMEOUT_SECONDS
            )
            
            if response.status_code in (200, 201, 204):
                return True, response.json() if response.text else {}
            else:
                error_msg = response.json().get('error', response.text) if response.text else f"HTTP {response.status_code}"
                return False, error_msg
                
        except requests.RequestException as e:
            return False, str(e)
    
    def verify_connection(self) -> bool:
        """Verify API connection and admin token validity"""
        print("\n🔗 Verifying API connection...")
        
        success, result = self._api_request('GET', '/auth/me')
        if not success:
            print(f"❌ Connection failed: {result}")
            return False
        
        user_role = result.get('role', 'unknown')
        print(f"✅ Connected as: {result.get('email', 'unknown')} (role: {user_role})")
        
        if user_role not in ('admin', 'manager', 'owner'):
            print(f"⚠️  Warning: Role '{user_role}' may not have deletion permissions")
        
        return True
    
    def load_manifest(self) -> Optional[Dict]:
        """Load the population manifest file"""
        print(f"\n📄 Loading manifest from: {self.manifest_path}")
        
        if not os.path.exists(self.manifest_path):
            print(f"❌ Manifest file not found: {self.manifest_path}")
            return None
        
        try:
            with open(self.manifest_path, 'r') as f:
                manifest = json.load(f)
            
            print(f"  ✓ Created at: {manifest.get('created_at', 'unknown')}")
            print(f"  ✓ Users: {len(manifest.get('users', []))}")
            print(f"  ✓ Bookings: {len(manifest.get('bookings', []))}")
            print(f"  ✓ Rentals: {len(manifest.get('rentals', []))}")
            print(f"  ✓ Packages: {len(manifest.get('packages', []))}")
            
            return manifest
            
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON in manifest: {e}")
            return None
    
    def backup_manifest(self):
        """Create backup of manifest before deletion"""
        backup_path = f"{self.manifest_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(self.manifest_path, backup_path)
        print(f"💾 Manifest backed up to: {backup_path}")
    
    def delete_bookings(self, booking_ids: List[str]) -> int:
        """Delete all tracked bookings"""
        deleted = 0
        
        if not booking_ids:
            print("  ℹ️  No bookings to delete")
            return 0
        
        print(f"\n🗑️  Deleting {len(booking_ids)} bookings...")
        
        for booking_id in booking_ids:
            success, _ = self._api_request('DELETE', f'/bookings/{booking_id}')
            if success:
                deleted += 1
                self.stats['bookings_deleted'] += 1
        
        print(f"  ✓ Deleted {deleted}/{len(booking_ids)} bookings")
        return deleted
    
    def delete_rentals(self, rental_ids: List[str]) -> int:
        """Delete all tracked rentals"""
        deleted = 0
        
        if not rental_ids:
            print("  ℹ️  No rentals to delete")
            return 0
        
        print(f"\n🗑️  Deleting {len(rental_ids)} rentals...")
        
        for rental_id in rental_ids:
            success, _ = self._api_request('DELETE', f'/rentals/{rental_id}')
            if success:
                deleted += 1
                self.stats['rentals_deleted'] += 1
        
        print(f"  ✓ Deleted {deleted}/{len(rental_ids)} rentals")
        return deleted
    
    def delete_packages(self, package_ids: List[str]) -> int:
        """Delete all tracked customer packages"""
        deleted = 0
        
        if not package_ids:
            print("  ℹ️  No packages to delete")
            return 0
        
        print(f"\n🗑️  Deleting {len(package_ids)} customer packages...")
        
        for package_id in package_ids:
            success, _ = self._api_request('DELETE', f'/services/customer-packages/{package_id}')
            if success:
                deleted += 1
                self.stats['packages_deleted'] += 1
        
        print(f"  ✓ Deleted {deleted}/{len(package_ids)} packages")
        return deleted
    
    def delete_users(self, users: List[Dict]) -> int:
        """Delete all tracked test users"""
        deleted = 0
        
        if not users:
            print("  ℹ️  No users to delete")
            return 0
        
        print(f"\n🗑️  Deleting {len(users)} users...")
        
        for user in users:
            user_id = user.get('id')
            if not user_id:
                continue
            
            # Try soft delete first (standard API)
            success, _ = self._api_request('DELETE', f'/users/{user_id}')
            
            if success:
                deleted += 1
                self.stats['users_deleted'] += 1
            else:
                self.stats['users_failed'] += 1
        
        print(f"  ✓ Deleted {deleted}/{len(users)} users")
        return deleted
    
    def delete_by_email_pattern(self, pattern: str = 'stress_test_') -> int:
        """Alternative: Delete users matching email pattern (if manifest lost)"""
        print(f"\n🔍 Searching for users with email pattern: *{pattern}*")
        
        # Fetch all users and filter by pattern
        success, users = self._api_request('GET', '/users')
        
        if not success:
            print(f"❌ Failed to fetch users: {users}")
            return 0
        
        matching_users = [
            u for u in users 
            if pattern in (u.get('email', '') or '')
        ]
        
        if not matching_users:
            print("  ℹ️  No matching users found")
            return 0
        
        print(f"  Found {len(matching_users)} matching users")
        
        return self.delete_users([{'id': u['id']} for u in matching_users])
    
    def run(self, force: bool = False, pattern_fallback: bool = False) -> bool:
        """Execute the full rollback process"""
        print("\n" + "="*60)
        print("  PLANNIVO ROLLBACK SCRIPT")
        print("="*60)
        
        if self.dry_run:
            print("\n⚠️  DRY RUN MODE - No actual deletions will occur")
        
        # Verify connection
        if not self.verify_connection():
            return False
        
        # Load manifest
        manifest = self.load_manifest()
        
        if not manifest and pattern_fallback:
            print("\n⚠️  No manifest found, using email pattern fallback...")
            if not force:
                confirm = input("\nDelete users matching 'stress_test_' pattern? [y/N]: ")
                if confirm.lower() != 'y':
                    print("Rollback cancelled.")
                    return False
            
            self.delete_by_email_pattern('stress_test_')
            self.print_summary()
            return True
        
        if not manifest:
            print("\n❌ Cannot proceed without manifest or --pattern-fallback flag")
            return False
        
        # Confirm deletion
        if not force and not self.dry_run:
            print("\n" + "!"*60)
            print("  ⚠️  WARNING: This will permanently delete test data!")
            print("!"*60)
            confirm = input("\nProceed with deletion? [y/N]: ")
            if confirm.lower() != 'y':
                print("Rollback cancelled.")
                return False
        
        # Backup manifest
        if not self.dry_run:
            self.backup_manifest()
        
        # Delete in reverse order: bookings -> rentals -> packages -> users
        self.delete_bookings(manifest.get('bookings', []))
        self.delete_rentals(manifest.get('rentals', []))
        self.delete_packages(manifest.get('packages', []))
        self.delete_users(manifest.get('users', []))
        
        # Print summary
        self.print_summary()
        
        # Remove manifest if successful
        if not self.dry_run and self.stats['users_failed'] == 0:
            os.remove(self.manifest_path)
            print(f"🗑️  Manifest removed: {self.manifest_path}")
        
        return self.stats['users_failed'] == 0
    
    def print_summary(self):
        """Print final summary statistics"""
        print("\n" + "="*60)
        print("  ROLLBACK COMPLETE")
        print("="*60)
        print(f"""
📊 DELETION STATISTICS:
────────────────────────────────────────
  Users Deleted:    {self.stats['users_deleted']:,}
  Users Failed:     {self.stats['users_failed']:,}
  Bookings Deleted: {self.stats['bookings_deleted']:,}
  Rentals Deleted:  {self.stats['rentals_deleted']:,}
  Packages Deleted: {self.stats['packages_deleted']:,}

{'✅ Rollback successful!' if self.stats['users_failed'] == 0 else '⚠️  Some deletions failed'}
""")


def main():
    parser = argparse.ArgumentParser(
        description='Rollback Plannivo test data population',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python rollback_population.py --base-url http://localhost:3001 --admin-token eyJ...
  python rollback_population.py --dry-run  # Preview without deleting
  python rollback_population.py --force    # Skip confirmation prompt
  python rollback_population.py --pattern-fallback  # Use email pattern if no manifest
        """
    )
    
    parser.add_argument(
        '--base-url',
        default=os.environ.get('PLANNIVO_API_URL', DEFAULT_BASE_URL),
        help=f'API base URL (default: {DEFAULT_BASE_URL})'
    )
    
    parser.add_argument(
        '--admin-token',
        default=os.environ.get('PLANNIVO_ADMIN_TOKEN'),
        help='Admin JWT token for authentication'
    )
    
    parser.add_argument(
        '--manifest-file',
        default=os.path.join(os.path.dirname(__file__), 'population_manifest.json'),
        help='Path to population manifest file'
    )
    
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Simulate without making actual deletions'
    )
    
    parser.add_argument(
        '--force',
        action='store_true',
        help='Skip confirmation prompt'
    )
    
    parser.add_argument(
        '--pattern-fallback',
        action='store_true',
        help='If manifest not found, delete users matching stress_test_ email pattern'
    )
    
    args = parser.parse_args()
    
    if not args.admin_token and not args.dry_run:
        print("❌ Error: --admin-token required (or set PLANNIVO_ADMIN_TOKEN env var)")
        sys.exit(1)
    
    rollback = PlannivioRollback(
        base_url=args.base_url,
        admin_token=args.admin_token or 'dry-run-token',
        manifest_path=args.manifest_file,
        dry_run=args.dry_run
    )
    
    success = rollback.run(force=args.force, pattern_fallback=args.pattern_fallback)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
