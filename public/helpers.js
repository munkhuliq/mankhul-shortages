(function (root) {
  const helpers = {
    hasPurchase: item => Number(item.quantityPurchased) > 0 || ['purchased', 'partial', 'completed'].includes(item.status),
    isDebt: item => item.paymentMethod === 'debt' && Number(item.price) > 0,
    csvCell(value) {
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      let cell = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell;
      return '"' + cell.replace(/"/g, '""') + '"';
    },
    absoluteDate(value) {
      const date = new Date(value);
      return value && Number.isFinite(date.getTime()) ? date.toLocaleString('sv-SE', { timeZone: 'Asia/Baghdad' }) + ' +03:00' : '';
    },
    quantityTotals(items, field) {
      const totals = new Map();
      for (const item of items) {
        const amount = Number(item[field]) || 0;
        if (amount) totals.set(item.unit || 'قطعة', (totals.get(item.unit || 'قطعة') || 0) + amount);
      }
      return [...totals].map(([unit, amount]) => `${Math.round(amount * 100) / 100} ${unit}`).join(' + ') || '0';
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  else root.Mankhul = helpers;
})(typeof globalThis !== 'undefined' ? globalThis : window);
