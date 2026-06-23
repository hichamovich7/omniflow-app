-- ============================================
-- OmniFlow Migration 002
-- Add role column to profiles
-- ============================================

alter table public.profiles
  add column role text not null default 'user';
