const fs = require('fs');

function doPatch() {
  const content = fs.readFileSync('tools/src/osTools.js', 'utf8');
  const startMark = 'async function send_whatsapp_message({ contact_name, message }) {';
  const startIdx = content.indexOf(startMark);
  const nextStart = content.indexOf('async function save_whatsapp_contact', startIdx);
  const endIdx = nextStart !== -1 ? nextStart : content.length;
  
  const newFunc = [
    'async function send_whatsapp_message({ contact_name, message }) {',
    '  try {',
    '    console.log(`Sending message via UI automation to ${contact_name}`);',
    '    const script = `',
    '      tell application "WhatsApp"',
    '          activate',
    '      end tell',
    '      delay 1.5',
    '      tell application "System Events"',
    '          keystroke "n" using {command down}',
    '          delay 1.5',
    '          keystroke "${contact_name}"',
    '          delay 2.5',
    '          keystroke return',
    '          delay 1.5',
    '          keystroke "${message}"',
    '          delay 1.0',
    '          keystroke return',
    '      end tell',
    '    `;',
    '    await runAppleScript(script);',
    '    return { success: true, message: `Boss, I sent the message to ${contact_name} by simulating keyboard strokes!` };',
    '  } catch(e) {',
    '    return { success: false, error: e.message };',
    '  }',
    '}',
    ''
  ].join('\n');

  const finalContent = content.substring(0, startIdx) + newFunc + content.substring(endIdx);
  fs.writeFileSync('tools/src/osTools.js', finalContent);
  console.log('Patched correctly!');
}

doPatch();
