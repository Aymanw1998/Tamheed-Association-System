// 0=Sunday(א) ... 6=Saturday(ש)
function endOfLastMonth(startDate, months) {
  // אחרון של החודש האחרון: day=0 של (month + months)
  return new Date(startDate.getFullYear(), startDate.getMonth() + months, 0);
}

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function countMeetingsBetween(start, end, daysOfWeekSet) {
  console.log("countMeetingsBetween", start, end, daysOfWeekSet);
  let cnt = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur <= end) {
    if (daysOfWeekSet.has(cur.getDay()+1)) cnt++;
    console.log("  checking", cur.toISOString(), "day", cur.getDay()+1, "cnt", cnt);
    cur.setDate(cur.getDate() + 1);
  }
  return cnt;
}

/**
 * חישוב הצעת מחיר יחסית לפי מספר אימונים בפועל לעומת מלאים
 * @param {Object} opts
 * @param {number} opts.planPrice   - מחיר החבילה המלא לכל התקופה (ללא חישוב חודשי)
 * @param {number} opts.months      - מספר חודשים (למשל 3)
 * @param {string|Date} opts.startDate - תאריך התחלה אמיתי (לדוגמה '2025-08-27')
 * @param {number[]} opts.daysOfWeek   - ימים בשבוע, 0=א' ... 6=ש' (לדוגמה [0,4] לא'+ה')
 * @param {number} [opts.roundTo=1]    - עיגול למחיר (1=שלם, 0.5 וכו')
 * @param {number} [opts.minFraction=0] - רצפה לאחוז תשלום (למשל 0.5 אם רוצים מינימום 50%)
 */
export function calcProratedQuote({
  planPrice,
  months,
  startDate,
  daysOfWeek,
  roundTo = 1,
  minFraction = 0,
}) {
  const start = (startDate instanceof Date) ? startDate : new Date(startDate);
  if(start.getTime() > new Date().getTime()) {
    
  }
  const priceAllMonth = planPrice/months;
  const periodEnd = endOfLastMonth(start, 1);       // סוף החודש האחרון
  console.log("periodEnd", periodEnd);
  const fullStart = firstOfMonth(start);                 // תחילת החודש הראשון
  console.log("fullStart", fullStart);
  const daysSet = new Set(daysOfWeek); // [0..6]
  console.log("daysSet", daysSet);
  const meetingsFull   = countMeetingsBetween(fullStart,  periodEnd, daysSet);
  const meetingsActual = countMeetingsBetween(start,      periodEnd, daysSet);
  console.log("meetingsFull/Actual", meetingsFull, meetingsActual);
  // הגנה מתמטית
  if (meetingsFull <= 0 && start.getMonth() === new Date().getMonth()) {
    return {
      price: 0, fraction: 0,
      meetingsFull, meetingsActual,
      period: { start, end: periodEnd }
    };
  } else if(start.getTime() > new Date().getTime()) {
    return {
      price: planPrice, fraction: 1,
      meetingsFull, meetingsActual,
      period: { start, end: periodEnd }
    };
  }

  let fraction = meetingsActual / meetingsFull;
  if (minFraction > 0) fraction = Math.max(fraction, minFraction);
  console.log("raw fraction", fraction);
  // עיגול למחיר נוח (ברירת מחדל לש"ח שלם)
  console.log("fraction before round", priceAllMonth, fraction);
  const raw = priceAllMonth * fraction;
  console.log("roundTo", roundTo, raw);
  const price = Math.round(raw / roundTo) * roundTo;
  console.log("final price", price);
  const totalPrice = (priceAllMonth * (months-1))+price;
  const totalEnd = endOfLastMonth(start, months);
  return {
    price: totalPrice,
    fraction,
    meetingsFull,
    meetingsActual,
    period: { start, end: periodEnd }
  };
}
