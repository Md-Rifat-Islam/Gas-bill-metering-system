-- GasBill Utility Billing System — PostgreSQL Schema Reference
-- Generated from Django models; run via `python manage.py migrate`

-- ─────────────────────────── AUTH ────────────────────────────────────────────
CREATE TABLE roles (
    id         SERIAL PRIMARY KEY,
    role_name  VARCHAR(50) UNIQUE NOT NULL   -- super_admin | admin | billing_staff | accountant | viewer
);

CREATE TABLE staff_users (
    id           BIGSERIAL PRIMARY KEY,
    role_id      INT REFERENCES roles(id) ON DELETE SET NULL,
    name         VARCHAR(100) NOT NULL,
    email        VARCHAR(254) UNIQUE NOT NULL,
    mobile       VARCHAR(15)  UNIQUE,
    password     VARCHAR(128) NOT NULL,
    is_active    BOOLEAN DEFAULT TRUE,
    is_staff     BOOLEAN DEFAULT FALSE,
    is_superuser BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customer_users (
    id         BIGSERIAL PRIMARY KEY,
    mobile     VARCHAR(15) UNIQUE NOT NULL,
    name       VARCHAR(100),
    is_active  BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE otp_verifications (
    id         BIGSERIAL PRIMARY KEY,
    mobile     VARCHAR(15) NOT NULL,
    otp_code   VARCHAR(6) NOT NULL,
    is_used    BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- JWT token blacklist managed by djangorestframework-simplejwt

-- ─────────────────────────── PROJECTS ────────────────────────────────────────
CREATE TABLE packages (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    unit_type      VARCHAR(20) DEFAULT 'm3',  -- m3 | kg
    per_unit_cost  NUMERIC(10,2) NOT NULL,
    description    TEXT,
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    address             TEXT,
    default_package_id  INT REFERENCES packages(id) ON DELETE SET NULL,
    service_charge      NUMERIC(10,2) DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────── BUILDINGS ───────────────────────────────────────
CREATE TABLE buildings (
    id                  SERIAL PRIMARY KEY,
    project_id          INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    code                VARCHAR(20),
    total_floors        INT DEFAULT 1,
    default_package_id  INT REFERENCES packages(id) ON DELETE SET NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────── UNITS ───────────────────────────────────────────
CREATE TABLE units (
    id             BIGSERIAL PRIMARY KEY,
    building_id    INT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_no       INT NOT NULL,
    unit_no        VARCHAR(10) NOT NULL,
    meter_no       VARCHAR(50) UNIQUE,
    mobile_number  VARCHAR(15),
    package_id     INT REFERENCES packages(id) ON DELETE SET NULL,
    status         VARCHAR(20) DEFAULT 'Active',  -- Active | Inactive
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (building_id, floor_no, unit_no)
);

CREATE TABLE allottees (
    id         BIGSERIAL PRIMARY KEY,
    unit_id    BIGINT UNIQUE NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(254),
    nid        VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────── METERS ──────────────────────────────────────────
CREATE TABLE meters (
    id         BIGSERIAL PRIMARY KEY,
    unit_id    BIGINT UNIQUE NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    meter_no   VARCHAR(50) UNIQUE NOT NULL,
    meter_type VARCHAR(50) DEFAULT 'Standard',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE meter_readings (
    id               BIGSERIAL PRIMARY KEY,
    meter_id         BIGINT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    previous_reading NUMERIC(10,2) NOT NULL,
    current_reading  NUMERIC(10,2) NOT NULL,
    reading_date     DATE NOT NULL,
    notes            TEXT,
    recorded_by_id   BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────── BILLING ─────────────────────────────────────────
CREATE TABLE bills (
    id                  BIGSERIAL PRIMARY KEY,
    bill_number         VARCHAR(50) UNIQUE NOT NULL,
    unit_id             BIGINT NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    building_id         INT NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
    project_id          INT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    billing_month       DATE NOT NULL,          -- first day of month

    -- Meter readings
    previous_reading    NUMERIC(10,2) DEFAULT 0,
    current_reading     NUMERIC(10,2) DEFAULT 0,
    total_usage_m3      NUMERIC(10,2) DEFAULT 0,
    total_usage_kg      NUMERIC(10,2),
    conversion_factor   NUMERIC(6,4),

    -- Pricing
    unit_price          NUMERIC(10,2) NOT NULL,
    base_amount         NUMERIC(12,2) DEFAULT 0,
    service_charge      NUMERIC(10,2) DEFAULT 0,

    -- Adjustments
    extra_charge        NUMERIC(10,2) DEFAULT 0,
    discount            NUMERIC(10,2) DEFAULT 0,
    late_fee            NUMERIC(10,2) DEFAULT 0,
    is_adjusted         BOOLEAN DEFAULT FALSE,
    adjustment_reason   TEXT,

    -- Totals
    total_amount        NUMERIC(12,2) DEFAULT 0,
    paid_amount         NUMERIC(12,2) DEFAULT 0,
    due_amount          NUMERIC(12,2) DEFAULT 0,
    status              VARCHAR(20) DEFAULT 'Unpaid',  -- Unpaid | Partial | Paid

    -- Audit
    created_by_id       BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
    last_updated_by_id  BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (unit_id, billing_month)
);

-- ─────────────────────────── PAYMENTS ────────────────────────────────────────
CREATE TABLE payments (
    id               BIGSERIAL PRIMARY KEY,
    bill_id          BIGINT NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
    paid_amount      NUMERIC(12,2) NOT NULL,
    payment_method   VARCHAR(50) NOT NULL,   -- Cash | Bank | bKash | Card | SSLCommerz
    transaction_id   VARCHAR(100) UNIQUE,
    payment_date     TIMESTAMPTZ DEFAULT NOW(),
    received_by_id   BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_transactions (
    id                       BIGSERIAL PRIMARY KEY,
    bill_id                  BIGINT NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
    gateway_name             VARCHAR(50) NOT NULL,
    gateway_transaction_id   VARCHAR(100) UNIQUE NOT NULL,
    amount                   NUMERIC(12,2) NOT NULL,
    status                   VARCHAR(20) DEFAULT 'Pending',  -- Pending | Success | Failed
    raw_response             JSONB,
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────── AUDIT ───────────────────────────────────────────
CREATE TABLE audit_logs (
    id           BIGSERIAL PRIMARY KEY,
    table_name   VARCHAR(50) NOT NULL,
    record_id    BIGINT NOT NULL,
    changed_by_id BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
    action       VARCHAR(50) NOT NULL,   -- CREATE | UPDATE | DELETE
    old_data     JSONB,
    new_data     JSONB,
    changed_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────── INDEXES ─────────────────────────────────────────
CREATE INDEX idx_bills_unit          ON bills(unit_id);
CREATE INDEX idx_bills_status        ON bills(status);
CREATE INDEX idx_bills_billing_month ON bills(billing_month);
CREATE INDEX idx_bills_project       ON bills(project_id);
CREATE INDEX idx_bills_building      ON bills(building_id);
CREATE INDEX idx_payments_bill       ON payments(bill_id);
CREATE INDEX idx_audit_table_record  ON audit_logs(table_name, record_id);
CREATE INDEX idx_otp_mobile          ON otp_verifications(mobile, is_used);
