/**
 * P2PFather WhatsApp Types
 * Minimal local type definitions — replaces @whiskeysockets/baileys types.
 * Hypermeow (Go bridge) is the active WhatsApp engine.
 */

export interface WAMessageKey {
    remoteJid?: string | null;
    fromMe?: boolean | null;
    id?: string | null;
    participant?: string | null;
}

export interface IButtonsResponseMessage {
    selectedButtonId?: string | null;
}

export interface ISingleSelectReply {
    selectedRowId?: string | null;
}

export interface IListResponseMessage {
    singleSelectReply?: ISingleSelectReply | null;
}

export interface INativeFlowResponseMessage {
    paramsJson?: string | null;
}

export interface IInteractiveResponseMessage {
    nativeFlowResponseMessage?: INativeFlowResponseMessage | null;
}

export interface IExtendedTextMessage {
    text?: string | null;
}

export interface IImageMessage {
    caption?: string | null;
}

export interface IMessageContent {
    conversation?: string | null;
    extendedTextMessage?: IExtendedTextMessage | null;
    imageMessage?: IImageMessage | null;
    buttonsResponseMessage?: IButtonsResponseMessage | null;
    listResponseMessage?: IListResponseMessage | null;
    interactiveResponseMessage?: IInteractiveResponseMessage | null;
}

export interface IWebMessageInfo {
    key?: WAMessageKey | null;
    message?: IMessageContent | null;
    pushName?: string | null;
}

/** Minimal WA socket stub — only used as fallback, Hypermeow handles actual sends */
export interface WASocket {
    user?: { id: string } | null;
    sendMessage: (jid: string, content: any, opts?: any) => Promise<any>;
}

/** Alias for IWebMessageInfo */
export type WAMessage = IWebMessageInfo;

/** proto namespace stub */
export const proto = {
    IWebMessageInfo: {} as IWebMessageInfo,
};
