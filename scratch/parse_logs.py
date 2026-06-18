import json
import re

with open('/Users/shijas/.gemini/antigravity-ide/brain/93183f9a-55d8-49a9-86c0-d2845ae2895f/.system_generated/logs/transcript.jsonl') as f:
    for line in f:
        data = json.loads(line)
        if data.get('step_index') == 55:
            content = data.get('content', '')
            # Find the section for Step 8: capture_browser_console_logs
            idx = content.find('### Step 8: capture_browser_console_logs')
            if idx != -1:
                # Find the next Step header
                next_idx = content.find('### Step', idx + 40)
                if next_idx != -1:
                    section = content[idx:next_idx]
                else:
                    section = content[idx:]
                print(section[:3000])
