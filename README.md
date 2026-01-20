## SEO notes

- Baseline SEO tags (title, description, OG/Twitter) are added in `index.html`.
- `public/robots.txt` and `public/sitemap.xml` are included for search engines.
- Use `usePageSEO` from `src/shared/utils/seo.js` in route components to set per-page title/description.
- For production, set a canonical URL in `index.html` and consider dynamic sitemap generation if you expose public marketing pages.

# 📋 Plannivo - Business Management System

A comprehensive business management system for service-based businesses built with React, Node.js, PostgreSQL, and Redis.

## 🚀 Quick Start (Docker)

```bash
# Clone the repository
git clone https://github.com/oguzbenturk/plannivo.git
cd plannivo

# Start all services with Docker
docker-compose up --build

# Application will be available at:
# Frontend: http://localhost:3000
# Backend API: http://localhost:4000
```

## 📁 Project Structure

```
plannivo/
├── 📁 src/                    # React frontend application
│   ├── features/              # Feature-based modules (bookings, customers, etc.)
│   ├── shared/                # Shared components, hooks, services
│   ├── routes/                # App routing
│   └── layouts/               # Layout components
├── 📁 backend/                # Node.js API server
│   ├── routes/                # API endpoints
│   ├── services/              # Business logic
│   ├── middlewares/           # Express middlewares
│   ├── scripts/               # Database utilities
│   └── db/                    # Database schemas & migrations
├── 📁 public/                 # Static assets
├── 📁 Images/                 # Application images
├── 📁 docs/                   # Documentation
├── docker-compose.yml         # Docker configuration
├── docker-compose.production.yml  # Production Docker config
├── init.sql                   # Database initialization
└── README.md                  # This file
```

## 🛠️ Development Setup

### Option 1: Docker (Recommended)
```bash
docker-compose up --build
```

### Option 2: Local Development
```bash
# Install dependencies
npm install
cd backend && npm install

# Start backend
cd backend && npm run dev

# Start frontend (in new terminal)
npm run dev:frontend
```

## 🌟 Features

- 👥 **Customer Management** - Client registration and profiles
- 📚 **Service Booking** - Schedule and manage business services
- 👨‍💼 **Staff Management** - Employee profiles and scheduling
- 🏗️ **Resource Tracking** - Business resource inventory
- 💰 **Financial Management** - Revenue tracking and reporting
- 🏠 **Property Services** - Property and accommodation management
- 📊 **Analytics Dashboard** - Business insights with instructor ratings leaderboard, cross-metric cards, and CSV/PDF exports
- 🔐 **Role-based Access** - Admin, staff, and client roles
- 🌐 **Multi-currency Support** - Handle different currencies
- 📱 **Responsive Design** - Works on all devices
- 🔐 **GDPR Compliance** - Complete data export and deletion system

## 🛡️ GDPR Compliance & Privacy

Plannivo is fully compliant with the **General Data Protection Regulation (GDPR)**, providing users with complete control over their personal data.

### User Rights Implementation

#### ✅ Article 15 - Right of Access
Users can export all their personal data in machine-readable format (JSON) with one click:
- Visit `/privacy/gdpr`
- Click "Export All My Data"
- Instant download of complete data package

**Exported Data Includes:**
- Personal information (name, email, phone, profile)
- Consent records (terms acceptance, marketing preferences)
- Booking history (as student or instructor)
- Financial records (transactions, commissions, balances)
- Communications (notifications)
- Ratings (given and received)
- Service packages, accommodation, equipment rentals
- Support requests and security audit log

#### ✅ Article 17 - Right to Erasure (Right to be Forgotten)
Users can request account deletion/anonymization:
- Self-service deletion via UI
- Financial records retained 7 years (legal requirement) but anonymized
- Irreversible action with confirmation modal

#### ✅ Article 20 - Right to Data Portability
All user data exported in structured JSON format, ready for transfer to other systems.

#### ✅ Article 7(3) - Right to Withdraw Consent
Users can manage marketing preferences:
- Email marketing opt-in/opt-out
- SMS marketing opt-in/opt-out
- WhatsApp marketing opt-in/opt-out

### Admin Tools

GDPR admin CLI for handling formal data requests:

```bash
# Export user data
node scripts/gdpr-admin.mjs export user@example.com

# Check GDPR status
node scripts/gdpr-admin.mjs status user@example.com

# Anonymize user data (with confirmation)
node scripts/gdpr-admin.mjs delete user@example.com
```

### API Endpoints

