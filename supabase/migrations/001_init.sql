-- 001_init.sql — Начальная схема БД для tg-stroyka
-- Выполнить в Supabase Dashboard → SQL Editor

-- ============================================================
-- ТАБЛИЦА ЛИДОВ
-- ============================================================
CREATE TABLE leads (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  region        TEXT,
  area          INTEGER,
  floors        TEXT,
  foundation    TEXT,
  roof_material TEXT,
  roof_shape    TEXT,
  style         TEXT,
  facade        TEXT,
  finishing     TEXT,
  options       JSONB DEFAULT '[]',
  total         NUMERIC,
  tg_user_id    BIGINT,
  tg_username   TEXT,
  status        TEXT DEFAULT 'new',   -- new | called | accepted | refused
  pdf_url       TEXT,
  manager_notified BOOLEAN DEFAULT FALSE,
  notes         TEXT
);

CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_status     ON leads(status);
CREATE INDEX idx_leads_phone      ON leads(phone);

-- ============================================================
-- ТАБЛИЦА ЦЕН (одна строка id='current')
-- ============================================================
CREATE TABLE prices (
  id           TEXT PRIMARY KEY DEFAULT 'current',
  box_per_sqm  JSONB NOT NULL,
  foundation   JSONB NOT NULL,
  roof_material JSONB NOT NULL,
  roof_shape   JSONB NOT NULL,
  style        JSONB NOT NULL,
  facade       JSONB NOT NULL,
  finishing    JSONB NOT NULL,
  options      JSONB NOT NULL,
  region       JSONB NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO prices (id, box_per_sqm, foundation, roof_material, roof_shape, style, facade, finishing, options, region)
VALUES (
  'current',
  '{"single": 22000, "mansard": 20000, "double": 19000}',
  '{"pile": 4000, "strip": 7000, "slab": 10000, "ushp": 16000}',
  '{"metalTile": 1.0, "softRoofing": 1.08, "standingSeam": 1.15}',
  '{"gable": 1.0, "hip": 1.12, "flat": 0.95}',
  '{"classic": 1.0, "hitech": 1.10, "chalet": 1.18}',
  '{"plaster": 3500, "brick": 8000, "panel": 5500, "none": 0}',
  '{"shell": 0, "rough": 7000, "whitebox": 10000, "turnkeyEco": 12000, "turnkeyStd": 22000}',
  '{"terrace": 200000, "garage": 380000, "bathhouse": 420000}',
  '{"kaluga": 1.0, "obninsk": 1.0, "moscow_obl": 1.15, "new_moscow": 1.15}'
);

-- ============================================================
-- ИСТОРИЯ ИЗМЕНЕНИЙ ЦЕН
-- ============================================================
CREATE TABLE prices_history (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  changed_at       TIMESTAMPTZ DEFAULT NOW(),
  changed_by       TEXT,
  prices_snapshot  JSONB NOT NULL
);

-- ============================================================
-- ПОРТФОЛИО
-- ============================================================
CREATE TABLE portfolio (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  title       TEXT,
  area        INTEGER,
  floors      TEXT,
  style       TEXT,
  description TEXT,
  photo_url   TEXT,
  is_visible  BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- FAQ (вопросы по шагам калькулятора)
-- ============================================================
CREATE TABLE faq (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  step       TEXT NOT NULL,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

INSERT INTO faq (step, question, answer, sort_order) VALUES
  ('foundation', 'Чем отличается свайный фундамент от ленточного?',
   'Свайный монтируется за 1 день, дешевле, подходит для большинства участков. Ленточный надёжнее на сложных грунтах и позволяет сделать полноценный подвал.', 1),
  ('foundation', 'Что такое УШП и зачем он нужен?',
   'Утеплённая шведская плита — монолитный фундамент с интегрированными тёплыми полами. Дороже на 50–100%, но экономит на отоплении до 30–40% в год.', 2),
  ('foundation', 'Можно ли ставить газобетон на сваи?',
   'Да, это стандартная практика в нашем регионе. Мы проектируем ростверк, который равномерно распределяет нагрузку стен из газобетона.', 3),
  ('roof', 'Какая кровля лучше для нашего климата?',
   'Металлочерепица — оптимальный выбор по цене и надёжности. Мягкая черепица тише при дожде и долговечнее. Фальцевая — премиум-вариант, срок службы 50+ лет.', 1),
  ('roof', 'Что надёжнее: двускатная или четырёхскатная кровля?',
   'Оба варианта надёжны. Четырёхскатная (+12%) лучше выглядит с разных сторон и меньше подвержена ветровой нагрузке. Двускатная проще в обслуживании.', 2),
  ('style', 'Что входит в стоимость стиля хай-тек?',
   'Надбавка 10% включает панорамные окна увеличенного размера, плоские фасадные элементы, нестандартную геометрию кровли и отделку металлом/стеклом.', 1),
  ('style', 'Сколько стоит шале?',
   'Шале дороже на 18% из-за крутого уклона кровли (до 45°), открытых деревянных балок, расширенных свесов и балкона. Требует более сложных расчётов.', 2),
  ('facade', 'Зачем нужен отдельный фасад если есть газобетон?',
   'Газобетон требует защиты от влаги. Штукатурка — минимально необходимый вариант. Облицовочный кирпич или фасадные панели — долговечнее и не требуют покраски каждые 5–7 лет.', 1),
  ('facade', 'Можно ли сделать фасад позже?',
   'Технически — да, но мы рекомендуем делать сразу. Без фасадной защиты газобетон намокает при дожде, что снижает теплоизоляцию и ускоряет износ.', 2),
  ('finishing', 'Что такое "Вайт бокс"?',
   'Чистовая стяжка пола, ошпаклёванные стены, смонтированные окна и двери, разведённые коммуникации. Заезжаете и делаете финишную отделку самостоятельно или позже.', 1),
  ('finishing', 'Что входит в "Под ключ стандарт"?',
   'Финишные материалы среднего+: ламинат, керамогранит, обои или покраска, встроенная мебель в санузле, чистовая сантехника. Заезжаете с мебелью.', 2);

-- ============================================================
-- СЕССИИ TELEGRAM-БОТА (для команды /addphoto)
-- ============================================================
CREATE TABLE bot_sessions (
  tg_user_id BIGINT PRIMARY KEY,
  state      TEXT,
  data       JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

-- ============================================================
-- RLS — Row Level Security
-- ============================================================
ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio      ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions   ENABLE ROW LEVEL SECURITY;

-- Только service_role имеет доступ (используется в Vercel Functions)
CREATE POLICY "service_role_leads"   ON leads          TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_prices"  ON prices         TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_history" ON prices_history TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_portfolio" ON portfolio    TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_faq"     ON faq            TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_sessions" ON bot_sessions  TO service_role USING (true) WITH CHECK (true);
