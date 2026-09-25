import { Pagination } from '@/components/shared/pagination';

interface HistoryPaginationProps {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}

export function HistoryPagination(props: HistoryPaginationProps) {
  return <Pagination basePath="/history" {...props} />;
}
