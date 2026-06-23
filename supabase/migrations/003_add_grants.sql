-- ============================================
-- OmniFlow Migration 003
-- Add table grants for authenticated role
-- ============================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.generations to authenticated;
grant select, insert, update, delete on public.pins to authenticated;
