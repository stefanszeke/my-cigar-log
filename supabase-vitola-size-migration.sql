-- Pityu Cigar Log vitola & size migration.
-- Run this once in Supabase SQL Editor to add cigar dimension fields
-- (length, ring gauge, diameter, shape) used by the "Vitola & size" detail card.

alter table public.cigars add column if not exists length_mm numeric;
alter table public.cigars add column if not exists ring_gauge numeric;
alter table public.cigars add column if not exists diameter_mm numeric;
alter table public.cigars add column if not exists shape text;
