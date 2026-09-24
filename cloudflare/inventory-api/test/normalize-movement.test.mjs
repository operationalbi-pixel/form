import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMovement } from "../src/index.js";

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
