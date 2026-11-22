import React, { useMemo, useState } from 'react';
import { LayoutGrid, List, Package, Plus, Search } from 'lucide-react';
import { BidProduct, Tender } from '../types/tender';
import { BidProductCard } from './BidProductCard';
import { BidProductsTable } from './BidProductsTable';

type ProductViewMode = 'cards' | 'list';
const VIEW_MODE_STORAGE_KEY = 'tiniatech_products_view_mode';

function loadInitialViewMode(): ProductViewMode {
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return saved === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

interface BidProductsViewProps {
  currentUid?: string;
  products: BidProduct[];
  tenders: Tender[];
  onNewProduct: () => void;
  onViewProduct: (product: BidProduct) => void;
  onEditProduct: (product: BidProduct) => void;
  onDeleteProduct: (product: BidProduct) => void;
  onSelectTenderId: (tenderId: string) => void;
  onDuplicateForNewCompany?: (product: BidProduct) => void;
  onCreateAccountingEntry?: (product: BidProduct) => void;
  canManageProducts?: boolean;
  canManageAccounting?: boolean;
}

export const BidProductsView: React.FC<BidProductsViewProps> = ({
  currentUid = '',
  products,
  tenders,
  onNewProduct,
  onViewProduct,
  onEditProduct,
  onDeleteProduct,
  onSelectTenderId,
  onDuplicateForNewCompany,
  onCreateAccountingEntry,
  canManageProducts = true,
  canManageAccounting = false,
}) => {
  const [search, setSearch] = useState('');
  const [tenderFilter, setTenderFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ProductViewMode>(() => loadInitialViewMode());

  const handleChangeViewMode = (mode: ProductViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (tenderFilter !== 'all' && p.tenderId !== tenderFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.materialName.toLowerCase().includes(q) ||
        p.stockNumber.toLowerCase().includes(q) ||
        p.partNumber.toLowerCase().includes(q) ||
        p.supplierCompany.toLowerCase().includes(q) ||
        p.tenderTrackingCode.toLowerCase().includes(q)
      );
    });
  }, [products, search, tenderFilter]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#868686] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Stok no, parça no, malzeme adı veya firma ara..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={tenderFilter}
            onChange={(e) => setTenderFilter(e.target.value)}
            aria-label="İhaleye Göre Filtrele"
            className="min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239] max-w-[260px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
          >
            <option value="all">Tüm Teklif Ürünleri ({products.length})</option>
            {tenders.map((t) => (
              <option key={t.id} value={t.id}>
                {t.trackingCode} — {t.title}
              </option>
            ))}
          </select>

          <div
            className="flex items-center gap-1 p-1 bg-[#F3F6FA] rounded-lg shrink-0"
            role="group"
            aria-label="Görünüm Seçeneği"
          >
            <button
              type="button"
              onClick={() => handleChangeViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
              className={`min-h-[36px] px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'cards'
                  ? 'bg-white text-[#0B2239] shadow-xs'
                  : 'text-[#4E5D6C] hover:text-[#0B2239]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kartlar</span>
            </button>
            <button
              type="button"
              onClick={() => handleChangeViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`min-h-[36px] px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'list'
                  ? 'bg-white text-[#0B2239] shadow-xs'
                  : 'text-[#4E5D6C] hover:text-[#0B2239]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Liste</span>
            </button>
          </div>

          {canManageProducts && (
            <button
              type="button"
              onClick={onNewProduct}
              className="min-h-[44px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Ürün Kartı</span>
            </button>
          )}
        </div>
      </div>

      {/* Cards Grid or Empty State */}
      {products.length === 0 ? (
        <div className="bg-white border border-[#DCE3EC] rounded-xl p-10 text-center max-w-xl mx-auto space-y-3">
          <div className="w-11 h-11 mx-auto rounded-lg bg-[#0B2239] flex items-center justify-center text-[#FBBF24]">
            <Package className="w-5 h-5" />
          </div>
          <h2 className="font-display text-lg font-bold text-[#0B2239]">
            Henüz Teklif Verilen Ürün Kartı Yok
          </h2>
          <p className="text-xs text-[#4E5D6C] leading-relaxed">
            İhalelerde teklif verdiğiniz malzemelerin stok numarası, parça numarası, fiyat alınan
            firma, fiyat tarihi, satış fiyatı, alım ve teklif tarihlerini kartlar halinde kaydedin.
          </p>
          {canManageProducts && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onNewProduct}
                className="min-h-[44px] px-5 py-2.5 inline-flex items-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>İlk Ürün Kartını Oluştur</span>
              </button>
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#DCE3EC] rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-[#0B2239]">
            Arama kriterlerinize uygun ürün kartı bulunamadı.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setTenderFilter('all');
            }}
            className="min-h-[44px] px-4 py-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-xs font-semibold text-[#0B2239] rounded-lg cursor-pointer transition-colors"
          >
            Filtreleri Temizle
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <BidProductsTable
          products={filtered}
          currentUid={currentUid}
          canManage={canManageProducts}
          canManageAccounting={canManageAccounting}
          showTenderColumn={true}
          onView={onViewProduct}
          onEdit={onEditProduct}
          onDelete={onDeleteProduct}
          onSelectTenderId={onSelectTenderId}
          onDuplicateForNewCompany={onDuplicateForNewCompany}
          onCreateAccountingEntry={onCreateAccountingEntry}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((product) => (
            <BidProductCard
              key={product.id}
              product={product}
              currentUid={currentUid}
              canManage={canManageProducts}
              canManageAccounting={canManageAccounting}
              onView={onViewProduct}
              onEdit={onEditProduct}
              onDelete={onDeleteProduct}
              onSelectTenderId={onSelectTenderId}
              onDuplicateForNewCompany={onDuplicateForNewCompany}
              onCreateAccountingEntry={onCreateAccountingEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
};
