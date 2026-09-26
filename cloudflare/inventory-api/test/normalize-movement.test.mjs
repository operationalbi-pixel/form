import assert from "node:assert/strict";
import test from "node:test";

import { buildCurrentShowcaseSummary, buildShowcaseSummary, normalizeMovement, normalizeTransferEvent } from "../src/index.js";

const baseRow = {
  record_id: "record-1",
  outlet: "BICP",
  location: "Showcase",
  qty: 0,
  event_date: "2026-09-25"
};

test("Showcase progress logs receive a system item identity", () => {
  const row = normalizeMovement({
    ...baseRow,
    record_type: "LOG",
    item_code: "",
    movement_type: "Showcase Log In"
  });

  assert.equal(row.item_code, "__LOG__");
  assert.equal(row.unit, "NONE");
  assert.equal(row.record_type, "LOG");
});

test("real stock movements still require an item code", () => {
  assert.throws(
    () => normalizeMovement({ ...baseRow, record_type: "MOVEMENT", direction: "IN" }),
    /INVALID_ITEM_CODE/
  );
});

test("real stock movements preserve their supplied item code", () => {
  const row = normalizeMovement({
    ...baseRow,
    record_type: "MOVEMENT",
    item_code: "ccfh0330",
    direction: "OUT",
    qty: 5
  });

  assert.equal(row.item_code, "CCFH0330");
  assert.equal(row.unit, "PCS");
});

test("transfer events preserve the source line relationship", () => {
  const row = normalizeTransferEvent({
    insertId: "accept-1",
    json: {
      transfer_id: "transfer-1",
      status: "ACCEPTED",
      source_event_id: "pending-1",
      created_at: "2026-09-26T08:00:00Z"
    }
  });

  assert.equal(row.event_id, "accept-1");
  assert.equal(row.source_event_id, "pending-1");
});

test("Showcase summary uses the latest logical version and returns daily totals", () => {
  const rows = [
    {
      record_id: "in-1", logical_id: "in-1", version: 1, record_type: "MOVEMENT",
      item_code: "CCFH0330", item_name: "SAMBAL HIJAU CC", direction: "IN", quantity: 10,
      movement_type: "Transfer In", event_date: "2026-09-24", created_at: "2026-09-24T08:00:00Z",
      source_file: "SHOWCASE_LOG", created_by: "100"
    },
    {
      record_id: "sold-old", logical_id: "sold-1", version: 1, record_type: "MOVEMENT",
      item_code: "CCFH0330", item_name: "SAMBAL HIJAU CC", direction: "OUT", quantity: 3,
      movement_type: "Sold", event_date: "2026-09-25", created_at: "2026-09-25T08:00:00Z",
      source_file: "SHOWCASE_LOG", created_by: "100"
    },
    {
      record_id: "sold-new", logical_id: "sold-1", version: 2, record_type: "MOVEMENT",
      item_code: "CCFH0330", item_name: "SAMBAL HIJAU CC", direction: "OUT", quantity: 2,
      movement_type: "Sold", event_date: "2026-09-25", created_at: "2026-09-25T08:01:00Z",
      source_file: "SHOWCASE_LOG", created_by: "100"
    }
  ];

  const item = buildShowcaseSummary(rows, "2026-09-25")[0];
  assert.equal(item.previous_balance, 10);
  assert.equal(item.balance, 8);
  assert.equal(item.total_sold, 2);
  assert.deepEqual(item.previous_aging, { fresh: 0, green: 10, yellow: 0, red: 0 });
  assert.deepEqual(item.balance_aging, { fresh: 0, green: 8, yellow: 0, red: 0 });
  assert.deepEqual(item.sold_actors, [{ created_by: "100", source_file: "SHOWCASE_LOG" }]);
});

test("current Showcase summary derives opening balance from compact balance and today's delta", () => {
  const rows = [{
    record_id: "sold-1", logical_id: "sold-1", version: 1, record_type: "MOVEMENT",
    item_code: "CCFH0330", item_name: "SAMBAL HIJAU CC", direction: "OUT", quantity: 2,
    movement_type: "Sold", event_date: "2026-09-25", created_at: "2026-09-25T08:00:00Z",
    source_file: "SHOWCASE_LOG", created_by: "100"
  }];
  const balances = [{ item_code: "CCFH0330", item_name: "SAMBAL HIJAU CC", current_qty: 8 }];

  const item = buildCurrentShowcaseSummary(rows, balances, "2026-09-25")[0];
  assert.equal(item.previous_balance, 10);
  assert.equal(item.balance, 8);
  assert.equal(item.total_sold, 2);
  assert.equal(item.previous_aging, null);
  assert.equal(item.balance_aging, null);
});