#### User Endpoints:
```http
GET /api/gdpr/export              # Export own data (JSON download)
DELETE /api/gdpr/anonymize        # Request account deletion
GET /api/gdpr/rights              # View GDPR rights information
```

#### Admin Endpoints:
```http
POST /api/gdpr/export/:userId           # Export any user's data
DELETE /api/gdpr/anonymize/:userId      # Anonymize any user's data
```

### Documentation

- 📖 **Full Guide**: [`docs/gdpr-compliance.md`](./docs/gdpr-compliance.md)
- 🎯 **Quick Reference**: [`docs/gdpr-quick-reference.md`](./docs/gdpr-quick-reference.md)

### Contact

- **Privacy Questions**: privacy@plannivo.com
- **Data Protection Officer**: dpo@plannivo.com
- **Response Time**: 30 days (GDPR Article 12)

## 📈 Instructor Ratings Analytics

The admin portal now ships with a dedicated **Instructor Ratings Analytics** module that links satisfaction metrics to operational and financial data.

- Flexible filters for service type, time range (7/30/90 days), ranking criteria, and benchmark highlighting
- Cross-metric snapshot cards covering revenue, booking value, instructor utilisation, and conversion rate
- Accessible leaderboard with per-service averages and “Top performer” tagging
- One-click **CSV** and **PDF** exports that embed filter metadata for audit trails
- Manual refresh control to re-pull data after adjustments

📚 Documentation & ops references:
- Functional walkthrough: [`docs/instructor-ratings-analytics-guide.md`](./docs/instructor-ratings-analytics-guide.md)
- Day-to-day operations runbook: [`docs/admin-analytics-runbook.md`](./docs/admin-analytics-runbook.md)

## 🔧 Configuration

### Environment Variables

Create `.env` files based on the examples:

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:4000
```

#### Backend (backend/.env)
```env
DATABASE_URL=postgresql://plannivo:password@db:5432/plannivo
JWT_SECRET=your-secret-key
REDIS_HOST=redis
REDIS_PORT=6379
```

## 🗄️ Database

The application uses PostgreSQL with the following main tables:
- `users` - User accounts (clients, staff, admins)
- `bookings` - Service bookings and scheduling
- `services` - Available services and packages
- `equipment` - Resource inventory tracking
- `financial_transactions` - Payment and financial records

## 🔑 Default Login

After running the application, you can log in with:
- **Admin**: Check the database for initial admin user
- **Demo accounts**: Created during database initialization

## 🐳 Docker Services

| Service  | Port | Description |
|----------|------|-------------|
| Frontend | 3000 | React application (Nginx) |
| Backend  | 4000 | Node.js API server |
| Database | 5432 | PostgreSQL database |
| Redis    | 6379 | Cache and sessions |

## 📚 API Documentation

The backend API provides RESTful endpoints for:
- `/api/auth` - Authentication
- `/api/users` - User management
- `/api/bookings` - Booking operations
- `/api/equipment` - Equipment management
- `/api/finances` - Financial operations
- `/api/services` - Service management
- `/api/gdpr` - GDPR data export and deletion

## 🧪 Testing

```bash
# Run frontend tests
npm test

# Run backend tests
cd backend && npm test

# Run with coverage
npm run test:coverage
```

## 🚀 Production Deployment

For production deployment on Ubuntu server, see the comprehensive Turkish guide:
[SUNUCU_KURULUM_REHBERI.md](./SUNUCU_KURULUM_REHBERI.md)

### Automated deploy helper: push-all

This repository includes `push-all.js`, a helper that:
- Swaps `.env` files to production, commits and pushes
- Restores local `.env` to development
- SSHes into your host, pulls the latest code, and rebuilds/restarts services

Provide secrets via environment variables (PowerShell example):

```
$env:DEPLOY_HOST="<ip>"; $env:DEPLOY_USER="root"; $env:DEPLOY_PASSWORD="<password>"; $env:DEPLOY_PATH="/root/plannivo"; npm run push-all -- --title "Deploy updates" --desc "Update application with latest changes" --branch "master"
```

Optional variables: `DEPLOY_BRANCH`, `DEPLOY_BUILD_CMD`, `DEPLOY_PRE_BUILD_CMD`, `DEPLOY_POST_BUILD_CMD`, `DEPLOY` (set to `false` to skip remote deploy)

Use `--dry-run` to preview actions without pushing or deploying.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📧 Email: support@plannivo.com
- 📖 Documentation: [docs/](./docs/)
- 🐛 Issues: [GitHub Issues](https://github.com/oguzbenturk/plannivo/issues)

---

**Built with ❤️ for the business community**
