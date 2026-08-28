'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createProjectSchema, updateProjectSchema } from '@/lib/validations/project';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import type { WordPressSitePublic } from '@/types/wordpress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ExpandableText } from '@/components/ui/expandable-text';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxIcon,
  ComboboxPopup,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Curated suggestions only — free text is always accepted, nothing here is
// enforced in the database. See docs/DECISIONS.md for why this stays a flat
// list rather than growing per-niche prompt logic.
const NICHE_SUGGESTIONS = [
  'Insurance',
  'Mortgages & Home Loans',
  'Legal / Attorney Services',
  'Addiction Treatment & Rehab',
  'Credit Cards & Credit Repair',
  'Cryptocurrency & Investing',
  'B2B Software / SaaS',
  'Web Hosting & Domains',
  'Personal Finance / Budgeting',
  'Real Estate',
  'Online Education & Degrees',
  'Cybersecurity / VPN',
  'Productivity & AI Tools',
  'Health & Wellness',
  'Home Organization & Decor',
  'Beauty & Personal Care',
  'Parenting & Baby',
  'Pets',
  'Travel',
  'Food & Recipes',
  'Crochet',
];

const NO_DEFAULT_LANGUAGE = 'none';

interface ProjectFormProps {
  mode: 'create' | 'edit';
  projectId?: string;
  defaultValues?: {
    name: string;
    description: string | null;
    niche: string | null;
    default_language: string | null;
  };
  wordpressSite?: WordPressSitePublic | null;
}

