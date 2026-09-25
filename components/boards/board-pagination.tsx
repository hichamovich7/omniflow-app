import { Pagination } from '@/components/shared/pagination';

interface BoardPaginationProps {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}

export function BoardPagination(props: BoardPaginationProps) {
  return <Pagination basePath="/boards" {...props} />;
}
