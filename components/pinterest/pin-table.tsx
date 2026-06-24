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

function hasAnyDates(pins: Pin[]): boolean {
  return pins.some((pin) => pin.publish_date);
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

export function PinTable({ pins }: PinTableProps) {
  const showImages = hasAnyImages(pins);
  const showDates = hasAnyDates(pins);

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-xs font-medium uppercase tracking-wider">
              #
            </TableHead>
            {showImages && (
              <TableHead className="w-16 text-xs font-medium uppercase tracking-wider">
                Image
              </TableHead>
            )}
            <TableHead className="text-xs font-medium uppercase tracking-wider">
              Title
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider">
              Board
            </TableHead>
            {showDates && (
              <TableHead className="text-xs font-medium uppercase tracking-wider">
                Publish Date
              </TableHead>
            )}
            <TableHead className="hidden lg:table-cell text-xs font-medium uppercase tracking-wider">
              Keywords
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pins.map((pin, i) => (
            <TableRow key={pin.id} className="group">
              <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
              {showImages && (
                <TableCell>
                  {pin.media_url ? (
                    <a href={pin.media_url} target="_blank" rel="noopener noreferrer">
                      <Image
                        src={pin.media_url}
                        alt={pin.title}
                        width={48}
                        height={64}
                        className="rounded-md object-cover"
                        unoptimized
                      />
                    </a>
                  ) : (
                    <div className="flex h-16 w-12 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </TableCell>
              )}
              <TableCell>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-snug">{pin.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{pin.description}</p>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{pin.board}</TableCell>
              {showDates && (
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {pin.publish_date ? formatDate(pin.publish_date) : '—'}
                </TableCell>
              )}
              <TableCell className="hidden max-w-xs truncate lg:table-cell">
                <span className="text-xs text-muted-foreground">{pin.keywords}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
