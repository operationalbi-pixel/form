// Inventory math preserved from the existing GAS ledger implementation. No GAS services.
function parseReportNumber_(value) {
  if (typeof value === 'number') return value;
  let text = String(value === null || value === undefined ? '' : value).trim().replace(/[\s\u00A0]/g, '');
  if (!text) return NaN;

  // Excel kadang menyimpan angka kecil sebagai scientific notation. Jangan hapus titik
  // pada 1.5E-2 karena itu akan berubah menjadi 15E-2 (10x lebih besar).
  if (/^[+-]?\d+(?:[.,]\d+)?[eE][+-]?\d+$/.test(text)) {
    return Number(text.replace(',', '.'));
  }

  const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // Separator paling kanan dianggap decimal separator; separator lain thousands.
    if (comma > dot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (comma >= 0) {
    // Report ESB Indonesia lazim memakai koma sebagai decimal separator.
    text = text.replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    // Jika ada banyak titik, titik terakhir adalah decimal bila group terakhir bukan 3 digit;
    // selain itu perlakukan sebagai thousands separator.
    const parts = text.split('.'), tail = parts[parts.length - 1];
    text = tail.length === 3 ? parts.join('') : parts.slice(0, -1).join('') + '.' + tail;
  }
  return Number(text);
}

function mapStockHistoryQueryRow_(r) {
  const info = String(r.info || ''), recordType = String(r.record_type || ''), isStockOpname = String(r.movement_type || '') === 'Stock Opname';
  let opnameBalance = null, opnameDate = '';
  if (recordType === 'OPNAME_DETAIL') {
    try {
      const audit = JSON.parse(info || '{}');
      const value = audit.actualQty === undefined || audit.actualQty === null || audit.actualQty === ''
        ? audit.stockOpnameBalance : audit.actualQty;
      const auditQty = Number(value);
      if ((typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && isFinite(auditQty)) opnameBalance = auditQty;
      opnameDate = String(audit.eventDate || audit.effectiveDate || audit.stockOpnameDate || r.event_date || '').slice(0, 10);
    } catch (error) { /* legacy audit without JSON */ }
  }
  if (isStockOpname) {
    let match = /(?:→\s*Balance|Balance)\s+(-?[\d.,]+)/i.exec(info);
    if (!match) match = /Stock awal\s+\d{4}-\d{2}-\d{2}\s+(-?[\d.,]+)/i.exec(info);
    if (match) opnameBalance = parseReportNumber_(match[1]);
    match = /(?:Hasil Stock Opname tanggal|Upload Stock Opname)\s+(\d{4}-\d{2}-\d{2})/i.exec(info) ||
      /Koreksi tanggal SO\s+\d{4}-\d{2}-\d{2}\s+→\s+(\d{4}-\d{2}-\d{2})/i.exec(info);
    opnameDate = match ? match[1] : String(r.event_date || '').slice(0, 10);
  }
  return {
    recordType: recordType,
    recordId: String(r.record_id || ''), logicalId: String(r.logical_id || r.record_id || ''), version: Number(r.version || 1),
    date: String(r.event_date || ''), direction: String(r.direction || ''), qty: Number(r.qty || 0),
    movementType: String(r.movement_type || ''), info: String(r.info || ''), productionDate: String(r.production_date || ''), expiryDate: String(r.expiry_date || ''),
    sourceArrivalDate: String(r.source_arrival_date || ''), supplier: String(r.supplier || ''),
    sourceFile: String(r.source_file || ''), sourceHash: String(r.source_hash || ''), sourceRow: Number(r.source_row || 0),
    transferId: String(r.transfer_id || ''), systemGenerated: Boolean(r.transfer_id),
    createdBy: String(r.created_by || ''), createdAt: String(r.created_at || ''),
    opnameBalance: opnameBalance !== null && isFinite(opnameBalance) ? Number(opnameBalance) : null, opnameDate: opnameDate
  };
}

function applyStockHistoryAuditRows_(rows) {
  const audits = {};
  (rows || []).forEach(function (row) {
    if (row.recordType !== 'OPNAME_DETAIL') return;
    const key = String(row.sourceHash || '') + '|' + String(row.sourceRow || 0);
    const previous = audits[key];
    if (!previous || stockMovementCreatedMillis_(row) >= stockMovementCreatedMillis_(previous)) audits[key] = row;
  });
  return (rows || []).filter(function (row) { return row.recordType === 'MOVEMENT'; }).map(function (row) {
    if (row.movementType !== 'Stock Opname') return row;
    const audit = audits[String(row.sourceHash || '') + '|' + String(row.sourceRow || 0)];
    if (audit && audit.opnameBalance !== null && isFinite(Number(audit.opnameBalance))) row.opnameBalance = Number(audit.opnameBalance);
    if (audit && audit.opnameDate) row.opnameDate = audit.opnameDate;
    if (row.opnameDate) row.date = row.opnameDate;
    return row;
  });
}

function stockCheckpointBalanceUntil_(history, endDateExclusive) {
  const rows = (history || []).filter(function (row) {
    const date = String(row.date || '').slice(0, 10);
    return !endDateExclusive || date < endDateExclusive;
  });
  let checkpoint = null;
  rows.forEach(function (row) {
    if (row.movementType !== 'Stock Opname' || row.opnameBalance === null || !isFinite(Number(row.opnameBalance))) return;
    const date = String(row.opnameDate || row.date || '').slice(0, 10);
    if (!date) return;
    if (!checkpoint || date > checkpoint.date || (date === checkpoint.date && stockMovementCreatedMillis_(row) >= checkpoint.created)) {
      checkpoint = { date: date, qty: Number(row.opnameBalance), created: stockMovementCreatedMillis_(row) };
    }
  });
  return rows.reduce(function (total, row) {
    const date = String(row.date || '').slice(0, 10);
    if (checkpoint) {
      if (date <= checkpoint.date || row.movementType === 'Stock Opname') return total;
    }
    if (row.direction === 'IN') return total + Number(row.qty || 0);
    if (row.direction === 'OUT') return total - Number(row.qty || 0);
    return total;
  }, checkpoint ? checkpoint.qty : 0);
}

function stockIsoDateOffset_(isoDate, days) {
  const raw = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(raw + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function stockLotOverrideInfo_(movement) {
  if (!movement || movement.direction !== 'LOT' || movement.movementType !== 'Lot Balance Override') return null;
  try {
    const parsed = JSON.parse(String(movement.info || ''));
    return parsed && Array.isArray(parsed.lots) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function stockLotOverrideIsRecalculation_(override, movement) {
  if (!override) return false;
  if (override.recalculation) return true;
  // Backward compatibility for legacy recalculation markers written before
  // recalculation metadata was embedded. Expiry-completion overrides always carry a note.
  return !String(override.note || '').trim() && movement && movement.direction === 'LOT' && movement.movementType === 'Lot Balance Override';
}

function stockMovementCreatedMillis_(movement) {
  const raw = movement && movement.createdAt;
  const numeric = Number(raw);
  if (isFinite(numeric) && numeric > 0) return numeric > 100000000000 ? numeric : numeric * 1000;
  const parsed = new Date(raw || 0).getTime();
  return isFinite(parsed) ? parsed : 0;
}

function stockLotArrivalKey_(lot) {
  lot = lot || {};
  return String(lot.sourceDate || lot.showcaseDate || lot.productionDate || '9999-12-31').slice(0, 10) || '9999-12-31';
}

function compareStockLotsFifo_(a, b) {
  const arrivalCompare = stockLotArrivalKey_(a).localeCompare(stockLotArrivalKey_(b));
  if (arrivalCompare) return arrivalCompare;
  const stockInCompare = String(a && a.showcaseDate || '9999-12-31').localeCompare(String(b && b.showcaseDate || '9999-12-31'));
  if (stockInCompare) return stockInCompare;
  const productionCompare = String(a && a.productionDate || '9999-12-31').localeCompare(String(b && b.productionDate || '9999-12-31'));
  if (productionCompare) return productionCompare;
  return String(a && a.expiryDate || '9999-12-31').localeCompare(String(b && b.expiryDate || '9999-12-31'));
}

function compareStockLotsFefo_(a, b) {
  const aExpiry = String(a && a.expiryDate || '').slice(0, 10);
  const bExpiry = String(b && b.expiryDate || '').slice(0, 10);
  // Expiry yang belum dicatat tidak boleh membuat lot lama tertahan tanpa batas.
  // Jika salah satu lot belum memiliki expiry, pertahankan urutan kedatangan FIFO.
  // FEFO hanya dapat dibandingkan secara aman ketika kedua expiry sudah diketahui.
  if (!aExpiry || !bExpiry) return compareStockLotsFifo_(a, b);
  if (aExpiry && bExpiry) {
    const expiryCompare = aExpiry.localeCompare(bExpiry);
    if (expiryCompare) return expiryCompare;
  }
  return compareStockLotsFifo_(a, b);
}

function calculateFifoSnapshots_(history) {
  let activeRecalculation = null, activeRecalculationInfo = null, activeRecalculationCreated = -1;
  (history || []).forEach(function (movement) {
    const override = stockLotOverrideInfo_(movement);
    if (!stockLotOverrideIsRecalculation_(override, movement)) return;
    const created = stockMovementCreatedMillis_(movement);
    if (!activeRecalculation || created > activeRecalculationCreated ||
        (created === activeRecalculationCreated && String(movement.recordId || '').localeCompare(String(activeRecalculation.recordId || '')) > 0)) {
      activeRecalculation = movement;
      activeRecalculationInfo = override.recalculation || { startDate: stockIsoDateOffset_(movement.date, 1), endDate: '9999-12-31', calculatedAt: movement.createdAt || '' };
      activeRecalculationCreated = created;
    }
  });
  const activeRecalculationBaseline = activeRecalculation ? String(activeRecalculation.date || '').slice(0, 10) : '';
  const activeRecalculationStart = String(activeRecalculationInfo && activeRecalculationInfo.startDate ||
    (activeRecalculationBaseline ? stockIsoDateOffset_(activeRecalculationBaseline, 1) : '')).slice(0, 10);
  const activeRecalculationEnd = String(activeRecalculationInfo && activeRecalculationInfo.endDate || '9999-12-31').slice(0, 10);
  const movements = history.slice().sort(function (a, b) {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCompare) return dateCompare;
    // Physical-count checkpoints close the selected date. A detailed lot override
    // is applied last so its Arrival/Stock In/Expired metadata cannot be replaced by
    // a transfer or another backdated movement carrying the same event date.
    const checkpointPriority = function (movement) {
      if (movement.direction === 'LOT' && movement.movementType === 'Lot Balance Override') return 2;
      if (movement.movementType === 'Stock Opname') return 1;
      return 0;
    };
    const checkpointCompare = checkpointPriority(a) - checkpointPriority(b);
    if (checkpointCompare) return checkpointCompare;
    const createdCompare = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    if (createdCompare) return createdCompare;
    const directionCompare = (a.direction === 'IN' ? 0 : 1) - (b.direction === 'IN' ? 0 : 1);
    if (directionCompare) return directionCompare;
    return String(a.logicalId || a.recordId || a.transferId || '').localeCompare(String(b.logicalId || b.recordId || b.transferId || ''));
  });
  const lots = [], uncoveredQueue = [], snapshots = {};
  function fefoActiveForDate(date) {
    date = String(date || '').slice(0, 10);
    return Boolean(activeRecalculationBaseline && date >= activeRecalculationBaseline);
  }
  function sortLots(date) {
    lots.sort(fefoActiveForDate(date) ? compareStockLotsFefo_ : compareStockLotsFifo_);
  }
  function pinnedLot(movement) {
    if (!movement || movement.direction !== 'OUT') return null;
    const pinned = {
      productionDate: String(movement.productionDate || ''), expiryDate: String(movement.expiryDate || ''),
      sourceDate: String(movement.sourceArrivalDate || ''), showcaseDate: ''
    };
    return pinned.productionDate || pinned.expiryDate || pinned.sourceDate ? pinned : null;
  }
  function shouldIgnorePinnedLot(movement) {
    if (!activeRecalculation || !movement || movement.direction !== 'OUT') return false;
    const date = String(movement.date || '').slice(0, 10);
    if (!date || !activeRecalculationStart || date < activeRecalculationStart || date > activeRecalculationEnd) return false;
    // Historical OUT rows that already existed when Recalculate was pressed must be
    // re-allocated from the newly ordered FEFO queue instead of keeping the old FIFO pin.
    return stockMovementCreatedMillis_(movement) <= activeRecalculationCreated;
  }
  function matchesPinned(lot, pinned) {
    if (pinned.productionDate && String(lot.productionDate || '') !== pinned.productionDate) return false;
    if (pinned.expiryDate && String(lot.expiryDate || '') !== pinned.expiryDate) return false;
    if (pinned.sourceDate && String(lot.sourceDate || '') !== pinned.sourceDate) return false;
    return true;
  }
  function consumeFromLots(movement, remaining, predicate) {
    for (let i = 0; i < lots.length && remaining > 0.0000001; i++) {
      if (lots[i].qty <= 0.0000001 || (predicate && !predicate(lots[i]))) continue;
      const taken = Math.min(lots[i].qty, remaining);
      lots[i].qty -= taken; remaining -= taken;
      if (taken > 0.0000001) movement.fifoUsageLots.push({
        qty: taken, productionDate: lots[i].productionDate, expiryDate: lots[i].expiryDate,
        sourceDate: lots[i].sourceDate, showcaseDate: lots[i].showcaseDate
      });
    }
    return remaining;
  }
  movements.forEach(function (movement) {
    const qty = Number(movement.qty || 0), movementDate = String(movement.date || '').slice(0, 10);
    movement.fifoUsageLots = [];
    movement.fifoUncovered = 0;
    if (movement.movementType === 'Stock Opname' && movement.opnameBalance !== null && isFinite(Number(movement.opnameBalance))) {
      // The physical count replaces every previous lot. Its unit-normalized audit
      // value is authoritative; a generic lot keeps the balance traceable even when
      // the SO file did not contain production/expiry metadata.
      lots.length = 0; uncoveredQueue.length = 0;
      const checkpointQty = Math.max(0, Number(movement.opnameBalance));
      if (checkpointQty > 0.0000001) lots.push({ qty: checkpointQty, productionDate: '', expiryDate: '', sourceDate: movementDate, showcaseDate: movementDate });
    } else if (movement.direction === 'LOT' && movement.movementType === 'Lot Balance Override') {
      let override = null;
      try { override = JSON.parse(String(movement.info || '')); } catch (error) { override = null; }
      const supersededFlowOverride = override && activeRecalculation && movement !== activeRecalculation &&
        movementDate >= activeRecalculationBaseline &&
        stockMovementCreatedMillis_(movement) <= activeRecalculationCreated &&
        (stockLotOverrideIsRecalculation_(override, movement) || /Lengkapi Expired Date/i.test(String(override.note || '')));
      if (supersededFlowOverride) return;
      if (override && Array.isArray(override.lots)) {
        lots.length = 0; uncoveredQueue.length = 0;
        override.lots.forEach(function (lot) {
          const lotQty = Number(lot.qty || 0);
          if (lotQty > 0.0000001) lots.push({ qty: lotQty, productionDate: String(lot.productionDate || ''), expiryDate: String(lot.expiryDate || ''), sourceDate: String(lot.arrivalDate || ''), showcaseDate: String(lot.stockInDate || '') });
        });
        const uncoveredQty = Math.max(0, Number(override.uncoveredQty || 0));
        if (uncoveredQty > 0.0000001) uncoveredQueue.push({ movement: { fifoUsageLots: [], fifoUncovered: uncoveredQty }, qty: uncoveredQty });
        sortLots(movementDate);
      }
    } else if (movement.direction === 'IN') {
      const incomingLot = {
        productionDate: String(movement.productionDate || ''), expiryDate: String(movement.expiryDate || ''),
        sourceDate: String(movement.sourceArrivalDate || movement.date || ''), showcaseDate: String(movement.date || '')
      };
      let incomingRemaining = qty;
      while (incomingRemaining > 0.0000001 && uncoveredQueue.length) {
        const debt = uncoveredQueue[0], covered = Math.min(incomingRemaining, debt.qty);
        debt.movement.fifoUsageLots.push({ qty: covered, productionDate: incomingLot.productionDate, expiryDate: incomingLot.expiryDate, sourceDate: incomingLot.sourceDate, showcaseDate: incomingLot.showcaseDate });
        debt.qty -= covered; debt.movement.fifoUncovered = Math.max(0, Number(debt.movement.fifoUncovered || 0) - covered); incomingRemaining -= covered;
        if (debt.qty <= 0.0000001) uncoveredQueue.shift();
      }
      if (incomingRemaining > 0.0000001) lots.push({ qty: incomingRemaining, productionDate: incomingLot.productionDate, expiryDate: incomingLot.expiryDate, sourceDate: incomingLot.sourceDate, showcaseDate: incomingLot.showcaseDate });
      sortLots(movementDate);
    } else if (movement.direction === 'OUT') {
      sortLots(movementDate);
      let remaining = qty;
      const pinned = shouldIgnorePinnedLot(movement) ? null : pinnedLot(movement);
      if (pinned) remaining = consumeFromLots(movement, remaining, function (lot) { return matchesPinned(lot, pinned); });
      if (remaining > 0.0000001) remaining = consumeFromLots(movement, remaining, null);
      movement.fifoUncovered = Math.max(0, remaining);
      if (remaining > 0.0000001) uncoveredQueue.push({ movement: movement, qty: remaining });
      for (let i = lots.length - 1; i >= 0; i--) if (lots[i].qty <= 0.0000001) lots.splice(i, 1);
    }
    snapshots[String(movement.date || '')] = lots.filter(function (lot) { return lot.qty > 0.0000001; }).map(function (lot) {
      return { qty: lot.qty, productionDate: lot.productionDate, expiryDate: lot.expiryDate, sourceDate: lot.sourceDate, showcaseDate: lot.showcaseDate };
    });
  });
  return snapshots;
}

function normalizeUnit_(value) { return String(value || '').trim().replace(/\s+/g, '').toUpperCase(); }

function defaultUnitConversionFactor_(fromUnit, toUnit) {
  const pair = normalizeUnit_(fromUnit) + '|' + normalizeUnit_(toUnit);
  const defaults = {
    'KG|GR': 1000, 'GR|KG': 0.001,
    'L|ML': 1000, 'LT|ML': 1000, 'LTR|ML': 1000,
    'ML|L': 0.001, 'ML|LT': 0.001, 'ML|LTR': 0.001,
    'L|LT': 1, 'LT|L': 1, 'L|LTR': 1, 'LTR|L': 1, 'LT|LTR': 1, 'LTR|LT': 1
  };
  return Number(defaults[pair] || 0);
}

function stockUnitMeasureProfile_(unit) {
  const normalized = normalizeUnit_(unit);
  if (!normalized) return null;
  const measureBase = function (measure) {
    measure = String(measure || '').toUpperCase();
    if (measure === 'ML') return { dimension: 'VOLUME', baseQty: 1 };
    if (measure === 'L' || measure === 'LT' || measure === 'LTR') return { dimension: 'VOLUME', baseQty: 1000 };
    if (measure === 'GR' || measure === 'G') return { dimension: 'MASS', baseQty: 1 };
    if (measure === 'KG') return { dimension: 'MASS', baseQty: 1000 };
    if (['PCS', 'PC', 'PCE', 'PIECE', 'EA', 'EACH', 'SLICE'].indexOf(measure) >= 0) return { dimension: 'COUNT', baseQty: 1 };
    return null;
  };

  const plain = measureBase(normalized);
  if (plain) return { dimension: plain.dimension, baseQty: plain.baseQty, packaged: false, unit: normalized };

  const match = /^([^@]+)@([0-9]+(?:[.,][0-9]+)?)(PIECE|EACH|SLICE|PCS|PCE|PC|EA|ML|LTR|LT|L|GR|KG|G)$/.exec(normalized);
  if (!match) return null;
  const amount = Number(String(match[2]).replace(',', '.'));
  const measure = measureBase(match[3]);
  if (!measure || !isFinite(amount) || amount <= 0) return null;
  return {
    dimension: measure.dimension,
    baseQty: amount * measure.baseQty,
    packaged: true,
    packageUnit: match[1],
    unit: normalized
  };
}

function intrinsicStockUnitConversionFactor_(fromUnit, toUnit) {
  const from = stockUnitMeasureProfile_(fromUnit), to = stockUnitMeasureProfile_(toUnit);
  if (!from || !to || from.dimension !== to.dimension || !from.baseQty || !to.baseQty) return 0;
  const factor = from.baseQty / to.baseQty;
  return isFinite(factor) && factor > 0 ? factor : 0;
}

function packagedStockUnitConversionFactor_(fromUnit, toUnit) {
  const from = stockUnitMeasureProfile_(fromUnit), to = stockUnitMeasureProfile_(toUnit);
  if (!from || !to || (!from.packaged && !to.packaged)) return 0;
  return intrinsicStockUnitConversionFactor_(fromUnit, toUnit);
}

function savedStockUnitConversionPathFactor_(itemCode, fromUnit, toUnit, saved) {
  itemCode = String(itemCode || '').trim().toUpperCase();
  fromUnit = normalizeUnit_(fromUnit); toUnit = normalizeUnit_(toUnit);
  if (!itemCode || !fromUnit || !toUnit || !saved) return 0;
  const graph = {};
  Object.keys(saved).forEach(function (key) {
    const row = saved[key] || {}, code = String(row.itemCode || '').trim().toUpperCase();
    const from = normalizeUnit_(row.fromUnit), to = normalizeUnit_(row.toUnit), factor = Number(row.factor);
    if (code !== itemCode || !from || !to || !isFinite(factor) || factor <= 0) return;
    if (!graph[from]) graph[from] = [];
    if (!graph[to]) graph[to] = [];
    graph[from].push({ unit: to, factor: factor });
    graph[to].push({ unit: from, factor: 1 / factor });
  });
  const queue = [{ unit: fromUnit, factor: 1 }], visited = {};
  while (queue.length) {
    const current = queue.shift();
    if (visited[current.unit]) continue;
    visited[current.unit] = true;
    if (current.unit === toUnit) return current.factor;
    (graph[current.unit] || []).forEach(function (edge) {
      if (!visited[edge.unit]) queue.push({ unit: edge.unit, factor: current.factor * edge.factor });
    });
  }
  return 0;
}

function resolveUnitConversionFactor_(itemCode, fromUnit, toUnit, provided, saved) {
  fromUnit = normalizeUnit_(fromUnit); toUnit = normalizeUnit_(toUnit);
  if (fromUnit === toUnit) return 1;
  // Ukuran yang tertulis eksplisit pada unit adalah sumber paling pasti. Ini
  // sekaligus mengoreksi rule lama yang dibulatkan, misalnya 1/946 disimpan
  // sebagai 0.001057 untuk konversi ML -> PCK@946ML.
  const intrinsic = packagedStockUnitConversionFactor_(fromUnit, toUnit);
  if (intrinsic) return intrinsic;
  const direct = stockConversionKey_(itemCode, fromUnit, toUnit), inverse = stockConversionKey_(itemCode, toUnit, fromUnit);
  let factor = Number(provided && provided[direct]);
  if (!isFinite(factor) || factor <= 0) factor = saved && saved[direct] && Number(saved[direct].factor);
  if (isFinite(factor) && factor > 0) return factor;
  let inverseFactor = Number(provided && provided[inverse]);
  if (!isFinite(inverseFactor) || inverseFactor <= 0) inverseFactor = saved && saved[inverse] && Number(saved[inverse].factor);
  if (isFinite(inverseFactor) && inverseFactor > 0) return 1 / inverseFactor;

  // STOCK_UNIT_CONVERSIONS adalah sumber utama dan boleh memakai jalur bertingkat
  // untuk item yang sama, misalnya PCS -> PACK -> BOX.
  const savedPath = savedStockUnitConversionPathFactor_(itemCode, fromUnit, toUnit, saved);
  if (savedPath) return savedPath;

  // Pasangan standar menjadi fallback ketika sheet belum memiliki rule.
  return defaultUnitConversionFactor_(fromUnit, toUnit);
}

function stockConversionKey_(code,from,to){return String(code||'').toUpperCase()+'|'+normalizeUnit_(from)+'|'+normalizeUnit_(to);}

export function inventoryHistory(rows){return applyStockHistoryAuditRows_(rows.map(row=>mapStockHistoryQueryRow_({...row,qty:row.quantity,source_arrival_date:row.arrival_date,direction:row.movement_type==='Lot Balance Override'?'LOT':row.direction})));}
export function remainingLots(rows){const snapshots=calculateFifoSnapshots_(inventoryHistory(rows)),dates=Object.keys(snapshots).sort();return dates.length?snapshots[dates.at(-1)]:[];}
export function balanceAt(rows,date){return stockCheckpointBalanceUntil_(inventoryHistory(rows),stockIsoDateOffset_(date,1));}
export function conversionFactor(code,from,to,rows){const saved={};for(const row of rows){saved[stockConversionKey_(code,row.from_unit,row.to_unit)]={itemCode:code,fromUnit:row.from_unit,toUnit:row.to_unit,factor:row.factor};}return resolveUnitConversionFactor_(code,from,to,{},saved);}
