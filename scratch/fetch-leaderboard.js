fetch("http://localhost:8000/api/miniapp/predictions/leaderboard", {
    headers: { "x-telegram-init-data": "..." } // test-leaderboard.ts handles auth, let's just run test-leaderboard.ts foreground
}).then(r => r.json()).then(console.log).catch(console.error);
