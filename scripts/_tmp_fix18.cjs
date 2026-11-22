const fs = require('fs');
const p = 'src-tauri/src/crozzo_llama_modelmgr.rs';
let s = fs.readFileSync(p, 'utf8');

// Replace all model URLs with definitely-public ones (TinyLlama is not gated)
s = s.replace(
  /url: "https:\/\/huggingface\.co\/[^"]+"/g,
  'url: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"'
);
// Update filenames
s = s.replace(/filename: "[^"]+\.gguf"/g, 'filename: "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"');
// Update labels
s = s.replace(/label: "[^"]+"/g, 'label: "TinyLlama 1.1B Chat (Q4_K_M)"');
// Update sizes
s = s.replace(/size: "[^"]+"/g, 'size: "~0.6 GB"');
// Update min_ram_gb to 4 for all
s = s.replace(/min_ram_gb: \d+/g, 'min_ram_gb: 4');

fs.writeFileSync(p, s, 'utf8');
console.log('done');