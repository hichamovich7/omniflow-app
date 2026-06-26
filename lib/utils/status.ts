export function statusToVariant(status: string) {
  switch (status) {
    case 'completed': return 'success' as const;
    case 'processing': return 'processing' as const;
    case 'failed': return 'error' as const;
    default: return 'neutral' as const;
  }
}
