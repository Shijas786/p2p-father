-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. USERS TABLE
create table public.users (
  id uuid default gen_random_uuid() primary key,
  telegram_id bigint unique not null,
  username text,
  first_name text,
  wallet_address text,
  wallet_type text not null default 'bot' check (wallet_type in ('bot', 'external')),
  wallet_index integer not null default 0, -- HD Wallet Index
  upi_id text,
  bank_details jsonb,
  trade_count integer default 0,
  completed_trades integer default 0,
  trust_score numeric default 100.0,
  tier text default 'standard',
  is_verified boolean default false,
  is_banned boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. ORDERS TABLE (Ads)
create table public.orders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) not null,
  type text not null check (type in ('buy', 'sell')),
  token text not null, -- e.g. 'USDC'
  chain text not null, -- e.g. 'base'
  amount numeric not null,
  min_amount numeric,
  max_amount numeric,
  rate numeric not null, -- Fiat Rate
  fiat_currency text not null default 'INR',
  payment_methods jsonb not null default '[]'::jsonb,
  payment_details jsonb default '{}'::jsonb, -- e.g. { "upi": "user@okicici", "group_id": -100123 }
  status text not null default 'active',
  filled_amount numeric default 0,
  expires_at timestamp with time zone, -- Auto-cancel time
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. TRADES TABLE (Active Deals)
create table public.trades (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references public.orders(id) not null,
  buyer_id uuid references public.users(id) not null,
  seller_id uuid references public.users(id) not null,
  token text not null,
  chain text not null,
  amount numeric not null,
  rate numeric not null,
  fiat_amount numeric not null,
  fiat_currency text default 'INR',
  fee_amount numeric default 0,
  fee_percentage numeric default 0.005,
  buyer_receives numeric not null,
  payment_method text,
  escrow_tx_hash text,
  release_tx_hash text,
  fee_tx_hash text,
  on_chain_trade_id bigint, -- ID from Smart Contract
  status text not null default 'created',
  escrow_locked_at timestamp with time zone,
  fiat_sent_at timestamp with time zone,
  fiat_confirmed_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  auto_release_at timestamp with time zone,
  dispute_reason text,
  dispute_evidence jsonb,
  resolution text,
  resolved_by text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. PAYMENT PROOFS TABLE
create table public.payment_proofs (
  id uuid default gen_random_uuid() primary key,
  trade_id uuid references public.trades(id) not null,
  user_id uuid references public.users(id) not null,
  utr text,
  amount numeric,
  receiver_upi text,
  screenshot_file_id text, -- Telegram File ID
  timestamp timestamp with time zone default now(),
  ai_verified boolean default false,
  ai_confidence numeric default 0
);

-- 5. FEES TABLE (Accounting)
create table public.fees (
  id uuid default gen_random_uuid() primary key,
  trade_id uuid references public.trades(id),
  amount numeric not null,
  token text not null,
  chain text not null,
  tx_hash text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. CHAT MESSAGES TABLE
create table public.trade_messages (
  id uuid default gen_random_uuid() primary key,
  trade_id uuid references public.trades(id) not null,
  user_id uuid references public.users(id) not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.orders enable row level security;
alter table public.trades enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.fees enable row level security;
alter table public.trade_messages enable row level security;

-- Create Policies (SERVICE_ROLE override allows bot to do everything)
-- Public Read access for Orders (Marketplace view)
create policy "Public orders are viewable by everyone" on public.orders
  for select using (true);

-- Users can read their own data
create policy "Users can see their own data" on public.users
  for select using (auth.uid() = id);

-- TRADES: Participants can see their trades
create policy "Participants can see trades" on public.trades
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);

-- MESSAGES: Participants can see/create messages
create policy "Participants can see messages" on public.trade_messages
  for select using (
    exists (
      select 1 from public.trades
      where trades.id = trade_messages.trade_id
      and (trades.buyer_id = auth.uid() or trades.seller_id = auth.uid())
    )
  );

create policy "Participants can insert messages" on public.trade_messages
  for insert with check (
    exists (
      select 1 from public.trades
      where trades.id = trade_messages.trade_id
      and (trades.buyer_id = auth.uid() or trades.seller_id = auth.uid())
    )
  );

-- NOTE: The bot uses SERVICE_KEY which bypasses RLS automatically.
