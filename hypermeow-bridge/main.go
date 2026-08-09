package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	waBinary "go.mau.fi/whatsmeow/binary"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waTypes "go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

type SendImageReq struct {
	JID      string `json:"jid"`
	ImageURL string `json:"imageUrl"`
	Caption  string `json:"caption"`
}

type SendTextReq struct {
	JID  string `json:"jid"`
	Text string `json:"text"`
}

type ButtonItem struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type SendButtonsReq struct {
	JID     string       `json:"jid"`
	Text    string       `json:"text"`
	Footer  string       `json:"footer"`
	Buttons []ButtonItem `json:"buttons"`
}

type ListRow struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type ListSection struct {
	Title string    `json:"title"`
	Rows  []ListRow `json:"rows"`
}

type SendListReq struct {
	JID        string        `json:"jid"`
	Title      string        `json:"title"`
	ButtonText string        `json:"buttonText"`
	Sections   []ListSection `json:"sections"`
}

type DeleteMsgReq struct {
	JID    string `json:"jid"`
	Sender string `json:"sender"`
	MsgID  string `json:"msgId"`
}

type WebhookPayload struct {
	JID         string `json:"jid"`
	Text        string `json:"text"`
	Sender      string `json:"sender"`
	PushName    string `json:"pushName"`
	AudioBase64 string `json:"audioBase64,omitempty"`
	MsgID       string `json:"msgId,omitempty"`
}

var (
	client     *whatsmeow.Client
	container  *sqlstore.Container
	webhookURL string
	latestQR   string
	qrMutex    sync.Mutex
	qrActive   bool
)

// resolveJID parses the raw JID string into waTypes.JID preserving original server (@lid or @s.whatsapp.net)
func resolveJID(rawJID string) (waTypes.JID, error) {
	jid, err := waTypes.ParseJID(rawJID)
	if err != nil {
		return waTypes.JID{}, fmt.Errorf("invalid JID: %w", err)
	}
	return jid, nil
}

func startQRFlow() {
	if client != nil && client.Store.ID != nil && client.Store.ID.User != "" {
		return
	}
	qrMutex.Lock()
	if qrActive {
		qrMutex.Unlock()
		return
	}
	qrActive = true
	qrMutex.Unlock()

	ctx := context.Background()
	qrChan, err := client.GetQRChannel(ctx)
	if err != nil {
		fmt.Printf("[Hypermeow QR Error] Failed to get QR channel: %v\n", err)
		qrMutex.Lock()
		qrActive = false
		qrMutex.Unlock()
		return
	}

	if !client.IsConnected() {
		_ = client.Connect()
	}

	go func() {
		for evt := range qrChan {
			if evt.Event == "code" {
				qrMutex.Lock()
				latestQR = evt.Code
				qrMutex.Unlock()
				fmt.Printf("[Hypermeow QR Code] Fresh QR Code generated.\n")
			} else if evt.Event == "success" {
				qrMutex.Lock()
				latestQR = ""
				qrActive = false
				qrMutex.Unlock()
				fmt.Println("[Hypermeow Status] Successfully paired with WhatsApp!")
			} else {
				fmt.Printf("[Hypermeow QR Event] %s\n", evt.Event)
			}
		}
		qrMutex.Lock()
		qrActive = false
		qrMutex.Unlock()
	}()
}

