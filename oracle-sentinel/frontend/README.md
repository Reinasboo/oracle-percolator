Oracle Sentinel frontend scaffold

- Run `pnpm install` in this folder
- Run `pnpm dev` to start the dev server (Vite)
- Built with React + TypeScript + Tailwind CSS

Design tokens are defined in `src/styles/tailwind.css` and `tailwind.config.cjs`

Demo mode
 - The frontend includes a realistic demo data generator and a mock socket fallback. To run with demo data (no backend required), set the Vite env var `VITE_USE_MOCK=true`.
 - Example (dev): `VITE_USE_MOCK=true pnpm dev`

Vercel deployment
 - The project includes `vercel.json` configured to serve the Vite `dist` directory as a static site.
 - To deploy:
	 1. Push your repo to GitHub.
	 2. Import the project in Vercel and set the build command to `pnpm build` and the output directory to `dist` (the `vercel.json` already sets this).
	 3. If you want a demo preview without backend, set the Environment Variable `VITE_USE_MOCK=true` in Vercel Project Settings (or leave it off to connect to a running backend at `http://localhost:3000`).

Notes
 - The demo generator produces coherent, correlated price movement across assets, realistic volatility, and confidence levels that respond to simulated anomalous events. Use `VITE_USE_MOCK=true` for demos or trade shows.

