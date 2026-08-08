/**
 * Baileys Model Context Protocol (MCP) Server
 * Implements MCP v1.0.0 JSON-RPC Specification for WhatsApp automation.
 */

import { getSock, isWaConnected, getLatestQr } from "../whatsapp/client";
import { reply, replyWithButtons, replyWithList } from "../whatsapp/router";
import { db } from "../db/client";

export interface McpRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: any;
}

export interface McpResponse {
    jsonrpc: "2.0";
    id: string | number;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

export const BAILEYS_MCP_TOOLS = [
    {
        name: "wa_get_status",
        description: "Check the current WhatsApp connection state, pairing status, and latest QR code.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "wa_send_text",
        description: "Send a text message to a WhatsApp phone number or JID.",
        inputSchema: {
            type: "object",
            properties: {
                recipient: {
                    type: "string",
                    description: "Phone number (e.g. 917012751478 or +917012751478) or full JID (e.g. 917012751478@s.whatsapp.net)."
                },
                text: {
                    type: "string",
                    description: "Message text content."
                }
            },
            required: ["recipient", "text"]
        }
    },
    {
        name: "wa_send_buttons",
        description: "Send native interactive quick_reply buttons (max 3 buttons) to a WhatsApp user.",
        inputSchema: {
            type: "object",
            properties: {
                recipient: {
                    type: "string",
                    description: "Phone number or full JID."
                },
                text: {
                    type: "string",
                    description: "Main body text."
                },
                buttons: {
                    type: "array",
                    description: "List of buttons (maximum 3 buttons).",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "string", description: "Button identifier/callback payload." },
                            label: { type: "string", description: "Visible text on the button." }
                        },
                        required: ["id", "label"]
                    }
                },
                footer: {
                    type: "string",
                    description: "Optional footer text."
                }
            },
            required: ["recipient", "text", "buttons"]
        }
    },
    {
        name: "wa_send_list",
        description: "Send a native interactive single_select list picker to a WhatsApp user.",
        inputSchema: {
            type: "object",
            properties: {
                recipient: {
                    type: "string",
                    description: "Phone number or full JID."
                },
                title: {
                    type: "string",
                    description: "Title header of the list."
                },
                buttonText: {
                    type: "string",
                    description: "Text shown on the list trigger button (e.g., View Options)."
                },
                sections: {
                    type: "array",
                    description: "List sections.",
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            rows: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        title: { type: "string" },
                                        description: { type: "string" }
                                    },
                                    required: ["id", "title"]
                                }
                            }
                        },
                        required: ["title", "rows"]
                    }
                }
            },
            required: ["recipient", "title", "buttonText", "sections"]
        }
    },
    {
        name: "wa_list_ads",
        description: "Fetch live active P2P trade buy and sell advertisements.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    }
];

function normalizeJid(recipient: string): string {
    const cleaned = recipient.replace(/[^0-9]/g, "");
    if (!cleaned) throw new Error(`Invalid recipient format: ${recipient}`);
    return `${cleaned}@s.whatsapp.net`;
}

export async function handleMcpRequest(req: McpRequest): Promise<McpResponse> {
    const { id, method, params } = req;

    try {
        switch (method) {
            case "initialize":
                return {
                    jsonrpc: "2.0",
                    id,
                    result: {
                        protocolVersion: "2024-11-05",
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: "baileys-mcp-server",
                            version: "1.0.0"
                        }
                    }
                };

            case "tools/list":
                return {
                    jsonrpc: "2.0",
                    id,
                    result: {
                        tools: BAILEYS_MCP_TOOLS
                    }
                };

            case "tools/call": {
                const name = params?.name;
                const args = params?.arguments || {};

                switch (name) {
                    case "wa_get_status": {
                        const connected = isWaConnected();
                        let botJid = null;
                        try {
                            const sock = getSock();
                            botJid = sock?.user?.id || null;
                        } catch {}
                        return {
                            jsonrpc: "2.0",
                            id,
                            result: {
                                content: [
                                    {
                                        type: "text",
                                        text: JSON.stringify({
                                            connected,
                                            botJid,
                                            latestQrAvailable: Boolean(getLatestQr())
                                        })
                                    }
                                ]
                            }
                        };
                    }

                    case "wa_send_text": {
                        const sock = getSock();
                        const jid = normalizeJid(args.recipient);
                        await reply(sock, jid, args.text);
                        return {
                            jsonrpc: "2.0",
                            id,
                            result: {
                                content: [
                                    {
                                        type: "text",
                                        text: `Message sent successfully to ${jid}`
                                    }
                                ]
                            }
                        };
                    }

                    case "wa_send_buttons": {
                        const sock = getSock();
                        const jid = normalizeJid(args.recipient);
                        await replyWithButtons(sock, jid, args.text, args.buttons, args.footer);
                        return {
                            jsonrpc: "2.0",
                            id,
                            result: {
                                content: [
                                    {
                                        type: "text",
                                        text: `Interactive buttons message sent successfully to ${jid}`
                                    }
                                ]
                            }
                        };
                    }

                    case "wa_send_list": {
                        const sock = getSock();
                        const jid = normalizeJid(args.recipient);
                        await replyWithList(sock, jid, args.title, args.buttonText, args.sections);
                        return {
                            jsonrpc: "2.0",
                            id,
                            result: {
                                content: [
                                    {
                                        type: "text",
                                        text: `Interactive list picker message sent successfully to ${jid}`
                                    }
                                ]
                            }
                        };
                    }

                    case "wa_list_ads": {
                        const ads = await db.getActiveOrders();
                        return {
                            jsonrpc: "2.0",
                            id,
                            result: {
                                content: [
                                    {
                                        type: "text",
                                        text: JSON.stringify(ads, null, 2)
                                    }
                                ]
                            }
                        };
                    }

                    default:
                        return {
                            jsonrpc: "2.0",
                            id,
                            error: {
                                code: -32601,
                                message: `Tool not found: ${name}`
                            }
                        };
                }
            }

            default:
                return {
                    jsonrpc: "2.0",
                    id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`
                    }
                };
        }
    } catch (err: any) {
        return {
            jsonrpc: "2.0",
            id,
            error: {
                code: -32603,
                message: err?.message || "Internal MCP error"
            }
        };
    }
}
