import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Pin } from '@/types/database';

interface PinTableProps {
  pins: Pin[];
}

export function PinTable({ pins }: PinTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Board</TableHead>
            <TableHead className="hidden lg:table-cell">Keywords</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pins.map((pin, i) => (
            <TableRow key={pin.id}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <p className="font-medium">{pin.title}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{pin.description}</p>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">{pin.board}</TableCell>
              <TableCell className="hidden max-w-xs truncate lg:table-cell">
                <span className="text-sm text-muted-foreground">{pin.keywords}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
