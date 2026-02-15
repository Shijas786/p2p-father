import { formatOrder } from '../src/utils/formatters';

const mockOrder = {
    id: "2a980508-9248-4530-a2e0-6c57a96dc82d",
    user_id: "e49657c1-ab8e-43cc-94b4-c885e10d50f0",
    type: "buy",
    token: "USDC",
    chain: "base",
    amount: 10,
    min_amount: null,
    max_amount: null,
    rate: 90,
    fiat_currency: "INR",
    payment_methods: ["UPI"],
    payment_details: {},
    status: "active",
    filled_amount: 0,
    created_at: "2026-02-14T15:15:30.324957+00:00",
    users: {
        username: "orusmon",
        trust_score: 100,
        wallet_address: "0x4Febb72c604637Bdd63Eb44af2171606b3D3fC9b",
        completed_trades: 0
    },
    username: "orusmon",
    trust_score: 100,
    wallet_address: "0x4Febb72c604637Bdd63Eb44af2171606b3D3fC9b"
};

const gorillaOrder = {
    ...mockOrder,
    username: "gorilla_m1",
    id: "38b0ebaa-1234-5678-90ab-cdef12345678" // Simulation
};

console.log("--- SIMULATION: orusmon ---");
console.log(formatOrder(mockOrder as any));

console.log("\n--- SIMULATION: gorilla_m1 ---");
console.log(formatOrder(gorillaOrder as any));
