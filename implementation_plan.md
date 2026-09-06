# Implementation Plan: Ingest Fabricate Criminal Network Dataset & Align Schemas

Integrate and align database schemas with the new official **Criminal Network Investigation** dataset (extracted from `Criminal Network Investigation (2).zip` to `data/criminal_investigation_data`), containing **140 cases, 1,000 persons, 26,832 graph relationships, 13,264 CDRs, 10,907 financial transactions, 146 FIRs, police reports, surveillance, and ground-truth roles**.

---

## User Review Required

> [!IMPORTANT]
> **Dataset Scale & Case Navigation**:
> The newly provided dataset contains **140 real cases** and **1,000 persons** generated with rich multi-source law enforcement attributes (Aadhaar IDs, bank account numbers, IMEI, vehicle registrations, IPC sections, and ground-truth roles: `kingpin`, `lieutenant`, `operative`, `mule`, `peripheral`).
> - We will update the database models to strictly match the 22 CSV schemas.
> - The Case Dashboard will list all cases from `cases.csv` (e.g., `FIR/HUN/2023/7466` — Cybercrime Phishing/Mule Network, `FIR/CHO/2023/5936` — Hawala Layering Scheme, `FIR/LUN/2025/1581` — Narcotics Syndicate).
> - Graph relationship categories and filtering (`All Links`, `Finance / Hawala`, `Phone Calls / CDR`, `FIR / Police Reports`, `Surveillance`, `Social Media`) will remain fully consistent.

---

## Proposed Changes

### 1. Database Schemas Alignment (`backend/app/models.py`)

Update SQLAlchemy models to mirror the exact columns of the 22 CSVs in `data/criminal_investigation_data/`:

#### [MODIFY] [models.py](file:///c:/Users/User/Downloads/Cyber/backend/app/models.py)
- **`Person`**:
  - Add: `aadhaar_id`, `first_name`, `last_name`, `gender`, `date_of_birth`, `age`, `city`, `state`, `occupation`, `email`, `marital_status`, `household_id`, `family_role`, `notes`.
  - Retain graph intelligence fields: `suspicion_score`, `hierarchy_score`, `confidence_band`, `is_seed`, `criminal_history_flag`, `network_role`.
- **`Case`**:
  - Add: `case_number`, `case_type`, `opened_date`, `closed_date`, `jurisdiction_location_id`.
- **`PhoneNumber`** (NEW Model):
  - `phone_id`, `person_id`, `phone_number`, `phone_type`, `carrier`, `activated_date`, `is_active`.
- **`FinancialAccount`** (NEW Model):
  - `account_id`, `person_id`, `organization_id`, `account_number`, `account_type`, `ifsc_code`, `opened_date`, `status`.
- **`TransactionRecord`**:
  - Align with `financial_transactions.csv`: `transaction_id`, `sender_person_id`, `receiver_person_id`, `sender_account_id`, `receiver_account_id`, `amount`, `transaction_timestamp`, `transaction_type`, `platform`, `location_id`, `description`, `linked_case_id`.
- **`CDRRecord`**:
  - Align with `cdr_records.csv`: `call_id`, `caller_person_id`, `receiver_person_id`, `caller_phone`, `receiver_phone`, `call_timestamp`, `call_duration`, `call_type`, `caller_location_id`, `receiver_location_id`, `linked_case_id`.
- **`FIRRecord`**:
  - Align with `firs.csv`: `fir_id`, `fir_number`, `case_id`, `filed_date`, `location_id`, `primary_complainant_person_id`, `involved_person_ids`, `narrative`, `status`.
- **`PoliceReport`** (NEW Model):
  - Align with `police_reports.csv`: `report_id`, `fir_id`, `case_id`, `report_date`, `officer_name`, `report_type`, `involved_person_ids`, `narrative`.
- **`SurveillanceRecord` & `SurveillanceReport`**:
  - Align with `surveillance_records.csv` and `surveillance_reports.csv`: `observation_id`, `observation_timestamp`, `location_id`, `observed_person_ids`, `vehicle_id`, `narrative`, `source_reliability`, `case_id`.
- **`CriminalHistoryRecord`**:
  - Align with `criminal_history.csv`: `history_id`, `person_id`, `case_id`, `case_type`, `year`, `status`, `charges`, `court_name`, `linked_person_ids`, `description`.
- **`SocialMediaChat` & `SocialMediaPost`** (NEW Models):
  - Align with `social_media_chats.csv` and `social_media_posts.csv`.
