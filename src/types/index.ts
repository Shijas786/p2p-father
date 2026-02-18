// =============================================
// Type definitions for the P2P trading system
// =============================================

// ---- Trade Types ----

export type TradeStatus =
    | "created"
    | "matched"
    | "waiting_for_escrow"
    | "in_escrow"
    | "fiat_sent"
    | "fiat_confirmed"
    | "releasing"
    | "completed"
    | "disputed"
    | "resolved"
    | "refunded"
    | "cancelled"
    | "expired";

export type OrderType = "buy" | "sell";
export type PaymentMethod = "UPI" | "IMPS" | "NEFT" | "PAYTM" | "BANK";
export type FiatCurrency = "INR" | "USD" | "AED";

export interface User {
    id: string;
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    wallet_address: string | null;
    wallet_type: 'bot' | 'external';
    wallet_index: number;
    upi_id: string | null;
    phone_number: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    bank_name: string | null;
    bank_details: BankDetails | null;
    trade_count: number;
    completed_trades: number;
    trust_score: number;
    tier: "standard" | "silver" | "gold" | "vip";
    is_verified: boolean;
    is_banned: boolean;
    created_at: string;
    photo_url?: string; // Manual PFP
    total_volume?: number;
    points?: number;
}

export interface BankDetails {
    account_name?: string;
    account_number?: string;
    ifsc?: string;
    bank_name?: string;
}

export interface Order {
    id: string;
    user_id: string;
    type: OrderType;
    token: string;
    chain: string;
    amount: number;
    min_amount: number | null;
    max_amount: number | null;
    rate: number;
    fiat_currency: FiatCurrency;
    payment_methods: PaymentMethod[];
    payment_details: Record<string, any>;
    status: "active" | "paused" | "filled" | "cancelled" | "expired";
    filled_amount: number;
    expires_at?: string | null;
    created_at: string;
    // Joined data
    username?: string;
    trust_score?: number;
}

export interface Trade {
    id: string;
    order_id: string;
    buyer_id: string;
    seller_id: string;
    token: string;
    chain: string;
    amount: number;
    rate: number;
    fiat_amount: number;
    fiat_currency: FiatCurrency;
    fee_amount: number;
    fee_percentage: number;
    buyer_receives: number;
    payment_method: PaymentMethod;
    escrow_tx_hash: string | null;
    release_tx_hash: string | null;
    fee_tx_hash: string | null;
    on_chain_trade_id: number | null;
    status: TradeStatus;
    escrow_locked_at: string | null;
    fiat_sent_at: string | null;
    fiat_confirmed_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    auto_release_at: string | null;
    dispute_reason: string | null;
    dispute_evidence: DisputeEvidence | null;
    resolution: string | null;
    resolved_by: string | null;
    created_at: string;
}

export interface DisputeEvidence {
    buyer_screenshots?: string[];
    seller_screenshots?: string[];
    buyer_utr?: string;
    seller_statement?: string;
    ai_analysis?: AiAnalysis;
    messages?: string[];
}

export interface AiAnalysis {
    confidence: number;
    recommendation: "release_to_buyer" | "refund_to_seller" | "needs_admin";
    reasoning: string;
    tamperingDetected: boolean;
}

export interface PaymentProof {
    trade_id: string;
    user_id: string;
    utr: string;
    amount: number;
    receiver_upi: string;
    screenshot_file_id: string;
    timestamp: string;
    ai_verified: boolean;
    ai_confidence: number;
}

// ---- Bridge Types ----

export interface BridgeQuote {
    from_chain: string;
    to_chain: string;
    from_token: string;
    to_token: string;
    from_amount: string;
    to_amount: string;
    bridge_provider: string;
    estimated_gas: string;
    estimated_time: number;
    integrator_fee: string;
}

// ---- AI Intent Types ----

export type IntentType =
    | "CREATE_SELL_ORDER"
    | "CREATE_BUY_ORDER"
    | "VIEW_ORDERS"
    | "MATCH_ORDER"
    | "CONFIRM_PAYMENT"
    | "CONFIRM_RECEIPT"
    | "BRIDGE_TOKENS"
    | "CHECK_BALANCE"
    | "CHECK_STATUS"
    | "SEND_CRYPTO"
    | "DISPUTE"
    | "HELP"
    | "PROFILE"
    | "UNKNOWN";

export interface ParsedIntent {
    intent: IntentType;
    confidence: number;
    params: Record<string, any>;
    response: string;
}

// ---- Session Types ----

export interface SessionData {
    user_id?: string;
    wallet_address?: string;
    current_trade_id?: string;
    current_order_id?: string;
    awaiting_input?: string;
    ad_draft?: {
        type?: string;
        token?: string;
        amount?: number;
        rate?: number;
        payment_methods?: string[];
        target_group_id?: number;
        chain?: string;
    };
    send_draft?: {
        to_address?: string;
        token?: string;
        token_address?: string;
        amount?: number;
    };
    conversation_history?: Array<{
        role: "user" | "assistant";
        content: string;
    }>;
}
export interface TradeMessage {
    id: string;
    trade_id: string;
    user_id: string;
    message: string;
    created_at: string;
    // Joined data
    username?: string;
}
