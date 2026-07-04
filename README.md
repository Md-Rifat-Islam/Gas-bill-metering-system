# 🔥 DECO — Utility Billing System

A full-stack Gas Billing Management System built with **Django REST Framework** (backend) and **React + Vite + TypeScript** (frontend), with beautiful Tailwind UI.

---

## 📁 Project Structure

```
gas-billing-system/
├── backend/                  # Django REST API
│   ├── gas_billing/          # Django project settings & urls
│   ├── apps/
│   │   ├── authentication/   # Staff login (JWT), Customer OTP, Roles
│   │   ├── projects/         # Projects & Pricing Packages
│   │   ├── buildings/        # Buildings under projects
│   │   ├── units/            # Units, Floors, Allottees
│   │   ├── meters/           # Meter assignments & readings
│   │   ├── billing/          # Bill creation & management (core)
│   │   ├── payments/         # Payment recording (Cash, bKash, Bank, etc.)
│   │   ├── reports/          # Revenue analytics & outstanding reports
│   │   └── audit/            # Full audit trail for all changes
│   ├── Dockerfile
│   ├── requirements.txt
│   └── manage.py
│
├── frontend/                 # React 18 + TypeScript + Vite
│   ├── src/
│   │   ├── api/              # Axios client with JWT auto-refresh
│   │   ├── components/
│   │   │   ├── layout/       # AppLayout with collapsible sidebar
│   │   │   └── ui/           # Modal, Badge, Pagination, Spinner, etc.
│   │   ├── pages/
│   │   │   ├── auth/         # Login page
│   │   │   ├── dashboard/    # Analytics & KPI overview
│   │   │   ├── projects/     # Project & Package CRUD
│   │   │   ├── buildings/    # Building management
│   │   │   ├── units/        # Unit & Allottee management
│   │   │   ├── billing/      # Bill creation & detail view
│   │   │   ├── payments/     # Payment transaction history
│   │   │   ├── reports/      # Charts & revenue reports
│   │   │   └── settings/     # Staff user management
│   │   ├── store/            # Zustand auth store
│   │   └── utils/            # Helper functions
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── docs/
│   └── schema.sql            # Full PostgreSQL schema reference
├── scripts/
│   └── setup.sh              # One-command setup script
└── docker-compose.yml        # Full stack Docker setup
```

---

## 🚀 Quick Start

### Option A — Local Development

```bash
# 1. Setup everything at once
chmod +x scripts/setup.sh && ./scripts/setup.sh

# 2a. Start backend
cd backend
source venv/bin/activate
python manage.py runserver

# 2b. Start frontend (new terminal)
cd frontend
npm run dev
```

### Option B — Docker Compose

```bash
cp backend/.env.example backend/.env   # Edit secrets
docker compose up --build
```

**Access:**
- 🌐 Frontend: http://localhost:5173
- 🔌 API: http://localhost:8000/api/v1/
- 🔑 Default admin: `admin@gasbill.com` / `Admin@1234`

---

## 🌟 Features

### Core Billing
- ✅ Multi-project, multi-building, multi-unit billing hierarchy
- ✅ Gas bill creation with m³ meter readings
- ✅ Automatic server-side bill calculation (usage × unit price + charges − discounts)
- ✅ Bill adjustments with mandatory audit reason
- ✅ Partial payments — bills auto-update to Partial/Paid status

### Payment Gateways
- ✅ Cash, Bank Transfer, bKash, Card, SSLCommerz
- ✅ Transaction ID tracking per payment
- ✅ Atomic payment application (DB transaction ensures consistency)

### User Management
- ✅ JWT authentication for staff (8h access + 7d refresh)
- ✅ OTP via mobile for customer portal
- ✅ 5 role types: super_admin, admin, billing_staff, accountant, viewer
- ✅ Token blacklist on logout

### Reports & Analytics
- ✅ Monthly revenue trend charts
- ✅ Revenue breakdown by project and building
- ✅ Outstanding bills tracker
- ✅ Payment method distribution

### Audit & Compliance
- ✅ Full audit log on every CREATE/UPDATE
- ✅ Stores old + new JSON snapshots per change

---

## 🔌 API Reference

| Endpoint | Methods | Description |
|---|---|---|
| `/api/v1/auth/login/` | POST | Staff JWT login |
| `/api/v1/auth/otp/request/` | POST | Customer OTP request |
| `/api/v1/auth/otp/verify/` | POST | Customer OTP verify |
| `/api/v1/projects/` | GET, POST | List/create projects |
| `/api/v1/projects/packages/` | GET, POST | Pricing packages |
| `/api/v1/buildings/` | GET, POST | Buildings |
| `/api/v1/units/` | GET, POST | Units with allottees |
| `/api/v1/meters/` | GET, POST | Meter assignments |
| `/api/v1/meters/readings/` | GET, POST | Meter readings |
| `/api/v1/billing/` | GET, POST | Bills |
| `/api/v1/billing/{id}/` | GET, PATCH | Bill detail |
| `/api/v1/billing/summary/` | GET | Bill KPI summary |
| `/api/v1/payments/` | GET, POST | Record payments |
| `/api/v1/reports/dashboard/` | GET | Dashboard stats |
| `/api/v1/reports/monthly-revenue/` | GET | Monthly trend |
| `/api/v1/reports/unpaid-bills/` | GET | Outstanding bills |
| `/api/v1/audit/` | GET | Audit log |

---

## 🛡️ Security Notes

- Never commit `.env` — change `SECRET_KEY` in production
- Disable `DEBUG` in production
- Set `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` appropriately
- The OTP endpoint currently returns OTP in the response for development — **remove this in production**

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, Django 4.2, DRF 3.14 |
| Auth | JWT (SimpleJWT), OTP via SMS |
| Database | PostgreSQL 15 |
| Cache / Queue | Redis 7, Celery |
| Frontend | React 18, TypeScript, Vite 5 |
| State | Zustand, TanStack Query v5 |
| UI | Tailwind CSS, Recharts, Lucide |
| Deploy | Docker, Nginx, Gunicorn |
