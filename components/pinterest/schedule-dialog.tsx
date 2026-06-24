'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  SCHEDULE_MODES,
  SCHEDULE_MODE_LABELS,
  DAY_FREQUENCY_OPTIONS,
  DAY_FREQUENCY_LABELS,
  HOUR_INTERVAL_OPTIONS,
  HOUR_INTERVAL_LABELS,
  calculateDaySchedule,
  calculateHourSchedule,
} from '@/lib/validations/schedule';
import type { ScheduleMode, DayFrequency, HourInterval } from '@/lib/validations/schedule';

interface ScheduleDialogProps {
  generationId: string;
  pinCount: number;
  hasSchedule: boolean;
}

const PREVIEW_LIMIT = 5;

function formatPreviewDate(date: Date): string {
  return (
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) +
    ' ' +
    date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  );
}

function getDefaultStartDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

export function ScheduleDialog({ generationId, pinCount, hasSchedule }: ScheduleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ScheduleMode>('days');
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [startTime, setStartTime] = useState('10:00');
  const [dayFrequency, setDayFrequency] = useState<DayFrequency>('daily');
  const [hourInterval, setHourInterval] = useState<HourInterval>(60);
  const [loading, setLoading] = useState(false);

  const previewDates = useMemo(() => {
    if (!startDate || !startTime) return [];
    return mode === 'hours'
      ? calculateHourSchedule(pinCount, startDate, startTime, hourInterval)
      : calculateDaySchedule(pinCount, startDate, startTime, dayFrequency);
  }, [pinCount, startDate, startTime, mode, dayFrequency, hourInterval]);

  async function handleApply() {
    setLoading(true);

    const payload =
      mode === 'hours'
        ? { generationId, mode, startDate, startTime, intervalMinutes: hourInterval }
        : { generationId, mode, startDate, startTime, frequency: dayFrequency };

    const res = await fetch('/api/pinterest/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to schedule pins');
      setLoading(false);
      return;
    }

    toast.success(`${json.data.pinsScheduled} pins scheduled`);
    setOpen(false);
    router.refresh();
  }

  async function handleClear() {
    setLoading(true);

    const res = await fetch('/api/pinterest/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId, clear: true }),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to clear schedule');
      setLoading(false);
      return;
    }

    toast.success('Schedule cleared');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
        Schedule
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Pins</DialogTitle>
            <DialogDescription>
              Set a publishing schedule for {pinCount} pins
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Scheduling Mode</Label>
              <Select value={mode} onValueChange={(v) => v && setMode(v as ScheduleMode)}>
                <SelectTrigger>
                  <span>{SCHEDULE_MODE_LABELS[mode]}</span>
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {SCHEDULE_MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            {mode === 'days' && (
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={dayFrequency}
                  onValueChange={(v) => v && setDayFrequency(v as DayFrequency)}
                >
                  <SelectTrigger>
                    <span>{DAY_FREQUENCY_LABELS[dayFrequency]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_FREQUENCY_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {DAY_FREQUENCY_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === 'hours' && (
              <div className="space-y-2">
                <Label>Interval</Label>
                <Select
                  value={String(hourInterval)}
                  onValueChange={(v) => v && setHourInterval(Number(v) as HourInterval)}
                >
                  <SelectTrigger>
                    <span>{HOUR_INTERVAL_LABELS[hourInterval]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_INTERVAL_OPTIONS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {HOUR_INTERVAL_LABELS[h]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {previewDates.length > 0 && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Preview</p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {previewDates.slice(0, PREVIEW_LIMIT).map((date, i) => (
                    <div key={i}>
                      Pin {i + 1} → {formatPreviewDate(date)}
                    </div>
                  ))}
                  {previewDates.length > PREVIEW_LIMIT && (
                    <div className="pt-1 text-xs">
                      + {previewDates.length - PREVIEW_LIMIT} more pins
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-2">
            {hasSchedule && (
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={loading}
                className="mr-auto"
              >
                Clear Schedule
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={loading}>
              {loading ? 'Applying...' : 'Apply Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
