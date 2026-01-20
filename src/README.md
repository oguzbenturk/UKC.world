# Project Structure - Kite Surfing School Management System

This project has been reorganized using a **feature-based architecture** for better maintainability and scalability.

## 🏗️ Structure Overview

```
src/
├── features/          # Feature-based modules
├── shared/           # Shared resources across features
├── layouts/          # Layout components
├── routes/           # Routing configuration
├── config/           # Configuration files
├── styles/           # Global styles
└── tests/           # Test files
```

## 📁 Features

Each feature follows the same internal structure:

```
feature/
├── components/       # Feature-specific components
├── pages/           # Feature pages
├── hooks/           # Feature-specific hooks
├── services/        # Feature-specific services
└── index.js         # Feature exports
```

### Available Features:

- **🔐 authentication** - Login, user profiles, auth context
- **📅 bookings** - Calendar, booking forms, timeline
- **👥 customers** - Customer management, profiles, users with student role
- **🧑‍🏫 instructors** - Instructor management, payments, commissions
- **🏄‍♂️ equipment** - Equipment tracking, forms, details
- **⚙️ services** - Service management, cards, modals
- **💰 finances** - Financial tracking, summaries, transactions
- **🚢 rentals** - Rental management
- **📊 dashboard** - Dashboard, settings, shop

## 🔄 Shared Resources

```
shared/
├── components/
│   ├── layout/      # Navigation, sidebar, layout
│   └── ui/          # Reusable UI components
├── hooks/           # Custom hooks used across features
├── services/        # API clients, data services
├── utils/           # Utility functions
├── constants/       # App constants
├── contexts/        # React contexts
└── models/          # Data models
```

## 📦 Easy Imports

### Import from features:
```javascript
import { Login, Dashboard } from '@/features';
import { BookingForm } from '@/features/bookings';
```

### Import shared resources:
```javascript
import { Layout, ErrorIndicator } from '@/shared';
import { useAuth } from '@/shared/hooks';
```

## 🎯 Benefits

✅ **Clear separation of concerns**  
✅ **Feature-based organization**  
✅ **Easy navigation and maintenance**  
✅ **Scalable architecture**  
✅ **Centralized shared resources**  
✅ **Simple import system**

## 🚀 Getting Started

All imports remain the same, but now you can also use the new feature-based imports for better organization.

The old file structure has been completely reorganized - all components, pages, and services are now properly categorized by their business domain.
