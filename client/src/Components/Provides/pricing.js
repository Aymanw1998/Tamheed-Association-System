// 0=Sunday(الأحد) ... 6=Saturday(السبت)
function endOfLastMonth(startDate, months) {
  // ملاحظة عربية
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
 * ملاحظة عربية
 * @param {Object} opts
 * ملاحظة عربية
 * ملاحظة عربية
 * ملاحظة عربية
 * @param {number[]} opts.daysOfWeek   - أيام الاثنينالسبتالاثنينالجمعةعربي, 0=الأحد' ... 6=السبت' (عربيالأربعاءالجمعةالثلاثاءعربيالخميس [0,4] عربيالأحد'+الخميس')
 * ملاحظة عربية
 * ملاحظة عربية
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
  const periodEnd = endOfLastMonth(start, 1);       // ملاحظة عربية
  console.log("periodEnd", periodEnd);
  const fullStart = firstOfMonth(start);                 // ملاحظة عربية
  console.log("fullStart", fullStart);
  const daysSet = new Set(daysOfWeek); // [0..6]
  console.log("daysSet", daysSet);
  const meetingsFull   = countMeetingsBetween(fullStart,  periodEnd, daysSet);
  const meetingsActual = countMeetingsBetween(start,      periodEnd, daysSet);
  console.log("meetingsFull/Actual", meetingsFull, meetingsActual);
  // ملاحظة عربية
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
  // ملاحظة عربية
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