func main() {
	port := os.Getenv("HYPERMEOW_PORT")
	if port == "" {
		port = "8085"
	}
	webhookURL = os.Getenv("WEBHOOK_URL")
	if webhookURL == "" {
		nodePort := os.Getenv("PORT")
		if nodePort == "" {
			nodePort = "8000"
		}
		webhookURL = "http://localhost:" + nodePort + "/api/whatsapp/webhook"
	}

	ctx := context.Background()
	dbLog := waLog.Stdout("Database", "INFO", true)
	var err error
	// Use persistent volume path so session survives redeploys
	dbPath := "/app/hypermeow-bridge/data/hypermeow.db"
	container, err = sqlstore.New(ctx, "sqlite3", "file:"+dbPath+"?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000", dbLog)
	if err != nil {
		log.Fatalf("Failed to initialize SQLite store: %v", err)
	}

	deviceStore, err := container.GetFirstDevice(ctx)
	if err != nil {
		log.Fatalf("Failed to get device store: %v", err)
	}

	clientLog := waLog.Stdout("Hypermeow", "INFO", true)
	client = whatsmeow.NewClient(deviceStore, clientLog)
	client.AddEventHandler(eventHandler)

	if client.Store.ID == nil || client.Store.ID.User == "" {
		startQRFlow()
	} else {
		err = client.Connect()
		if err != nil {
			log.Fatalf("Failed to connect: %v", err)
		}
		fmt.Println("[Hypermeow] Connected successfully with existing session!")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/qr", handleGetQR)
	mux.HandleFunc("/logout", handleLogout)
	mux.HandleFunc("/send-text", handleSendText)
	mux.HandleFunc("/send-image", handleSendImage)
	mux.HandleFunc("/send-buttons", handleSendButtons)
	mux.HandleFunc("/send-list", handleSendList)
	mux.HandleFunc("/delete-message", handleDeleteMessage)

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	go func() {
		fmt.Printf("[Hypermeow Bridge] HTTP server running on port %s...\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	client.Disconnect()
	fmt.Println("[Hypermeow] Shutting down cleanly.")
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	connected := client != nil && client.Store.ID != nil && client.Store.ID.User != ""
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"connected": connected,
		"engine":    "hypermeow-v1.0",
	})
}

func handleGetQR(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// If already logged in / paired, never generate or return QR
	if client != nil && client.Store.ID != nil && client.Store.ID.User != "" {
		json.NewEncoder(w).Encode(map[string]string{
			"qr": "",
		})
		return
	}

	// If not logged in and no active QR, trigger startQRFlow
	qrMutex.Lock()
	hasQR := latestQR != ""
	qrMutex.Unlock()
	if !hasQR {
		startQRFlow()
	}

	qrMutex.Lock()
	code := latestQR
	qrMutex.Unlock()
	json.NewEncoder(w).Encode(map[string]string{
		"qr": code,
	})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if client != nil {
		_ = client.Logout(context.Background())
		client.Disconnect()
		qrMutex.Lock()
		latestQR = ""
		qrMutex.Unlock()
		go startQRFlow()
	}
	json.NewEncoder(w).Encode(map[string]string{
		"status": "logged_out",
	})
}

func handleSendText(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SendTextReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	jid, err := resolveJID(req.JID)
	if err != nil {
		http.Error(w, "Invalid JID format", http.StatusBadRequest)
		return
	}

	msg := &waProto.Message{
		Conversation: proto.String(req.Text),
	}

	_, err = client.SendMessage(context.Background(), jid, msg)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to send text: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "sent", "jid": req.JID})
}

func handleSendImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SendImageReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	jid, err := resolveJID(req.JID)
	if err != nil {
		http.Error(w, "Invalid JID format", http.StatusBadRequest)
		return
	}

	// Fetch image bytes from ImageURL
	resp, err := http.Get(req.ImageURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to download image: %v", err), http.StatusBadRequest)
		return
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read image bytes: %v", err), http.StatusInternalServerError)
		return
	}

	uploaded, err := client.Upload(context.Background(), data, whatsmeow.MediaImage)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to upload media to WhatsApp: %v", err), http.StatusInternalServerError)
		return
	}

	msg := &waProto.Message{
		ImageMessage: &waProto.ImageMessage{
			URL:           proto.String(uploaded.URL),
			DirectPath:    proto.String(uploaded.DirectPath),
			MediaKey:      uploaded.MediaKey,
			FileSHA256:    uploaded.FileSHA256,
			FileEncSHA256: uploaded.FileEncSHA256,
			FileLength:    proto.Uint64(uploaded.FileLength),
			Mimetype:      proto.String("image/png"),
			Caption:       proto.String(req.Caption),
		},
	}

	_, err = client.SendMessage(context.Background(), jid, msg)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to send image: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "sent", "jid": req.JID})
}

