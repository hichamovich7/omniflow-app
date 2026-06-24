'use client';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
const MONTH = 2592000;

export function RelativeDate({ date }: { date: string }) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (seconds < MINUTE) {
    return <span title={new Date(date).toLocaleString()}>just now</span>;
  } else if (seconds < HOUR) {
    value = Math.floor(seconds / MINUTE);
    unit = 'minute';
  } else if (seconds < DAY) {
    value = Math.floor(seconds / HOUR);
    unit = 'hour';
  } else if (seconds < WEEK) {
    value = Math.floor(seconds / DAY);
    unit = 'day';
  } else if (seconds < MONTH) {
    value = Math.floor(seconds / WEEK);
    unit = 'week';
  } else {
    return (
      <span title={new Date(date).toLocaleString()}>
        {new Date(date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </span>
    );
  }

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  return (
    <span title={new Date(date).toLocaleString()}>
      {rtf.format(-value, unit)}
    </span>
  );
}
