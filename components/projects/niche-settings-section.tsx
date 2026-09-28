'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ContentStreamFormDialog,
  type BoardOption,
  type CategoryOption,
} from '@/components/projects/content-stream-form-dialog';
import { findSubNiche, recommendedNicheSections } from '@/lib/niche/resolve';
import {
  MAX_CUSTOM_VALUE_LENGTH,
  NICHE_SETTINGS_LIST_FIELDS,
  addCustomValue,
  customValueError,
  normalizeNicheSettings,
  recommendedFieldValues,
  removeCustomValue,
  resetNicheSettings,
  resolveNicheField,
  setRecommendedDisabled,
  setSubNicheDisabled,
  type NicheSettings,
  type NicheSettingsListField,
} from '@/lib/niche/settings';

const FIELD_META: Record<NicheSettingsListField, { label: string; description: string; scope: string }> = {
  tone: { label: 'Tone', description: 'How the texts sound. Tone words describe the voice, never a fact about the content.', scope: 'WordPress + Pinterest' },
  audience: { label: 'Audience', description: 'Who the content is written for.', scope: 'WordPress + Pinterest' },
  keywords: { label: 'Keywords & topics', description: 'Priority keywords and topics — relevance hints, never forced into every text.', scope: 'WordPress + Pinterest' },
  pinterestAngles: { label: 'Pinterest angles', description: 'Angle ideas used inside the five structured Pin angles.', scope: 'Pinterest' },
  visualStyle: { label: 'Visual style', description: 'Art direction for AI image prompts.', scope: 'Images' },
  cta: { label: 'CTA', description: 'Call to action on Pins.', scope: 'Pinterest' },
};

export interface NicheSettingsStream {
  id: string;
  name: string;
}

interface NicheSettingsSectionProps {
  projectId: string;
  niche: string | null;
  initialSettings: NicheSettings | null;
  /** Live (non-archived) Content Streams of the project — the sub-niches. */
  streams: NicheSettingsStream[];
  categories: CategoryOption[];
  boards: BoardOption[];
}

function sameSettings(a: NicheSettings | null, b: NicheSettings | null): boolean {
  return JSON.stringify(normalizeNicheSettings(a)) === JSON.stringify(normalizeNicheSettings(b));
}

/**
 * Niche settings (Phase 2): the niche profile's recommended values,
 * pre-filled, which the user can disable, extend with custom values or reset.
 * Only customizations are saved (PUT /api/projects/[id]/niche-settings).
 * Sub-niches are Content Streams: new ones go through the existing dialog.
 */
