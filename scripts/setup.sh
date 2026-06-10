#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GasBill — One-command local setup script
# Usage: chmod +x scripts/setup.sh && ./scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

BOLD="\033[1m"; GREEN="\033[32m"; CYAN="\033[36m"; YELLOW="\033[33m"; RESET="\033[0m"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "${BOLD}${CYAN}🔥  GasBill Utility Billing System — Setup${RESET}"
echo "────────────────────────────────────────────"

# ── 1. Backend ────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}[1/4] Python backend${RESET}"
cd "$ROOT/backend"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "  ${YELLOW}⚠  .env created — edit DB_PASSWORD if needed${RESET}"
fi

python3 -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate

pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
echo "  ✅ Python packages installed"

python manage.py migrate --run-syncdb
echo "  ✅ Migrations applied"

python manage.py shell << 'PYEOF'
from apps.authentication.models import Role, StaffUser

# Seed roles
for r in ['super_admin','admin','billing_staff','accountant','viewer']:
    Role.objects.get_or_create(role_name=r)
print("  ✅ Roles seeded")

# Seed superuser
role = Role.objects.get(role_name='super_admin')
if not StaffUser.objects.filter(email='admin@gasbill.com').exists():
    StaffUser.objects.create_superuser(
        email='admin@gasbill.com', password='Admin@1234',
        name='System Admin', role=role
    )
    print("  ✅ Admin created: admin@gasbill.com / Admin@1234")
else:
    print("  ℹ  Admin already exists")
PYEOF

deactivate

# ── 2. Frontend ───────────────────────────────────────────────────────────────
echo -e "\n${BOLD}[2/4] Node frontend${RESET}"
cd "$ROOT/frontend"
npm install --silent
echo "  ✅ Node packages installed"

# ── 3. Done ───────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${GREEN}✅  Setup complete!${RESET}"
echo ""
echo "  To start the system, open TWO terminals:"
echo ""
echo -e "  ${BOLD}Terminal 1 — Backend:${RESET}"
echo "    cd backend && source venv/bin/activate && python manage.py runserver"
echo ""
echo -e "  ${BOLD}Terminal 2 — Frontend:${RESET}"
echo "    cd frontend && npm run dev"
echo ""
echo "  🌐 App:    http://localhost:5173"
echo "  🔌 API:    http://localhost:8000/api/v1/"
echo "  🔑 Login:  admin@gasbill.com  /  Admin@1234"
