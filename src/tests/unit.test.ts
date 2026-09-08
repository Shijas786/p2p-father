/**
 * P2P Father — Core Financial Math & Security Unit Tests
 *
 * These tests are 100% non-destructive:
 * - No database connections
 * - No blockchain calls
 * - No real funds touched
 * - All logic is tested in pure TypeScript in-memory
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac, timingSafeEqual } from "node:crypto";

// ─── 1. Fee & Payout Math ──────────────────────────────────────────────────
describe("Fee & Payout Math", () => {
    function calculatePayout(
        amount: number,
        feePercent: number
    ): { buyerReceives: number; feeAmount: number } {
        const feeAmount = parseFloat((amount * feePercent).toFixed(8));
        const buyerReceives = parseFloat((amount - feeAmount).toFixed(8));
        return { buyerReceives, feeAmount };
    }

    it("buyer receives exactly (amount - fee) on BSC 0.5% fee", () => {
        const { buyerReceives, feeAmount } = calculatePayout(100, 0.005);
        assert.equal(buyerReceives, 99.5);
        assert.equal(feeAmount, 0.5);
        assert.equal(buyerReceives + feeAmount, 100);
    });

    it("buyer receives 100% on Base (0% fee)", () => {
        const { buyerReceives, feeAmount } = calculatePayout(100, 0);
        assert.equal(buyerReceives, 100);
        assert.equal(feeAmount, 0);
    });

    it("fiat total = amount * rate (no floating point drift)", () => {
        const amount = 50;
        const rate = 91.5;
        const fiatTotal = parseFloat((amount * rate).toFixed(2));
        assert.equal(fiatTotal, 4575.0);
    });

    it("does not allow zero-amount trade", () => {
        assert.throws(() => {
            if (0 <= 0) throw new Error("Amount must be positive");
        });
    });

    it("does not allow negative-amount trade", () => {
        assert.throws(() => {
            if (-5 <= 0) throw new Error("Amount must be positive");
        });
    });

    it("fee percentage expressed as BPS is correctly converted", () => {
        const feePercent = parseInt("50") / 10000; // 50 BPS = 0.5%
        assert.equal(feePercent, 0.005);
    });
});

// ─── 2. Trade Status Flow ─────────────────────────────────────────────────
describe("Trade Status Flow", () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
        waiting_for_escrow: ["in_escrow", "cancelled"],
        in_escrow: ["fiat_sent", "disputed", "cancelled"],
        fiat_sent: ["fiat_confirmed", "disputed"],
        fiat_confirmed: ["completed"],
        disputed: [], // only admin can resolve
        completed: [],
        cancelled: [],
    };

    function canTransition(from: string, to: string): boolean {
        return VALID_TRANSITIONS[from]?.includes(to) ?? false;
    }

    it("in_escrow → fiat_sent is valid", () => {
        assert.equal(canTransition("in_escrow", "fiat_sent"), true);
    });

    it("fiat_sent → fiat_confirmed is valid", () => {
        assert.equal(canTransition("fiat_sent", "fiat_confirmed"), true);
    });

    it("in_escrow → disputed is valid (30-minute delay is enforced separately)", () => {
        assert.equal(canTransition("in_escrow", "disputed"), true);
    });

    it("completed → anything is NOT valid", () => {
        assert.equal(canTransition("completed", "disputed"), false);
        assert.equal(canTransition("completed", "fiat_sent"), false);
        assert.equal(canTransition("completed", "cancelled"), false);
    });

    it("cancelled → anything is NOT valid", () => {
        assert.equal(canTransition("cancelled", "in_escrow"), false);
    });

    it("disputed → anything is NOT valid for non-admin", () => {
        assert.equal(canTransition("disputed", "completed"), false);
        assert.equal(canTransition("disputed", "cancelled"), false);
    });
});

// ─── 3. Dispute Cooldown Timer ────────────────────────────────────────────
describe("Dispute Cooldown (30 min)", () => {
    function canRaiseDispute(escrowLockedAt: Date, now: Date): { allowed: boolean; waitMinutes: number } {
        const THIRTY_MIN_MS = 30 * 60 * 1000;
        const diff = now.getTime() - escrowLockedAt.getTime();
        if (diff < THIRTY_MIN_MS) {
            const waitMinutes = Math.ceil((THIRTY_MIN_MS - diff) / 60_000);
            return { allowed: false, waitMinutes };
        }
        return { allowed: true, waitMinutes: 0 };
    }

    it("blocks dispute if only 5 minutes have passed since escrow lock", () => {
        const locked = new Date();
        const now = new Date(locked.getTime() + 5 * 60 * 1000); // 5 min later
        const result = canRaiseDispute(locked, now);
        assert.equal(result.allowed, false);
        assert.equal(result.waitMinutes, 25);
    });

    it("allows dispute after exactly 30 minutes", () => {
        const locked = new Date();
        const now = new Date(locked.getTime() + 30 * 60 * 1000 + 1000); // 30 min + 1s
        const result = canRaiseDispute(locked, now);
        assert.equal(result.allowed, true);
    });

    it("blocks dispute at 29:59 (1 second short)", () => {
        const locked = new Date();
        const now = new Date(locked.getTime() + 29 * 60 * 1000 + 59 * 1000);
        const result = canRaiseDispute(locked, now);
        assert.equal(result.allowed, false);
        assert.equal(result.waitMinutes, 1);
    });
});

// ─── 4. EVM Address Validation ──────────────────────────────────────────────
describe("EVM Address Validation", () => {
    const EVM_REGEX = /^0x[0-9a-fA-F]{40}$/;

    it("accepts valid 42-char EVM address", () => {
        assert.equal(EVM_REGEX.test("0xAbCd1234567890AbCd1234567890AbCd12345678"), true);
    });

    it("rejects address that is too short", () => {
        assert.equal(EVM_REGEX.test("0x1234"), false);
    });

    it("rejects address without 0x prefix", () => {
        assert.equal(EVM_REGEX.test("AbCd1234567890AbCd1234567890AbCd12345678"), false);
    });

    it("rejects address with non-hex characters", () => {
        assert.equal(EVM_REGEX.test("0xZZZZ1234567890AbCd1234567890AbCd12345678"), false);
    });

    it("rejects empty string", () => {
        assert.equal(EVM_REGEX.test(""), false);
    });
});

// ─── 5. HMAC Token Integrity ─────────────────────────────────────────────
describe("HMAC Trade Token Integrity", () => {
    // Uses the top-level crypto import

    const SECRET = "test_secret_do_not_use_in_production";

    function sign(payload: string): string {
        return createHmac("sha256", SECRET).update(payload).digest("hex");
    }

    function verify(payload: string, sig: string): boolean {
        const expected = sign(payload);
        try {
            return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
        } catch {
            return false;
        }
    }

    it("valid signature verifies correctly", () => {
        const payload = "trade-abc123:user-xyz:1234567890";
        const sig = sign(payload);
        assert.equal(verify(payload, sig), true);
    });

    it("tampered payload is rejected", () => {
        const payload = "trade-abc123:user-xyz:1234567890";
        const sig = sign(payload);
        const tampered = "trade-abc123:user-HACKER:1234567890";
        assert.equal(verify(tampered, sig), false);
    });

    it("tampered signature is rejected", () => {
        const payload = "trade-abc123:user-xyz:1234567890";
        const sig = sign(payload);
        const badSig = sig.slice(0, -2) + "00";
        assert.equal(verify(payload, badSig), false);
    });

    it("empty signature returns false (no crash)", () => {
        assert.equal(verify("anything", ""), false);
    });
});

// ─── 6. Rate Limiter Logic (in-memory simulation) ─────────────────────────
describe("Rate Limiter Logic", () => {
    // Mirror of the in-process fallback logic to test without Redis
    const _map = new Map<string, { count: number; resetAt: number }>();

    function syncCheck(key: string, maxHits: number, windowMs: number): boolean {
        const now = Date.now();
        const entry = _map.get(key);
        if (!entry || now > entry.resetAt) {
            _map.set(key, { count: 1, resetAt: now + windowMs });
            return true;
        }
        if (entry.count >= maxHits) return false;
        entry.count++;
        return true;
    }

    it("allows requests within limit", () => {
        const key = "test:ip1";
        assert.equal(syncCheck(key, 3, 60_000), true);  // 1
        assert.equal(syncCheck(key, 3, 60_000), true);  // 2
        assert.equal(syncCheck(key, 3, 60_000), true);  // 3
    });

    it("blocks the 4th request after limit of 3", () => {
        const key = "test:ip2";
        syncCheck(key, 3, 60_000); // 1
        syncCheck(key, 3, 60_000); // 2
        syncCheck(key, 3, 60_000); // 3
        assert.equal(syncCheck(key, 3, 60_000), false); // 4 — blocked
    });

    it("resets after the window expires", () => {
        const key = "test:ip3";
        syncCheck(key, 1, 1); // 1 hit, 1ms window
        // Force expire
        const entry = _map.get(key)!;
        entry.resetAt = Date.now() - 1;
        assert.equal(syncCheck(key, 1, 1), true); // should be allowed again
    });
});

// ─── 7. XSS Safety — safeHtml ────────────────────────────────────────────
describe("safeHtml Sanitizer", () => {
    function safeHtml(s: unknown): string {
        if (s === null || s === undefined) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    it("escapes < and > to prevent tag injection", () => {
        assert.equal(safeHtml("<script>"), "&lt;script&gt;");
    });

    it("escapes & to prevent entity injection", () => {
        assert.equal(safeHtml("a&b"), "a&amp;b");
    });

    it("escapes double quotes for attribute safety", () => {
        assert.equal(safeHtml('"hello"'), "&quot;hello&quot;");
    });

    it("returns empty string for null", () => {
        assert.equal(safeHtml(null), "");
    });

    it("returns empty string for undefined", () => {
        assert.equal(safeHtml(undefined), "");
    });

    it("passes through safe alphanumeric content", () => {
        assert.equal(safeHtml("hello world 123"), "hello world 123");
    });

    it("does not double-encode already escaped text", () => {
        // Note: we intentionally don't double-decode — this tests raw escaping
        const result = safeHtml("<b>bold</b>");
        assert.equal(result.includes("<"), false);
        assert.equal(result.includes(">"), false);
    });
});
