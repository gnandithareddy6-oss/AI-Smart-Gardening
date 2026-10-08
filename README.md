# Sprout — local AI gardening assistant

Sprout connects its gardening chat to the Ollama model `qwen2.5:3b`. Chat requests go from the browser to the local PowerShell server and then to Ollama on `127.0.0.1:11434`. Your chat is processed locally; the app does not send prompts to a hosted AI service.

## Run on Windows

1. Install Ollama if it is not already installed: <https://ollama.com/download>.
2. In PowerShell, download the model if needed:

   ```powershell
   ollama pull qwen2.5:3b
   ```

3. Make sure Ollama is running. The Ollama desktop app normally starts its local service automatically. Otherwise, start it in a separate PowerShell window:

   ```powershell
   ollama serve
   ```

4. From this project folder, start the website:

   ```powershell
   .\server.ps1
   ```

   If PowerShell blocks the script, run it for this session with:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\server.ps1
   ```

5. Open <http://127.0.0.1:8000> in your browser. Keep the PowerShell window open while you use Sprout; press Ctrl+C there to stop the server.

The server listens only on the local loopback address. It serves the website and forwards chat requests to Ollama, avoiding browser CORS configuration. The model indicator in the chat header shows whether Ollama and the requested model are available.
