-- CryApp Admin PRO: preparación de USD y ajustes contables.
-- Ejecutar SOLO en TEST tras revisar la aplicación; no convierte importes DOP.
-- Los reembolsos pendientes NO reducen ingresos. Permite varios reembolsos parciales;
-- la API debe impedir que la suma confirmada exceda el importe pagado.
BEGIN;
ALTER TABLE cryapp_subscription_plans
  ADD COLUMN IF NOT EXISTS price_usd numeric(12,2);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cryapp_plans_price_usd_nonnegative') THEN ALTER TABLE cryapp_subscription_plans ADD CONSTRAINT cryapp_plans_price_usd_nonnegative CHECK (price_usd IS NULL OR price_usd >= 0); END IF; END $$;
ALTER TABLE cryapp_payment_requests
  ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'DOP',
  ADD COLUMN IF NOT EXISTS amount_usd numeric(12,2);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cryapp_payments_currency_check') THEN ALTER TABLE cryapp_payment_requests ADD CONSTRAINT cryapp_payments_currency_check CHECK (currency IN ('DOP','USD')); END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cryapp_payments_usd_nonnegative') THEN ALTER TABLE cryapp_payment_requests ADD CONSTRAINT cryapp_payments_usd_nonnegative CHECK (amount_usd IS NULL OR amount_usd >= 0); END IF; END $$;
-- Precios solicitados: USD 30 PRO y USD 50 PREMIUM; no alterar precios DOP históricos.
UPDATE cryapp_subscription_plans SET price_usd = CASE id WHEN 'pro' THEN 30.00 WHEN 'premium' THEN 50.00 END WHERE id IN ('pro','premium');
CREATE TABLE IF NOT EXISTS cryapp_financial_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES cryapp_payment_requests(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  kind varchar(30) NOT NULL CHECK (kind = 'refund'),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  confirmed_at timestamptz,
  CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL CHECK (currency IN ('DOP','USD')),
  reason text NOT NULL DEFAULT '',
  actor_id uuid REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cryapp_adjustments_payment ON cryapp_financial_adjustments(payment_id);
CREATE INDEX IF NOT EXISTS idx_cryapp_adjustments_created ON cryapp_financial_adjustments(created_at);
COMMIT;
