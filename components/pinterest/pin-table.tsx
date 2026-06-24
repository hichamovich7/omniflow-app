import Image from 'next/image';
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

function hasAnyImages(pins: Pin[]): boolean {
  return pins.some((pin) => pin.media_url);
}

export function PinTable({ pins }: PinTableProps) {
  const showImages = hasAnyImages(pins);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            {showImages && <TableHead className="w-20">Image</TableHead>}
            <TableHead>Title</TableHead>
            <TableHead>Board</TableHead>
            <TableHead className="hidden lg:table-cell">Keywords</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pins.map((pin, i) => (
            <TableRow key={pin.id}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              {showImages && (
                <TableCell>
                  {pin.media_url ? (
                    <a href={pin.media_url} target="_blank" rel="noopener noreferrer">
                      <Image
                        src={pin.media_url}
                        alt={pin.title}
                        width={48}
                        height={64}
                        className="rounded object-cover"
                        unoptimized
                      />
                    </a>
                  ) : (
                    <div className="flex h-16 w-12 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </TableCell>
              )}
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
