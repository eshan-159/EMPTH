import { createPdfTool } from './pdfTools.js';
import { fileTools } from './fileTools.js';
import { convertFileTool } from './convertTools.js';
import { osTools } from './osTools.js';

export const toolRegistry = {
  create_pdf: createPdfTool,
  convert_file: convertFileTool,
  write_text_file: fileTools.write_text_file,
  read_file: fileTools.read_file,
  create_folder: fileTools.create_folder,
  list_files: fileTools.list_files,
  open_application: osTools.open_application,
  read_active_window: osTools.read_active_window,
  click_ui_element: osTools.click_ui_element,
  type_text_os: osTools.type_text_os,
  save_whatsapp_contact: osTools.save_whatsapp_contact,
  check_whatsapp_contact: osTools.check_whatsapp_contact,
  send_whatsapp_message: osTools.send_whatsapp_message,
  list_whatsapp_contacts: osTools.list_whatsapp_contacts,
  check_whatsapp_setup: osTools.check_whatsapp_setup,
  check_screen: osTools.check_screen
};

export const toolDescriptions = `
Available tools and parameters:
- read_file: {"path": "relative/path/from/ASSISTANT_WORKDIR"}
- write_text_file: {"content": "...", "path": "filename_or_relative_path"}
- create_folder: {"path": "filename_or_relative_path"}
- list_files: {"path": "relative_path"}
- create_pdf: {"content": "...", "path": "filename_or_relative_path.pdf"}
- convert_file: {"input_path": "path", "output_format": "pdf"}
- open_application: {"app_name": "Application Name"}
- read_active_window: {} (Reads what is on the screen for macOS automation)
- click_ui_element: {"element_name": "Exact Button or Label name"}
- type_text_os: {"text": "Text to type", "press_enter": true}
- check_whatsapp_contact: {"contact_name": "Name"}
- save_whatsapp_contact: {"contact_name": "Name", "phone_number": "+919876543210"}
- send_whatsapp_message: {"contact_name": "Name", "message": "Exact message"}
- list_whatsapp_contacts: {} (no parameters needed)
- check_whatsapp_setup: {} (no parameters needed)
- check_screen: {"question": "Question about screen"}
`;

export const toolRules = `
Rules:
- Prefer tool calls when the user asks to open an app (e.g. 'open_application' for VS Code or WhatsApp).
- For screen interaction/automation:
  1. ALWAYS use 'read_active_window' first when the user asks to "click something", "type something", or "see my screen".
  2. Once you have the UI element names from 'read_active_window', use 'click_ui_element' to click the exact element name to gain focus.
  3. If typing is needed, after clicking the text box, use 'type_text_os' to type physical keystrokes.
- For sending a WhatsApp message:
  1. If you don't know the exact phone number, ALWAYS use 'check_whatsapp_contact' to see if the contact exists in storage FIRST. 
  2. If the contact exists, DO NOT SEND IT YET. Respond by asking the user to confirm the text BEFORE sending. Say: "I found this contact. Let's confirm. I'll send '...'. Should I send it?"
  3. Wait for the user to reply with a positive confirmation (Yes, send it, etc.).
  4. Only AFTER the user confirms/validates the message should you call 'send_whatsapp_message'.
- If 'check_whatsapp_contact' returns "CONTACT_NOT_FOUND", ask the user for their phone number to save it. When they provide it, use 'save_whatsapp_contact'.
`;
