'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Loader2, Upload, X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

interface ReferenceImageUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function ReferenceImageUpload({ value, onChange, disabled }: ReferenceImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(file: File) {
    if (!ACCEPTED_TYPES.split(',').includes(file.type)) {
      toast.error('Unsupported file type — use JPG, PNG, or WebP');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File is too large — 5MB maximum');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/pinterest/reference-image', { method: 'POST', body: formData });
    const json = await res.json();
    setUploading(false);

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Upload failed. Try again.');
      return;
    }

    onChange(json.data.url);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  if (value) {
    return (
      <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-border/60 bg-muted">
        <Image src={value} alt="Reference style image" fill sizes="96px" className="object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label="Remove reference image"
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-card/90 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => !disabled && !uploading && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        'flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors',
        dragOver ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-border',
        (disabled || uploading) && 'pointer-events-none opacity-60'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileInput}
        disabled={disabled || uploading}
        className="hidden"
      />
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {dragOver ? <Upload className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          <span className="text-center text-[10px] leading-tight">Upload</span>
        </>
      )}
    </div>
  );
}
