# SHODH — AI-Powered Criminal Network Analysis Platform
> **Smart India Hackathon | 100% Local Deployment | Zero Cloud & Zero External APIs**

---

## 📌 Executive Summary

**SHODH** is an offline-capable, high-precision visual intelligence platform engineered for law enforcement agencies to uncover, map, and dismantle organised crime syndicates. It synthesises heterogeneous investigative evidence—including **Call Detail Records (CDRs)**, **Financial Hawala Transactions**, **First Information Reports (FIRs)**, **Field Surveillance Reports**, **Social Media Communications**, and **Cell Tower Location Trails**—into a coherent, interactive relationship graph.

All computation runs locally using **SQLite**, **NetworkX**, **FastAPI**, and **React (Vite)** without sending sensitive evidentiary records to any cloud provider or proprietary AI API.

---

## 🎨 4-Colour Law Enforcement Palette

In strict adherence to courtroom and evidentiary design guidelines, the platform utilizes a focused 4-colour palette:
* ⚪ **White (#FFFFFF)**: Dominant background and clean peripheral node fill.
* 🟡 **Yellow (#FFD600 / #FFF9C4)**: Secondary accent, inner concentric core zone (>75%), and key intelligence alerts.
* 🔴 **Red (#E53935 / #FFEBEE)**: High-severity pattern alerts, criminal history badges, and registered crime incident dots.
* ⚫ **Black (#1A1A1A)**: Typography, high-contrast borders, and timeline baselines.

---

## 🕸️ Key Visual Intelligence Capabilities

1. **Spacious Concentric Network Graph**:
   * **Inner Zone (>75% Suspicion)**: High-probability core syndicate members and kingpins.
   * **Middle Zone (50–75%)**: Active coordinators and lieutenants.
   * **Outer Zone (25–50%)**: Peripheral associates and couriers.
   * **Pruned Outside (<25%)**: Filtered innocent contacts represented as unobtrusive `?` placeholders.
   * **Zoom-Gated Edge Labels**: Transaction amounts and call counts dynamically render upon zoom-in to prevent visual clutter.
   * **Layout Switcher**: One-click toggle between **Concentric Rings**, **Force-Directed (CoSE)**, and **Breadth-First**.
   * **Pivot Filters**: Instant filtering by Criminal Record, Hawala Transactions, Call Networks, or Suspicion Threshold.

2. **Syndicate Hierarchy & Influence Tree**:
   * Nodes automatically ranked via composite graph algorithms (**PageRank** + **Betweenness Centrality** + **Suspicion Score**).
   * Direct jump from tree ranking to graph node selection.

3. **Dual Evidentiary Timelines**:
   * **Past Timeline (D3.js)**: Horizontal baseline with white network/communication dots and red crime event/FIR dots. Click to view detailed evidence.
   * **Predictive Future Timeline**: Local exponential smoothing on time-series frequency and movement trends with required evidentiary uncertainty disclaimers (*"This is one input among others, not a certainty"*).

4. **12 Suspicious Activity Pattern Detectors**:
   1. Sudden communication burst
   2. New connections between unrelated people
   3. One person bridging multiple groups
   4. Same entity across multiple cases
   5. Unusual location sequence
   6. Repeated co-location of multiple people
   7. Unusual financial transaction pattern
   8. Circular transaction pattern (hawala layering)
   9. Communication + location correlation
   10. Phone/vehicle/identity hopping (burner phones)
   11. Sudden formation of a new community
   12. Existing network suddenly more active

5. **India-Bounded Live Location Tracking**:
   * Leaflet map bounded to the Indian subcontinent using free OpenStreetMap tiles.
   * Historical movement trails with timestamped waypoints and simulated live WebSocket location stream.

6. **Investigator Approval Gate & Role-Based Access (RBAC)**:
   * **Investigator**: Explores nodes, requests tracking warrants, overrides suspicion scores with mandatory justification.
   * **Senior Authority**: Approves/rejects elevated tracking warrants and DFS candidate expansions.
   * **Admin**: Audits complete immutable chain of custody logs.

---

## 🚀 Quick Start (One-Command Launch)

### On Windows
Double-click `run.bat` or run in PowerShell / Command Prompt:
```cmd
run.bat
```
*Creates virtual environment, installs backend and frontend dependencies, generates the 40-entity syndicate dataset, starts backend (`:8000`) and frontend (`:5173`), and opens your default browser.*

### On Linux / macOS
```bash
chmod +x run.sh
./run.sh
```

---

## 🔑 Default Credentials

| Role | Username | Password | Access Level |
|------|----------|----------|--------------|
| **Investigator** | `investigator` | `invest123` | Case analysis, graph exploration, score override |
| **Senior Authority** | `senior` | `senior123` | Warrant approvals, standing authorization, surveillance oversight |
| **Administrator** | `admin` | `admin123` | Global audit log review, system management |

*(Quick-login buttons are also provided on the login page for demo convenience.)*

---

## 📂 Project Architecture

```
Cyber/
├── backend/
│   ├── app/
│   │   ├── auth.py            # OAuth2 password flow + JWT tokens
│   │   ├── config.py          # Config loader for config.yaml thresholds
│   │   ├── database.py        # SQLite engine & session management
│   │   ├── detectors.py       # 12 Suspicious activity pattern detectors
│   │   ├── forecasting.py     # Local exponential smoothing (no AI API needed)
│   │   ├── graph_store.py     # NetworkX graph abstraction & SQLite persistence
│   │   ├── main.py            # FastAPI app & WebSocket managers
│   │   ├── models.py          # SQLAlchemy models (CDRs, Transactions, FIRs, etc.)
│   │   ├── routes.py          # REST & WebSocket API endpoints
│   │   └── scoring.py         # Multi-factor suspicion scoring engine
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/        # NetworkGraph, HierarchyTree, Timelines, LocationMap, etc.
│   │   ├── pages/             # Login, Dashboard, CaseView, AuditLogs
│   │   ├── api.js             # Centralized Axios API service layer
│   │   ├── App.jsx            # Main router & user state
│   │   └── index.css          # 4-Colour design system stylesheet
│   ├── package.json
│   └── vite.config.js
├── data-generator/
│   ├── generate.py            # Synthetic generator creating ~40 fictional suspects
│   └── output/                # Generated CSVs and complete_case_data.json
├── config/
│   └── config.yaml            # Configurable weights, thresholds, and scoring rules
├── run.bat                    # Windows launcher
├── run.sh                     # Unix launcher
├── Makefile                   # Development tasks
└── README.md
```

---

## 🧪 Step-by-Step Demo Flow

1. **Login**: Click **Investigator** on the login screen.
2. **Dashboard**: Click **Load Demo Case (40 Nodes)** or create a new case and click **Seed 40-Entity Syndicate**.
3. **Network Graph**:
   * Inspect the spacious concentric layout with **Vikram Malhotra** (Kingpin) at the inner yellow core.
   * Observe circular avatar frames, criminal record alert borders, and innocent contacts as `?` placeholders outside the rings.
   * Zoom in with scroll wheel to see edge transaction amounts (e.g. `₹250,000`) and call frequencies reveal automatically.
   * Click any node to open the **Entity Dossier** with CDRs, bank transactions, and score overrides.
   * Click any edge to view the **Link Breakdown**.
4. **Hierarchy Tree**: Switch to the **Hierarchy Tree** tab to inspect influence rankings. Click any associate to jump to their node in the graph.
5. **Past & Predictive Timelines**:
   * **Past Timeline**: Explore chronological white communication dots and red crime incident dots.
   * **Predictive Timeline**: Review forecasted activity surges and op-sec communication drops.
6. **Pattern Alerts**:
   * Click **Run 12 Pattern Detectors** to trigger circular transaction checks, communication bursts, and burner phone detection.
   * Confirm or dismiss detected anomalies.
7. **Location Tracking**:
   * Switch to **Location Tracking** to view India-bounded movement trails and real-time streaming pings.
8. **Audit Trail**:
   * Log in as **Admin** and navigate to **Audit Logs** to view immutable evidentiary records of all expansions, score overrides, and warrant decisions.
