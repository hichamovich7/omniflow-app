'use client';

import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const registerSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const result = registerSchema.safeParse({ email, password, confirmPassword });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      console.error(authError);
      setError(typeof authError.message === 'string' ? authError.message : 'Failed to create account');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
          <span className="text-lg">✓</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a confirmation link to <strong className="text-foreground">{email}</strong>
        </p>
        <p className="mt-6 text-[13px] text-muted-foreground">
          Already confirmed?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <span className="text-sm font-bold text-primary-foreground">O</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Get started with OmniFlow</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            className="h-10"
          />
        </div>
        {error && (
          <div className="rounded-lg bg-destructive/5 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