func handleSendButtons(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SendButtonsReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	jid, err := resolveJID(req.JID)
	if err != nil {
		http.Error(w, "Invalid JID format", http.StatusBadRequest)
		return
	}
	fmt.Printf("[SendButtons] resolved JID: %s (server=%s)\n", jid.String(), jid.Server)

	// Build native quick_reply buttons (max 3, WhatsApp limit)
	nativeFlowBtns := make([]*waProto.InteractiveMessage_NativeFlowMessage_NativeFlowButton, 0)
	for i, btn := range req.Buttons {
		if i >= 3 {
			break
		}
		paramsJSON, _ := json.Marshal(map[string]string{"display_text": btn.Label, "id": btn.ID})
		fmt.Printf("[SendButtons] Button: name=quick_reply params=%s\n", string(paramsJSON))
		nativeFlowBtns = append(nativeFlowBtns, &waProto.InteractiveMessage_NativeFlowMessage_NativeFlowButton{
			Name:             proto.String("quick_reply"),
			ButtonParamsJSON: proto.String(string(paramsJSON)),
		})
	}

	// Build inline text button list so ALL WhatsApp clients (iOS/Android/Web/Desktop) render action options
	textWithInlineButtons := req.Text
	if len(req.Buttons) > 0 {
		textWithInlineButtons += "\n\n━━━━━━━━━━━━━━━━━━━━"
		for _, btn := range req.Buttons {
			textWithInlineButtons += fmt.Sprintf("\n👉 *%s* → Send: `%s`", btn.Label, btn.ID)
		}
		textWithInlineButtons += "\n━━━━━━━━━━━━━━━━━━━━"
	}

	// No empty Header — omit unless a title/image is needed
	msg := &waProto.Message{
		InteractiveMessage: &waProto.InteractiveMessage{
			Body:   &waProto.InteractiveMessage_Body{Text: proto.String(textWithInlineButtons)},
			Footer: &waProto.InteractiveMessage_Footer{Text: proto.String(req.Footer)},
			InteractiveMessage: &waProto.InteractiveMessage_NativeFlowMessage_{
				NativeFlowMessage: &waProto.InteractiveMessage_NativeFlowMessage{
					MessageVersion: proto.Int32(1),
					Buttons:        nativeFlowBtns,
				},
			},
		},
	}

	// Build the biz relay node required for WhatsApp to render native_flow buttons.
	// Without this, WhatsApp silently drops/ignores the interactive message.
	bizNode := waBinary.Node{
		Tag: "biz",
		Content: []waBinary.Node{
			{
				Tag: "interactive",
				Attrs: waBinary.Attrs{
					"type": "native_flow",
					"v":    "1",
				},
				Content: []waBinary.Node{
					{
						Tag: "native_flow",
						Attrs: waBinary.Attrs{
							"v":    "9",
							"name": "mixed",
						},
					},
				},
			},
		},
	}
	isGroup := jid.Server == "g.us"
	additionalNodes := []waBinary.Node{bizNode}
	if !isGroup {
		additionalNodes = append([]waBinary.Node{{Tag: "bot", Attrs: waBinary.Attrs{"biz_bot": "1"}}}, additionalNodes...)
	}

	// ── Attempt 1: InteractiveMessage WITH AdditionalNodes (biz & bot nodes) ─────
	fmt.Printf("[SendButtons] Attempt 1: sending WITH AdditionalNodes (isGroup=%v)\n", isGroup)
	_, err = client.SendMessage(context.Background(), jid, msg, whatsmeow.SendRequestExtra{
		AdditionalNodes: &additionalNodes,
	})
	if err == nil {
		fmt.Println("[SendButtons] Attempt 1 SUCCESS (InteractiveMessage sent with AdditionalNodes)")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "sent", "jid": req.JID})
		return
	}
	fmt.Printf("[SendButtons] Attempt 1 FAILED: %v\n", err)

	// ── Attempt 2: Plain text fallback ───────────────────────────────────────
	fmt.Println("[SendButtons] Attempt 2: plain text fallback")
	fallbackText := req.Text + "\n\n━━━━━━━━━━━━━━━━━━━━"
	nums := []string{"1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"}
	for i, btn := range req.Buttons {
		num := fmt.Sprintf("%d.", i+1)
		if i < len(nums) {
			num = nums[i]
		}
		fallbackText += fmt.Sprintf("\n%s %s", num, btn.Label)
	}
	fallbackText += "\n━━━━━━━━━━━━━━━━━━━━\n_" + req.Footer + "_"
	fallbackMsg := &waProto.Message{Conversation: proto.String(fallbackText)}
	_, err2 := client.SendMessage(context.Background(), jid, fallbackMsg)
	if err2 != nil {
		fmt.Printf("[SendButtons] Attempt 2 FAILED: %v\n", err2)
		http.Error(w, fmt.Sprintf("all send attempts failed: %v / %v", err, err2), http.StatusInternalServerError)
		return
	}
	fmt.Println("[SendButtons] Attempt 2 SUCCESS (plain text fallback sent)")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "sent_fallback", "jid": req.JID})
}


