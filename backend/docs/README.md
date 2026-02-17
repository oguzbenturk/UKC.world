# Plannivo
Business Management app powered by AI

## Overview

Plannivo is a comprehensive management system for service-based businesses, handling bookings, staff management, resource rentals, property services and financial operations.

## Project Structure

- **Backend**: API server built with Express.js and PostgreSQL
- **Frontend**: React-based user interface


## Getting Started

See the backend and frontend README files for specific setup instructions.
# Plannivo API Endpoints Documentation

This document provides a comprehensive list of all API endpoints available in the Plannivo application, organized by category.

## Authentication

- **POST /api/auth/login** - Authenticate user and receive JWT token
- **POST /api/auth/refresh** - Refresh JWT token
- **POST /api/auth/logout** - Invalidate current JWT token
- **GET /api/auth/me** - Get current authenticated user information

## User Management

- **GET /api/users** - List all users (Admin/Manager only)
- **GET /api/users/:id** - Get user by ID
- **POST /api/users** - Create new user (Admin/Manager only)
- **PUT /api/users/:id** - Update user information
- **DELETE /api/users/:id** - Delete user (Admin only)
- **PATCH /api/users/:id/password** - Update user password
- **GET /api/users/:id/profile** - Get user profile

## Instructor Management

- **GET /api/instructors** - List all instructors (Admin/Manager only)
- **GET /api/instructors/:id** - Get instructor by ID
- **GET /api/instructors/:id/bookings** - Get instructor's bookings
- **GET /api/instructors/:id/students** - Get instructor's students
- **GET /api/instructors/:id/services** - Get services offered by instructor
- **POST /api/instructors/:id/services** - Add service to instructor
- **PUT /api/instructors/:id/services/:serviceId** - Update instructor service
- **DELETE /api/instructors/:id/services/:serviceId** - Remove service from instructor

## Student Management

- **GET /api/students** - List all students (Admin/Manager only)
- **GET /api/students/:id** - Get student by ID
- **GET /api/students/:id/bookings** - Get student's bookings
- **GET /api/students/:id/packages** - Get student's lesson packages

## Booking System

- **GET /api/bookings** - List all bookings (Admin/Manager only)
- **GET /api/bookings/:id** - Get booking by ID
- **POST /api/bookings** - Create new booking
- **PUT /api/bookings/:id** - Update booking
- **DELETE /api/bookings/:id** - Cancel booking
- **GET /api/bookings/calendar** - Get bookings in calendar format
- **GET /api/bookings/availability** - Check instructor availability

## Services Management

- **GET /api/services** - List all services
- **GET /api/services/:id** - Get service by ID
- **POST /api/services** - Create new service (Admin/Manager only)
- **PUT /api/services/:id** - Update service (Admin/Manager only)
- **DELETE /api/services/:id** - Delete service (Admin only)

## Equipment Management

- **GET /api/equipment** - List all equipment
- **GET /api/equipment/:id** - Get equipment by ID
- **POST /api/equipment** - Add new equipment (Admin/Manager only)
- **PUT /api/equipment/:id** - Update equipment (Admin/Manager only)
- **DELETE /api/equipment/:id** - Delete equipment (Admin only)
- **GET /api/equipment/available** - List available equipment

## Rentals

- **GET /api/rentals** - List all rentals
- **GET /api/rentals/:id** - Get rental by ID
- **POST /api/rentals** - Create new rental
- **PUT /api/rentals/:id** - Update rental
- **DELETE /api/rentals/:id** - Cancel rental
- **PATCH /api/rentals/:id/return** - Mark rental as returned

## Financial Operations

- **GET /api/finances/transactions** - List all financial transactions
- **GET /api/finances/transactions/:id** - Get transaction details
- **POST /api/finances/transactions** - Record new transaction
- **GET /api/finances/reports/revenue** - Get revenue reports
- **GET /api/finances/reports/instructor-commissions** - Get instructor commission reports

## Instructor Commissions

- **GET /api/instructor-commissions** - List all instructor commissions
- **GET /api/instructor-commissions/:id** - Get commission by ID
- **POST /api/instructor-commissions/calculate** - Calculate commissions for period
- **PUT /api/instructor-commissions/:id/status** - Update commission payment status

## Resource Transfers

- **GET /api/resource-transfers** - List all resource transfers
- **GET /api/resource-transfers/:id** - Get transfer by ID
- **POST /api/resource-transfers** - Create new resource transfer
- **PUT /api/resource-transfers/:id** - Update resource transfer

## Accommodation Management

- **GET /api/accommodation** - List all accommodation units
- **GET /api/accommodation/:id** - Get accommodation unit by ID
- **POST /api/accommodation** - Create new accommodation unit (Admin/Manager only)
- **PUT /api/accommodation/:id** - Update accommodation unit (Admin/Manager only)
- **DELETE /api/accommodation/:id** - Delete accommodation unit (Admin only)
- **GET /api/accommodation/bookings** - List all accommodation bookings
- **GET /api/accommodation/bookings/:id** - Get booking by ID
- **POST /api/accommodation/bookings** - Create new accommodation booking
- **PUT /api/accommodation/bookings/:id** - Update accommodation booking
- **DELETE /api/accommodation/bookings/:id** - Cancel accommodation booking
- **GET /api/accommodation/available** - List available accommodation units
- **GET /api/accommodation/dashboard** - Get accommodation statistics for dashboard

