const fs = require('fs');
const p = 'src-tauri/src/lib.rs';
let s = fs.readFileSync(p, 'utf8');
// Add cfg guard to crozzo_device_profile mod
s = s.replace('mod crozzo_device_profile;\n', '#[cfg(not(any(target_os = "android", target_os = "ios")))]\nmod crozzo_device_profile;\n', 1);
// Add cfg guard to the command registration
s = s.replace('            crozzo_device_profile::crozzo_device_ram,', '#[cfg(not(any(target_os = "android", target_os = "ios")))]\n            crozzo_device_profile::crozzo_device_ram,', 1);
fs.writeFileSync(p, s, 'utf8');
console.log('done');