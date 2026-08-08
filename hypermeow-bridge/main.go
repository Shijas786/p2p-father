package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waTypes "go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

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

type WebhookPayload struct {
	JID      string `json:"jid"`
	Text     string `json:"text"`
	Sender   string `json:"sender"`
	PushName string `json:"pushName"`
}

var (
	client     *whatsmeow.Client
	container  *sqlstore.Container
	webhookURL string
	latestQR   string
	qrMutex    sync.Mutex
	qrActive   bool
)

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
	container, err = sqlstore.New(ctx, "sqlite3", "file:hypermeow.db?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000", dbLog)
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
	mux.HandleFunc("/send-buttons", handleSendButtons)
	mux.HandleFunc("/send-list", handleSendList)

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

	jid, err := waTypes.ParseJID(req.JID)
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

	jid, err := waTypes.ParseJID(req.JID)
	if err != nil {
		http.Error(w, "Invalid JID format", http.StatusBadRequest)
		return
	}

	// Build native quick_reply buttons (max 3, WhatsApp limit)
	type nativeBtn struct {
		Name             string          `json:"name"`
		ButtonParamsJson string          `json:"buttonParamsJson"`
	}
	type btnParams struct {
		DisplayText string `json:"display_text"`
		ID          string `json:"id"`
	}

	nativeBtns := make([]nativeBtn, 0)
	for i, btn := range req.Buttons {
		if i >= 3 {
			break
		}
		paramsJSON, _ := json.Marshal(btnParams{DisplayText: btn.Label, ID: btn.ID})
		nativeBtns = append(nativeBtns, nativeBtn{
			Name:             "quick_reply",
			ButtonParamsJson: string(paramsJSON),
		})
	}
	nativeBtnsJSON, _ := json.Marshal(nativeBtns)

	msg := &waProto.Message{
		InteractiveMessage: &waProto.InteractiveMessage{
			Body:   &waProto.InteractiveMessage_Body{Text: proto.String(req.Text)},
			Footer: &waProto.InteractiveMessage_Footer{Text: proto.String(req.Footer)},
			Header: &waProto.InteractiveMessage_Header{},
			InteractiveMessage: &waProto.InteractiveMessage_NativeFlowMessage_{
				NativeFlowMessage: &waProto.InteractiveMessage_NativeFlowMessage{
					MessageVersion: proto.Int32(1),
					ButtonsJson:    proto.String(string(nativeBtnsJSON)),
				},
			},
		},
	}

	_, err = client.SendMessage(context.Background(), jid, msg)
	if err != nil {
		// Fallback: send as numbered plain text
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
			http.Error(w, fmt.Sprintf("Failed to send buttons: %v; fallback also failed: %v", err, err2), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "sent", "jid": req.JID})
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

	jid, err := waTypes.ParseJID(req.JID)
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

	msg := &waProto.Message{
		ListMessage: &waProto.ListMessage{
			Title:       proto.String(req.Title),
			ButtonText:  proto.String(req.ButtonText),
			ListType:    waProto.ListMessage_SINGLE_SELECT.Enum(),
			Sections:    sections,
		},
	}

	_, err = client.SendMessage(context.Background(), jid, msg)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to send list: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "sent", "jid": req.JID})
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
		if text == "" {
			text = v.Message.GetButtonsResponseMessage().GetSelectedButtonID()
		}
		if text == "" {
			text = v.Message.GetListResponseMessage().GetSingleSelectReply().GetSelectedRowID()
		}
		if text == "" {
			return
		}

		payload := WebhookPayload{
			JID:      v.Info.Chat.String(),
			Text:     text,
			Sender:   v.Info.Sender.String(),
			PushName: v.Info.PushName,
		}
		body, _ := json.Marshal(payload)
		resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(body))
		if err != nil {
			fmt.Printf("[Hypermeow Webhook Error] %v\n", err)
			return
		}
		resp.Body.Close()
	}
}
