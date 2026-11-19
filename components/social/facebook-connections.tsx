'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Link2, Loader2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  disconnectFacebookPage,
  facebookConnectHref,
  listFacebookPages,
  selectFacebookPage,
  verifyFacebookConnection,
} from '@/components/social/facebook-requests';
import { FACEBOOK_CONNECT_MESSAGES, isFacebookConnectReason } from '@/lib/social/facebook-connect-messages';
import {
  SOCIAL_CONNECTION_STATUS_LABELS,
  type FacebookPagesResponse,
  type SocialConnection,
  type SocialConnectionStatus,
} from '@/lib/social/facebook-publication';
import { cn } from '@/lib/utils';

export interface FacebookConnectState {
  status: 'select' | 'error' | null;
  reason: string | null;
  projectId: string | null;
}

interface FacebookConnectionsProps {
  projects: Array<{ id: string; name: string }>;
  connections: SocialConnection[];
  connect: FacebookConnectState;
  /** False when the server has no Meta app credentials / token key. */
  configured: boolean;
  unavailable: boolean;
}

const STATUS_VARIANT: Record<SocialConnectionStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  expired: 'warning',
  revoked: 'danger',
  error: 'danger',
};

/**
 * Facebook Page connections per project (TASK-068; several Pages per project
 * since TASK-102): connect (Facebook Login, full-page redirect), pick a Page,
 * verify, reconnect, disconnect — each Page on its own, never replacing the
 * project's other Pages. Only Facebook Pages — never a personal profile or a
 * group. The browser only sees Page names and ids; tokens stay on the server.
 */
