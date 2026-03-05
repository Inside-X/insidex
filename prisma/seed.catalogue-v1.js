export const CATALOGUE_V1_PRODUCT = Object.freeze({
  slug: 'produit-test-v1',
  name: 'Produit Test V1',
  description: 'Produit de démonstration déterministe pour le smoke catalogue V1.',
  status: 'active',
  price: '19.90',
  currency: 'EUR',
  stock: 25,
  stockStatus: 'in_stock',
  stockQuantity: 25,
  backorderable: false,
  image: {
    url: '/assets/images/kahawa.jpg',
    alt: 'Produit test V1',
    width: 1200,
    height: 1200,
    position: 0,
  },
  variant: {
    sku: 'INSX-PRODUIT-TEST-V1-DEFAULT',
    label: 'Standard',
    attributes: { size: 'std', color: 'noir' },
    priceDelta: '0.00',
    stockStatus: 'in_stock',
    stockQuantity: 25,
    backorderable: false,
  },
  spec: {
    key: 'matiere',
    value: 'coton',
    position: 0,
  },
});

export async function seedCatalogueV1({ prisma, force = false, log = console.log } = {}) {
  if (!prisma || !prisma.product) {
    throw new Error('seedCatalogueV1 requires a prisma client');
  }

  const totalProducts = await prisma.product.count();
  if (!force && totalProducts > 0) {
    log('catalogue_v1_seed_skipped', { reason: 'catalogue_not_empty', totalProducts });
    return { seeded: false, reason: 'catalogue_not_empty', totalProducts };
  }

  const product = await prisma.product.upsert({
    where: { slug: CATALOGUE_V1_PRODUCT.slug },
    update: {
      name: CATALOGUE_V1_PRODUCT.name,
      description: CATALOGUE_V1_PRODUCT.description,
      status: CATALOGUE_V1_PRODUCT.status,
      price: CATALOGUE_V1_PRODUCT.price,
      currency: CATALOGUE_V1_PRODUCT.currency,
      stock: CATALOGUE_V1_PRODUCT.stock,
      stockStatus: CATALOGUE_V1_PRODUCT.stockStatus,
      stockQuantity: CATALOGUE_V1_PRODUCT.stockQuantity,
      backorderable: CATALOGUE_V1_PRODUCT.backorderable,
      active: true,
    },
    create: {
      slug: CATALOGUE_V1_PRODUCT.slug,
      name: CATALOGUE_V1_PRODUCT.name,
      description: CATALOGUE_V1_PRODUCT.description,
      status: CATALOGUE_V1_PRODUCT.status,
      price: CATALOGUE_V1_PRODUCT.price,
      currency: CATALOGUE_V1_PRODUCT.currency,
      stock: CATALOGUE_V1_PRODUCT.stock,
      stockStatus: CATALOGUE_V1_PRODUCT.stockStatus,
      stockQuantity: CATALOGUE_V1_PRODUCT.stockQuantity,
      backorderable: CATALOGUE_V1_PRODUCT.backorderable,
      active: true,
    },
    select: { id: true, slug: true },
  });

  await prisma.productImage.upsert({
    where: {
      productId_position: {
        productId: product.id,
        position: CATALOGUE_V1_PRODUCT.image.position,
      },
    },
    update: {
      url: CATALOGUE_V1_PRODUCT.image.url,
      alt: CATALOGUE_V1_PRODUCT.image.alt,
      width: CATALOGUE_V1_PRODUCT.image.width,
      height: CATALOGUE_V1_PRODUCT.image.height,
    },
    create: {
      productId: product.id,
      url: CATALOGUE_V1_PRODUCT.image.url,
      alt: CATALOGUE_V1_PRODUCT.image.alt,
      width: CATALOGUE_V1_PRODUCT.image.width,
      height: CATALOGUE_V1_PRODUCT.image.height,
      position: CATALOGUE_V1_PRODUCT.image.position,
    },
  });

  await prisma.productVariant.upsert({
    where: { sku: CATALOGUE_V1_PRODUCT.variant.sku },
    update: {
      productId: product.id,
      label: CATALOGUE_V1_PRODUCT.variant.label,
      attributes: CATALOGUE_V1_PRODUCT.variant.attributes,
      priceDelta: CATALOGUE_V1_PRODUCT.variant.priceDelta,
      stockStatus: CATALOGUE_V1_PRODUCT.variant.stockStatus,
      stockQuantity: CATALOGUE_V1_PRODUCT.variant.stockQuantity,
      backorderable: CATALOGUE_V1_PRODUCT.variant.backorderable,
    },
    create: {
      productId: product.id,
      sku: CATALOGUE_V1_PRODUCT.variant.sku,
      label: CATALOGUE_V1_PRODUCT.variant.label,
      attributes: CATALOGUE_V1_PRODUCT.variant.attributes,
      priceDelta: CATALOGUE_V1_PRODUCT.variant.priceDelta,
      stockStatus: CATALOGUE_V1_PRODUCT.variant.stockStatus,
      stockQuantity: CATALOGUE_V1_PRODUCT.variant.stockQuantity,
      backorderable: CATALOGUE_V1_PRODUCT.variant.backorderable,
    },
  });

  await prisma.productSpec.upsert({
    where: {
      productId_key: {
        productId: product.id,
        key: CATALOGUE_V1_PRODUCT.spec.key,
      },
    },
    update: {
      value: CATALOGUE_V1_PRODUCT.spec.value,
      position: CATALOGUE_V1_PRODUCT.spec.position,
    },
    create: {
      productId: product.id,
      key: CATALOGUE_V1_PRODUCT.spec.key,
      value: CATALOGUE_V1_PRODUCT.spec.value,
      position: CATALOGUE_V1_PRODUCT.spec.position,
    },
  });

  log('catalogue_v1_seed_applied', { slug: product.slug, force, totalProductsBefore: totalProducts });
  return { seeded: true, slug: product.slug, force, totalProductsBefore: totalProducts };
}

export default seedCatalogueV1;