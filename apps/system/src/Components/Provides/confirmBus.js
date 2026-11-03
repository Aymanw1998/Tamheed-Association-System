// ملاحظة عربية
let _askImpl = null;
let _cancelImpl = null;

// ملاحظة عربية
const PRESETS = {
  navigate: { title: 'مغادرة الصفحة', message: 'توجد تغييرات لم تُحفظ، وستُفقد إذا غادرت الصفحة الآن. هل تريد المغادرة؟', confirmText: 'نعم', cancelText: 'إلغاء'},
  create:   { title: 'تأكيد الإنشاء', message: 'هل تريد إنشاء هذا العنصر؟', confirmText: 'نعم',  cancelText: 'إلغاء' },
  change:   { title: 'تأكيد الحفظ', message: 'هل تريد حفظ التغييرات؟', confirmText: 'نعم', cancelText: 'إلغاء' },
  delete:   { title: 'تأكيد الحذف', message: 'هل تريد حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.', confirmText: 'نعم', cancelText: 'إلغاء', danger: true },
};

// ملاحظة عربية
export function setGlobalAsk(fn /* (options) => Promise<boolean> */) {
  _askImpl = typeof fn === 'function' ? fn : null;

}

// Closes the open confirm dialog (if any) as if «إلغاء» was pressed: its
// promise resolves false. The guided journey calls it when it leaves a
// chapter, so a dialog it opened never outlives that chapter.
export function setGlobalCancel(fn) {
  _cancelImpl = typeof fn === 'function' ? fn : null;
}

export function cancelOpenConfirm() {
  if (typeof _cancelImpl === 'function') _cancelImpl();
}

/**
 * ملاحظة عربية
 * ملاحظة عربية
 * ملاحظة عربية
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
