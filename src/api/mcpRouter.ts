/**
 * Express MCP Router for Baileys WhatsApp MCP Server
 * Exposes POST /api/mcp for MCP JSON-RPC protocol requests.
 */

import { Router } from "express";
import { handleMcpRequest, BAILEYS_MCP_TOOLS } from "../mcp/baileysMcpServer";

export const mcpRouter = Router();

// GET /api/mcp/tools - Returns human-readable JSON summary of available MCP tools
mcpRouter.get("/tools", (req, res) => {
    res.json({
        server: "Baileys WhatsApp MCP Server",
        version: "1.0.0",
        protocolVersion: "2024-11-05",
        tools: BAILEYS_MCP_TOOLS
    });
});

// POST /api/mcp - Standard MCP JSON-RPC endpoint
mcpRouter.post("/", async (req, res) => {
    try {
        const body = req.body;
        if (!body || typeof body !== "object") {
            res.status(400).json({
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: "Parse error: invalid JSON body" }
            });
            return;
        }

        const response = await handleMcpRequest(body);
        res.json(response);
    } catch (err: any) {
        res.status(500).json({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: err?.message || "Internal server error" }
        });
    }
});
