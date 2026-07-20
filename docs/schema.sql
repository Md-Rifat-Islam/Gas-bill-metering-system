-- DECO Utility Billing System — PostgreSQL Schema Reference
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
    created_by_id BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,  -- who created this account (Admin hierarchy)
    notes        TEXT DEFAULT '',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customer_users (
    id         BIGSERIAL PRIMARY KEY,
    mobile     VARCHAR(15) UNIQUE NOT NULL,
    name       VARCHAR(100),
    email      VARCHAR(254) DEFAULT '',
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

-- Per-user, per-module permission override on top of a StaffUser's role.
-- NOTE: present in the schema and editable via the Staff edit UI, but NOT
-- currently consulted by any permission check — role alone determines
-- access today. Kept for a planned future enforcement pass.
CREATE TABLE user_permissions (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    module       VARCHAR(30) NOT NULL,  -- projects | buildings | units | meters | billing | payments | reports | staff | audit
    can_view     BOOLEAN DEFAULT TRUE,
    can_edit     BOOLEAN DEFAULT FALSE,
    can_delete   BOOLEAN DEFAULT FALSE,
    granted_by_id BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, module)
);

-- JWT token blacklist managed by djangorestframework-simplejwt
-- NOTE: the customer portal uses a separately-shaped JWT (embeds
-- user_type='customer', customer_id, mobile) via a dedicated
-- CustomerJWTAuthentication class — it does not reference staff_users.

-- ─────────────────────────── PROJECTS ────────────────────────────────────────
CREATE TABLE packages (
    id                 SERIAL PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    unit_type          VARCHAR(20) DEFAULT 'm3',  -- m3 | kg
    per_unit_cost      NUMERIC(10,2) NOT NULL,
    conversion_factor  NUMERIC(6,4),              -- Kg per m³; used only when unit_type = kg
    description        TEXT,
    is_active          BOOLEAN DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
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
    meter_no       VARCHAR(50) UNIQUE,   -- legacy mirror only; the linked meters row (below) is
                                          -- the source of truth. Kept in sync automatically
                                          -- whenever a Meter is created/updated, but no longer
                                          -- independently editable from the API — see meters.
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
    barcode    VARCHAR(100) UNIQUE,   -- scan-to-select payload for Quick Reading Dashboard
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE meter_readings (
    id               BIGSERIAL PRIMARY KEY,
    meter_id         BIGINT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    previous_reading NUMERIC(10,2) NOT NULL,
    current_reading  NUMERIC(10,2) NOT NULL,
    reading_date     DATE NOT NULL,
    reading_photo    VARCHAR(255),         -- photo of the meter at time of reading
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
    total_usage_kg      NUMERIC(10,2),          -- populated, and BILLED ON, when conversion_factor is set
    conversion_factor   NUMERIC(6,4),           -- snapshot copy from the package at creation time

    -- Pricing
    unit_price          NUMERIC(10,2) NOT NULL, -- per m³, or per Kg when conversion_factor is set
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
    id                      BIGSERIAL PRIMARY KEY,
    bill_id                 BIGINT NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
    paid_amount             NUMERIC(12,2) NOT NULL,
    payment_method          VARCHAR(50) NOT NULL,   -- Cash | Bank | bKash | Card | SSLCommerz
    transaction_id          VARCHAR(100) UNIQUE,

    -- Explicit, required, user-supplied date of the payment itself.
    -- (Previously defaulted to the record's creation timestamp — that made
    -- it impossible to record a payment dated earlier than data-entry time.
    -- created_at, below, still tracks when the record was actually created.)
    payment_date            DATE NOT NULL,

    -- Proof of payment — required by the API for both manual staff entry
    -- and customer portal submissions (enforced in serializers, not here).
    proof_image             VARCHAR(255),
    proof_invoice           VARCHAR(255),

    source                  VARCHAR(20) DEFAULT 'staff',     -- staff | customer
    status                  VARCHAR(20) DEFAULT 'Approved',  -- Pending | Approved | Rejected

    submitted_by_customer_id BIGINT REFERENCES customer_users(id) ON DELETE SET NULL,
    received_by_id          BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,   -- who recorded a staff-entered payment
    reviewed_by_id           BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,   -- who approved/rejected a customer submission
    reviewed_at              TIMESTAMPTZ,
    remarks                  TEXT DEFAULT '',

    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW()
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

-- Singleton row (always id = 1) — admin-configurable bKash/Nagad/Bank
-- details shown to customers before they submit a manual payment.
CREATE TABLE payment_channel_settings (
    id                     SERIAL PRIMARY KEY,
    bkash_number           VARCHAR(20) DEFAULT '',
    bkash_type             VARCHAR(20) DEFAULT 'Personal',
    nagad_number           VARCHAR(20) DEFAULT '',
    bank_name              VARCHAR(100) DEFAULT '',
    bank_account_name      VARCHAR(100) DEFAULT '',
    bank_account_number    VARCHAR(50)  DEFAULT '',
    bank_branch            VARCHAR(100) DEFAULT '',
    bank_routing_number    VARCHAR(50)  DEFAULT '',
    instructions           TEXT DEFAULT '',
    updated_by_id          BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────── AUDIT ───────────────────────────────────────────
CREATE TABLE audit_logs (
    id                    BIGSERIAL PRIMARY KEY,
    table_name            VARCHAR(50) NOT NULL,
    record_id             BIGINT NOT NULL,

    -- An entry is attributed to exactly one of the two actor FKs below (or
    -- neither, for a system-initiated action) — changed_by alone couldn't
    -- represent a customer-submitted action (e.g. a portal payment), so a
    -- separate nullable FK was added rather than forcing every actor to be
    -- a staff user.
    changed_by_id          BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
    changed_by_customer_id BIGINT REFERENCES customer_users(id) ON DELETE SET NULL,

    action                VARCHAR(50) NOT NULL,   -- CREATE | UPDATE | DELETE
    old_data              JSONB,
    new_data              JSONB,
    changed_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────── INDEXES ─────────────────────────────────────────
CREATE INDEX idx_bills_unit          ON bills(unit_id);
CREATE INDEX idx_bills_status        ON bills(status);
CREATE INDEX idx_bills_billing_month ON bills(billing_month);
CREATE INDEX idx_bills_project       ON bills(project_id);
CREATE INDEX idx_bills_building      ON bills(building_id);
CREATE INDEX idx_payments_bill       ON payments(bill_id);
CREATE INDEX idx_payments_status     ON payments(status);
CREATE INDEX idx_payments_source     ON payments(source);
CREATE INDEX idx_meters_barcode      ON meters(barcode);
CREATE INDEX idx_meter_readings_meter_date ON meter_readings(meter_id, reading_date DESC);
CREATE INDEX idx_audit_table_record  ON audit_logs(table_name, record_id);
CREATE INDEX idx_otp_mobile          ON otp_verifications(mobile, is_used);