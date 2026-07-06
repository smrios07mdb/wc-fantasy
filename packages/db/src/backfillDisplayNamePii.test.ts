import { describe, it, expect } from "vitest";
import { looksLikeEmail } from "@app/shared";
import {
  BACKFILL_MAP,
  EMAIL_SHAPE_SQL,
  MANAGER_LABEL_SQL,
  resolveRename,
} from "./backfillDisplayNamePii";

describe("T15-BACKFILL pure core (audit/T15-BACKFILL_PLAN.md)", () => {
  describe("BACKFILL_MAP — the two committed targets", () => {
    it("maps slot 7 → 'Manager 7' and slot 8 → 'Manager 8' for the two baked ids", () => {
      expect(BACKFILL_MAP).toEqual([
        { id: "e9f30e58-3a50-4bea-a51c-0039de3178d9", draftSlot: 7, mappedName: "Manager 7" },
        { id: "3a3f75b1-2bd6-4a2c-8ae5-8691e7fec6de", draftSlot: 8, mappedName: "Manager 8" },
      ]);
    });

    it("every label is exactly `Manager {draftSlot}` (display-only, slot-derived, no placeholders)", () => {
      for (const t of BACKFILL_MAP) {
        expect(t.mappedName).toBe(`Manager ${t.draftSlot}`);
      }
    });

    it("targets are distinct ids and distinct labels (two rows, two distinct slots)", () => {
      expect(new Set(BACKFILL_MAP.map((t) => t.id)).size).toBe(2);
      expect(new Set(BACKFILL_MAP.map((t) => t.mappedName)).size).toBe(2);
    });

    it("no assigned label is itself email-shaped (a re-run cannot re-touch a backfilled row)", () => {
      for (const t of BACKFILL_MAP) {
        expect(looksLikeEmail(t.mappedName)).toBe(false);
      }
    });
  });

  describe("resolveRename — anti-clobber via the shared guard", () => {
    it("relabels while the value is still the leaked email (both pre-image addresses)", () => {
      expect(resolveRename("yader.rosales@gmail.com", "Manager 7")).toBe("Manager 7");
      expect(resolveRename("ahitaon@gmail.com", "Manager 8")).toBe("Manager 8");
    });

    it("no-ops a row renamed to a real (non-email) name in the interim — does NOT clobber", () => {
      // The user/commish renamed the row between snapshot and run; the guarded WHERE must skip it.
      expect(resolveRename("Nacho", "Manager 7")).toBeNull();
      expect(resolveRename("José M.", "Manager 8")).toBeNull();
      // A legit name that merely CONTAINS an "@" is not email-SHAPED and is likewise left untouched.
      expect(resolveRename("n@cho", "Manager 7")).toBeNull();
      // Idempotency: after a first run the value is the label itself → a second run is a no-op.
      expect(resolveRename("Manager 7", "Manager 7")).toBeNull();
    });

    it("delegates to the shared looksLikeEmail (preview/write cannot diverge from the guard)", () => {
      for (const s of ["a@b.co", "x.y@z.io", "not an email", "manager 7", "  spaced@out.com  "]) {
        const expected = looksLikeEmail(s) ? "LABEL" : null;
        expect(resolveRename(s, "LABEL")).toBe(expected);
      }
    });
  });

  describe("SQL predicates mirror the shared guard byte-for-byte", () => {
    it("EMAIL_SHAPE_SQL, compiled as a regex, agrees with looksLikeEmail on the trimmed value", () => {
      const sqlEmail = new RegExp(EMAIL_SHAPE_SQL);
      // The runner applies the SQL predicate to `trim(display_name)`; looksLikeEmail trims too, so
      // compare against the trimmed input to model identical semantics.
      const samples = [
        "yader.rosales@gmail.com",
        "ahitaon@gmail.com",
        "Manager 7",
        "Nacho",
        "n@cho",
        "a@b.co",
        "no-domain@localhost",
        "",
      ];
      for (const s of samples) {
        expect(sqlEmail.test(s.trim())).toBe(looksLikeEmail(s));
      }
    });

    it("MANAGER_LABEL_SQL matches `Manager N` case-insensitively (the collision predicate)", () => {
      const label = new RegExp(MANAGER_LABEL_SQL, "i");
      expect(label.test("Manager 7")).toBe(true);
      expect(label.test("manager 12")).toBe(true);
      expect(label.test("Manager")).toBe(false);
      expect(label.test("Manager 7 (x)")).toBe(false);
      expect(label.test("yader.rosales@gmail.com")).toBe(false);
    });
  });
});
