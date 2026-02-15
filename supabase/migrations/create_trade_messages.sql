-- Create trade_messages table
create table public.trade_messages (
  id uuid default gen_random_uuid() primary key,
  trade_id uuid references public.trades(id) not null,
  user_id uuid references public.users(id) not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.trade_messages enable row level security;

-- Policies (Optional if using Service Role in backend)
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
