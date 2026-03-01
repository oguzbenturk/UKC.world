# Shop Sidebar Filter Improvement Plan

## Goal
Redesign the shop sidebar filters with a proper hierarchical category/subcategory system, ensuring the database, backend, admin forms, and frontend sidebar all align to the same category tree.

---

## Target Category Hierarchy

```
Kitesurf Equipment
├── Kites
├── Bars
├── Boards
├── Lines
└── Spare Parts

WingFoil Equipment
├── Wings
├── Boards
└── Foils

Efoil Equipment
├── FoilAssist Boards
├── Front & Back Wings
└── E-Masts & Fuselages

ION - Wetsuits
├── Men
│   ├── Fullsuits
│   ├── Springsuits & Shorties
│   └── All Wetsuits
└── Women
    ├── Fullsuits
    ├── Springsuits & Shorties
    └── All Wetsuits

ION - Harnesses
├── Men
└── Women

ION - Accessories
├── Ponchos
├── Leashes
└── Beach Accessories

UKC.SHOP
├── Hoodies
├── Ponchos
└── T-Shirts

UKC.SECONDWIND
├── Kites
├── Bars
├── Boards
└── Set Options
```

---

## GAP Analysis: Current vs Target

### Current Category Sources (3 inconsistent definitions!)

| Source File | Categories Defined |
|---|---|
| `src/shared/constants/productCategories.js` | kites, boards, wing-foil, e-foil, wetsuits, harnesses, bars, equipment, accessories, apparel, bags, spare-parts, safety, other (14 categories) |
| `src/shared/contexts/ShopFiltersContext.jsx` | kites, boards, wing-foil, e-foil, harnesses, wetsuits, bars, equipment, accessories, apparel, safety, spare-parts, other (13 labels) |
| `src/features/products/pages/Products.jsx` | kites, boards, bars, bags, harnesses, wetsuits, equipment, accessories, apparel, safety, other (11 categories, own array) |

### Key Gaps

| Target Category | Current Match | Gap |
|---|---|---|
| **Kitesurf Equipment** | `kites` + `bars` + `boards` (separate top-level) | Need to GROUP kites+bars+boards+lines+spare-parts under one parent |
| **WingFoil Equipment** | `wing-foil` exists with subcats wings/foil-boards/masts | Rename subcats to match spec (Foils, Boards) |
| **Efoil Equipment** | `e-foil` exists with subcats boards/accessories | Need new subcats: FoilAssist Boards, Front & Back Wings, E-Masts & Fuselages |
| **ION - Wetsuits** | `wetsuits` exists with subcats men/women/kids | Need 3-level: Men→Fullsuits/Springsuits/All, Women→same. Drop "kids" |
| **ION - Harnesses** | `harnesses` exists with waist/seat/men/women/freestyle/freeride | Simplify to just Men/Women |
| **ION - Accessories** | `accessories` exists but empty subcats | Need Ponchos/Leashes/Beach Accessories |
| **UKC.SHOP** | `apparel` partially matches (hoodies subcategory exists) | New category with Hoodies/Ponchos/T-Shirts |
| **UKC.SECONDWIND** | `other` used as catch-all | New category for second-hand: Kites/Bars/Boards/Set Options |

### Files That Need Changes

| # | File | Change Needed |
|---|---|---|
| 1 | `src/shared/constants/productCategories.js` | Complete rewrite of PRODUCT_CATEGORIES with new hierarchy |
| 2 | `src/shared/contexts/ShopFiltersContext.jsx` | Update CATEGORY_LABELS to match new categories |
| 3 | `src/features/products/pages/Products.jsx` | Replace local PRODUCT_CATEGORIES with import from constants |
| 4 | `src/features/products/components/ProductForm.jsx` | Update category dropdown to use shared constants |
| 5 | `src/shared/components/layout/Sidebar.jsx` | Redesign `renderShopSidebar()` for new hierarchy |
| 6 | `src/features/outsider/pages/ShopCategoryPage.jsx` | Update SECTION_TO_CATEGORY mapping |
| 7 | `src/features/outsider/pages/ShopLandingPage.jsx` | Update SECTIONS array |
| 8 | `src/features/dashboard/pages/Shop.jsx` | Update SHOP_NAV_CATEGORIES |
| 9 | `backend/db/migrations/161_update_shop_categories.sql` | New migration: update product_subcategories table |
| 10 | `backend/routes/products.js` | Ensure filtering supports new category values |

---

## Implementation Checklist

### Phase 1: Category Data Model

- [x] **1.1** Rewrite `src/shared/constants/productCategories.js` with new 8-category hierarchy supporting 3-level nesting (category → gender/group → subcategory)
- [x] **1.2** Update `CATEGORY_LABELS` in `src/shared/contexts/ShopFiltersContext.jsx` to match new category keys
- [x] **1.3** Update `availableCategories` computation in ShopFiltersContext to support new structure

### Phase 2: Database & Backend

- [x] **2.1** Create migration `backend/db/migrations/161_update_shop_categories.sql` — clear old subcategories, insert new hierarchy
- [x] **2.2** Verify `backend/routes/products.js` GET / supports new category values and subcategory filtering
- [x] **2.3** Add backend endpoint or logic for fetching category tree (if needed)

### Phase 3: Admin Product Management

- [x] **3.1** Remove local `PRODUCT_CATEGORIES` array from `src/features/products/pages/Products.jsx` and import from shared constants
- [x] **3.2** Update `ProductForm.jsx` category/subcategory dropdowns to use the new hierarchy
- [x] **3.3** Ensure existing products with old category values still display correctly (backward compatibility via LEGACY_CATEGORY_MAP)

### Phase 4: Shop Sidebar Filter UI

- [x] **4.1** Redesign `renderShopSidebar()` in `Sidebar.jsx` — support 3-level nesting with expand/collapse
- [x] **4.2** Add gender-level filtering for ION-Wetsuits (Men/Women → subtypes)
- [x] **4.3** Style the sidebar with modern indentation, active states, and smooth transitions

### Phase 5: Shop Pages & Navigation

- [x] **5.1** Update `SECTION_TO_CATEGORY` in `ShopCategoryPage.jsx` for new category keys
- [x] **5.2** Update `SECTIONS` array in `ShopLandingPage.jsx` with new categories
- [x] **5.3** Update `SHOP_NAV_CATEGORIES` in `Shop.jsx` with new category tabs
- [x] **5.4** Update `navConfig.js` shop subItems to use new URL slugs
- [x] **5.5** Update `ProductPreviewModal.jsx` to use `getCategoryLabel()` instead of local array

### Phase 6: Cleanup & Verification

- [x] **6.1** Remove unused old category definitions (bags, spare-parts, safety, equipment as top-level)
- [x] **6.2** Verify no broken imports or references to old category keys across codebase
- [ ] **6.3** Run migration on database: `npm run migrate:up`
- [ ] **6.4** Test admin product create/edit with new categories
- [ ] **6.5** Test shop sidebar filtering at all hierarchy levels
