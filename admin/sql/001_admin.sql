CREATE TABLE IF NOT EXISTS cryapp_admin_roles (
 user_id uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('superadmin','admin','payments')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cryapp_subscription_plans (
 id text PRIMARY KEY, name text NOT NULL, price_dop numeric(12,2) NOT NULL CHECK(price_dop>=0),
 duration_days integer NOT NULL CHECK(duration_days>0), active boolean NOT NULL DEFAULT true
);
INSERT INTO cryapp_subscription_plans(id,name,price_dop,duration_days) VALUES
 ('pro','PRO',299,30),('premium','PREMIUM',599,30) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS cryapp_payment_requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES usuarios(id), plan_id text NOT NULL REFERENCES cryapp_subscription_plans(id),
 amount_dop numeric(12,2) NOT NULL CHECK(amount_dop>=0), reference text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by uuid REFERENCES usuarios(id), note text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cryapp_user_subscriptions (
 user_id uuid PRIMARY KEY REFERENCES usuarios(id), plan_id text NOT NULL REFERENCES cryapp_subscription_plans(id),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, payment_id uuid REFERENCES cryapp_payment_requests(id)
);
CREATE TABLE IF NOT EXISTS cryapp_admin_audit (
 id bigserial PRIMARY KEY, actor_id uuid REFERENCES usuarios(id), action text NOT NULL, target text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
