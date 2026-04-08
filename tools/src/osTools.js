import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';

const execAsync = promisify(exec);

async function askVisionModel(prompt, base64Image) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set.");

  const payload = {
    model: "llama-3.2-11b-vision-preview",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
        ]
      }
    ],
    temperature: 0.1
  };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

const runAppleScript = (script) => new Promise((resolve, reject) => {
  const child = spawn('osascript', ['-']);
  let out = '', err = '';
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => err += d);
  child.on('close', code => {
    if (code === 0) resolve(out.trim());
    else reject(new Error(err || 'AppleScript exited with code ' + code));
  });
  child.stdin.write(script);
  child.stdin.end();
});

export const readActiveWindowTool = {
  declaration: {
    name: "read_active_window",
    description: "Reads the accessibility tree UI of the currently active macOS window to let the AI 'see' what is on screen.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  rules: "Use this tool FIRST when the user asks you to 'see my screen' or 'what is on my screen'. It returns the UI structure.",
  handler: async () => {
    const script = `
      try
        tell application "System Events"
          -- If the AI assistant app itself is frontmost, temporarily hide it so we can read the user's actual screen
          set currentApp to first application process whose frontmost is true
          if name of currentApp is "Electron" or name of currentApp is "empth" then
             set visible of currentApp to false
             delay 0.2
          end if
          
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          if exists (window 1 of frontApp) then
            set winName to name of window 1 of frontApp
            
            -- Try to fetch meaningful UI elements like buttons, text fields, checkboxes
            set uiElements to ""
            try
              set allElements to entire contents of window 1 of frontApp
              set elementsList to {}
              repeat with elem in allElements
                try
                  set eName to name of elem
                  set eRole to role of elem
                  -- Only grab elements with actual names to keep the output clean and fast
                  if eName is not missing value and eName is not "" then
                    set end of elementsList to (eRole & " '" & eName & "'")
                  end if
                end try
              end repeat
              
              set AppleScript's text item delimiters to ", "
              set uiElements to elementsList as string
              set AppleScript's text item delimiters to ""
            on error
              set uiElements to "Too many nested elements to fast-read. You can ask the user to use 'check_screen' vision tool instead."
            end try
            
            return "Active App: " & appName & " | Window: " & winName & " | Interactive Elements: [" & uiElements & "]"
          else
            return "Active App: " & appName & " | No open windows visible to accessibility."
          end if
        end tell
      on error errMsg
        return "Accessibility Error: " & errMsg
      end try
    `;
    try {
      const result = await runAppleScript(script);
      return { success: true, ui_tree: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

export const clickUIElementTool = {
  declaration: {
    name: "click_ui_element",
    description: "Clicks a UI element (button, text field, link) in the currently active window by its exact accessibility name.",
    parameters: {
      type: "object",
      properties: {
        element_name: {
          type: "string",
          description: "The exact name of the UI element to click (obtained from read_active_window)"
        }
      },
      required: ["element_name"]
    }
  },
  rules: "Use this to interact with apps after reading the screen UI.",
  handler: async (params) => {
    if (!params.element_name) return { success: false, error: "Missing element_name" };
    const script = `
      try
        tell application "System Events"
          -- Ensure AI app isn't blocking clicks
          set currentApp to first application process whose frontmost is true
          if name of currentApp is "Electron" or name of currentApp is "empth" then
             set visible of currentApp to false
             delay 0.2
          end if
          
          set frontApp to first application process whose frontmost is true
          tell window 1 of frontApp
            -- Deep search whole window to click the named element
            set theElement to first UI element of entire contents whose name is "${params.element_name.replace(/"/g, '\\"')}"
            click theElement
          end tell
        end tell
        return "Successfully clicked: ${params.element_name}"
      on error errMsg
        return "Failed to click: " & errMsg
      end try
    `;
    try {
      const result = await runAppleScript(script);
      return { success: true, message: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

export const typeTextOSTool = {
  declaration: {
    name: "type_text_os",
    description: "Types text directly into whatever text field currently has focus on macOS, optionally pressing Enter.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text to type"
        },
        press_enter: {
          type: "boolean",
          description: "Whether to press the Enter/Return key after typing"
        }
      },
      required: ["text"]
    }
  },
  rules: "Use this after clicking a text field, or when focus is already in an input box.",
  handler: async (params) => {
    if (!params.text) return { success: false, error: "Missing text" };
    const enterScript = params.press_enter ? '\n key code 36' : '';
    const script = `
      tell application "System Events"
        keystroke "${params.text.replace(/"/g, '\\"')}"
        ${enterScript}
      end tell
      return "Typed successfully"
    `;
    try {
      const result = await runAppleScript(script);
      return { success: true, message: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

export const openApplicationTool = {
  declaration: {
    name: "open_application",
    description: "Opens a macOS application",
    parameters: {
      type: "object",
      properties: {
        app_name: {
          type: "string",
          description: "Name of the application to open"
        }
      },
      required: ["app_name"]
    }
  },
  rules: "Prefer this tool when the user asks to open an app.",
  handler: async (params) => {
    const { app_name } = params;
    if (!app_name) return { success: false, error: "Missing app_name" };

    try {
      // Use -g (background) flag so macOS doesn't steal focus from the AI app, 
      // preventing the UI from hiding and halting execution.
      const child = spawn('open', ['-g', '-a', app_name], { detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true, message: `Opened ${app_name}` };
    } catch (err) {
      return { success: false, error: `Failed to open ${app_name}: ${err.message}` };
    }
  }
};

export const saveWhatsappContactTool = {
  declaration: {
    name: "save_whatsapp_contact",
    description: "Saves a contact for WhatsApp messaging",
    parameters: {
      type: "object",
      properties: {
        contact_name: {
          type: "string",
          description: "Name of the contact"
        },
        phone_number: {
          type: "string",
          description: "Phone number with country code (e.g., +1234567890)"
        }
      },
      required: ["contact_name", "phone_number"]
    }
  },
  rules: "Use this to save WhatsApp contacts when user provides a phone number.",
  handler: async (params) => {
    const { contact_name, phone_number } = params;
    if (!contact_name || !phone_number) return { success: false, error: "Missing name or phone number" };

    try {
      const file = '/Users/eshan./Desktop/empth/backend/data/contacts.json';
      let contacts = {};

      try {
        const data = await fs.readFile(file, 'utf8');
        contacts = JSON.parse(data);
      } catch(e) {
        // Initialize with structure if file doesn't exist
        contacts = {
          "_comment": "WhatsApp contacts storage. Add contacts using voice command: 'save WhatsApp contact [name] at [phone number]'",
          "_example": {
            "mom": "+1234567890",
            "dad": "+9876543210"
          }
        };
      }

      // Clean and validate the phone number
      let cleanPhone = phone_number.replace(/[^0-9+]/g, '');

      // Ensure international format
      if (!cleanPhone.startsWith('+')) {
        return {
          success: false,
          error: "Invalid phone number format",
          message: "Please include the country code. Example: +1234567890 or +91987654321"
        };
      }

      // Check for minimum length (country code + number)
      if (cleanPhone.length < 8) {
        return {
          success: false,
          error: "Phone number too short",
          message: "Please provide a complete phone number with country code. Example: +1234567890"
        };
      }

      const contactKey = contact_name.toLowerCase();
      const wasExists = contacts[contactKey];

      contacts[contactKey] = cleanPhone;

      await fs.mkdir('/Users/eshan./Desktop/empth/backend/data', { recursive: true }).catch(()=>{});
      await fs.writeFile(file, JSON.stringify(contacts, null, 2));

      const action = wasExists ? "updated" : "saved";
      return {
        success: true,
        message: `Successfully ${action} ${contact_name} with phone number ${cleanPhone}. You can now send messages by saying: 'send WhatsApp message to ${contact_name}...'`
      };
    } catch (err) {
      console.error(`saveWhatsappContactTool error:`, err);
      return { success: false, error: err.message };
    }
  }
};


export const checkWhatsappContactTool = {
  declaration: {
    name: "check_whatsapp_contact",
    description: "Checks if a WhatsApp contact is saved before drafting",
    parameters: {
      type: "object",
      properties: {
        contact_name: {
          type: "string",
          description: "Name of the contact to check"
        }
      },
      required: ["contact_name"]
    }
  },
  handler: async (params) => {
    const { contact_name } = params;
    try {
      const file = '/Users/eshan./Desktop/empth/backend/data/contacts.json';
      let contacts = {};
      try {
        const data = await require('fs').promises.readFile(file, 'utf8');
        contacts = JSON.parse(data);
      } catch(e) {
        return { success: false, error: "CONTACT_NOT_FOUND" };
      }
      
      const targetPhone = contacts[contact_name.toLowerCase()];
      if (targetPhone) {
        return { success: true, message: `Contact ${contact_name} found (${targetPhone}). Ready to draft the message for user confirmation.` };
      }
      return { success: false, error: "CONTACT_NOT_FOUND" };
    } catch(err) {
      return { success: false, error: err.message };
    }
  }
};

export const sendWhatsappMessageTool = {
  declaration: {
    name: "send_whatsapp_message",
    description: "Sends a WhatsApp message to a saved contact",
    parameters: {
      type: "object",
      properties: {
        contact_name: {
          type: "string",
          description: "Name of the contact to send message to"
        },
        message: {
          type: "string",
          description: "Message content to send"
        }
      },
      required: ["contact_name", "message"]
    }
  },
  rules: "If user asks to send a WhatsApp message, use this tool. If contact not found, ask for phone number and use save_whatsapp_contact first.",
  handler: async (params) => {
    const contact_name = params.contact_name;
    const message = params.message;
    if (!contact_name || !message) return { success: false, error: 'Missing parameters' };
    
    try {
      const file = '/Users/eshan./Desktop/empth/backend/data/contacts.json';
      let contacts = {};
      try {
        const data = await fs.readFile(file, 'utf8');
        contacts = JSON.parse(data);
      } catch(e) {
        return { success: false, error: "No contacts found. Please save the contact first." };
      }
      
      let targetPhone = contacts[contact_name.toLowerCase()];
      if (!targetPhone) {
        return { success: false, error: `Contact ${contact_name} not found.` };
      }

      // Remove any non-numeric characters except +
      targetPhone = targetPhone.replace(/[^0-9+]/g, '');

      // Open whatsapp URL in background (-g) so it doesn't steal focus midway
      const url = `whatsapp://send?phone=${targetPhone}&text=${encodeURIComponent(message)}`;
      const child = spawn('open', ['-g', url], { detached: true, stdio: 'ignore' });
      child.unref();

      // Wait a bit for WhatsApp to process the scheme, then bring it forward and hit send
      const s = 'delay 3.0\n' +
                'tell application "System Events"\n' +
                '    tell process "WhatsApp"\n' +
                '        set frontmost to true\n' +
                '        delay 0.5\n' +
                '        keystroke return\n' +
                '    end tell\n' +
                'end tell';
      await runAppleScript(s);
      return { success: true, message: 'Done! I sent it to ' + contact_name };
    } catch(e) { return { success: false, error: e.message }; }
  }
};
export const listWhatsappContactsTool = {
  declaration: {
    name: "list_whatsapp_contacts",
    description: "Lists all saved WhatsApp contacts",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  rules: "Use when user asks about their WhatsApp contacts or wants to see who they can message.",
  handler: async (params) => {
    try {
      const file = '/Users/eshan./Desktop/empth/backend/data/contacts.json';
      let contacts = {};

      try {
        const data = await fs.readFile(file, 'utf8');
        contacts = JSON.parse(data);
      } catch(e) {
        return {
          success: false,
          error: "No contacts found",
          message: "No WhatsApp contacts have been saved yet. Use voice command: 'save WhatsApp contact [name] at [phone number]'"
        };
      }

      // Filter out the comment and example fields
      const realContacts = Object.entries(contacts).filter(([key]) => !key.startsWith('_'));

      if (realContacts.length === 0) {
        return {
          success: true,
          message: "No WhatsApp contacts saved yet. You can save contacts using voice command: 'save WhatsApp contact [name] at [phone number]'"
        };
      }

      const contactsList = realContacts.map(([name, phone]) => `${name}: ${phone}`).join(', ');
      return {
        success: true,
        message: `WhatsApp contacts: ${contactsList}`,
        contacts: Object.fromEntries(realContacts)
      };
    } catch (err) {
      console.error(`listWhatsappContactsTool error:`, err);
      return { success: false, error: err.message };
    }
  }
};

export const checkWhatsappSetupTool = {
  declaration: {
    name: "check_whatsapp_setup",
    description: "Diagnoses WhatsApp setup and verifies all requirements",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  rules: "Use when user has WhatsApp messaging issues or wants to verify their setup.",
  handler: async (params) => {
    const checks = [];
    let allPassed = true;

    try {
      // Check 1: WhatsApp Desktop installation
      try {
        await execAsync(`ls "/Applications/WhatsApp.app"`);
        checks.push("✅ WhatsApp Desktop is installed");
      } catch (err) {
        checks.push("❌ WhatsApp Desktop not found. Please install WhatsApp Desktop from the Mac App Store");
        allPassed = false;
      }

      // Check 2: Test deep link functionality
      try {
        // Try a harmless deep link test - just open WhatsApp without sending
        await execAsync(`open "whatsapp://"`);
        checks.push("✅ WhatsApp deep links working");
      } catch (err) {
        checks.push("❌ WhatsApp deep links not working");
        allPassed = false;
      }

      // Check 3: Check AppleScript permissions
      try {
        const script = `
          tell application "System Events"
              -- Just test if we can access System Events
              return "ok"
          end tell
        `;
        await runAppleScript(script);
        checks.push("✅ AppleScript automation permissions granted");
      } catch (err) {
        checks.push("❌ AppleScript automation permission denied. Enable in System Preferences > Security & Privacy > Privacy > Automation");
        allPassed = false;
      }

      // Check 4: Contacts file status
      try {
        const file = '/Users/eshan./Desktop/empth/backend/data/contacts.json';
        const data = await fs.readFile(file, 'utf8');
        const contacts = JSON.parse(data);
        const realContacts = Object.entries(contacts).filter(([key]) => !key.startsWith('_'));

        if (realContacts.length > 0) {
          checks.push(`✅ ${realContacts.length} WhatsApp contact(s) saved`);
        } else {
          checks.push("⚠️ No WhatsApp contacts saved yet. Save contacts using: 'save WhatsApp contact [name] at [phone number]'");
        }
      } catch (err) {
        checks.push("⚠️ No contacts file found. Save your first contact to create it.");
      }

      const status = allPassed ? "ready" : "needs_setup";
      return {
        success: true,
        status,
        message: checks.join('\n'),
        checks
      };
    } catch (err) {
      console.error(`checkWhatsappSetupTool error:`, err);
      return { success: false, error: `Setup check failed: ${err.message}` };
    }
  }
};

export const checkScreenTool = {
  declaration: {
    name: "check_screen",
    description: "Takes a screenshot and analyzes it using AI vision",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Question to ask about the screenshot"
        }
      },
      required: ["question"]
    }
  },
  rules: "Use when user asks about what's on their screen or wants screen analysis.",
  handler: async (params) => {
    const { question } = params;
    if (!question) return { success: false, error: "Missing question for vision" };

    try {
      const imgPath = '/tmp/empth_screen.jpg';
      // Take a silent screenshot (-x) to the path
      await execAsync(`screencapture -x ${imgPath}`);

      const fileBuffer = await fs.readFile(imgPath);
      const base64Image = fileBuffer.toString('base64');

      console.log(`Taking screenshot and asking Groq Vision: "${question}"`);
      const answer = await askVisionModel(question, base64Image);

      // Cleanup screenshot
      await fs.unlink(imgPath).catch(() => {});

      return { success: true, answer };
    } catch (err) {
      console.error(`checkScreenTool error:`, err);
      return { success: false, error: `Vision failed: ${err.message}` };
    }
  }
};

// Legacy export for backward compatibility
export const osTools = {
  read_active_window: readActiveWindowTool.handler,
  click_ui_element: clickUIElementTool.handler,
  type_text_os: typeTextOSTool.handler,
  open_application: openApplicationTool.handler,
  save_whatsapp_contact: saveWhatsappContactTool.handler,
  check_whatsapp_contact: checkWhatsappContactTool.handler,
  send_whatsapp_message: sendWhatsappMessageTool.handler,
  list_whatsapp_contacts: listWhatsappContactsTool.handler,
  check_whatsapp_setup: checkWhatsappSetupTool.handler,
  check_screen: checkScreenTool.handler
};
