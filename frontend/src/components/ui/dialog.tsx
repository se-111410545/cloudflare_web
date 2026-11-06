import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * 極簡 Dialog（純 React 實作，避免額外 UI 相依）
 */
export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-xl',
          className
        )}
      >
        {children}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 rounded-sm text-gray-500 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">關閉</span>
        </button>
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-1.5 text-left', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold leading-none', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-gray-500', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex justify-end gap-2 pt-2', className)} {...props} />
  );
}