export function ProjectForm({ mode, projectId, defaultValues, wordpressSite }: ProjectFormProps) {
  const router = useRouter();
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [description, setDescription] = useState(defaultValues?.description ?? '');
  // Existing Brand Profile text starts collapsed (ExpandableText, "Read more"
  // to expand) so a long profile doesn't dominate the form on load — clicking
  // into it switches to the real Textarea. New/empty profiles skip this and
  // are always directly editable.
  const [descriptionEditing, setDescriptionEditing] = useState(
    mode === 'create' || !defaultValues?.description
  );
  const [niche, setNiche] = useState(defaultValues?.niche ?? '');
  const [defaultLanguage, setDefaultLanguage] = useState(defaultValues?.default_language ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // WordPress Connection
  const [wpSite, setWpSite] = useState<WordPressSitePublic | null>(wordpressSite ?? null);
  const [wpEditing, setWpEditing] = useState(!wpSite);
  const [wpSiteUrl, setWpSiteUrl] = useState('');
  const [wpUsername, setWpUsername] = useState('');
  const [wpPassword, setWpPassword] = useState('');
  const [wpTestStatus, setWpTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [wpTestMessage, setWpTestMessage] = useState<string | null>(null);
  const [wpSaving, setWpSaving] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  function resetWpFields() {
    setWpSiteUrl('');
    setWpUsername('');
    setWpPassword('');
    setWpTestStatus('idle');
    setWpTestMessage(null);
  }

  function handleChangeConnection() {
    setWpEditing(true);
    setWpSiteUrl(wpSite?.site_url ?? '');
    setWpUsername(wpSite?.wp_username ?? '');
    setWpPassword('');
    setWpTestStatus('idle');
    setWpTestMessage(null);
  }

  function handleCancelWpEdit() {
    setWpEditing(false);
    resetWpFields();
  }

  async function handleTestConnection() {
    setWpTestStatus('testing');
    setWpTestMessage(null);

    const res = await fetch('/api/wordpress/sites/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl: wpSiteUrl, wpUsername, applicationPassword: wpPassword }),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setWpTestStatus('error');
      setWpTestMessage(json.error?.message ?? 'Connection failed');
      return;
    }

    setWpTestStatus('success');
    setWpTestMessage(`Connected as ${json.data.displayName}`);
  }

  async function handleDisconnect() {
    if (!wpSite) return;
    setDisconnecting(true);

    const res = await fetch(`/api/wordpress/sites/${wpSite.id}`, { method: 'DELETE' });
    const json = await res.json();

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to disconnect WordPress');
      setDisconnecting(false);
      return;
    }

    toast.success('WordPress disconnected');
    setWpSite(null);
    setWpEditing(true);
    resetWpFields();
    setDisconnecting(false);
    setDisconnectOpen(false);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const schema = mode === 'create' ? createProjectSchema : updateProjectSchema;
    const parsed = schema.safeParse({
      name,
      description: description || null,
      niche: niche || null,
      default_language: defaultLanguage || null,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);

    const url = mode === 'create' ? '/api/projects' : `/api/projects/${projectId}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Something went wrong';
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    toast.success(mode === 'create' ? 'Project created' : 'Project updated');

    const savedProjectId: string = mode === 'create' ? json.data.projectId : (projectId as string);

    const hasWpInput = Boolean(wpSiteUrl.trim() || wpUsername.trim() || wpPassword.trim());

    if (wpEditing && hasWpInput) {
      if (wpTestStatus !== 'success') {
        toast.error('Test the WordPress connection before saving it — the project itself was saved.');
      } else {
        setWpSaving(true);
        const wpUrl = wpSite ? `/api/wordpress/sites/${wpSite.id}` : '/api/wordpress/sites';
        const wpMethod = wpSite ? 'PATCH' : 'POST';
        const wpBody = wpSite
          ? { siteUrl: wpSiteUrl, wpUsername, applicationPassword: wpPassword }
          : { projectId: savedProjectId, siteUrl: wpSiteUrl, wpUsername, applicationPassword: wpPassword };

        const wpRes = await fetch(wpUrl, {
          method: wpMethod,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wpBody),
        });
        const wpJson = await wpRes.json();

        if (!wpRes.ok || wpJson.error) {
          toast.error(wpJson.error?.message ?? 'Failed to save the WordPress connection');
        } else {
          toast.success('WordPress connection saved');
        }
        setWpSaving(false);
      }
    }

    router.push('/projects');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g. Bathroom Blog DE"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Brand Profile (optional)</Label>
        {descriptionEditing ? (
          <Textarea
            id="description"
            placeholder="e.g. German Pinterest project for bathroom niche — friendly, cozy tone"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={10000}
            rows={3}
            disabled={loading}
            autoFocus={mode === 'edit'}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setDescriptionEditing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDescriptionEditing(true);
              }
            }}
            className="min-h-16 w-full cursor-text rounded-lg border border-input bg-transparent px-2.5 py-2 transition-colors hover:border-ring"
          >
            <ExpandableText text={description} className="text-sm" />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Used as context for all AI-generated content in this project.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="niche">Niche (optional)</Label>
          <Combobox items={NICHE_SUGGESTIONS} inputValue={niche} onInputValueChange={(value) => setNiche(value)}>
            <ComboboxInputGroup>
              <ComboboxInput
                id="niche"
                placeholder="e.g. Home Organization & Decor"
                maxLength={100}
                disabled={loading}
              />
              <ComboboxIcon />
            </ComboboxInputGroup>
            <ComboboxPopup>
              <ComboboxEmpty>No matches — your typed text is used as-is.</ComboboxEmpty>
              <ComboboxList>
                {(item) => (
                  <ComboboxItem key={item as string} value={item}>
                    {item as string}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxPopup>
          </Combobox>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default-language">Default Language (optional)</Label>
          <Select
            value={defaultLanguage || NO_DEFAULT_LANGUAGE}
            onValueChange={(v) => v && setDefaultLanguage(v === NO_DEFAULT_LANGUAGE ? '' : v)}
          >
            <SelectTrigger id="default-language" className="w-full" disabled={loading}>
              <span className="truncate text-sm">
                {defaultLanguage ? LANGUAGE_LABELS[defaultLanguage as SupportedLanguage] : 'None'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DEFAULT_LANGUAGE}>None</SelectItem>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pre-fills the Language field on generation forms for this project. Always changeable there.
          </p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border/60 p-4">
        <Label>WordPress Connection (optional)</Label>

        {!wpEditing && wpSite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Connected to {wpSite.site_url}</Badge>
            <Button type="button" variant="outline" size="sm" onClick={handleChangeConnection} disabled={loading}>
              Change connection
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDisconnectOpen(true)}
              disabled={loading}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wp-site-url">Site URL</Label>
              <Input
                id="wp-site-url"
                type="url"
                placeholder="https://example.com"
                value={wpSiteUrl}
                onChange={(e) => {
                  setWpSiteUrl(e.target.value);
                  setWpTestStatus('idle');
                }}
                disabled={loading || wpSaving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="wp-username">WP Username</Label>
                <Input
                  id="wp-username"
                  value={wpUsername}
                  onChange={(e) => {
                    setWpUsername(e.target.value);
                    setWpTestStatus('idle');
                  }}
                  disabled={loading || wpSaving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wp-password">Application Password</Label>
                <Input
                  id="wp-password"
                  type="password"
                  autoComplete="off"
                  value={wpPassword}
                  onChange={(e) => {
                    setWpPassword(e.target.value);
                    setWpTestStatus('idle');
                  }}
                  disabled={loading || wpSaving}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Generate an Application Password in WordPress under Users → Profile → Application Passwords. It is
              encrypted before storage and never shown again after saving.
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={
                  loading || wpSaving || wpTestStatus === 'testing' || !wpSiteUrl || !wpUsername || !wpPassword
                }
              >
                {wpTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </Button>
              {wpSite && (
                <Button type="button" variant="ghost" size="sm" onClick={handleCancelWpEdit} disabled={loading || wpSaving}>
                  Cancel
                </Button>
              )}
              {wpTestMessage && (
                <p className={wpTestStatus === 'success' ? 'text-sm text-success' : 'text-sm text-destructive'}>
                  {wpTestMessage}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/projects')}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === 'create'
              ? 'Creating...'
              : 'Saving...'
            : mode === 'create'
              ? 'Create Project'
              : 'Save Changes'}
        </Button>
      </div>

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect WordPress</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect {wpSite?.site_url}? Scheduled or published articles for this
              project will revert to Draft in OmniFlow — nothing changes on your WordPress site itself.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDisconnectOpen(false)} disabled={disconnecting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