func handleSendList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SendListReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	jid, err := resolveJID(req.JID)
	if err != nil {
		http.Error(w, "Invalid JID format", http.StatusBadRequest)
		return
	}

	sections := make([]*waProto.ListMessage_Section, 0)
	for _, sec := range req.Sections {
		rows := make([]*waProto.ListMessage_Row, 0)
		for _, r := range sec.Rows {
			rows = append(rows, &waProto.ListMessage_Row{
				RowID:       proto.String(r.ID),
				Title:       proto.String(r.Title),
				Description: proto.String(r.Description),
			})
		}
		sections = append(sections, &waProto.ListMessage_Section{
			Title: proto.String(sec.Title),
			Rows:  rows,
		})
	}

	textWithInlineList := req.Title
	if len(req.Sections) > 0 {
		textWithInlineList += "\n\n━━━━━━━━━━━━━━━━━━━━"
		for _, sec := range req.Sections {
			if sec.Title != "" {
				textWithInlineList += "\n\n📌 *" + sec.Title + "*"
			}
			for _, r := range sec.Rows {
				textWithInlineList += fmt.Sprintf("\n• *%s*", r.Title)
				if r.Description != "" {
					textWithInlineList += fmt.Sprintf("\n  └ %s", r.Description)
				}
				textWithInlineList += fmt.Sprintf("\n  👉 Send: `%s`", r.ID)
			}
		}
		textWithInlineList += "\n━━━━━━━━━━━━━━━━━━━━"
	}

	msg := &waProto.Message{
		ListMessage: &waProto.ListMessage{
			Title:      proto.String(textWithInlineList),
			ButtonText: proto.String(req.ButtonText),
			ListType:   waProto.ListMessage_SINGLE_SELECT.Enum(),
			Sections:   sections,
		},
	}

	bizNode := waBinary.Node{
		Tag: "biz",
		Content: []waBinary.Node{
			{
				Tag: "interactive",
				Attrs: waBinary.Attrs{"type": "native_flow", "v": "1"},
				Content: []waBinary.Node{
					{Tag: "native_flow", Attrs: waBinary.Attrs{"v": "9", "name": "mixed"}},
				},
			},
		},
	}
	isGroup := jid.Server == "g.us"
	additionalNodes := []waBinary.Node{bizNode}
	if !isGroup {
		additionalNodes = append([]waBinary.Node{{Tag: "bot", Attrs: waBinary.Attrs{"biz_bot": "1"}}}, additionalNodes...)
	}

	// Attempt 1: ListMessage with AdditionalNodes
	_, err = client.SendMessage(context.Background(), jid, msg, whatsmeow.SendRequestExtra{
		AdditionalNodes: &additionalNodes,
	})
	if err == nil {
		fmt.Println("[SendList] Attempt 1 SUCCESS")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "sent", "jid": req.JID})
		return
	}
	fmt.Printf("[SendList] Attempt 1 FAILED: %v\n", err)

	// Attempt 2: Clean Plain-Text Menu Fallback
	fmt.Println("[SendList] Attempt 2: sending plain-text list menu fallback")
	fallbackText := req.Title + "\n\n━━━━━━━━━━━━━━━━━━━━"
	for _, sec := range req.Sections {
		if sec.Title != "" {
			fallbackText += "\n\n* " + sec.Title + " *"
		}
		for _, r := range sec.Rows {
			fallbackText += fmt.Sprintf("\n• *%s*", r.Title)
			if r.Description != "" {
				fallbackText += fmt.Sprintf("\n  └ %s", r.Description)
			}
			fallbackText += fmt.Sprintf("\n  👉 Send: `%s`", r.ID)
		}
	}
	fallbackText += "\n━━━━━━━━━━━━━━━━━━━━"

	fallbackMsg := &waProto.Message{Conversation: proto.String(fallbackText)}
	_, err2 := client.SendMessage(context.Background(), jid, fallbackMsg)
	if err2 != nil {
		fmt.Printf("[SendList] Attempt 2 FAILED: %v\n", err2)
		http.Error(w, fmt.Sprintf("all list send attempts failed: %v / %v", err, err2), http.StatusInternalServerError)
		return
	}

	fmt.Println("[SendList] Attempt 2 SUCCESS (plain text list fallback sent)")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "sent_fallback", "jid": req.JID})
}

func handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req DeleteMsgReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	chatJID, err := resolveJID(req.JID)
	if err != nil {
		http.Error(w, "Invalid JID format", http.StatusBadRequest)
		return
	}

	var pJID *string
	if req.Sender != "" {
		sJID, err := resolveJID(req.Sender)
		if err == nil {
			sJIDStr := sJID.String()
			pJID = &sJIDStr
		}
	}

	msg := &waProto.Message{
		ProtocolMessage: &waProto.ProtocolMessage{
			Type: waProto.ProtocolMessage_REVOKE.Enum(),
			Key: &waProto.MessageKey{
				RemoteJID:   proto.String(chatJID.String()),
				FromMe:      proto.Bool(false),
				ID:          proto.String(req.MsgID),
				Participant: pJID,
			},
		},
	}

	_, err = client.SendMessage(context.Background(), chatJID, msg)
	if err != nil {
		fmt.Printf("[Hypermeow DeleteMessage Error] %v\n", err)
		http.Error(w, fmt.Sprintf("Failed to delete message: %v", err), http.StatusInternalServerError)
		return
	}

	fmt.Printf("[Hypermeow DeleteMessage] Successfully requested revocation of msg %s in %s\n", req.MsgID, req.JID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "msgId": req.MsgID})
}

