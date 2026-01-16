import { useEffect } from 'react';
import { useConfirm } from './ConfirmContext'; // יש לך כבר
import { setGlobalAsk } from './confirmBus';

/** מריץ פעם אחת ברוט: מחבר את ה-confirm של ה-Provider ל-bus הגלובלי */
export default function ConfirmBridge() {
  const confirm = useConfirm(); // (options) => Promise<boolean>
  useEffect(() => { setGlobalAsk((opts) => confirm(opts)); }, [confirm]);
  return null;
}
