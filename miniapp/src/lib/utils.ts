/**
 * Robustly copy text to clipboard with a fallback for environments 
 * where navigator.clipboard might be unavailable or restricted (like some WebViews).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    // Try modern API first
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('Modern clipboard API failed, trying fallback:', err);
        }
    }

    // Fallback: Create a hidden textarea
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Ensure it's not visible but part of the DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.style.opacity = "0";

        document.body.appendChild(textArea);

        // Select the text
        textArea.focus();
        textArea.select();

        // Execute copy command
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        return successful;
    } catch (err) {
        console.error('Copy fallback failed:', err);
        return false;
    }
}
/**
 * Simplifies complex blockchain/API error messages for end-users.
 */
export function formatError(err: any): string {
    const msg = (err?.message || String(err)).toLowerCase();

    // Standard Wallet Rejections
    if (msg.includes('user rejected') || msg.includes('action_rejected') || msg.includes('user_rejected')) {
        return "Transaction cancelled by user.";
    }

    // Gas & Balance errors
    if (msg.includes('insufficient funds for gas') || msg.includes('intrinsic gas too low')) {
        return "Insufficient balance for network fees (Gas).";
    }
    
    if (msg.includes('insufficient funds') || msg.includes('insufficient balance') || msg.includes('amount exceeds balance')) {
        return "Insufficient balance for this transaction.";
    }

    // Network & Provider issues
    if (msg.includes('network error') || msg.includes('failed to fetch') || msg.includes('load failed')) {
        return "Network connection error. Please try again.";
    }

    if (msg.includes('switch chain') || msg.includes('switch network')) {
        return "Failed to switch network. Please try manually.";
    }

    // Contract Logic Errors (Optional mapping)
    if (msg.includes('execution reverted')) {
        if (msg.includes('allowance')) return "Token approval required.";
        return "Contract execution failed. Check your balance or vault.";
    }

    // Fallback: Try to extract a clean message if it's already semi-clinical
    if (msg.length < 60 && !msg.includes(':') && !msg.includes('0x')) {
        return err.message;
    }

    return "Operation failed. Please try again.";
}
