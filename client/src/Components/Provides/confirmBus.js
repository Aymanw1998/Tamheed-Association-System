// גשר גלובלי: services יכולים לקרוא ask(...) בלי hooks
let _askImpl = null;

// פריסטים נוחים
const PRESETS = {
  navigate: { title: 'خروج من الصفحة', message: 'هل أنت متأكد من رغبتك في الخروج من الصفحة؟ توجد تغييرات لم يتم حفظها، وسيؤدي إلى دون تحديث البيانات', confirmText: 'نعم', cancelText: 'الغاء'},
  create:   { title: 'إنشاء', message: 'هل أنت متأكد من رغبتك في إنشاء هذا العنصر؟', confirmText: 'نعم',  cancelText: 'الغاء' },
  change:   { title: 'تغيير', message: 'هل أنت متأكد من حفظ التغييرات؟', confirmText: 'نعم', cancelText: 'الغاء' },
  delete:   { title: 'حذف', message: 'هل أنت متأكد من حذف هذا العنصر؟', confirmText: 'نعم', cancelText: 'الغاء', danger: true },
};

// מגדיר את פונקציית ה-confirm שמגיעה מה-Provider (דרך ה-Bridge)
export function setGlobalAsk(fn /* (options) => Promise<boolean> */) {
  _askImpl = typeof fn === 'function' ? fn : null;

}

/**
 * בקשת אישור מתוך services
 * @param {'navigate'|'create'|'change'|'delete'|object} kind - פריסט או אובייקט מותאם אישית
 * @param {object} overrides - שינויים נקודתיים (כותרת/טקסטים/מסוכן וכו')
 * @returns {Promise<boolean>}
 */
export async function ask(kind, overrides = {}) {
  console.log("confirmBus ask", kind, overrides);
  console.log("_askImpl", _askImpl, typeof _askImpl);
  if (typeof _askImpl !== 'function') {
    console.warn('[confirmBus] not initialized – auto-approve.');
    return Promise.reject(new Error('Confirm not ready yet'));
  }
  const base = typeof kind === 'string' ? (PRESETS[kind] || PRESETS.change) : (kind || {});
  console.log("confirmBus ask base", base);
  return _askImpl({ ...base, ...overrides });
}