func eventHandler(evt interface{}) {
	switch v := evt.(type) {
	case *events.LoggedOut:
		fmt.Println("[Hypermeow Event] Logged out from WhatsApp. Resetting store & regenerating QR code...")
		qrMutex.Lock()
		latestQR = ""
		qrActive = false
		qrMutex.Unlock()
		if client.Store.ID != nil {
			client.Store.ID.User = ""
		}
		go startQRFlow()

	case *events.Message:
		if v.Info.IsFromMe {
			return
		}

		text := v.Message.GetConversation()
		if text == "" {
			text = v.Message.GetExtendedTextMessage().GetText()
		}
		if text == "" && v.Message.GetButtonsResponseMessage() != nil {
			text = v.Message.GetButtonsResponseMessage().GetSelectedButtonID()
			if text == "" {
				text = v.Message.GetButtonsResponseMessage().GetSelectedDisplayText()
			}
		}
		if text == "" && v.Message.GetTemplateButtonReplyMessage() != nil {
			text = v.Message.GetTemplateButtonReplyMessage().GetSelectedID()
			if text == "" {
				text = v.Message.GetTemplateButtonReplyMessage().GetSelectedDisplayText()
			}
		}
		if text == "" && v.Message.GetListResponseMessage() != nil {
			text = v.Message.GetListResponseMessage().GetSingleSelectReply().GetSelectedRowID()
		}
		// Handle interactive button tap (NativeFlowMessage response & Body text)
		if text == "" && v.Message.GetInteractiveResponseMessage() != nil {
			irm := v.Message.GetInteractiveResponseMessage()
			if irm.GetNativeFlowResponseMessage() != nil {
				paramsJSON := irm.GetNativeFlowResponseMessage().GetParamsJSON()
				var params map[string]interface{}
				if err := json.Unmarshal([]byte(paramsJSON), &params); err == nil {
					if id, ok := params["id"].(string); ok && id != "" {
						text = id
					}
				}
				if text == "" {
					text = paramsJSON
				}
			}
			if text == "" && irm.GetBody() != nil {
				text = irm.GetBody().GetText()
			}
		}

		var audioBase64 string
		if text == "" && v.Message.GetAudioMessage() != nil {
			audioBytes, err := client.Download(context.Background(), v.Message.GetAudioMessage())
			if err == nil && len(audioBytes) > 0 {
				audioBase64 = base64.StdEncoding.EncodeToString(audioBytes)
				text = "[VOICE_NOTE]"
				fmt.Printf("[Hypermeow Message] Received voice note from sender=%s (bytes=%d)\n", v.Info.Sender.String(), len(audioBytes))
			} else {
				fmt.Printf("[Hypermeow Message] Failed to download audio message: %v\n", err)
			}
		}

		fmt.Printf("[Hypermeow Message] chat=%s sender=%s pushName=%s msgID=%s text=%q\n", v.Info.Chat.String(), v.Info.Sender.String(), v.Info.PushName, v.Info.ID, text)

		if text == "" {
			msgJSON, _ := json.Marshal(v.Message)
			fmt.Printf("[Hypermeow Message] IGNORED — empty text (msgType=%T) | RawMsg: %s\n", v.Message, string(msgJSON))
			return
		}

		payload := WebhookPayload{
			JID:         v.Info.Chat.String(),
			Text:        text,
			Sender:      v.Info.Sender.String(),
			PushName:    v.Info.PushName,
			AudioBase64: audioBase64,
			MsgID:       v.Info.ID,
		}
		body, _ := json.Marshal(payload)
		fmt.Printf("[Hypermeow Webhook] POST %s payload=%s\n", webhookURL, string(body))
		resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(body))
		if err != nil {
			fmt.Printf("[Hypermeow Webhook Error] %v\n", err)
			return
		}
		fmt.Printf("[Hypermeow Webhook] Response status: %d\n", resp.StatusCode)
		resp.Body.Close()
	}
}

