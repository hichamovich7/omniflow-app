export function statusToVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'success' as const;
    case 'processing':
      return 'processing' as const;
    case 'failed':
      return 'error' as const;
    default:
      return 'neutral' as const;
  }
}

// Badge variant mappings: visual only, statuses and labels are unchanged.
// Blue (primary) = in progress or planned, amber (warning) = needs attention.

export function statusToBadgeVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'success' as const;
    case 'processing':
      return 'primary' as const;
    case 'failed':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

export function publishStatusToBadgeVariant(status: string) {
  switch (status) {
    case 'published':
      return 'success' as const;
    case 'scheduled':
      return 'primary' as const;
    case 'failed':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

export function contentStreamStatusToBadgeVariant(status: string) {
  switch (status) {
    case 'active':
      return 'success' as const;
    case 'warming':
      return 'warning' as const;
    case 'archived':
      return 'outline' as const;
    default:
      return 'neutral' as const; // paused
  }
}
