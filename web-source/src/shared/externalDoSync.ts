import {
  inferDefaultProductFromCategory,
  type DeliveryOrder,
  type ProductCategory,
} from '../types/grain.ts';

export interface ExternalDoNormalized {
  externalId: string;
  doNumber: string;
  product: ProductCategory;
  category: string;
  totalBags: number;
  totalMt: number;
  deliveredBags: number;
  deliveredMt: number;
  recipient: string;
  date: string;
  status: 'pending' | 'distributed';
}

function pickField(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') {
      return obj[k];
    }
  }
  return undefined;
}

export function parseProductCategory(raw: unknown): ProductCategory {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'rice';
  if (s === 'paddy' || s.includes('ধান') || s.includes('dhan')) return 'paddy';
  if (s === 'wheat' || s.includes('গম') || s.includes('gom')) return 'wheat';
  if (
    s === 'bosta_50' ||
    s === 'bosta50' ||
    (s.includes('বস্তা') && s.includes('৫০')) ||
    (s.includes('bosta') && s.includes('50')) ||
    s === '50kg'
  ) {
    return 'bosta_50';
  }
  if (
    s === 'bosta_30' ||
    s === 'bosta30' ||
    (s.includes('বস্তা') && s.includes('৩০')) ||
    (s.includes('bosta') && s.includes('30')) ||
    s === '30kg'
  ) {
    return 'bosta_30';
  }
  if (s === 'bosta' || s.includes('বস্তা')) return 'bosta_50';
  if (s === 'rice' || s.includes('চাল') || s.includes('chal')) return 'rice';
  return 'rice';
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const cleaned = String(val ?? '')
    .replace(/,/g, '')
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function extractArrayFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'));
  }
  if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>;
    const candidates = [
      rec.pending,
      rec.pendingDos,
      rec.deliveryOrders,
      rec.dos,
      rec.orders,
      rec.data,
      rec.items,
      rec.rows,
      rec.records,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) {
        return c.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'));
      }
    }
    if (pickField(rec, ['doNumber', 'do_number', 'doNo', 'do_no', 'ডিও নম্বর', 'ডিও'])) {
      return [rec];
    }
  }
  return [];
}

export function normalizeExternalDoList(payload: unknown): ExternalDoNormalized[] {
  const rawList = extractArrayFromPayload(payload);
  const results: ExternalDoNormalized[] = [];

  for (const row of rawList) {
    const doNumberRaw = pickField(row, [
      'doNumber',
      'do_number',
      'doNo',
      'do_no',
      'do',
      'DO',
      'ডিও নম্বর',
      'ডিও',
    ]);
    const doNumber = String(doNumberRaw || '').trim();
    if (!doNumber) continue;

    const categoryRaw = pickField(row, [
      'category',
      'khat',
      'channel',
      'scheme',
      'খাত',
      'ক্যাটাগরি',
    ]);
    const category = String(categoryRaw || 'বিডব্লিউবি').trim();

    const productRaw = pickField(row, ['product', 'productType', 'item', 'grain', 'পণ্য']);
    const product = productRaw
      ? parseProductCategory(productRaw)
      : inferDefaultProductFromCategory(category);

    const totalMt = Number(
      parseNumber(
        pickField(row, [
          'totalMt',
          'total_mt',
          'mt',
          'metricTons',
          'metric_tons',
          'quantityMt',
          'qtyMt',
          'weight',
          'পরিমাণ',
          'মে.টন',
        ])
      ).toFixed(4)
    );

    const totalBags = Math.round(
      parseNumber(
        pickField(row, ['totalBags', 'total_bags', 'bags', 'bosta', 'qtyBags', 'বস্তা'])
      )
    );

    const deliveredMt = Number(
      parseNumber(pickField(row, ['deliveredMt', 'delivered_mt', 'dispatchedMt'])).toFixed(4)
    );
    const deliveredBags = Math.round(
      parseNumber(pickField(row, ['deliveredBags', 'delivered_bags', 'dispatchedBags']))
    );

    const recipient = String(
      pickField(row, ['recipient', 'dealer', 'union', 'receiver', 'প্রাপক', 'ডিলার']) || ''
    ).trim();

    const date = String(
      pickField(row, ['date', 'doDate', 'do_date', 'createdDate', 'তারিখ']) || todayIso()
    ).slice(0, 10);

    const statusRaw = String(pickField(row, ['status', 'state', 'অবস্থা']) || '')
      .trim()
      .toLowerCase();
    const isDistFlag =
      row.isDistributed === true ||
      row.distributed === true ||
      statusRaw === 'distributed' ||
      statusRaw === 'completed' ||
      statusRaw === 'done' ||
      statusRaw === 'delivered' ||
      statusRaw === 'বিতরণকৃত';

    const extIdRaw = pickField(row, ['externalId', 'id', '_id', 'doId', 'rowId']);
    const externalId = String(extIdRaw || `${doNumber}::${product}`).trim();

    results.push({
      externalId,
      doNumber,
      product,
      category,
      totalBags: totalBags > 0 ? totalBags : totalMt > 0 ? Math.round(totalMt * 20) : 0,
      totalMt,
      deliveredBags,
      deliveredMt,
      recipient,
      date,
      status: isDistFlag ? 'distributed' : 'pending',
    });
  }

  return results;
}

export function isDoPending(order: DeliveryOrder): boolean {
  if (order.status === 'distributed') return false;
  const isBagOnly = order.product === 'bosta_50' || order.product === 'bosta_30';
  if (!isBagOnly && order.totalMt > 0) {
    return order.totalMt - order.deliveredMt > 0.0001;
  }
  if (order.totalBags > 0) {
    return order.totalBags - order.deliveredBags > 0;
  }
  return order.totalMt - order.deliveredMt > 0.0001;
}
