# AirBridge

**Fast, Secure, and Free Peer-to-Peer File Sharing**

AirBridge is a robust, open-source file-sharing web application that allows users to seamlessly transfer large files, entire folders, and media across devices on the same local network. It utilizes WebRTC to establish direct Peer-to-Peer (P2P) connections, ensuring that your data never touches a cloud server. 

Because files are streamed directly from sender to receiver and saved straight to the disk using the File System Access API, AirBridge handles massive files (e.g., 50GB+) effortlessly without crashing the browser's memory!

## Features
- **⚡ Blazing Fast Local Transfers:** Send files at maximum local network speeds (automatically scales based on device capabilities).
- **🔒 100% Private & Secure:** Your files are transferred directly between peers via secure WebRTC Data Channels. Nothing is uploaded to any server.
- **📁 Unlimited File Sizes & Folders:** Drag and drop hundreds of files or entire directories. Large files are streamed chunk-by-chunk to disk.
- **📱 Device Discovery:** Automatically detects other AirBridge instances on the same network to prompt quick connections.
- **⌨️ Keyboard Accessible:** Navigate and trigger transfers quickly using just the keyboard.
- **🚫 No Logins Required:** Instant access. No sign-ups, no tracking.

## Technology Stack
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/)
- **Core Technology:** WebRTC (Peer-to-Peer connection), File System Access API (Direct-to-Disk streaming)
- **Monorepo:** Turborepo 

## Prerequisites
- Node.js >= 18.x
- `npm` (or `pnpm`/`yarn`)

## Installation & Running Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/AirBridge-Monorepo.git
   cd AirBridge-Monorepo
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm --prefix apps/web run dev -- -H 0.0.0.0
   ```
   *Note: Using `-H 0.0.0.0` binds the server to your local IP address so you can access it from other devices (e.g. your phone) on the same WiFi network.*

4. **Access the application:**
   - On the host machine: `http://localhost:3000`
   - On a phone/tablet: `http://<YOUR_LOCAL_IP>:3000` 

## Deployment

Since AirBridge relies on Next.js API Routes (`/api/signaling` and `/api/presence`) to negotiate the WebRTC connection between peers, **it requires a host that supports serverless functions**. 

We recommend deploying to platforms that natively support Next.js, such as **Vercel** or **Netlify**.

1. Push your code to a GitHub repository.
2. Log into [Vercel](https://vercel.com/) or [Netlify](https://www.netlify.com/).
3. Import your repository and select the Next.js framework preset.
4. Deploy! It's completely free.

*Note: GitHub Pages or standard Firebase Hosting (Static) will **not** work because they do not support Next.js serverless API routes.*

## Security Notice & Browser Limitations
- **Secure Context Required:** To use the File System Access API (which allows direct-to-disk streaming), browsers require the site to run in a Secure Context. This means your production deployment **must use HTTPS**. 
- **Downloads History:** Files streamed via AirBridge will bypass the browser's built-in download manager for security reasons, so they will not appear in `Ctrl+J` history.

## License

This project is licensed under the [MIT License](LICENSE).