export function FacebookConnections({ projects, connections, connect, configured, unavailable }: FacebookConnectionsProps) {
  const byProject = new Map<string, SocialConnection[]>();
  for (const connection of connections) byProject.set(connection.project_id, [...(byProject.get(connection.project_id) ?? []), connection]);
  const reason = connect.reason ?? undefined;
  const errorMessage = connect.status === 'error' && isFacebookConnectReason(reason) ? FACEBOOK_CONNECT_MESSAGES[reason] : null;

  return (
    <section
      aria-labelledby="facebook-pages-title"
      className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
      data-testid="facebook-connections"
    >
      <h2 id="facebook-pages-title" className="text-base font-semibold">
        Facebook Pages
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Connect one or several Facebook Pages per project. Only Pages are supported — never a personal profile or a group. Each post
        is published on the Page you choose, and OmniFlow never publishes without your confirmation.
      </p>

      {!configured && (
        <Alert variant="warning" role="status" className="mb-3">
          Facebook publishing is not configured on this server yet. Posts can still be generated, edited and copied.
        </Alert>
      )}
      {unavailable && (
        <Alert variant="warning" role="status" className="mb-3">
          Facebook connections are not available yet (database migration 046 not applied).
        </Alert>
      )}
      {errorMessage && (
        <Alert variant="danger" className="mb-3">
          {errorMessage}
        </Alert>
      )}

      {connect.status === 'select' && connect.projectId && (
        <PagePicker
          projectId={connect.projectId}
          projectName={projects.find((p) => p.id === connect.projectId)?.name ?? 'this project'}
          connectedPageIds={(byProject.get(connect.projectId) ?? []).map((connection) => connection.external_account_id)}
        />
      )}

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a project first to connect a Facebook Page.</p>
      ) : (
        <ul className="divide-y divide-border/60" data-testid="facebook-connection-list">
          {projects.map((project) => (
            <ProjectConnections
              key={project.id}
              project={project}
              connections={byProject.get(project.id) ?? []}
              disabled={!configured || unavailable}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectConnections({
  project,
  connections,
  disabled,
}: {
  project: { id: string; name: string };
  connections: SocialConnection[];
  disabled: boolean;
}) {
  return (
    <li className="space-y-2 py-3" data-project={project.id}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{project.name}</p>
          <p className="text-xs text-muted-foreground">
            {connections.length === 0
              ? 'No Facebook Page connected.'
              : `${connections.length} Facebook Page${connections.length > 1 ? 's' : ''} connected`}
          </p>
        </div>
        <a
          href={facebookConnectHref(project.id)}
          aria-disabled={disabled || undefined}
          className={cn(buttonVariants({ size: 'sm', variant: connections.length ? 'outline' : 'default' }), disabled && 'pointer-events-none opacity-60')}
          data-testid="facebook-add-page"
        >
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          {connections.length ? 'Add another Page' : 'Connect a Facebook Page'}
        </a>
      </div>
      {connections.length > 0 && (
        <ul className="space-y-2" data-testid="facebook-project-pages">
          {connections.map((connection) => (
            <ConnectionRow key={connection.id} project={project} connection={connection} disabled={disabled} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ConnectionRow({
  project,
  connection,
  disabled,
}: {
  project: { id: string; name: string };
  connection: SocialConnection;
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'verify' | 'disconnect' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function verify() {
    setBusy('verify');
    const response = await verifyFacebookConnection<{ status: SocialConnectionStatus; message: string | null }>(connection.id);
    setBusy(null);
    if (response.data?.status === 'active') toast.success(`The Page "${connection.external_account_name}" is connected and reachable.`);
    else toast.error(response.data?.message ?? response.error?.message ?? 'The connection could not be checked.');
    router.refresh();
  }

  async function disconnect() {
    setBusy('disconnect');
    const response = await disconnectFacebookPage<{ id: string }>(connection.id);
    setBusy(null);
    if (response.error) {
      toast.error(response.error.message);
      return;
    }
    setConfirmOpen(false);
    toast.success(`Facebook Page "${connection.external_account_name}" disconnected.`);
    router.refresh();
  }

  const missingComment = !connection.granted_scopes.includes('pages_manage_engagement');

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center" data-page={connection.external_account_id}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant={STATUS_VARIANT[connection.status]}>{SOCIAL_CONNECTION_STATUS_LABELS[connection.status]}</Badge>
          <span className="text-sm font-medium text-foreground">{connection.external_account_name}</span>
          <span>· Page ID {connection.external_account_id}</span>
          {missingComment && <span>· First comments not allowed (permission not granted)</span>}
        </div>
        {connection.status !== 'active' && <p className="mt-1 text-xs text-warning">Reconnect this Page to publish on it again.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={verify} disabled={disabled || busy !== null}>
          {busy === 'verify' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
          Verify
        </Button>
        <a
          href={facebookConnectHref(project.id)}
          aria-disabled={disabled || undefined}
          title={`Sign in with Facebook again, then select "${connection.external_account_name}"`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), disabled && 'pointer-events-none opacity-60')}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Reconnect
        </a>
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOpen(true)} disabled={busy !== null}>
          <Unplug className="mr-1.5 h-3.5 w-3.5" />
          Disconnect Page
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => busy === null && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect this Facebook Page?</DialogTitle>
            <DialogDescription>
              OmniFlow will forget the connection to &quot;{connection.external_account_name}&quot; for {project.name}. The project&apos;s
              other Pages stay connected. Posts already published stay on Facebook and in your history. Posts scheduled for this Page are
              not published while it is disconnected — never on another Page. You can also remove OmniFlow from your Facebook settings
              (Business integrations).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={disconnect} disabled={busy !== null}>
              {busy === 'disconnect' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Disconnect Page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function PagePicker({ projectId, projectName, connectedPageIds }: { projectId: string; projectName: string; connectedPageIds: string[] }) {
  const router = useRouter();
  const [state, setState] = useState<{ loading: boolean; data: FacebookPagesResponse | null; error: string | null }>({
    loading: true,
    data: null,
    error: null,
  });
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listFacebookPages<FacebookPagesResponse>(projectId).then((response) => {
      if (!cancelled) setState({ loading: false, data: response.data, error: response.error?.message ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function choose(pageId: string) {
    setSaving(pageId);
    const response = await selectFacebookPage<SocialConnection>(projectId, pageId);
    setSaving(null);
    if (response.error) {
      toast.error(response.error.message);
      return;
    }
    toast.success(connectedPageIds.includes(pageId) ? `Facebook Page reconnected for ${projectName}.` : `Facebook Page added to ${projectName}.`);
    router.replace('/facebook');
    router.refresh();
  }

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-selected p-4" data-testid="facebook-page-picker">
      <h3 className="text-sm font-semibold">Choose a Facebook Page for {projectName}</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Only Pages you manage are listed. A new Page is added to the project&apos;s other Pages; selecting a Page already connected
        reconnects it.
      </p>
      {state.loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your Facebook Pages…
        </p>
      )}
      {state.error && <Alert variant="danger">{state.error}</Alert>}
      {state.data && state.data.pages.length === 0 && (
        <div className="space-y-2 text-sm">
          <p>Facebook returned no Page for your account.</p>
          <p className="text-xs text-muted-foreground">
            If your Page belongs to a Business Portfolio, Facebook may require the &quot;business management&quot; permission to list
            it. Connect again with that permission only if this is the case.
          </p>
          <a href={facebookConnectHref(projectId, true)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Connect again with Business Portfolio access
          </a>
        </div>
      )}
      {state.data && state.data.pages.length > 0 && (
        <>
          {!state.data.canComment && (
            <Alert variant="warning" role="status" className="mb-2">
              The first-comment permission was not granted: posts can be published, but the article link cannot be added as a
              first comment.
            </Alert>
          )}
          <ul className="divide-y divide-border/60">
            {state.data.pages.map((page) => (
              <li key={page.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{page.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Page ID {page.id}
                    {connectedPageIds.includes(page.id) && ' · Already connected to this project'}
                    {!page.canPublish && ' · You cannot create content on this Page'}
                  </p>
                </div>
                <Button type="button" size="sm" onClick={() => choose(page.id)} disabled={!page.canPublish || saving !== null}>
                  {saving === page.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  {connectedPageIds.includes(page.id) ? 'Reconnect' : 'Select'}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
