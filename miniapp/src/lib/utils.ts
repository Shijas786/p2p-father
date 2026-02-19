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
