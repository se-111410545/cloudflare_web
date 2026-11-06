import { Percent } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';

export interface DiscountOption {
  key: string;
  label: string;
  /** 付款比例：0.9 代表 9 折 */
  rate: number;
  permissionKey: string;
}

/**
 * 可設定的折扣按鈕清單。
 * Boss 可於 /admin 的「權限設定」調整哪個角色能使用哪些按鈕。
 */
export const DISCOUNT_OPTIONS: DiscountOption[] = [
  { key: 'none', label: '無折扣', rate: 1, permissionKey: 'discount:none' },
  { key: 'd5', label: '95折', rate: 0.95, permissionKey: 'discount:5' },
  { key: 'd10', label: '9折', rate: 0.9, permissionKey: 'discount:10' },
  { key: 'd15', label: '85折', rate: 0.85, permissionKey: 'discount:15' },
  { key: 'd20', label: '8折', rate: 0.8, permissionKey: 'discount:20' },
  { key: 'd30', label: '7折', rate: 0.7, permissionKey: 'discount:30' },
  { key: 'd50', label: '5折', rate: 0.5, permissionKey: 'discount:50' },
];

interface DiscountButtonsProps {
  value: DiscountOption | null;
  onChange: (option: DiscountOption) => void;
  className?: string;
}

/**
 * 動態折扣按鈕：僅顯示目前登入者角色被授權的折扣。
 */
export function DiscountButtons({ value, onChange, className }: DiscountButtonsProps) {
  const { has, loading } = usePermissions();

  if (loading) {
    return <div className={cn('text-xs text-gray-400', className)}>載入權限中…</div>;
  }

  const allowed = DISCOUNT_OPTIONS.filter((o) => has(o.permissionKey));

  if (allowed.length === 0) {
    return <div className={cn('text-xs text-gray-400', className)}>此角色未授權折扣功能</div>;
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {allowed.map((option) => {
        const active = value?.key === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all',
              active
                ? 'border-pos-600 bg-pos-600 text-white shadow'
                : 'border-gray-300 bg-white text-gray-700 hover:border-pos-500 hover:text-pos-700'
            )}
          >
            <Percent className="h-3 w-3" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
