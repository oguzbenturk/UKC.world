// backend/constants/vendorCatalogs.js
// Configuration for external vendor catalog integrations (ION, Duotone, etc.)

export const VENDOR_CATALOGS = [
  {
    key: 'duotone',
    brand: 'Duotone',
    envFeedUrl: 'DUOTONE_PRODUCT_FEED_URL',
  apiKeyEnv: 'DUOTONE_PRODUCT_FEED_TOKEN',
    defaultCategory: 'kites',
    defaultCurrency: 'EUR',
    enabledEnvFlag: 'DUOTONE_SYNC_ENABLED',
    // Some APIs expose a simple REST endpoint returning JSON.
    // Expected shape: {
    //   products: [{
    //     sku, name, description, price, currency, stock, category,
    //     image, images (array), url, lastUpdated
    //   }]
    // }
    extraction: {
      dataPath: 'products'
    }
  },
  {
    key: 'ion',
    brand: 'ION',
    envFeedUrl: 'ION_PRODUCT_FEED_URL',
  apiKeyEnv: 'ION_PRODUCT_FEED_TOKEN',
    defaultCategory: 'equipment',
    defaultCurrency: 'EUR',
    enabledEnvFlag: 'ION_SYNC_ENABLED',
    extraction: {
      dataPath: 'items'
    }
  }
];

export const VENDOR_KEY_MAP = VENDOR_CATALOGS.reduce((acc, vendor) => {
  acc[vendor.key] = vendor;
  return acc;
}, {});
