#!/usr/bin/env python3
"""
Plannivo Database Population Script
===================================
Creates 2,000 unique test users via the API with:
- Unique IDs and email addresses
- Starting wallet balances
- Package purchases
- Booking histories (lessons + rentals)

Requirements:
  pip install requests faker

Usage:
  python populate_2000_users.py --base-url http://localhost:3001 --admin-token <JWT>
  
Environment Variables:
  PLANNIVO_API_URL - Base API URL (default: http://localhost:3001)
  PLANNIVO_ADMIN_TOKEN - Admin JWT token for authentication
"""

import os
import sys
import json
import argparse
import random
import time
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, Dict, Any, List, Tuple

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)

try:
    from faker import Faker
except ImportError:
    print("ERROR: 'faker' package required. Install with: pip install faker")
    sys.exit(1)

# Configuration
TOTAL_USERS = 2000
BATCH_SIZE = 50
DEFAULT_BASE_URL = "http://localhost:3001"
TIMEOUT_SECONDS = 30

# Test user prefix for easy identification/rollback
TEST_USER_PREFIX = "stress_test_"

# Pricing configuration (matches stress test)
HOURLY_RATE = 80
PACKAGE_DISCOUNT = 0.15
RENTAL_HOURLY_RATE = 25

fake = Faker()
Faker.seed(42)  # Reproducible fake data