## Settings

- **GET /api/settings** - Get system settings
- **PUT /api/settings** - Update system settings (Admin only)
- **GET /api/settings/currencies** - Get available currencies

## System Operations

- **GET /api/system/health** - Check system health
- **GET /api/system/logs** - Get system logs (Admin only)
- **POST /api/system/backup** - Create system backup (Admin only)
- **POST /api/system/restore** - Restore from backup (Admin only)

## File Upload

- **POST /api/upload** - Upload file
- **GET /api/upload/:filename** - Get uploaded file
- **DELETE /api/upload/:filename** - Delete uploaded file

---

**Note**: All endpoints except authentication endpoints require a valid JWT token in the Authorization header.

**Example**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Most endpoints have role-based access control. The roles in the system are:
- admin: Full access to all endpoints
- manager: Access to most management endpoints
- instructor: Limited access to relevant instructor endpoints
- student: Limited access to relevant student endpoints
- freelancer: Limited access to relevant freelancer endpoints

## Database Schemas

### Users Table

- **id**: UUID (Primary Key)
- **email**: String (Unique)
- **password_hash**: String
- **role_id**: UUID (Foreign Key to Roles Table)
- **name**: String
- **first_name**: String
- **last_name**: String
- **created_at**: Timestamp
- **updated_at**: Timestamp
- **profile_image_url**: String

### Roles Table

- **id**: UUID (Primary Key)
- **name**: String (Unique)

### Bookings Table

- **id**: UUID (Primary Key)
- **date**: Date
- **start_hour**: Integer
- **duration**: Float
- **student_user_id**: UUID (Foreign Key to Users Table)
- **instructor_user_id**: UUID (Foreign Key to Users Table)
- **status**: String
- **payment_status**: String
- **amount**: Float
- **notes**: String
- **location**: String
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Equipment Table

- **id**: UUID (Primary Key)
- **name**: String
- **type**: String
- **size**: String
- **brand**: String
- **model**: String
- **serial_number**: String (Unique)
- **purchase_date**: Date
- **condition**: String
- **last_maintenance**: Date
- **next_maintenance_due**: Date
- **availability**: String
- **notes**: String
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Transactions Table

- **id**: UUID (Primary Key)
- **user_id**: UUID (Foreign Key to Users Table)
- **amount**: Float
- **type**: String
- **description**: String
- **payment_method**: String
- **reference_number**: String
- **created_by**: UUID (Foreign Key to Users Table)
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Instructor Earnings Table

- **id**: UUID (Primary Key)
- **instructor_id**: UUID (Foreign Key to Users Table)
- **booking_id**: UUID (Foreign Key to Bookings Table)
- **total_earnings**: Float
- **payroll_id**: UUID (Foreign Key to Instructor Payroll Table)
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Instructor Payroll Table

- **id**: UUID (Primary Key)
- **instructor_id**: UUID (Foreign Key to Users Table)
- **period_start_date**: Date
- **period_end_date**: Date
- **base_salary**: Float
- **commission**: Float
- **bonus**: Float
- **deductions**: Float
- **total_amount**: Float
- **payment_status**: String
- **payment_date**: Date
- **notes**: String
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Student Accounts Table

- **id**: UUID (Primary Key)
- **user_id**: UUID (Foreign Key to Users Table)
- **balance**: Float
- **total_spent**: Float
- **last_payment_date**: Date
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Accommodation Units Table

- **id**: UUID (Primary Key)
- **name**: String
- **type**: String (e.g., 'Bungalow', 'Suite', 'Cabin', 'Apartment')
- **status**: String (e.g., 'Available', 'Occupied', 'Maintenance')
- **capacity**: Integer
- **price_per_night**: Decimal(10,2)
- **description**: Text
- **amenities**: JSONB
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Accommodation Bookings Table

- **id**: UUID (Primary Key)
- **unit_id**: UUID (Foreign Key to Accommodation Units Table)
- **guest_id**: UUID (Foreign Key to Users Table)
- **check_in_date**: Date
- **check_out_date**: Date
- **guests_count**: Integer
- **total_price**: Decimal(10,2)
- **status**: String (e.g., 'confirmed', 'pending', 'cancelled')
- **notes**: Text
- **created_by**: UUID (Foreign Key to Users Table)
- **updated_by**: UUID (Foreign Key to Users Table)
- **created_at**: Timestamp
- **updated_at**: Timestamp

## Configuration Files

### .env

- **JWT_SECRET**: Secret key for JWT token encryption
- **TOKEN_EXPIRY**: JWT token expiry duration
- **DB_HOST**: Database host
- **DB_PORT**: Database port
- **DB_USER**: Database user
- **DB_PASSWORD**: Database password
- **DB_NAME**: Database name

### db-init.js

- Script to initialize the database with necessary tables and data

### db.js

- Database connection and pool configuration

### authorize.js

- Middleware for role-based authorization

### auth.js

- Utility functions for authentication and JWT token management

---

**Note**: Ensure that all environment variables are properly set and managed, especially sensitive information like `JWT_SECRET`.

**Example**:
```
JWT_SECRET=your-secret-key
TOKEN_EXPIRY=24h
DB_HOST=localhost
DB_PORT=5432
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name
```
