export function statusToVariant(status: string) {
  switch (status) {
    case 'completed': return 'success' as const;
    case 'processing': return 'processing' as const;
    case 'failed': return 'error' as const;
    default: return 'neutral' as const;
  }
}

export function statusToBadgeVariant(status: string) {
  switch (status) {
    case 'completed': return 'success' as const;
    case 'processing': return 'warning' as const;
    case 'failed': return 'destructive' as const;
    default: return 'secondary' as const;
  }
}
