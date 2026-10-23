-- CryApp Admin PRO: preparación de USD y ajustes contables.
-- Ejecutar SOLO en TEST tras revisar la aplicación; no convierte importes DOP.
BEGIN;
ALTER TABLE cryapp_subscription_plans
  ADD COLUMN IF NOT EXISTS price_usd numeric(12,2);
ALTER TABLE cryapp_subscription_plans
  ADD CONSTRAINT cryapp_plans_price_usd_nonnegative CHECK (price_usd IS NULL OR price_usd >= 0);
ALTER TABLE cryapp_payment_requests
  ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'DOP',
  ADD COLUMN IF NOT EXISTS amount_usd numeric(12,2);
ALTER TABLE cryapp_payment_requests
  ADD CONSTRAINT cryapp_payments_currency_check CHECK (currency IN ('DOP','USD')),
  ADD CONSTRAINT cryapp_payments_usd_nonnegative CHECK (amount_usd IS NULL OR amount_usd >= 0);
CREATE TABLE IF NOT EXISTS cryapp_financial_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES cryapp_payment_requests(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  kind varchar(30) NOT NULL CHECK (kind IN ('cancellation_adjustment','refund')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL CHECK (currency IN ('DOP','USD')),
  reason text NOT NULL DEFAULT '',
  actor_id uuid REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id,kind)
);
CREATE INDEX IF NOT EXISTS idx_cryapp_adjustments_created ON cryapp_financial_adjustments(created_at);
COMMIT;