export function NicheSettingsSection({ projectId, niche, initialSettings, streams, categories, boards }: NicheSettingsSectionProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<NicheSettings | null>(initialSettings);
  const [settings, setSettings] = useState<NicheSettings | null>(initialSettings);
  const [drafts, setDrafts] = useState<Partial<Record<NicheSettingsListField, string>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<NicheSettingsListField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamDialog, setStreamDialog] = useState<{ open: boolean; session: number; name: string }>({ open: false, session: 0, name: '' });

  const { profile, sections } = useMemo(() => recommendedNicheSections(niche), [niche]);
  const dirty = !sameSettings(settings, saved);
  const disabledSubNiches = settings?.fields.subNiches?.disabled ?? [];

  function addValue(field: NicheSettingsListField) {
    const value = drafts[field]?.trim();
    if (!value) return;
    const invalid = customValueError(value);
    if (invalid) {
      setFieldErrors((current) => ({ ...current, [field]: invalid }));
      return;
    }
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSettings((current) => addCustomValue(current, field, value));
    setDrafts((current) => ({ ...current, [field]: '' }));
  }

  function openStreamDialog(name = '') {
    setStreamDialog((current) => ({ open: true, session: current.session + 1, name }));
  }

  async function save(next: NicheSettings | null) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/niche-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: normalizeNicheSettings(next) }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok || !json || json.error) {
      const message = json?.error?.message ?? 'Failed to save niche settings';
      setError(message);
      toast.error(message);
      return;
    }
    const stored = (json.data?.settings ?? null) as NicheSettings | null;
    setSaved(stored);
    setSettings(stored);
    toast.success(stored ? 'Niche settings saved' : 'Niche settings reset to defaults');
    router.refresh();
  }

  const intro = profile
    ? `Recommended by OmniFlow for ${profile.label}.`
    : niche
      ? `No dedicated profile for "${niche}" — general recommendations, fully editable.`
      : 'No niche set — general recommendations, fully editable.';

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6" data-testid="niche-settings">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Niche settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {intro} Used by every WordPress and Pinterest generation of this project, after your source facts and the options you choose.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSettings(null)}
          disabled={saving || settings === null}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to defaults
        </Button>
      </div>

      <div className="mt-5 space-y-6">
        {NICHE_SETTINGS_LIST_FIELDS.map((field) => {
          const meta = FIELD_META[field];
          const resolved = resolveNicheField(recommendedFieldValues(sections, field), settings?.fields[field]);
          const inputId = `niche-${field}-custom`;
          return (
            <section key={field} aria-labelledby={`niche-${field}-title`} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={`niche-${field}-title`} className="text-sm font-medium">
                  {meta.label}
                </h3>
                <Badge variant="outline">{meta.scope}</Badge>
                {settings?.fields[field] && (
                  <Button type="button" variant="link" size="xs" onClick={() => setSettings((s) => resetNicheSettings(s, field))}>
                    Reset field
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{meta.description}</p>

              {resolved.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recommended value — add your own.</p>
              ) : (
                <ul className="space-y-1.5">
                  {resolved.items.map((item) => (
                    <li
                      key={`${item.source}-${item.value}`}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                    >
                      <span className={item.disabled ? 'text-sm text-muted-foreground line-through' : 'text-sm'}>{item.value}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant={item.source === 'custom' ? 'primary' : item.disabled ? 'neutral' : 'outline'}>
                          {item.source === 'custom' ? 'Custom' : item.disabled ? 'Disabled' : 'Recommended'}
                        </Badge>
                        {item.source === 'custom' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Remove custom value "${item.value}"`}
                            onClick={() => setSettings((s) => removeCustomValue(s, field, item.value))}
                          >
                            <X />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => setSettings((s) => setRecommendedDisabled(s, field, item.value, !item.disabled))}
                          >
                            {item.disabled ? 'Enable' : 'Disable'}
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2">
                <label htmlFor={inputId} className="sr-only">
                  Custom {meta.label.toLowerCase()} value
                </label>
                <Input
                  id={inputId}
                  value={drafts[field] ?? ''}
                  maxLength={MAX_CUSTOM_VALUE_LENGTH}
                  placeholder="Add custom value"
                  aria-invalid={fieldErrors[field] ? true : undefined}
                  aria-describedby={fieldErrors[field] ? `${inputId}-error` : undefined}
                  onChange={(event) => setDrafts((current) => ({ ...current, [field]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addValue(field);
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={() => addValue(field)} disabled={!drafts[field]?.trim()}>
                  <Plus className="h-3.5 w-3.5" />
                  Add custom value
                </Button>
              </div>
              {fieldErrors[field] && (
                <p id={`${inputId}-error`} className="text-xs text-destructive">
                  {fieldErrors[field]}
                </p>
              )}
            </section>
          );
        })}

        <section aria-labelledby="niche-subniches-title" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="niche-subniches-title" className="text-sm font-medium">
              Sub-niches (Content Streams)
            </h3>
            <Badge variant="outline">WordPress + Pinterest</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            A Content Stream linked to the WordPress category or board you generate into is used as a more specific sub-niche. New sub-niches are created as Content Streams.
          </p>

          {profile && profile.subNiches.length > 0 && (
            <ul className="space-y-1.5">
              {profile.subNiches.map((sub) => {
                const disabled = disabledSubNiches.includes(sub.slug);
                const stream = streams.find((s) => findSubNiche(profile, s.name)?.slug === sub.slug);
                return (
                  <li
                    key={sub.slug}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <span className={disabled ? 'text-sm text-muted-foreground line-through' : 'text-sm'}>
                      {sub.label}
                      {stream && <span className="text-xs text-muted-foreground"> · Content Stream “{stream.name}”</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge variant={disabled ? 'neutral' : 'outline'}>{disabled ? 'Disabled' : 'Recommended'}</Badge>
                      {!stream && !disabled && (
                        <Button type="button" variant="ghost" size="xs" onClick={() => openStreamDialog(sub.label)}>
                          Create stream
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="xs" onClick={() => setSettings((s) => setSubNicheDisabled(s, sub.slug, !disabled))}>
                        {disabled ? 'Enable' : 'Disable'}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {streams.filter((s) => !findSubNiche(profile, s.name)).length > 0 && (
            <ul className="space-y-1.5">
              {streams
                .filter((s) => !findSubNiche(profile, s.name))
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
                    <span className="text-sm">{s.name}</span>
                    <Badge variant="primary">Custom</Badge>
                  </li>
                ))}
            </ul>
          )}

          <Button type="button" variant="outline" size="sm" onClick={() => openStreamDialog()}>
            <Plus className="h-3.5 w-3.5" />
            Create new Content Stream
          </Button>
        </section>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button type="button" onClick={() => save(settings)} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save niche settings'}
        </Button>
      </div>

      <ContentStreamFormDialog
        key={`niche-stream-${streamDialog.session}`}
        open={streamDialog.open}
        onOpenChange={(open) => setStreamDialog((current) => ({ ...current, open }))}
        projectId={projectId}
        categories={categories}
        boards={boards}
        initialName={streamDialog.name}
      />
    </div>
  );
}