- **`Location`, `Vehicle`, `Organization`**:
  - Align with `locations.csv`, `vehicles.csv`, `organizations.csv`.
- **`GroundTruthNetwork`** (NEW Model):
  - Align with `ground_truth_network.csv`: stores baseline syndicate roles (`kingpin`, `lieutenant`, `operative`, `mule`, `peripheral`).

---

### 2. High-Performance Ingestion Script (`backend/scripts/ingest_fabricate_data.py`)

#### [NEW] [ingest_fabricate_data.py](file:///c:/Users/User/Downloads/Cyber/backend/scripts/ingest_fabricate_data.py)
- Ingests all 22 CSV tables directly from `data/criminal_investigation_data/` into SQLite in optimized chunks.
- Builds the NetworkX in-memory and persisted graphs for cases.
- Maps `graph_relationships.csv` to semantic edge types with confidence scores:
  - `called` $\rightarrow$ `CALL`
  - `financial_transfer` $\rightarrow$ `TRANSACTION` ("finance wala")
  - `named_together_in_fir` / `named_together_in_police_report` $\rightarrow$ `FIR`
  - `co_observed` $\rightarrow$ `SURVEILLANCE`
  - `co_accused_prior_case` $\rightarrow$ `CRIMINAL_HISTORY`
  - `direct_message` / `mentioned_in_chat` $\rightarrow$ `SOCIAL_MEDIA`
- Calculates suspicion scores, network hierarchy ranks, and runs pattern detectors across the ingested cases.

---

### 3. API & Routes Update (`backend/app/routes.py`)

#### [MODIFY] [routes.py](file:///c:/Users/User/Downloads/Cyber/backend/app/routes.py)
- Update `GET /api/cases` to list the ingested cases with their titles, case numbers, types, and suspect counts.
- Update `GET /api/cases/{case_id}/graph` to return the case-specific subgraph from `graph_relationships` and `ground_truth_network`.
- Update upload parsers to accept the Fabricate CSV formats (e.g. `financial_transactions.csv` with `sender_person_id` / `receiver_person_id`, `cdr_records.csv` with `caller_person_id` / `receiver_person_id`).
- Add an endpoint `POST /api/cases/seed-fabricate` to allow 1-click seeding of the full Fabricate dataset directly from the UI.

---

### 4. Frontend Graph & Category Filtering Alignment

#### [MODIFY] [cyberGraphAdapter.js](file:///c:/Users/User/Downloads/Cyber/frontend/src/components/graph/cyberGraphAdapter.js)
- Ensure semantic relationship mapping cleanly handles the Fabricate relation types:
  - `called` $\rightarrow$ Phone calls badge (`18 calls`, `Duration: 420s`)
  - `financial_transfer` $\rightarrow$ Financial badge (`₹ Amount`, `Transfer`)
  - `named_together_in_fir` $\rightarrow$ FIR badge (`FIR Co-Accused`)
  - `co_observed` $\rightarrow$ Surveillance badge (`Meetup Observed`)
  - `co_accused_prior_case` $\rightarrow$ Criminal History badge (`Prior Co-Accused`)
- Embed the new Fabricate fields (Aadhaar, Occupation, City, Vehicle, Ground Truth Role) directly into the suspect card digital footprint.

#### [MODIFY] [UploadData.jsx](file:///c:/Users/User/Downloads/Cyber/frontend/src/components/UploadData.jsx)
- Update the sample file references and add a 1-click button to load the full Fabricate investigation dataset.

---

## Verification Plan

### Automated Verification:
1. **Schema & Migration Verification**:
   - Run `python backend/scripts/ingest_fabricate_data.py --verify-only` to ensure all 22 CSVs map cleanly into SQLAlchemy models with zero foreign key or type errors.
2. **Backend Unit Tests**:
   - Run `pytest backend/tests` to verify pattern detectors and score computations pass.
3. **API Graph Verification**:
   - Query `GET /api/cases/{case_id}/graph` for the top cybercrime case (`FIR/HUN/2023/7466`) to verify nodes, edges, and category filters.
4. **Frontend Build**:
   - Run `npm run build` in `frontend` to guarantee clean TypeScript/JSX compilation.

### Manual Verification:
- Inspect the Case List in the dashboard to verify all cases are displayed.
- Open the Network Graph and ELK Link Graph to verify categorized edge filtering (`All Links`, `Finance / Hawala`, `Phone Calls`, `FIRs`).
