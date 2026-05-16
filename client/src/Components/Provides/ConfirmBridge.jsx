import { useEffect } from 'react';
import { useConfirm } from './ConfirmContext'; // ملاحظة عربية
import { setGlobalAsk } from './confirmBus';

/* ملاحظة عربية */
export default function ConfirmBridge() {
  const confirm = useConfirm(); // (options) => Promise<boolean>
  useEffect(() => { setGlobalAsk((opts) => confirm(opts)); }, [confirm]);
  return null;
}
