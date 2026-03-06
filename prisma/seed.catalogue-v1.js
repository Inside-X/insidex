const PRODUCT_A_SLUG = 'cafe-signature-v1';
const PRODUCT_B_SLUG = 'tshirt-insidex-v1';
const PRODUCT_C_SLUG = 'mug-collector-v1';

export const CATALOGUE_V1_PRODUCTS = Object.freeze([
  {
    slug: PRODUCT_A_SLUG,
    name: 'Café Signature InsideX',
    description: 'Café moulu signature, lot déterministe pour validation locale.',
    status: 'active',
    price: '14.90',
    currency: 'EUR',
    stock: 120,
    stockStatus: 'in_stock',
    stockQuantity: 120,
    backorderable: false,
    images: [
      {
        url: '/assets/images/catalogue/cafe-signature-1.jpg',
        alt: 'Sachet Café Signature vue face',
        width: 1200,
        height: 1200,
        position: 0,
      },
      {
        url: '/assets/images/catalogue/cafe-signature-2.jpg',
        alt: 'Sachet Café Signature vue détail',
        width: 1200,
        height: 1200,
        position: 1,
      },
    ],
    variants: [],
    specs: [
      { key: 'origine', value: 'Brésil', position: 0 },
      { key: 'torréfaction', value: 'Médium', position: 1 },
    ],
  },
  {
    slug: PRODUCT_B_SLUG,
    name: 'T-shirt InsideX Core',
    description: 'T-shirt unisexe avec variantes de tailles pour les règles CTA V1.',
    status: 'active',
    price: '29.00',
    currency: 'EUR',
    stock: 40,
    stockStatus: 'in_stock',
    stockQuantity: 40,
    backorderable: false,
    images: [
      {
        url: '/assets/images/catalogue/tshirt-core-1.jpg',
        alt: 'T-shirt InsideX Core face',
        width: 1200,
        height: 1200,
        position: 0,
      },
      {
        url: '/assets/images/catalogue/tshirt-core-2.jpg',
        alt: 'T-shirt InsideX Core dos',
        width: 1200,
        height: 1200,
        position: 1,
      },
    ],
    variants: [
      {
        sku: 'INSX-TSHIRT-CORE-S',
        label: 'Taille S',
        attributes: { size: 'S', color: 'black' },
        priceDelta: '-1.00',
        absolutePrice: null,
        stockStatus: 'in_stock',
        stockQuantity: 15,
        backorderable: false,
      },
      {
        sku: 'INSX-TSHIRT-CORE-XL',
        label: 'Taille XL',
        attributes: { size: 'XL', color: 'black' },
        priceDelta: '3.00',
        absolutePrice: null,
        stockStatus: 'out_of_stock',
        stockQuantity: 0,
        backorderable: false,
      },
    ],
    specs: [
      { key: 'matiere', value: '100% coton biologique', position: 0 },
      { key: 'coupe', value: 'Regular', position: 1 },
    ],
  },
  {
    slug: PRODUCT_C_SLUG,
    name: 'Mug Collector InsideX',
    description: 'Mug collector indisponible pour cas stock produit out_of_stock.',
    status: 'active',
    price: '18.00',
    currency: 'EUR',
    stock: 0,
    stockStatus: 'out_of_stock',
    stockQuantity: 0,
    backorderable: false,
    images: [
      {
        url: '/assets/images/catalogue/mug-collector-1.jpg',
        alt: 'Mug Collector InsideX',
        width: 1000,
        height: 1000,
        position: 0,
      },
    ],
    variants: [],
    specs: [
      { key: 'contenance', value: '330ml', position: 0 },
    ],
  },
]);


export const CATALOGUE_V1_PRODUCT = Object.freeze({
  ...CATALOGUE_V1_PRODUCTS[1],
  image: CATALOGUE_V1_PRODUCTS[1].images[0],
  variant: CATALOGUE_V1_PRODUCTS[1].variants[0],
  spec: CATALOGUE_V1_PRODUCTS[1].specs[0],
});

export async function seedCatalogueV1({ prisma, log = console.log } = {}) {
  if (!prisma || !prisma.product) {
    throw new Error('seedCatalogueV1 requires a prisma client');
  }

  const summary = { products: 0, images: 0, variants: 0, specs: 0, slugs: [] };

  for (const productInput of CATALOGUE_V1_PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { slug: productInput.slug },
      update: {
        name: productInput.name,
        description: productInput.description,
        status: productInput.status,
        price: productInput.price,
        currency: productInput.currency,
        stock: productInput.stock,
        stockStatus: productInput.stockStatus,
        stockQuantity: productInput.stockQuantity,
        backorderable: productInput.backorderable,
        active: true
      },
      create: {
        slug: productInput.slug,
        name: productInput.name,
        description: productInput.description,
        status: productInput.status,
        price: productInput.price,
        currency: productInput.currency,
        stock: productInput.stock,
        stockStatus: productInput.stockStatus,
        stockQuantity: productInput.stockQuantity,
        backorderable: productInput.backorderable,
        active: true,
      },
      select: { id: true, slug: true },
    });

    summary.products += 1;
    summary.slugs.push(product.slug);

    for (const image of productInput.images) {
      await prisma.productImage.upsert({
        where: {
          productId_position: {
            productId: product.id,
            position: image.position,
          },
        },
        update: {
          url: image.url,
          alt: image.alt,
          width: image.width,
          height: image.height,
        },
        create: {
          productId: product.id,
          url: image.url,
          alt: image.alt,
          width: image.width,
          height: image.height,
          position: image.position,
        },
      });
      summary.images += 1;
    }

    for (const variant of productInput.variants) {
      await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: {
          productId: product.id,
          label: variant.label,
          attributes: variant.attributes,
          priceDelta: variant.priceDelta,
          absolutePrice: variant.absolutePrice,
          stockStatus: variant.stockStatus,
          stockQuantity: variant.stockQuantity,
          backorderable: variant.backorderable,
        },
        create: {
          productId: product.id,
          sku: variant.sku,
          label: variant.label,
          attributes: variant.attributes,
          priceDelta: variant.priceDelta,
          absolutePrice: variant.absolutePrice,
          stockStatus: variant.stockStatus,
          stockQuantity: variant.stockQuantity,
          backorderable: variant.backorderable,
        },
      });
      summary.variants += 1;
    }

    for (const spec of productInput.specs) {
      await prisma.productSpec.upsert({
        where: {
          productId_key: {
            productId: product.id,
            key: spec.key,
          },
        },
        update: {
          value: spec.value,
          position: spec.position,
        },
        create: {
          productId: product.id,
          key: spec.key,
          value: spec.value,
          position: spec.position,
        },
      });
      summary.specs += 1;
    }
  }

  log('catalogue_v1_seed_applied', summary);
  return { seeded: true, ...summary };
}

export default seedCatalogueV1;