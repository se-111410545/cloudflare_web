import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Category, Product } from '@/types';
import { cn } from '@/lib/utils';

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  onSelect: (product: Product) => void;
  /** 圖片 URL 產生器 (依檔案鍵) */
  imageUrl?: (key: string | null | undefined) => string | undefined;
}

export function ProductGrid({ products, categories, onSelect, imageUrl }: ProductGridProps) {
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const inCategory = activeCategory === 'all' || p.category_id === activeCategory;
      const inKeyword =
        !keyword.trim() || p.name.toLowerCase().includes(keyword.trim().toLowerCase());
      return inCategory && inKeyword;
    });
  }, [products, activeCategory, keyword]);

  return (
    <div className="flex h-full flex-col">
      {/* 分類 + 搜尋 */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋商品…"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-pos-500 focus:ring-2 focus:ring-pos-500/20"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
              activeCategory === 'all'
                ? 'bg-pos-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                activeCategory === cat.id
                  ? 'bg-pos-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* 商品網格 */}
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((product) => {
          const img = imageUrl?.(product.image_key);
          const unavailable = !product.is_available;
          return (
            <button
              key={product.id}
              type="button"
              disabled={unavailable}
              onClick={() => onSelect(product)}
              className={cn(
                'card-pos group flex flex-col overflow-hidden text-left transition-all hover:shadow-md disabled:opacity-50 disabled:hover:shadow-sm',
                unavailable && 'cursor-not-allowed'
              )}
            >
              <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
                {img ? (
                  <img
                    src={img}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-gray-300">
                    {product.name.slice(0, 2)}
                  </div>
                )}
                {unavailable && (
                  <span className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    停售
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <p className="truncate text-sm font-semibold text-gray-800">{product.name}</p>
                <p className="mt-0.5 text-sm font-bold text-pos-700">
                  ${Number(product.price).toFixed(0)}
                </p>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-gray-400">
            沒有符合的商品
          </p>
        )}
      </div>
    </div>
  );
}