class PlannivioPopulator:
    """Handles population of Plannivo database via REST API"""
    
    def __init__(self, base_url: str, admin_token: str, dry_run: bool = False):
        self.base_url = base_url.rstrip('/')
        self.admin_token = admin_token
        self.dry_run = dry_run
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {admin_token}',
            'Content-Type': 'application/json'
        })
        
        # Track created resources for potential rollback
        self.created_users: List[Dict] = []
        self.created_bookings: List[str] = []
        self.created_rentals: List[str] = []
        self.created_packages: List[str] = []
        self.stats = {
            'users_created': 0,
            'users_failed': 0,
            'topups_created': 0,
            'packages_purchased': 0,
            'bookings_created': 0,
            'rentals_created': 0,
            'total_topup_amount': 0,
            'total_revenue': 0
        }
        
    def _api_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Tuple[bool, Any]:
        """Make API request with error handling"""
        url = f"{self.base_url}/api{endpoint}"
        
        if self.dry_run:
            print(f"  [DRY RUN] {method} {url}")
            if data:
                print(f"    Payload: {json.dumps(data, indent=2)[:200]}...")
            return True, {'id': f'dry-run-{random.randint(1000, 9999)}'}
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                timeout=TIMEOUT_SECONDS
            )
            
            if response.status_code in (200, 201):
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
            print(f"⚠️  Warning: Role '{user_role}' may not have full permissions")
        
        return True
    
    def fetch_required_ids(self) -> Dict[str, Any]:
        """Fetch required IDs (roles, services, instructors) from the system"""
        print("\n📋 Fetching system configuration...")
        
        config = {
            'student_role_id': None,
            'outsider_role_id': None,
            'instructors': [],
            'services': [],
            'packages': [],
            'rental_equipment': []
        }
        
        # Fetch roles
        success, roles = self._api_request('GET', '/roles')
        if success and isinstance(roles, list):
            for role in roles:
                if role.get('name') == 'student':
                    config['student_role_id'] = role['id']
                elif role.get('name') == 'outsider':
                    config['outsider_role_id'] = role['id']
            print(f"  ✓ Roles: student={config['student_role_id']}, outsider={config['outsider_role_id']}")
        
        # Fetch instructors
        success, users = self._api_request('GET', '/users?role=instructor')
        if success and isinstance(users, list):
            config['instructors'] = [{'id': u['id'], 'name': u.get('name', 'Instructor')} for u in users[:10]]
            print(f"  ✓ Instructors: {len(config['instructors'])} found")
        
        # Fetch services (lessons)
        success, services = self._api_request('GET', '/services')
        if success and isinstance(services, list):
            config['services'] = [s for s in services if s.get('serviceType') != 'rental'][:5]
            config['rental_equipment'] = [s for s in services if s.get('serviceType') == 'rental' or s.get('category') == 'rental'][:5]
            print(f"  ✓ Services: {len(config['services'])} lessons, {len(config['rental_equipment'])} rentals")
        
        # Fetch packages
        success, packages = self._api_request('GET', '/services/packages')
        if success and isinstance(packages, list):
            config['packages'] = packages[:5]
            print(f"  ✓ Packages: {len(config['packages'])} available")
        
        return config
    
    def generate_user_data(self, index: int) -> Dict[str, Any]:
        """Generate unique user data for creation"""
        timestamp = int(time.time())
        unique_id = f"{TEST_USER_PREFIX}{timestamp}_{index:04d}"
        
        first_name = fake.first_name()
        last_name = fake.last_name()
        
        return {
            'first_name': first_name,
            'last_name': last_name,
            'email': f"{unique_id}@stresstest.plannivo.local",
            'phone': fake.phone_number()[:15],
            'password': 'StressTest123!',
            'age': random.randint(18, 65),
            'weight': random.randint(50, 100),
            'preferred_currency': 'EUR',
            '_test_id': unique_id  # Internal tracking
        }
    
    def create_user(self, user_data: Dict[str, Any], config: Dict) -> Optional[Dict]:
        """Create a single user via API"""
        # Use public registration endpoint (creates outsider role)
        register_data = {
            'first_name': user_data['first_name'],
            'last_name': user_data['last_name'],
            'email': user_data['email'],
            'phone': user_data.get('phone'),
            'password': user_data['password'],
            'age': user_data.get('age'),
            'weight': user_data.get('weight'),
            'preferred_currency': user_data.get('preferred_currency', 'EUR')
        }
        
        success, result = self._api_request('POST', '/auth/register', register_data)
        
        if success:
            user_id = result.get('id')
            if user_id:
                self.created_users.append({
                    'id': user_id,
                    'email': user_data['email'],
                    '_test_id': user_data['_test_id']
                })
                return {'id': user_id, **user_data}
        else:
            # Try admin user creation if registration fails
            admin_data = {
                'first_name': user_data['first_name'],
                'last_name': user_data['last_name'],
                'email': user_data['email'],
                'phone': user_data.get('phone'),
                'password': user_data['password'],
                'role_id': config.get('outsider_role_id') or config.get('student_role_id')
            }
            
            success, result = self._api_request('POST', '/users', admin_data)
            if success:
                user_id = result.get('id')
                if user_id:
                    self.created_users.append({
                        'id': user_id,
                        'email': user_data['email'],
                        '_test_id': user_data['_test_id']
                    })
                    return {'id': user_id, **user_data}
        
        return None
    
    def topup_wallet(self, user_id: str, amount: float, currency: str = 'EUR') -> bool:
        """Add funds to user's wallet"""
        deposit_data = {
            'amount': amount,
            'currency': currency,
            'method': 'cash',
            'autoComplete': True,
            'notes': 'Stress test initial balance'
        }
        
        # Admin deposit endpoint
        success, _ = self._api_request('POST', f'/wallet/admin/deposit/{user_id}', deposit_data)
        
        if success:
            self.stats['topups_created'] += 1
            self.stats['total_topup_amount'] += amount
            
        return success
    
    def purchase_package(self, user_id: str, package: Dict, config: Dict) -> Optional[str]:
        """Purchase a lesson package for user"""
        purchase_data = {
            'user_id': user_id,
            'package_id': package.get('id'),
            'payment_method': 'wallet',
            'currency': 'EUR'
        }
        
        success, result = self._api_request('POST', '/services/packages/purchase', purchase_data)
        
        if success:
            pkg_id = result.get('id') or result.get('customerPackageId')
            if pkg_id:
                self.created_packages.append(pkg_id)
                self.stats['packages_purchased'] += 1
                self.stats['total_revenue'] += float(package.get('price', 0))
                return pkg_id
        
        return None
    
    def create_booking(self, user_id: str, config: Dict, use_package: bool = False) -> Optional[str]:
        """Create a lesson booking for user"""
        if not config['instructors'] or not config['services']:
            return None
        
        instructor = random.choice(config['instructors'])
        service = random.choice(config['services'])
        
        # Generate booking date (next 30 days)
        booking_date = datetime.now() + timedelta(days=random.randint(1, 30))
        start_hour = random.choice([9, 10, 11, 14, 15, 16, 17])
        duration = random.choice([0.5, 1, 1.5, 2])
        
        booking_data = {
            'date': booking_date.strftime('%Y-%m-%d'),
            'start_hour': start_hour,
            'duration': duration,
            'student_user_id': user_id,
            'instructor_user_id': instructor['id'],
            'service_id': service.get('id'),
            'status': 'confirmed',
            'use_package': use_package,
            'amount': 0 if use_package else (HOURLY_RATE * duration),
            'notes': f'Stress test booking - {datetime.now().isoformat()}'
        }
        
        success, result = self._api_request('POST', '/bookings', booking_data)
        
        if success:
            booking_id = result.get('id')
            if booking_id:
                self.created_bookings.append(booking_id)
                self.stats['bookings_created'] += 1
                if not use_package:
                    self.stats['total_revenue'] += booking_data['amount']
                return booking_id
        
        return None
    
    def create_rental(self, user_id: str, config: Dict) -> Optional[str]:
        """Create an equipment rental for user"""
        if not config['rental_equipment']:
            return None
        
        equipment = random.choice(config['rental_equipment'])
        
        start_date = datetime.now() + timedelta(days=random.randint(1, 14))
        end_date = start_date + timedelta(hours=random.randint(2, 8))
        
        rental_data = {
            'user_id': user_id,
            'equipment_ids': [equipment.get('id')],
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'rental_date': start_date.strftime('%Y-%m-%d'),
            'status': 'active',
            'payment_status': 'paid',
            'total_price': random.randint(50, 200),
            'notes': f'Stress test rental - {datetime.now().isoformat()}'
        }
        
        success, result = self._api_request('POST', '/rentals', rental_data)
        
        if success:
            rental_id = result.get('id')
            if rental_id:
                self.created_rentals.append(rental_id)
                self.stats['rentals_created'] += 1
                self.stats['total_revenue'] += rental_data['total_price']
                return rental_id
        
        return None
    
    def process_user_batch(self, batch_users: List[Dict], config: Dict, batch_num: int) -> int:
        """Process a batch of users - create user, add balance, create bookings"""
        success_count = 0
        
        for user_data in batch_users:
            # 1. Create user
            user = self.create_user(user_data, config)
            if not user:
                self.stats['users_failed'] += 1
                continue
            
            self.stats['users_created'] += 1
            user_id = user['id']
            
            # 2. Top up wallet (random amount between 500 and 3000)
            topup_amount = random.randint(500, 3000)
            self.topup_wallet(user_id, topup_amount)
            
            # 3. Determine flow: 60% package, 40% cash
            use_package = random.random() < 0.6
            
            # 4. If package flow, purchase a package
            if use_package and config['packages']:
                package = random.choice(config['packages'])
                self.purchase_package(user_id, package, config)
            
            # 5. Create random number of bookings (1-5)
            num_bookings = random.randint(1, 5)
            for _ in range(num_bookings):
                self.create_booking(user_id, config, use_package)
            
            # 6. Optionally create rental (70% chance)
            if random.random() < 0.7:
                self.create_rental(user_id, config)
            
            success_count += 1
        
        return success_count
    
    def run(self) -> bool:
        """Execute the full population process"""
        print("\n" + "="*60)
        print("  PLANNIVO DATABASE POPULATION SCRIPT")
        print("="*60)
        
        if self.dry_run:
            print("\n⚠️  DRY RUN MODE - No actual API calls will be made")
        
        # Verify connection
        if not self.verify_connection():
            return False
        
        # Fetch system config
        config = self.fetch_required_ids()
        
        if not config['student_role_id'] and not config['outsider_role_id']:
            print("❌ No valid role IDs found. Cannot create users.")
            return False
        
        # Generate all user data upfront
        print(f"\n📝 Generating {TOTAL_USERS} user profiles...")
        all_users = [self.generate_user_data(i) for i in range(TOTAL_USERS)]
        
        # Process in batches
        num_batches = (TOTAL_USERS + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"\n🚀 Starting population ({num_batches} batches of {BATCH_SIZE})...\n")
        
        start_time = time.time()
        
        for batch_num in range(num_batches):
            batch_start = batch_num * BATCH_SIZE
            batch_end = min(batch_start + BATCH_SIZE, TOTAL_USERS)
            batch_users = all_users[batch_start:batch_end]
            
            batch_success = self.process_user_batch(batch_users, config, batch_num + 1)
            
            elapsed = time.time() - start_time
            rate = self.stats['users_created'] / elapsed if elapsed > 0 else 0
            
            print(f"✓ Batch {batch_num + 1}/{num_batches} | "
                  f"Users: {self.stats['users_created']}/{TOTAL_USERS} | "
                  f"Bookings: {self.stats['bookings_created']} | "
                  f"Rate: {rate:.1f} users/sec")
        
        # Save created user IDs for rollback
        self.save_rollback_manifest()
        
        # Print final stats
        self.print_summary(time.time() - start_time)
        
        return self.stats['users_failed'] == 0
    
    def save_rollback_manifest(self):
        """Save manifest of created resources for rollback"""
        manifest = {
            'created_at': datetime.now().isoformat(),
            'users': self.created_users,
            'bookings': self.created_bookings,
            'rentals': self.created_rentals,
            'packages': self.created_packages,
            'stats': self.stats
        }
        
        manifest_path = os.path.join(os.path.dirname(__file__), 'population_manifest.json')
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        print(f"\n💾 Rollback manifest saved to: {manifest_path}")
    
    def print_summary(self, elapsed_time: float):
        """Print final summary statistics"""
        print("\n" + "="*60)
        print("  POPULATION COMPLETE")
        print("="*60)
        print(f"""
📊 FINAL STATISTICS:
────────────────────────────────────────
  Users Created:      {self.stats['users_created']:,}
  Users Failed:       {self.stats['users_failed']:,}
  Wallet Top-ups:     {self.stats['topups_created']:,} (€{self.stats['total_topup_amount']:,.2f})
  Packages Purchased: {self.stats['packages_purchased']:,}
  Bookings Created:   {self.stats['bookings_created']:,}
  Rentals Created:    {self.stats['rentals_created']:,}
  
  Total Revenue:      €{self.stats['total_revenue']:,.2f}
  Execution Time:     {elapsed_time:.1f} seconds
  
✅ Ready for stress testing!
""")


def main():
    parser = argparse.ArgumentParser(
        description='Populate Plannivo database with 2,000 test users',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python populate_2000_users.py --base-url http://localhost:3001 --admin-token eyJ...
  python populate_2000_users.py --dry-run  # Test without making API calls
  
Environment Variables:
  PLANNIVO_API_URL     - Base API URL
  PLANNIVO_ADMIN_TOKEN - Admin JWT token
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
        '--dry-run',
        action='store_true',
        help='Simulate without making actual API calls'
    )
    
    args = parser.parse_args()
    
    if not args.admin_token and not args.dry_run:
        print("❌ Error: --admin-token required (or set PLANNIVO_ADMIN_TOKEN env var)")
        print("   Get token by logging in as admin and copying from browser DevTools")
        sys.exit(1)
    
    populator = PlannivioPopulator(
        base_url=args.base_url,
        admin_token=args.admin_token or 'dry-run-token',
        dry_run=args.dry_run
    )
    
    success = populator.run()
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
