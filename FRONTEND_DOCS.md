# Intain Copilot - Frontend Documentation

The frontend is a React Single Page Application (SPA) built with Vite, styled with Tailwind CSS, and uses Lucide for iconography.

## 1. The Intain Design System
The UI is strictly designed to emulate Intain's enterprise FinTech aesthetic, projecting security, trust, and advanced AI capabilities.

### Colors & Themes (Tailwind `tailwind.config.js`)
*   **The Intain Vault (Backgrounds):** The application relies on a dark mode aesthetic using Deep Midnight Navy (`slate-950` / `#020617`) and Charcoal (`slate-900` / `#0f172a`).
*   **Trust Markers:** Actionable and primary UI elements use Corporate Electric Teal (`brand-400`/`brand-500` - hex `#2dd4bf` to `#14b8a6`). Success states use Emerald Green.
*   **The AI Spark:** A specific iridescent gradient spanning from violet (`#8b5cf6`) to cyan (`#22d3ee`) is reserved strictly for AI interactions, distinguishing deterministic system output from generative AI output.

### Styling Utilities
*   **Glassmorphism (`.glass-card`):** A custom utility class defined in `index.css` that applies `backdrop-blur-md`, a translucent slate background (`bg-surface-900/60`), and a subtle border. This creates a premium, frosted-glass effect over the slow-moving radial gradient background mesh.
*   **Typography:** The application uses `Plus Jakarta Sans` for standard UI text (headers, buttons, descriptions) to mimic modern banking portals, and `JetBrains Mono` for precise financial data and cryptographic hashes.

## 2. Role-Based Routing
The `App.tsx` file handles routing using `react-router-dom`, intercepting requests via a `<ProtectedLayout />`. The `Dashboard` component switches the default view based on the user's role:

*   **`ADMIN` (Master Admin Control):** Renders the `AdminDash.tsx`. This dashboard acts as a unified hub, containing a tabbed interface that seamlessly embeds the Operator, Reviewer, and Consumer dashboards.
*   **`DATA_OPERATOR` (Ingestion):** Renders `OperatorDash.tsx`. Focused on the `UploadZone`, recent uploads, and macro data quality statistics.
*   **`REVIEWER` (Quality Assurance):** Renders `ReviewerDash.tsx`. Focused on the Exception Queue, rendering `ExceptionCard` components where human and AI collaboration occurs.
*   **`DATA_CONSUMER` (Analytics):** Renders `ConsumerDash.tsx`. Access is restricted strictly to the Verified Vault—loans that have achieved the `LOAN_VERIFIED` event state.

## 3. Key Component Logic

### `AIPanel.tsx`
Handles the Generative AI suggestion UI inside the `ExceptionCard`.
*   **Mechanics:** When the user clicks "Request AI Analysis", a loading state triggers the `.animate-copilot-pulse` class—a custom Tailwind keyframe that creates a breathing iridescent glow around the panel.
*   **Confidence Meter:** Parses the AI's confidence score and dynamically renders a progress bar. It uses semantic coloring based on thresholds (Green >90%, Yellow 70-89%, Red <70%).
*   **Data Formatting:** Renders the `suggested_patch` JSON in a strict monospace block for easy developer/reviewer inspection before they click "Accept AI Fix".

### `AuditTimeline.tsx`
Renders the cryptographically hashed event ledger for a specific loan.
*   **Visual Time-Travel:** Features a premium video-style slider input (the "Rewind" scrubber). 
*   **API Integration:** As the user drags the slider to a specific historical event index, the component maps that index to an event's `timestamp`. It then issues a `POST /api/audit/rewind` request to the backend with that `target_timestamp`.
*   **State Manipulation:** The component visually grayscales, dims, and strikes-through any events that occurred *after* the slider's current position, effectively visualizing the temporal rewind.

### `Table.tsx`
A highly-structured data table optimized for financial records.
*   **Mechanics:** Accepts generic arrays of `LoanState` objects. Enforces strict right-alignment and `JetBrains Mono` fonts for numerical financial columns (`original_principal`, `current_balance`) to ensure decimal alignment.

## 4. Authentication Flow
The application uses a mock JWT flow suitable for the hackathon prototype.
*   **Login Logic:** The `LoginPage.tsx` submits credentials to `/api/auth/login`. On success, it stores the JWT and user metadata in `localStorage`.
*   **API Client (`api/client.ts`):** An Axios instance intercepts all outgoing HTTP requests and automatically attaches the `Authorization: Bearer <token>` header if a token exists in `localStorage`.
*   **Demo Access (Quick Logins):** To bypass manual typing during presentations, `LoginPage.tsx` features four "Quick Login" buttons. Because Vite aggressively caches `import.meta.env` during hot-reloads (which caused runtime bugs previously), these buttons are hardcoded with the backend's default seeded credentials (`admin123`, `operator123`, etc.) to guarantee 100% reliability during the demo.
