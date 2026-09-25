import { Pagination } from '@/components/shared/pagination';

interface WordPressHistoryPaginationProps {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}

export function WordPressHistoryPagination(props: WordPressHistoryPaginationProps) {
  return <Pagination basePath="/wordpress/history" {...props} />;
}
